import { buildTree, merkleProof, type CircuitMerkleProof } from "@bombaylocal/protocol";
import type { IssuerDb, Leaf } from "./db.ts";

/** Rebuild the LeanIMT over all leaves, with revoked leaves set to 0 (SPEC §3.1 / §7). */
export function rebuildTree(db: IssuerDb): { tree: ReturnType<typeof buildTree>; leaves: Leaf[] } {
  const leaves = db.allLeaves();
  const values = leaves.map((l) => (l.revoked ? 0n : BigInt(l.leaf)));
  return { tree: buildTree(values), leaves };
}

/** The circuit Merkle proof for one leaf index, from the current tree. */
export function pathFor(db: IssuerDb, leafIndex: number): CircuitMerkleProof {
  const { tree } = rebuildTree(db);
  return merkleProof(tree, leafIndex);
}
