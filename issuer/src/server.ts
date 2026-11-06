import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import { IssuerDb } from "./db.ts";
import { loadDeployment, loadEnv, loadProducts, loadScannerAllowlist } from "./config.ts";
import { purchase } from "./purchase.ts";
import { acceptScanBatch, type ScanBatch } from "./scan.ts";
import { RegistryClient } from "./registry.ts";
import { makeArkiv, type ArkivWriter } from "./arkiv/index.ts";
import { publishRoot } from "./publisher.ts";
import { AUTO_PUBLISH_RETRIES, autoPublishDelay, hasUnpublishedLeaves } from "./autopublish.ts";
import { PurchaseLimiter } from "./ratelimit.ts";
import { corsHook } from "./cors.ts";
import { makeLogger, type Logger } from "./logger.ts";
import { ROOT_HEARTBEAT, day } from "@unlink/protocol";

export type Server = Awaited<ReturnType<typeof buildServer>>;

/** How often the heartbeat checks whether a root is due (SPEC §3.1 heartbeat). */
const HEARTBEAT_CHECK = 10 * 60;

export async function buildServer(opts: {
  db?: IssuerDb;
  arkiv?: ArkivWriter;
  logger?: Logger;
} = {}) {
  const env = loadEnv();
  const deployment = loadDeployment();
  const products = loadProducts();
  const allowlist = loadScannerAllowlist();
  const log = opts.logger ?? makeLogger();
  const db = opts.db ?? new IssuerDb(env.dbPath);
  const limiter = new PurchaseLimiter();
  const registry = new RegistryClient(env.rpcUrl, env.issuerPrivateKey, deployment.registry);
  const arkiv = opts.arkiv ?? makeArkiv(env.issuerPrivateKey).writer;

  // One publish at a time (admin endpoint, heartbeat and auto-publish share it).
  let inFlight: Promise<unknown> = Promise.resolve();
  const publish = () => {
    const run = inFlight.then(() => publishRoot({ db, registry, arkiv, deployment, log }));
    inFlight = run.catch(() => undefined);
    return run;
  };

  // Auto-publish after a purchase (src/autopublish.ts). The "anything new?" check runs inside the publish queue, so a
  // heartbeat or admin publish that already covered the new leaves makes this a no-op instead of a second root.
  let autoTimer: NodeJS.Timeout | null = null;
  const scheduleAutoPublish = (attempt = 0): void => {
    if (autoTimer) return;
    const delay = autoPublishDelay(Math.floor(Date.now() / 1000), db.latestRoot()?.issuedAt, deployment.minRootInterval);
    autoTimer = setTimeout(() => {
      autoTimer = null;
      const run = inFlight.then(() =>
        hasUnpublishedLeaves(db) ? publishRoot({ db, registry, arkiv, deployment, log }) : undefined,
      );
      inFlight = run.catch(() => undefined);
      run
        .then((signed) => { if (signed) log.info({ rootId: signed.rootId, leafCount: signed.leafCount }, "auto-publish"); })
        .catch((e) => {
          log.error({ err: (e as Error).message, attempt }, "auto-publish failed");
          if (attempt + 1 < AUTO_PUBLISH_RETRIES) scheduleAutoPublish(attempt + 1);
        });
    }, delay * 1000);
  };

  /**
   * SPEC §3.1 heartbeat: a root at least every ROOT_HEARTBEAT, and once within the first hour after 00:00 IST
   * (that root also zeroes expired batches), even with no new purchases.
   */
  const heartbeatDue = (now: number): boolean => {
    const last = db.latestRoot();
    if (!last) return db.allLeaves().length > 0;
    return now - last.issuedAt >= ROOT_HEARTBEAT - HEARTBEAT_CHECK || day(now) !== day(last.issuedAt);
  };
  const startHeartbeat = (): NodeJS.Timeout => {
    const tick = () => {
      if (!heartbeatDue(Math.floor(Date.now() / 1000))) return;
      publish().catch((e) => log.error({ err: (e as Error).message }, "heartbeat publish failed"));
    };
    tick();
    return setInterval(tick, HEARTBEAT_CHECK * 1000);
  };

  // disableRequestLogging: Fastify's default per-request lines include the client IP (remoteAddress) and URL.
  // That would link a buyer's IP to purchase time (invariant 1). We log only our own count/rootId/product lines.
  const app = Fastify({ loggerInstance: log, disableRequestLogging: true, trustProxy: env.trustProxy });

  const requireAdmin = (req: { headers: Record<string, unknown> }): void => {
    if (req.headers["x-admin-token"] !== env.adminToken) throw new Error("unauthorized");
  };

  // CORS for the live demo page only (src/cors.ts): POST /purchase and GET /health, nothing else.
  app.addHook("onRequest", corsHook(env.corsOrigins));

  app.get("/health", async () => ({ ok: true }));

  // POST /purchase {idCommitment, product} -> {leafIndex, validUntilDay, zoneClass}
  app.post("/purchase", async (req, reply) => {
    const body = req.body as { idCommitment?: string; product?: string };
    if (!body?.idCommitment || !body?.product) return reply.code(400).send({ error: "idCommitment and product required" });
    if (!limiter.allow(req.ip)) {
      return reply.code(429).send({ error: "too many purchases, try again later" });
    }
    try {
      const result = purchase(db, products, BigInt(body.idCommitment), body.product);
      log.info({ product: body.product }, "purchase"); // no idCommitment/leaf/leafIndex in the log line
      scheduleAutoPublish();
      return result;
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // POST /admin/revoke {leafIndex}
  app.post("/admin/revoke", async (req, reply) => {
    try {
      requireAdmin(req as never);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = req.body as { leafIndex?: number };
    if (typeof body?.leafIndex !== "number") return reply.code(400).send({ error: "leafIndex required" });
    try {
      const seq = db.revokeLeaf(body.leafIndex);
      log.info({ seq }, "revoke");
      return { seq };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // POST /admin/publish-root -> rebuild, postRoot on Sepolia, sign, store, publish to Arkiv
  app.post("/admin/publish-root", async (req, reply) => {
    try {
      requireAdmin(req as never);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
    try {
      const signed = await publish();
      return {
        rootId: signed.rootId,
        root: signed.root,
        issuedAt: signed.issuedAt,
        expiresAt: signed.expiresAt,
        leafCount: signed.leafCount,
        revSeq: signed.revSeq,
        txHash: signed.txHash,
      };
    } catch (e) {
      log.error({ err: (e as Error).message }, "publish-root failed");
      return reply.code(502).send({ error: (e as Error).message });
    }
  });

  // POST /scan-batches {scannerPubKey, epochId, nullifiers[], sig} -> {stored, duplicates}
  app.post("/scan-batches", async (req, reply) => {
    try {
      const result = acceptScanBatch(db, allowlist, req.body as ScanBatch);
      log.info({ epochId: (req.body as ScanBatch).epochId, ...result }, "scan-batch");
      return result;
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  return { app, db, registry, deployment, env, log, publish, heartbeatDue, startHeartbeat };
}

// Entry point: `npm start`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { app, env, log, startHeartbeat } = await buildServer();
  startHeartbeat();
  app.listen({ port: env.port, host: env.host }).then((addr) => log.info({ addr }, "issuer listening"));
}
