import { FIELD_R, type BatchData } from "@unlink/protocol";
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

// The decode + rebuild side lives in protocol/ so the issuer and the passenger phone run identical code (invariant 5).
export { decodeLeaves, rebuildFromArkiv, type BatchData, type RevocationData } from "@unlink/protocol";

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

/** Split consecutive leaves starting at fromIndex into batches of at most `max`, numbered from startBatchNo. */
export function splitBatches(leaves: readonly bigint[], fromIndex: number, startBatchNo: number, max: number): BatchData[] {
  const out: BatchData[] = [];
  for (let i = 0; i < leaves.length; i += max) {
    out.push({ batchNo: startBatchNo + out.length, fromIndex: fromIndex + i, leaves: leaves.slice(i, i + max) });
  }
  return out;
}

