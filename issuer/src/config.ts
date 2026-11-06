import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MAX_PASS_DAYS, assertZoneClass } from "@unlink/protocol";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

export type Product = { durationDays: number; zoneClass: 0 | 1 | 2 };

export type Deployment = {
  chainId: number;
  registry: string;
  authority: string;
  issuer: string;
  minRootInterval: number;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** The deployed Registry on Sepolia (written by Module 4). */
export function loadDeployment(): Deployment {
  const all = readJson<{ sepolia: Deployment }>(join(repoRoot, "deployments.json"));
  return all.sepolia;
}

/** Product catalogue. validUntilDay = day(now) + durationDays - 1 (inclusive last day). */
export function loadProducts(): Record<string, Product> {
  const products = readJson<Record<string, Product>>(join(here, "..", "products.json"));
  for (const [name, p] of Object.entries(products)) {
    assertZoneClass(p.zoneClass);
    if (!Number.isInteger(p.durationDays) || p.durationDays < 1 || p.durationDays > MAX_PASS_DAYS) {
      throw new Error(`product ${name}: durationDays must be 1..${MAX_PASS_DAYS}`);
    }
  }
  return products;
}

/** Scanner key allowlist (addresses). Written by the operator; Module 8 publishes it to Arkiv as ScannerList. */
export function loadScannerAllowlist(): string[] {
  try {
    return readJson<string[]>(join(here, "..", "scanners.json")).map((a) => a.toLowerCase());
  } catch {
    return [];
  }
}

export type Env = {
  rpcUrl: string;
  issuerPrivateKey: string;
  adminToken: string;
  port: number;
  dbPath: string;
  host: string;
  /** Address of a reverse proxy (Caddy on the hosted VM) whose X-Forwarded-For Fastify may trust for req.ip. */
  trustProxy: string | false;
  /** Browser origins allowed to call POST /purchase and GET /health (the live demo page). */
  corsOrigins: string[];
};

/** Reads runtime secrets from the environment. Uses the publicnode RPC by default: the Alchemy endpoint
 *  under-estimates gas and fails writes (see deployments.json rpcNote). */
export function loadEnv(): Env {
  const rpcUrl = process.env.ISSUER_RPC_URL || process.env.SEPOLIA_RPC_URL_BACKUP || process.env.SEPOLIA_RPC_URL;
  const issuerPrivateKey = process.env.ISSUER_PRIVATE_KEY;
  const adminToken = process.env.ADMIN_TOKEN;
  if (!rpcUrl) throw new Error("set SEPOLIA_RPC_URL_BACKUP (publicnode) or ISSUER_RPC_URL");
  if (!issuerPrivateKey) throw new Error("set ISSUER_PRIVATE_KEY");
  if (!adminToken) throw new Error("set ADMIN_TOKEN");
  return {
    rpcUrl,
    issuerPrivateKey: issuerPrivateKey.startsWith("0x") ? issuerPrivateKey : `0x${issuerPrivateKey}`,
    adminToken,
    port: Number(process.env.ISSUER_PORT ?? 3000),
    // The SQLite file holding the tree. On the hosted VM: /var/lib/unlink/issuer.db (issuer/deploy/README.md).
    dbPath: process.env.ISSUER_DB_PATH || "issuer.db",
    // Hosted VM: listen on 127.0.0.1 only (Caddy terminates HTTPS in front) and trust only that proxy.
    host: process.env.ISSUER_HOST || "0.0.0.0",
    trustProxy: process.env.ISSUER_TRUST_PROXY || false,
    corsOrigins: (process.env.ISSUER_CORS_ORIGINS ?? "https://harshittgupta.github.io").split(",").map((s) => s.trim()).filter(Boolean),
  };
}
