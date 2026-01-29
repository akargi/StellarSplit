//! # Custom Types for Split Escrow Contract
//!
//! I'm defining all the core data structures here to keep them organized
//! and easily importable throughout the contract.

use soroban_sdk::{contracttype, Address, String, Vec};

/// Status of a split throughout its lifecycle
///
/// I designed these states to cover the full lifecycle:
/// - Pending: Created but no deposits yet
/// - Active: At least one deposit received
/// - Completed: All participants have paid their share
/// - Released: Funds have been released to the creator
/// - Cancelled: Split was cancelled, refunds may be needed
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SplitStatus {
    Pending,
    Active,
    Completed,
    Released,
    Cancelled,
}

/// A participant in a split
///
/// I'm tracking both the owed amount and paid amount separately
/// to support partial payments and payment verification.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Participant {
    /// The participant's Stellar address
    pub address: Address,

    /// The amount this participant owes
    pub share_amount: i128,

    /// The amount this participant has paid so far
    pub amount_paid: i128,

    /// Whether the participant has fully paid their share
    pub has_paid: bool,
}

/// A bill split record
///
/// I'm storing all split data in a single struct for atomic operations.
/// The participants vector allows any number of people to share a bill.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Split {
    /// Unique identifier for this split
    pub id: u64,

    /// The address that created this split
    pub creator: Address,

    /// Human-readable description (e.g., "Dinner at Joe's")
    pub description: String,

    /// Total amount to be split among participants
    pub total_amount: i128,

    /// Amount collected so far from participants
    pub amount_collected: i128,

    /// List of participants and their share details
    pub participants: Vec<Participant>,

    /// Current status of the split
    pub status: SplitStatus,

    /// Timestamp when the split was created
    pub created_at: u64,
}

/// Configuration for the contract
///
/// I'm keeping this minimal for now but it can be extended
/// to include fee settings, limits, etc.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ContractConfig {
    /// The contract administrator address
    pub admin: Address,

    /// Whether the contract is paused
    pub is_paused: bool,
}
