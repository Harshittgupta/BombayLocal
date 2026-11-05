import type { IssuerDb } from "./db.ts";
import type { RegistryClient } from "./registry.ts";
import type { ArkivPublisher, NewLeaf, Revocation, SignedRoot } from "./arkiv.ts";
import type { Logger } from "./logger.ts";
import type { Deployment } from "./config.ts";
import { rebuildTree } from "./tree.ts";
import { expiresAtFor, signRoot } from "./sign.ts";
import { toBeHex, zeroPadValue } from "ethers";

export type PublisherCtx = {
  db: IssuerDb;
  registry: RegistryClient;
  arkiv: ArkivPublisher;
  deployment: Deployment;
  log: Logger;
};

/**
 * Rebuild the tree, post the root on-chain, sign it with the exact §3.3 encoding (issuedAt = on-chain postedAt,
 * expiresAt = issuedAt + ROOT_TTL), store it, then publish to Arkiv. Returns the signed root.
 */
export async function publishRoot(ctx: PublisherCtx): Promise<SignedRoot> {
  const { db, registry, arkiv, deployment, log } = ctx;

  // Safety: the wallet that posts and signs MUST be the issuer named in the signed root, or scanners recover a
  // different address and reject every root (SPEC §5 step 5).
  if (registry.wallet.address.toLowerCase() !== deployment.issuer.toLowerCase()) {
    throw new Error(`signing wallet ${registry.wallet.address} != deployment.issuer ${deployment.issuer}`);
  }

  const { tree, leaves } = rebuildTree(db);
  if (BigInt(tree.root) === 0n) throw new Error("refusing to post a zero root (empty tree)"); // SPEC §3.3 / postRoot
  const root = zeroPadValue(toBeHex(tree.root), 32); // bytes32
  const leafCount = leaves.length;
  const revSeq = db.revSeq();

  // Deltas since the previous root (the current max rootId row), computed BEFORE posting.
  const prevRow = db.raw.prepare("SELECT leafCount, revSeq FROM roots ORDER BY rootId DESC LIMIT 1")
    .get() as { leafCount: number; revSeq: number } | undefined;
  const fromIndex = prevRow?.leafCount ?? 0;
  const fromSeq = prevRow?.revSeq ?? 0;
  const newLeaves: NewLeaf[] = leaves.slice(fromIndex).map((l) => ({ leafIndex: l.leafIndex, leaf: l.leaf }));
  const revocations: Revocation[] = db.raw
    .prepare("SELECT seq, leafIndex, reason FROM revocations WHERE seq > ? ORDER BY seq")
    .all(fromSeq) as Revocation[];

  // SPEC §3.1 publishing order: (1) leaves + revocations, (2) postRoot, (3) sign, (4) signed root.
  await arkiv.publishLeavesAndRevocations(newLeaves, revocations);

  const { rootId, postedAt, txHash } = await registry.postRoot(root);
  const issuedAt = postedAt;
  const expiresAt = expiresAtFor(issuedAt);

  const fields = {
    chainId: deployment.chainId,
    registry: deployment.registry,
    issuer: deployment.issuer,
    rootId,
    root,
    issuedAt,
    expiresAt,
  };
  const signature = await signRoot(registry.wallet, fields);

  db.recordRoot({ rootId, root, issuedAt, expiresAt, leafCount, revSeq, signature, txHash });
  const signedRoot: SignedRoot = { ...fields, signature, leafCount, revSeq, txHash };

  await arkiv.publishSignedRoot(signedRoot);

  log.info({ rootId, leafCount, revSeq, newLeaves: newLeaves.length, revocations: revocations.length, txHash }, "root published");
  return signedRoot;
}
