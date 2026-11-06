import { LEAF_BATCH_MAX, day } from "@unlink/protocol";
import { toBeHex, zeroPadValue } from "ethers";
import type { IssuerDb } from "./db.ts";
import type { RegistryClient } from "./registry.ts";
import type { ArkivWriter } from "./arkiv/writer.ts";
import type { SignedRoot } from "./arkiv/types.ts";
import type { Logger } from "./logger.ts";
import type { Deployment } from "./config.ts";
import { rebuildTree } from "./tree.ts";
import { expiresAtFor, signRoot } from "./sign.ts";

export type PublisherCtx = {
  db: IssuerDb;
  registry: RegistryClient;
  arkiv: ArkivWriter;
  deployment: Deployment;
  log: Logger;
  now?: () => number;
};

export type PublishResult = SignedRoot & { arkivKeys: { batches: string[]; revocations: string[]; signedRoot: string } };

/**
 * SPEC §3.1 issuer duties, in order:
 *  0. zeroing: every batch whose leaves have all expired gets an `expired` revocation; new leaves get LeafBatches;
 *  1. Arkiv: publish every unpublished LeafBatch, then every unpublished Revocation (idempotent writes);
 *  2. Registry.postRoot(root) on Sepolia;
 *  3. sign with the on-chain rootId and postedAt (§3.3), store;
 *  4. Arkiv: publish the SignedRoot.
 * So whenever a rootId exists on chain, the data a phone needs to rebuild it is already on Arkiv.
 */
export async function publishRoot(ctx: PublisherCtx): Promise<PublishResult> {
  const { db, registry, arkiv, deployment, log } = ctx;
  const now = ctx.now?.() ?? Math.floor(Date.now() / 1000);

  // The wallet that posts, signs and writes to Arkiv MUST be the issuer named in the signed root, or scanners and
  // phones recover / filter on a different address and reject every root (SPEC §5 step 5, §3.1 step 2).
  const issuer = deployment.issuer.toLowerCase();
  if (registry.wallet.address.toLowerCase() !== issuer) {
    throw new Error(`signing wallet ${registry.wallet.address} != deployment.issuer ${deployment.issuer}`);
  }
  if (arkiv.address.toLowerCase() !== issuer) throw new Error(`Arkiv writer ${arkiv.address} != deployment.issuer`);

  // Recover: a previous run died after its postRoot tx was mined but before recordRoot. The root we were posting
  // is in pendingRoot; if it is the issuer's on-chain latest, sign it with the on-chain rootId/postedAt and record it.
  const pending = db.pendingRoot();
  if (pending) {
    const state = await registry.issuerState(deployment.issuer);
    const recorded = db.latestRoot()?.rootId ?? 0;
    if (state.latestRootId > recorded && state.latestRoot.toLowerCase() === pending.root.toLowerCase()) {
      const f = {
        chainId: deployment.chainId,
        registry: deployment.registry,
        issuer: deployment.issuer,
        rootId: state.latestRootId,
        root: pending.root,
        issuedAt: state.latestPostedAt,
        expiresAt: expiresAtFor(state.latestPostedAt),
      };
      const signature = await signRoot(registry.wallet, f);
      db.recordRoot({ ...f, leafCount: pending.leafCount, revSeq: pending.revSeq, signature, txHash: pending.txHash ?? "" });
      log.warn({ rootId: f.rootId }, "recovered an on-chain root a crashed run did not record");
    } else {
      db.clearPendingRoot(); // that tx never landed (or a later root superseded it)
    }
  }

  // Heal: if a previous run crashed between recordRoot and step 4, the latest root is on chain and recorded but its
  // SignedRoot is not on Arkiv, so phones cannot move to it. Re-publish it (idempotent: an identical entity is reused).
  const prev = db.latestRoot();
  if (prev) {
    await arkiv.publishSignedRoot({
      chainId: deployment.chainId,
      registry: deployment.registry,
      issuer: deployment.issuer,
      ...prev,
    });
  }

  const zeroed = db.zeroExpiredBatches(day(now));
  const newBatches = db.batchNewLeaves(LEAF_BATCH_MAX);

  const { tree, leaves } = rebuildTree(db);
  if (BigInt(tree.root) === 0n) throw new Error("refusing to post a zero root (empty tree)"); // SPEC §3.3 / postRoot
  const root = zeroPadValue(toBeHex(tree.root), 32); // bytes32
  const leafCount = leaves.length;
  const revSeq = db.revSeq();

  // (1) leaves + revocations first.
  const batchKeys: string[] = [];
  for (const b of db.batches().filter((x) => !x.published)) {
    const r = await arkiv.publishLeafBatch({
      batchNo: b.batchNo,
      fromIndex: b.fromIndex,
      lastValidDay: b.lastValidDay,
      leaves: db.batchLeaves(b),
    });
    db.markBatchPublished(b.batchNo);
    batchKeys.push(r.entityKey);
  }
  const revocationKeys: string[] = [];
  for (const rev of db.unpublishedRevocations()) {
    const r = await arkiv.publishRevocation(rev, db.batchDaysOverlapping(rev.fromIndex, rev.count));
    db.markRevocationPublished(rev.seq);
    revocationKeys.push(r.entityKey);
  }

  // (2) on-chain root, (3) sign with the on-chain rootId and postedAt.
  db.setPendingRoot({ root, leafCount, revSeq });
  const { rootId, postedAt, txHash } = await registry.postRoot(root, (hash) =>
    db.setPendingRoot({ root, leafCount, revSeq, txHash: hash }),
  );
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

  // (4) the signed root.
  const sr = await arkiv.publishSignedRoot(signedRoot);

  // Counts and ids only: never a leaf, leafIndex or revocation range (invariant 1).
  log.info(
    { rootId, leafCount, revSeq, newBatches: newBatches.length, zeroedBatches: zeroed.length, txHash },
    "root published (Sepolia + Arkiv)",
  );
  return { ...signedRoot, arkivKeys: { batches: batchKeys, revocations: revocationKeys, signedRoot: sr.entityKey } };
}
