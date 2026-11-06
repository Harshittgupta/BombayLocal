import { FIELD_R, buildTree, type PassTree } from "@unlink/protocol";
import { bytesToHex, hexToBytes, type Hex } from "viem";

/** Leaves as bytes: each a 32-byte big-endian field element, concatenated (SPEC §3.1 LeafBatch). */
export function encodeLeaves(leaves: readonly bigint[]): Uint8Array {
  const out = new Uint8Array(leaves.length * 32);
  leaves.forEach((v, i) => {
    if (v < 0n || v >= FIELD_R) throw new Error("leaf out of field range");
    out.set(hexToBytes(`0x${v.toString(16).padStart(64, "0")}`), i * 32);
  });
  return out;
}

export function decodeLeaves(hex: Hex): bigint[] {
  const b = hexToBytes(hex);
  if (b.length % 32 !== 0) throw new Error(`leaf bytes length ${b.length} is not a multiple of 32`);
  const out: bigint[] = [];
  for (let i = 0; i < b.length; i += 32) out.push(BigInt(bytesToHex(b.subarray(i, i + 32))));
  return out;
}

/** Scanner keys as bytes: 20-byte addresses, concatenated. */
export function encodeAddresses(addrs: readonly string[]): Uint8Array {
  const out = new Uint8Array(addrs.length * 20);
  addrs.forEach((a, i) => {
    const b = hexToBytes(a as Hex);
    if (b.length !== 20) throw new Error(`not a 20-byte address: ${a}`);
    out.set(b, i * 20);
  });
  return out;
}

export function decodeAddresses(hex: Hex): string[] {
  const b = hexToBytes(hex);
  if (b.length % 20 !== 0) throw new Error("scanner list length is not a multiple of 20");
  const out: string[] = [];
  for (let i = 0; i < b.length; i += 20) out.push(bytesToHex(b.subarray(i, i + 20)));
  return out;
}

export type BatchData = { batchNo: number; fromIndex: number; leaves: bigint[] };
export type RevocationData = { seq: number; fromIndex: number; count: number };

/** Split consecutive leaves starting at fromIndex into batches of at most `max`, numbered from startBatchNo. */
export function splitBatches(leaves: readonly bigint[], fromIndex: number, startBatchNo: number, max: number): BatchData[] {
  const out: BatchData[] = [];
  for (let i = 0; i < leaves.length; i += max) {
    out.push({ batchNo: startBatchNo + out.length, fromIndex: fromIndex + i, leaves: leaves.slice(i, i + max) });
  }
  return out;
}

/**
 * SPEC §3.1 refresh step 4: rebuild the LeanIMT over [0, leafCount) from public Arkiv data.
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
