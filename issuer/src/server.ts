import Fastify from "fastify";
import { IssuerDb } from "./db.ts";
import { loadDeployment, loadEnv, loadProducts, loadScannerAllowlist } from "./config.ts";
import { purchase } from "./purchase.ts";
import { acceptScanBatch, type ScanBatch } from "./scan.ts";
import { RegistryClient } from "./registry.ts";
import { NoopArkivPublisher, type ArkivPublisher } from "./arkiv.ts";
import { publishRoot } from "./publisher.ts";
import { makeLogger, type Logger } from "./logger.ts";

export type Server = Awaited<ReturnType<typeof buildServer>>;

export async function buildServer(opts: {
  db?: IssuerDb;
  arkiv?: ArkivPublisher;
  logger?: Logger;
} = {}) {
  const env = loadEnv();
  const deployment = loadDeployment();
  const products = loadProducts();
  const allowlist = loadScannerAllowlist();
  const log = opts.logger ?? makeLogger();
  const db = opts.db ?? new IssuerDb("issuer.db");
  const registry = new RegistryClient(env.rpcUrl, env.issuerPrivateKey, deployment.registry);
  const arkiv = opts.arkiv ?? new NoopArkivPublisher((o, m) => log.info(o, m));

  // disableRequestLogging: Fastify's default per-request lines include the client IP (remoteAddress) and URL.
  // That would link a buyer's IP to purchase time (invariant 1). We log only our own count/rootId/product lines.
  const app = Fastify({ loggerInstance: log, disableRequestLogging: true });

  const requireAdmin = (req: { headers: Record<string, unknown> }): void => {
    if (req.headers["x-admin-token"] !== env.adminToken) throw new Error("unauthorized");
  };

  app.get("/health", async () => ({ ok: true }));

  // POST /purchase {idCommitment, product} -> {leafIndex, validUntilDay, zoneClass}
  app.post("/purchase", async (req, reply) => {
    const body = req.body as { idCommitment?: string; product?: string };
    if (!body?.idCommitment || !body?.product) return reply.code(400).send({ error: "idCommitment and product required" });
    try {
      const result = purchase(db, products, BigInt(body.idCommitment), body.product);
      log.info({ product: body.product }, "purchase"); // no idCommitment/leaf/leafIndex in the log line
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
      const signed = await publishRoot({ db, registry, arkiv, deployment, log });
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

  return { app, db, registry, deployment, env, log };
}

// Entry point: `npm start`
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1] ?? "")) {
  const { app, env, log } = await buildServer();
  app.listen({ port: env.port, host: "0.0.0.0" }).then((addr) => log.info({ addr }, "issuer listening"));
}
