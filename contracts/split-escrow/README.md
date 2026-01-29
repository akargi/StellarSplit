# Split Escrow Contract

A Soroban smart contract for managing bill-splitting escrow on the Stellar network.

## Overview

This contract enables trustless bill splitting by:
1. Creating splits with defined participants and amounts
2. Accepting deposits from participants
3. Releasing funds to the split creator once complete
4. Supporting cancellation and refunds

## Data Structures

### SplitStatus

```rust
enum SplitStatus {
    Pending,    // Created, no deposits yet
    Active,     // At least one deposit received
    Completed,  // All participants have paid
    Released,   // Funds released to creator
    Cancelled,  // Split cancelled, refunds pending
}
```

### Split

```rust
struct Split {
    id: u64,
    creator: Address,
    description: String,
    total_amount: i128,
    amount_collected: i128,
    participants: Vec<Participant>,
    status: SplitStatus,
    created_at: u64,
}
```

### Participant

```rust
struct Participant {
    address: Address,
    share_amount: i128,
    amount_paid: i128,
    has_paid: bool,
}
```

## Contract Interface

### Initialize

```rust
fn initialize(env: Env, admin: Address)
```

Must be called once after deployment to set the contract administrator.

### Create Split

```rust
fn create_split(
    env: Env,
    creator: Address,
    description: String,
    total_amount: i128,
    participant_addresses: Vec<Address>,
    participant_shares: Vec<i128>,
) -> u64
```

Creates a new split and returns the split ID.

**Requirements:**
- Participant shares must sum to total amount
- At least one participant required
- Creator must authorize the transaction

### Deposit

```rust
fn deposit(env: Env, split_id: u64, participant: Address, amount: i128)
```

Deposits funds into a split.

**Requirements:**
- Split must be Pending or Active
- Participant must be in the split
- Amount cannot exceed remaining owed

### Release Funds

```rust
fn release_funds(env: Env, split_id: u64)
```

Releases collected funds to the split creator.

**Requirements:**
- Split must be Completed
- Only creator can call

### Cancel Split

```rust
fn cancel_split(env: Env, split_id: u64)
```

Cancels a split and marks for refunds.

**Requirements:**
- Split cannot be Released
- Only creator can call

### Get Split

```rust
fn get_split(env: Env, split_id: u64) -> Split
```

Returns the split details.

## Events

| Event | Data | Description |
|-------|------|-------------|
| `init` | `(admin)` | Contract initialized |
| `created` | `(split_id, creator, amount)` | Split created |
| `deposit` | `(split_id, participant, amount)` | Deposit received |
| `released` | `(split_id, recipient, amount)` | Funds released |
| `cancel` | `(split_id)` | Split cancelled |

## Storage

The contract uses persistent storage with TTL extension:
- **Admin**: Contract administrator address
- **SplitCounter**: Auto-incrementing ID counter
- **Split(id)**: Individual split records

## Testing

```bash
cargo test
```

Run with output:

```bash
cargo test -- --nocapture
```

## Building

```bash
cargo build --target wasm32-unknown-unknown --release
```

Output: `target/wasm32-unknown-unknown/release/split_escrow.wasm`

## Security

- All state-changing operations require authorization
- Input validation prevents invalid states
- Status checks prevent invalid transitions
- Storage TTL prevents orphaned data

## Future Enhancements

- [ ] Token transfer integration (XLM, USDC)
- [ ] Multi-signature release
- [ ] Automatic refund processing
- [ ] Fee configuration
- [ ] Time-locked releases
