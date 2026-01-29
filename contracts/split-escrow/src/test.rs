//! # Unit Tests for Split Escrow Contract
//!
//! I'm testing all the core functionality to ensure the contract
//! behaves correctly under various scenarios.

#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String, Vec};

/// Helper to create a test environment and contract client
fn setup_test() -> (Env, Address, SplitEscrowContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, SplitEscrowContract);
    let client = SplitEscrowContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);

    (env, admin, client)
}

/// Helper to initialize the contract
fn initialize_contract(client: &SplitEscrowContractClient, admin: &Address) {
    client.initialize(admin);
}

// ============================================
// Initialization Tests
// ============================================

#[test]
fn test_initialize() {
    let (_env, admin, client) = setup_test();

    initialize_contract(&client, &admin);

    let stored_admin = client.get_admin();
    assert_eq!(stored_admin, admin);
}

#[test]
#[should_panic(expected = "Contract already initialized")]
fn test_double_initialize_fails() {
    let (_env, admin, client) = setup_test();

    initialize_contract(&client, &admin);
    // Second initialization should fail
    initialize_contract(&client, &admin);
}

// ============================================
// Split Creation Tests
// ============================================

#[test]
fn test_create_split() {
    let (env, admin, client) = setup_test();
    initialize_contract(&client, &admin);

    let creator = Address::generate(&env);
    let participant1 = Address::generate(&env);
    let participant2 = Address::generate(&env);

    let description = String::from_str(&env, "Dinner at Joe's");
    let total_amount: i128 = 100_0000000; // 100 with 7 decimals

    let mut addresses = Vec::new(&env);
    addresses.push_back(participant1.clone());
    addresses.push_back(participant2.clone());

    let mut shares = Vec::new(&env);
    shares.push_back(50_0000000i128);
    shares.push_back(50_0000000i128);

    let split_id = client.create_split(&creator, &description, &total_amount, &addresses, &shares);

    assert_eq!(split_id, 1);

    let split = client.get_split(&split_id);
    assert_eq!(split.id, 1);
    assert_eq!(split.creator, creator);
    assert_eq!(split.total_amount, total_amount);
    assert_eq!(split.status, SplitStatus::Pending);
    assert_eq!(split.participants.len(), 2);
}

#[test]
#[should_panic(expected = "Participant shares must sum to total amount")]
fn test_create_split_invalid_shares() {
    let (env, admin, client) = setup_test();
    initialize_contract(&client, &admin);

    let creator = Address::generate(&env);
    let participant = Address::generate(&env);

    let description = String::from_str(&env, "Bad split");
    let total_amount: i128 = 100_0000000;

    let mut addresses = Vec::new(&env);
    addresses.push_back(participant);

    // Share doesn't match total
    let mut shares = Vec::new(&env);
    shares.push_back(50_0000000i128);

    client.create_split(&creator, &description, &total_amount, &addresses, &shares);
}

#[test]
#[should_panic(expected = "At least one participant is required")]
fn test_create_split_no_participants() {
    let (env, admin, client) = setup_test();
    initialize_contract(&client, &admin);

    let creator = Address::generate(&env);
    let description = String::from_str(&env, "Empty split");

    let addresses: Vec<Address> = Vec::new(&env);
    let shares: Vec<i128> = Vec::new(&env);

    client.create_split(&creator, &description, &0, &addresses, &shares);
}

// ============================================
// Deposit Tests
// ============================================

#[test]
fn test_deposit() {
    let (env, admin, client) = setup_test();
    initialize_contract(&client, &admin);

    let creator = Address::generate(&env);
    let participant = Address::generate(&env);

    let description = String::from_str(&env, "Test split");
    let total_amount: i128 = 100_0000000;

    let mut addresses = Vec::new(&env);
    addresses.push_back(participant.clone());

    let mut shares = Vec::new(&env);
    shares.push_back(100_0000000i128);

    let split_id = client.create_split(&creator, &description, &total_amount, &addresses, &shares);

    // Make a deposit
    client.deposit(&split_id, &participant, &50_0000000);

    let split = client.get_split(&split_id);
    assert_eq!(split.status, SplitStatus::Active);
    assert_eq!(split.amount_collected, 50_0000000);

    // Complete the deposit
    client.deposit(&split_id, &participant, &50_0000000);

    let split = client.get_split(&split_id);
    assert_eq!(split.status, SplitStatus::Completed);
    assert_eq!(split.amount_collected, 100_0000000);
}

#[test]
#[should_panic(expected = "Deposit exceeds remaining amount owed")]
fn test_deposit_exceeds_share() {
    let (env, admin, client) = setup_test();
    initialize_contract(&client, &admin);

    let creator = Address::generate(&env);
    let participant = Address::generate(&env);

    let description = String::from_str(&env, "Test split");

    let mut addresses = Vec::new(&env);
    addresses.push_back(participant.clone());

    let mut shares = Vec::new(&env);
    shares.push_back(100_0000000i128);

    let split_id = client.create_split(&creator, &description, &100_0000000, &addresses, &shares);

    // Try to overpay
    client.deposit(&split_id, &participant, &150_0000000);
}

// ============================================
// Cancel Tests
// ============================================

#[test]
fn test_cancel_split() {
    let (env, admin, client) = setup_test();
    initialize_contract(&client, &admin);

    let creator = Address::generate(&env);
    let participant = Address::generate(&env);

    let description = String::from_str(&env, "Test split");

    let mut addresses = Vec::new(&env);
    addresses.push_back(participant);

    let mut shares = Vec::new(&env);
    shares.push_back(100_0000000i128);

    let split_id = client.create_split(&creator, &description, &100_0000000, &addresses, &shares);

    client.cancel_split(&split_id);

    let split = client.get_split(&split_id);
    assert_eq!(split.status, SplitStatus::Cancelled);
}

// ============================================
// Release Tests
// ============================================

#[test]
fn test_release_funds() {
    let (env, admin, client) = setup_test();
    initialize_contract(&client, &admin);

    let creator = Address::generate(&env);
    let participant = Address::generate(&env);

    let description = String::from_str(&env, "Test split");

    let mut addresses = Vec::new(&env);
    addresses.push_back(participant.clone());

    let mut shares = Vec::new(&env);
    shares.push_back(100_0000000i128);

    let split_id = client.create_split(&creator, &description, &100_0000000, &addresses, &shares);

    // Complete the split
    client.deposit(&split_id, &participant, &100_0000000);

    // Release funds
    client.release_funds(&split_id);

    // Note: In a full implementation, we'd verify the token transfer
    // For now, we just verify the function doesn't panic
}

#[test]
#[should_panic(expected = "Split is not completed")]
fn test_release_incomplete_split() {
    let (env, admin, client) = setup_test();
    initialize_contract(&client, &admin);

    let creator = Address::generate(&env);
    let participant = Address::generate(&env);

    let description = String::from_str(&env, "Test split");

    let mut addresses = Vec::new(&env);
    addresses.push_back(participant);

    let mut shares = Vec::new(&env);
    shares.push_back(100_0000000i128);

    let split_id = client.create_split(&creator, &description, &100_0000000, &addresses, &shares);

    // Try to release without completing deposits
    client.release_funds(&split_id);
}
