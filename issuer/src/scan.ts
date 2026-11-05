import { ethers } from "ethers";
import { assertField } from "@unlink/protocol";
import type { IssuerDb } from "./db.ts";

export type ScanBatch = {
  scannerPubKey: string; // scanner's ethereum address
  epochId: number;
  nullifiers: string[]; // decimal field-element strings
  sig: string;
};

/** Canonical digest a scanner signs over its batch (sorted nullifiers, no finer-than-epoch timestamps; SPEC §5). */
export function scanBatchDigest(scannerPubKey: string, epochId: number, nullifiers: string[]): string {
  return ethers.solidityPackedKeccak256(
    ["string", "address", "uint32", "uint256[]"],
    ["UNLINK-SCANBATCH-v1", scannerPubKey, epochId, nullifiers.map((n) => BigInt(n))],
  );
}

export type ScanResult = { stored: number; duplicates: number };

/**
 * Verify a scan batch and store its nullifiers. Only accepts batches signed by a scanner key in the allowlist
 * (SPEC §5). Returns how many nullifiers were already present (cross-scanner duplicates, the audit statistic).
 */
export function acceptScanBatch(db: IssuerDb, allowlist: string[], batch: ScanBatch): ScanResult {
  const key = batch.scannerPubKey.toLowerCase();
  if (!allowlist.includes(key)) throw new Error("scanner not in allowlist");
  if (!Number.isInteger(batch.epochId) || batch.epochId < 0) throw new Error("bad epochId");
  for (const n of batch.nullifiers) assertField(BigInt(n), "nullifier");

  const sorted = [...batch.nullifiers].map(BigInt).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map(String);
  const recovered = ethers.verifyMessage(
    ethers.getBytes(scanBatchDigest(batch.scannerPubKey, batch.epochId, sorted)),
    batch.sig,
  );
  if (recovered.toLowerCase() !== key) throw new Error("bad scanner signature");

  const duplicates = db.storeScanBatch(batch.epochId, sorted, key);
  return { stored: sorted.length, duplicates };
}
