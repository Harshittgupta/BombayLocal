import type { SignedRootFields } from "./sign.ts";

/** A new leaf as published to Arkiv in a LeafBatch (SPEC §3.1). */
export type NewLeaf = { leafIndex: number; leaf: string };

/** A revocation as published to Arkiv (SPEC §3.1). */
export type Revocation = { seq: number; leafIndex: number; reason: string };

export type SignedRoot = SignedRootFields & { signature: string; leafCount: number; revSeq: number; txHash: string };

/**
 * Split in the SPEC §3.1 publishing order: the publisher writes leaves and revocations FIRST, then posts the
 * root on-chain, then signs it, then writes the SignedRoot. This guarantees that whenever a rootId exists on
 * chain, the LeafBatch/Revocation data a phone needs to rebuild it is already on Arkiv. Module 6 implements the
 * real writer (LeafBatch / Revocation / SignedRoot entities). Here it is the interface plus a no-op that logs counts.
 */
export interface ArkivPublisher {
  /** Step 1: publish the new leaves and revocations (before postRoot). */
  publishLeavesAndRevocations(newLeaves: NewLeaf[], revocations: Revocation[]): Promise<void>;
  /** Step 4: publish the signed root (after postRoot + sign). */
  publishSignedRoot(signedRoot: SignedRoot): Promise<void>;
}

export class NoopArkivPublisher implements ArkivPublisher {
  constructor(private readonly log: (o: object, msg: string) => void) {}

  async publishLeavesAndRevocations(newLeaves: NewLeaf[], revocations: Revocation[]): Promise<void> {
    // Counts only — never leaf values or indices (invariant 1).
    this.log({ newLeaves: newLeaves.length, revocations: revocations.length }, "arkiv leaves+revocations (noop; Module 6)");
  }

  async publishSignedRoot(signedRoot: SignedRoot): Promise<void> {
    this.log({ rootId: signedRoot.rootId, leafCount: signedRoot.leafCount }, "arkiv signed root (noop; Module 6)");
  }
}
