import { addr, bytes, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";

/**
 * Arkiv entity schemas (SPEC §3.1, §9; documented in arkiv/schema.md). Every entity carries app="unlink", v=1,
 * type and the writer's address, all indexed. Readers ALSO require $creator = $owner = the expected writer: the
 * attributes alone prove nothing, because anyone can write any attribute.
 */
export const APP = "unlink";
export const SCHEMA_VERSION = 1n;

export const TYPE = {
  signedRoot: "unlink.signedRoot",
  leafBatch: "unlink.leafBatch",
  revocation: "unlink.revocation",
  scannerList: "unlink.scannerList",
  verifyKey: "unlink.verifyKey",
  expiryDemo: "unlink.expiryDemo",
} as const;

const common = {
  app: str().indexed(),
  v: u64().indexed(),
  type: str().indexed(),
  issuer: addr().indexed(),
};

/** §3.3 fields + unsigned leafCount/revSeq. signature is 65 B (132 hex chars > the 128 B str limit), so bytes. */
export const SignedRootSchema = defineSchema(TYPE.signedRoot, {
  ...common,
  rootId: u64().indexed(),
  chainId: u64(),
  registry: addr(),
  root: str(),
  issuedAt: u64(),
  expiresAt: u64(),
  leafCount: u64(),
  revSeq: u64(),
  signature: bytes(),
  txHash: str(),
});

/** Consecutive leaves [fromIndex, fromIndex+count), each 32 B big-endian, at most LEAF_BATCH_MAX per entity. */
export const LeafBatchSchema = defineSchema(TYPE.leafBatch, {
  ...common,
  batchNo: u64().indexed(),
  fromIndex: u64().indexed(),
  count: u64(),
  lastValidDay: u64(),
  leaves: bytes(),
});

/** Sets leaves [fromIndex, fromIndex+count) to 0. reason: "revoked" (one pass) | "expired" (a whole batch). */
export const RevocationSchema = defineSchema(TYPE.revocation, {
  ...common,
  seq: u64().indexed(),
  fromIndex: u64(),
  count: u64(),
  reason: str().indexed(),
});

/** Scanner pubkey (address) allowlist: 20 B each, concatenated. */
export const ScannerListSchema = defineSchema(TYPE.scannerList, {
  ...common,
  listNo: u64().indexed(),
  keys: bytes(),
});

/**
 * Groth16 verification key: the exact bytes of circuits/artifacts/verification_key.json. Written by the
 * AUTHORITY wallet (SPEC §9), so `issuer` here holds the authority address (the writer).
 */
export const VerifyKeySchema = defineSchema(TYPE.verifyKey, {
  ...common,
  vkSha256: str().indexed(),
  vk: bytes(),
});

/** Throwaway entity used only by scripts/arkiv-expiry-demo.ts to show expiry working. */
export const ExpiryDemoSchema = defineSchema(TYPE.expiryDemo, {
  ...common,
  note: str(),
});
