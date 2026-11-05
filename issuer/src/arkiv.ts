import type { SignedRootFields } from "./sign.ts";

/** A new leaf as published to Arkiv in a LeafBatch (SPEC §3.1). */
export type NewLeaf = { leafIndex: number; leaf: string };

/** A revocation as published to Arkiv (SPEC §3.1). */
export type Revocation = { seq: number; leafIndex: number; reason: string };

export type SignedRoot = SignedRootFields & { signature: string; leafCount: number; revSeq: number; txHash: string };

/**
 * The publisher calls this after each root is posted and signed. Module 6 implements the real Arkiv writer
 * (SignedRoot + LeafBatch + Revocation entities). Here it is just an interface plus a no-op that logs counts.
 */
export interface ArkivPublisher {
  publishToArkiv(signedRoot: SignedRoot, newLeaves: NewLeaf[], revocations: Revocation[]): Promise<void>;
}

export class NoopArkivPublisher implements ArkivPublisher {
  constructor(private readonly log: (o: object, msg: string) => void) {}

  async publishToArkiv(signedRoot: SignedRoot, newLeaves: NewLeaf[], revocations: Revocation[]): Promise<void> {
    // Counts only — never leaf values or indices (invariant 1).
    this.log(
      { rootId: signedRoot.rootId, newLeaves: newLeaves.length, revocations: revocations.length },
      "arkiv publish (noop; Module 6 implements)",
    );
  }
}
