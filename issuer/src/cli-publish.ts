// Runs the publisher once against the real Sepolia Registry and prints the tx hash (SPEC R5, M5 done-when).
// Usage (from issuer/, with the repo .env loaded):  npm run publish-root
import { IssuerDb } from "./db.ts";
import { loadDeployment, loadEnv, loadProducts } from "./config.ts";
import { purchase } from "./purchase.ts";
import { RegistryClient } from "./registry.ts";
import { NoopArkivPublisher } from "./arkiv.ts";
import { publishRoot } from "./publisher.ts";
import { makeLogger } from "./logger.ts";
import { randomSecret, idCommitment } from "@unlink/protocol";

const log = makeLogger();
const env = loadEnv();
const deployment = loadDeployment();
const products = loadProducts();
const db = new IssuerDb("issuer.db");
const registry = new RegistryClient(env.rpcUrl, env.issuerPrivateKey, deployment.registry);

// If the tree is empty, simulate one purchase so there is a real leaf to commit to.
if (db.allLeaves().length === 0) {
  purchase(db, products, idCommitment(randomSecret()), "day-pass");
  log.info({ product: "day-pass" }, "seeded one purchase for the publish demo");
}

const signed = await publishRoot({ db, registry, arkiv: new NoopArkivPublisher((o, m) => log.info(o, m)), deployment, log });
log.info(
  { rootId: signed.rootId, txHash: signed.txHash, issuedAt: signed.issuedAt, expiresAt: signed.expiresAt },
  "published root on Sepolia",
);
console.log(`postRoot tx: https://sepolia.etherscan.io/tx/${signed.txHash}`);
process.exit(0);
