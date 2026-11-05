import { LeanIMT } from "@zk-kit/lean-imt";
import { MAX_DEPTH } from "./constants.ts";
import { assertField, hash2 } from "./hash.ts";

export type PassTree = LeanIMT<bigint>;

/**
 * Poseidon LeanIMT (SPEC §3.2): internal node = Poseidon2(left, right); a node with no right sibling is
 * promoted unchanged; a 0 leaf (revoked or zeroed) is an ordinary value.
 */
export function buildTree(leaves: readonly bigint[]): PassTree {
  if (leaves.length > 2 ** MAX_DEPTH) throw new RangeError(`tree holds at most 2^${MAX_DEPTH} leaves`);
  leaves.forEach((l, i) => assertField(l, `leaf ${i}`));
  return new LeanIMT<bigint>(hash2, [...leaves]);
}

/** Exactly what the circuit's private Merkle inputs expect (SPEC §3.2, §4). */
export type CircuitMerkleProof = {
  root: bigint;
  leaf: bigint;
  /** Levels that had a sibling = proof.siblings.length (may be < tree depth). Constrained <= MAX_DEPTH. */
  depth: number;
  /** LeanIMT's compressed proof.index: one bit per level that had a sibling, level 0 = LSB. NOT the leaf index. */
  pathIndex: number;
  /** proof.siblings padded with 0 to MAX_DEPTH entries. */
  siblings: bigint[];
};

export function merkleProof(tree: PassTree, leafIndex: number): CircuitMerkleProof {
  const p = tree.generateProof(leafIndex);
  const depth = p.siblings.length;
  if (depth > MAX_DEPTH) throw new RangeError(`proof depth ${depth} exceeds MAX_DEPTH`);
  if (p.index < 0 || p.index >= 2 ** MAX_DEPTH) throw new RangeError("path index out of range");
  const siblings = [...p.siblings, ...Array<bigint>(MAX_DEPTH - depth).fill(0n)];
  return { root: p.root, leaf: p.leaf, depth, pathIndex: p.index, siblings };
}
