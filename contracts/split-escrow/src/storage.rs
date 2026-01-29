//! # Storage Module for Split Escrow Contract
//!
//! I'm organizing all storage operations here for consistency and safety.
//! Using typed storage keys prevents key collision bugs.

use soroban_sdk::{contracttype, Address, Env};

use crate::types::Split;

/// Storage keys for the contract
///
/// I'm using an enum with variants for different data types
/// to ensure type-safe storage access throughout the contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// The contract administrator
    Admin,

    /// Counter for generating unique split IDs
    SplitCounter,

    /// A split record, indexed by ID
    Split(u64),

    /// Whether the contract is initialized
    Initialized,
}

/// Time-to-live for persistent storage (about 1 year)
const LEDGER_TTL_PERSISTENT: u32 = 31_536_000;

/// Time-to-live bump threshold
const LEDGER_TTL_THRESHOLD: u32 = 86_400;

// ============================================
// Admin Storage Functions
// ============================================

/// Check if the admin has been set
pub fn has_admin(env: &Env) -> bool {
    env.storage().persistent().has(&DataKey::Admin)
}

/// Get the contract admin address
pub fn get_admin(env: &Env) -> Address {
    env.storage()
        .persistent()
        .get(&DataKey::Admin)
        .expect("Admin not set")
}

/// Set the contract admin address
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().persistent().set(&DataKey::Admin, admin);
    env.storage().persistent().extend_ttl(
        &DataKey::Admin,
        LEDGER_TTL_THRESHOLD,
        LEDGER_TTL_PERSISTENT,
    );
}

// ============================================
// Split Counter Functions
// ============================================

/// Get the next split ID and increment the counter
///
/// I'm using a simple incrementing counter for split IDs.
/// This is safe because each split is independent.
pub fn get_next_split_id(env: &Env) -> u64 {
    let key = DataKey::SplitCounter;
    let current: u64 = env.storage().persistent().get(&key).unwrap_or(0);
    let next = current + 1;
    env.storage().persistent().set(&key, &next);
    env.storage()
        .persistent()
        .extend_ttl(&key, LEDGER_TTL_THRESHOLD, LEDGER_TTL_PERSISTENT);
    next
}

// ============================================
// Split Storage Functions
// ============================================

/// Get a split by ID
pub fn get_split(env: &Env, split_id: u64) -> Split {
    let key = DataKey::Split(split_id);
    env.storage()
        .persistent()
        .get(&key)
        .expect("Split not found")
}

/// Check if a split exists
pub fn has_split(env: &Env, split_id: u64) -> bool {
    let key = DataKey::Split(split_id);
    env.storage().persistent().has(&key)
}

/// Store a split
pub fn set_split(env: &Env, split_id: u64, split: &Split) {
    let key = DataKey::Split(split_id);
    env.storage().persistent().set(&key, split);
    env.storage()
        .persistent()
        .extend_ttl(&key, LEDGER_TTL_THRESHOLD, LEDGER_TTL_PERSISTENT);
}

/// Remove a split (for cleanup if needed)
#[allow(dead_code)]
pub fn remove_split(env: &Env, split_id: u64) {
    let key = DataKey::Split(split_id);
    env.storage().persistent().remove(&key);
}
