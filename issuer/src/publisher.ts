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

  const { tree, leaves } = rebuildTree(db);
  const root = zeroPadValue(toBeHex(tree.root), 32); // bytes32, nonzero (empty tree root is nonzero for ≥1 leaf)
  const leafCount = leaves.length;
  const revSeq = db.revSeq();

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

  // New leaves and revocations since the previous root, for Module 6's Arkiv writer.
  const prevRow = db.raw.prepare("SELECT leafCount, revSeq FROM roots WHERE rootId < ? ORDER BY rootId DESC LIMIT 1")
    .get(rootId) as { leafCount: number; revSeq: number } | undefined;
  const fromIndex = prevRow?.leafCount ?? 0;
  const fromSeq = prevRow?.revSeq ?? 0;
  const newLeaves: NewLeaf[] = leaves.slice(fromIndex).map((l) => ({ leafIndex: l.leafIndex, leaf: l.leaf }));
  const revocations: Revocation[] = (
    db.raw.prepare("SELECT seq, leafIndex, reason FROM revocations WHERE seq > ? ORDER BY seq").all(fromSeq) as Revocation[]
  );

  await arkiv.publishToArkiv(signedRoot, newLeaves, revocations);

  log.info({ rootId, leafCount, revSeq, newLeaves: newLeaves.length, revocations: revocations.length, txHash }, "root published");
  return signedRoot;
}
