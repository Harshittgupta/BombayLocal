import { FIELD_R } from "./constants.ts";
import { bytesToUint, hexToBytes } from "./bytes.ts";
import { buildTree, type PassTree } from "./tree.ts";

/**
 * The Arkiv rebuild (SPEC §3.1 refresh step 4), shared by the issuer's round trip and the passenger phone so both
 * run identical code (invariant 5).
 */
export type BatchData = { batchNo: number; fromIndex: number; leaves: bigint[] };
export type RevocationData = { seq: number; fromIndex: number; count: number };

/** LeafBatch `leaves` bytes: count × 32-byte big-endian field elements. */
export function decodeLeaves(hex: string): bigint[] {
  const b = hexToBytes(hex);
  if (b.length % 32 !== 0) throw new Error(`leaf bytes length ${b.length} is not a multiple of 32`);
  const out: bigint[] = [];
  for (let i = 0; i < b.length; i += 32) out.push(bytesToUint(b.subarray(i, i + 32)));
  return out;
}

/**
 * Rebuild the LeanIMT over [0, leafCount) from public Arkiv data:
 * - each position takes its value from the live LeafBatch covering it, or 0 if none does (expired and zeroed);
 * - overlapping non-identical batches, or any leaf >= r, reject;
 * - then every Revocation with seq <= revSeq sets its range to 0.
 */
export function rebuildFromArkiv(
  leafCount: number,
  revSeq: number,
  batches: readonly BatchData[],
  revocations: readonly RevocationData[],
): PassTree {
  const pos: (bigint | undefined)[] = new Array(leafCount).fill(undefined);
  for (const b of batches) {
    b.leaves.forEach((v, i) => {
      if (v >= FIELD_R) throw new Error(`batch ${b.batchNo}: leaf >= r`);
      const idx = b.fromIndex + i;
      if (idx >= leafCount) return; // published ahead of the root that will cover it
      const prev = pos[idx];
      if (prev !== undefined && prev !== v) throw new Error(`overlapping non-identical batches (batch ${b.batchNo})`);
      pos[idx] = v;
    });
  }
  const values = pos.map((v) => v ?? 0n);
  for (const r of revocations) {
    if (r.seq > revSeq) continue;
    for (let i = r.fromIndex; i < r.fromIndex + r.count && i < leafCount; i++) values[i] = 0n;
  }
  return buildTree(values);
}
