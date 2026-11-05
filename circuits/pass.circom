pragma circom 2.2.3;

// Unlink pass circuit. Statement: SPEC.md v0.3 §4.
// "I hold the secret behind a leaf in the issuer's tree with this root, the leaf's pass is still valid on
//  currentDay, its fare class is zoneClass, and this is my nullifier for epochId."
//
// Includes resolve with: -l node_modules/circomlib/circuits -l node_modules/@zk-kit/binary-merkle-root.circom/src
include "poseidon.circom";
include "bitify.circom";
include "comparators.circom";
include "binary-merkle-root.circom";

template Pass(MAX_DEPTH) {
    // Public inputs, declared first and in SPEC §4 order (snarkjs orders public signals by declaration).
    // The template has no output signals.
    signal input root;
    signal input nullifier;
    signal input epochId;
    signal input currentDay;
    signal input zoneClass;

    // Private inputs.
    signal input secret;
    signal input validUntilDay;
    signal input depth;
    signal input pathIndex;              // LeanIMT's compressed proof.index, NOT the leaf index
    signal input siblings[MAX_DEPTH];    // proof.siblings padded with 0

    // 1. leaf = Poseidon3(Poseidon1(secret), validUntilDay, zoneClass)
    signal idCommitment <== Poseidon(1)([secret]);
    signal leaf <== Poseidon(3)([idCommitment, validUntilDay, zoneClass]);

    // 2. depth <= MAX_DEPTH. The template outputs 0 for depth > MAX_DEPTH, so the caller must bound it.
    //    Num2Bits(5) makes depth < 32, which LessEqThan(5) requires of its inputs.
    component depthBits = Num2Bits(5);
    depthBits.in <== depth;
    signal depthOk <== LessEqThan(5)([depth, MAX_DEPTH]);
    depthOk === 1;

    // 3. root === BinaryMerkleRoot(MAX_DEPTH)(leaf, depth, pathIndex, siblings).
    //    The template runs Num2Bits(MAX_DEPTH) on pathIndex, so every path bit is boolean.
    signal computedRoot <== BinaryMerkleRoot(MAX_DEPTH)(leaf, depth, pathIndex, siblings);
    root === computedRoot;

    // 4. nullifier === Poseidon2(secret, epochId), using the same secret signal as the leaf.
    signal computedNullifier <== Poseidon(2)([secret, epochId]);
    nullifier === computedNullifier;

    // 5. currentDay <= validUntilDay, with both range-checked to 16 bits as LessEqThan(16) requires.
    component validUntilBits = Num2Bits(16);
    validUntilBits.in <== validUntilDay;
    component currentDayBits = Num2Bits(16);
    currentDayBits.in <== currentDay;
    signal stillValid <== LessEqThan(16)([currentDay, validUntilDay]);
    stillValid === 1;

    // 6. zoneClass in {0, 1, 2}.
    signal zoneClassTimesMinusOne <== zoneClass * (zoneClass - 1);
    zoneClassTimesMinusOne * (zoneClass - 2) === 0;
}

component main {public [root, nullifier, epochId, currentDay, zoneClass]} = Pass(20);
