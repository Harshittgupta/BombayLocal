import type { SignedRootFields } from "../sign.ts";

/** The SignedRoot entity: the §3.3 signed fields plus the unsigned leafCount/revSeq (SPEC §3.1). */
export type SignedRoot = SignedRootFields & { signature: string; leafCount: number; revSeq: number; txHash: string };

export type LeafBatch = { batchNo: number; fromIndex: number; leaves: bigint[]; lastValidDay: number };

export type Revocation = { seq: number; fromIndex: number; count: number; reason: "revoked" | "expired" };

/** Any record read back from Arkiv carries its entity key. */
export type Keyed<T> = T & { entityKey: string };
