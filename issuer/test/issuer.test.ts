import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import * as snarkjs from "snarkjs";
import { ethers } from "ethers";
import {
  buildCircuitInput,
  buildTree,
  FIELD_R,
  idCommitment,
  merkleProof,
  randomSecret,
} from "@unlink/protocol";
import { IssuerDb, TABLES } from "../src/db.ts";
import { purchase } from "../src/purchase.ts";
import { loadProducts } from "../src/config.ts";
import { rootDigest, recoverRootSigner, signRoot, type SignedRootFields } from "../src/sign.ts";
import { scanBatchDigest } from "../src/scan.ts";
import { rebuildTree } from "../src/tree.ts";
import { makeLogger } from "../src/logger.ts";
import { AUTO_PUBLISH_DELAY, autoPublishDelay, hasUnpublishedLeaves } from "../src/autopublish.ts";
import { PurchaseLimiter } from "../src/ratelimit.ts";
import Fastify from "fastify";

const PRODUCTS = loadProducts();
const WASM = "../circuits/artifacts/pass.wasm";
const ZKEY = "../circuits/artifacts/pass_final.zkey";
const VK = JSON.parse(readFileSync("../circuits/artifacts/verification_key.json", "utf8"));

function freshDb(): IssuerDb {
  return new IssuerDb(":memory:");
}

describe("purchase (SPEC §3.1)", () => {
  it("4. rejects a malformed idCommitment (>= field modulus)", () => {
    const db = freshDb();
    expect(() => purchase(db, PRODUCTS, FIELD_R, "day-pass")).toThrow();
    expect(() => purchase(db, PRODUCTS, FIELD_R + 1n, "day-pass")).toThrow();
    expect(() => purchase(db, PRODUCTS, 123n, "no-such-product")).toThrow();
    db.close();
  });

  it("sets validUntilDay and zoneClass from the product, not the phone", () => {
    const db = freshDb();
    const r = purchase(db, PRODUCTS, idCommitment(randomSecret()), "month-first");
    expect(r.zoneClass).toBe(1);
    expect(r.leafIndex).toBe(0);
    db.close();
  });
});

describe("circuit integration (SPEC §4)", () => {
  it("1. a purchased leaf's path proves and verifies in the real circuit", async () => {
    const db = freshDb();
    const secret = randomSecret();
    const r = purchase(db, PRODUCTS, idCommitment(secret), "month-pass");
    // pad the tree with other passengers so the path is non-trivial
    for (let i = 0; i < 4; i++) purchase(db, PRODUCTS, idCommitment(randomSecret()), "day-pass");

    const { tree } = rebuildTree(db);
    const proof = merkleProof(tree, r.leafIndex);
    const input = buildCircuitInput({
      secret,
      validUntilDay: r.validUntilDay,
      zoneClass: r.zoneClass,
      proof,
      epochId: Math.floor(Date.now() / 1000 / 600),
    });
    const { proof: g16, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
    expect(await snarkjs.groth16.verify(VK, publicSignals, g16)).toBe(true);
    expect(publicSignals[0]).toBe(tree.root.toString());
    db.close();
  }, 120_000);
});

describe("signed root (SPEC §3.3)", () => {
  it("2. a standalone signature verify recovers the issuer address", async () => {
    const wallet = ethers.Wallet.createRandom();
    const fields: SignedRootFields = {
      chainId: 11155111,
      registry: "0xd13c3d5B02312AEFa4661aD1Fc8205807F255A16",
      issuer: wallet.address,
      rootId: 7,
      root: "0x" + "11".repeat(32),
      issuedAt: 1_793_000_000,
      expiresAt: 1_793_000_000 + 36 * 3600,
    };
    const sig = await signRoot(wallet as unknown as ethers.Wallet, fields);
    expect(recoverRootSigner(fields, sig)).toBe(wallet.address);
    // tampering any field breaks recovery
    expect(recoverRootSigner({ ...fields, rootId: 8 }, sig)).not.toBe(wallet.address);
    // ethers returns v in {27,28}, low-s (65-byte sig)
    const { v } = ethers.Signature.from(sig);
    expect(v === 27 || v === 28).toBe(true);
    expect(ethers.dataLength(sig)).toBe(65);
  });

  it("2b. rootDigest matches an independent packed encoding of the exact 134-byte preimage", () => {
    const f: SignedRootFields = {
      chainId: 11155111,
      registry: "0xd13c3d5B02312AEFa4661aD1Fc8205807F255A16",
      issuer: "0x8d3713FBad1A2E40F40de56D37eab09513cb060B",
      rootId: 42,
      root: "0x" + "cd".repeat(32),
      issuedAt: 1_793_000_000,
      expiresAt: 1_793_000_000 + 36 * 3600,
    };
    const preimage = ethers.concat([
      ethers.toUtf8Bytes("UNLINK-ROOT-v1"), // 14 bytes, no length prefix
      ethers.zeroPadValue(ethers.toBeHex(f.chainId), 32),
      ethers.getBytes(f.registry), // 20
      ethers.getBytes(f.issuer), // 20
      ethers.zeroPadValue(ethers.toBeHex(f.rootId), 8),
      f.root, // 32
      ethers.zeroPadValue(ethers.toBeHex(f.issuedAt), 4),
      ethers.zeroPadValue(ethers.toBeHex(f.expiresAt), 4),
    ]);
    expect(ethers.dataLength(preimage)).toBe(134);
    expect(ethers.keccak256(preimage)).toBe(rootDigest(f));
  });

  it("2c. the committed fixtures/sign-vectors.json matches the current code (shared with the Kotlin scanner)", () => {
    const v = JSON.parse(readFileSync("../fixtures/sign-vectors.json", "utf8"));
    expect(rootDigest(v.signedRoot.fields)).toBe(v.signedRoot.digest);
    expect(recoverRootSigner(v.signedRoot.fields, v.signedRoot.eip191Signature)).toBe(v.signedRoot.signer);
    const sb = v.scanBatch;
    expect(scanBatchDigest(sb.scannerPubKey, sb.epochId, sb.nullifiersSorted)).toBe(sb.digest);
    expect(ethers.verifyMessage(ethers.getBytes(sb.digest), sb.eip191Signature)).toBe(sb.signer);
  });
});

describe("revocation (SPEC §7)", () => {
  it("3. a revoked leaf is 0 in the next rebuilt root, others unaffected", () => {
    const db = freshDb();
    const keep = purchase(db, PRODUCTS, idCommitment(randomSecret()), "day-pass");
    const gone = purchase(db, PRODUCTS, idCommitment(randomSecret()), "day-pass");
    const before = rebuildTree(db).tree.root;

    const seq = db.revokeLeaf(gone.leafIndex);
    expect(seq).toBe(1);
    const { tree, leaves } = rebuildTree(db);
    expect(tree.root).not.toBe(before);
    expect(leaves[gone.leafIndex].revoked).toBe(1);
    // the revoked position contributes 0; the kept leaf is still present
    expect(leaves[keep.leafIndex].revoked).toBe(0);
    const all = db.allLeaves().map((l) => (l.revoked ? 0n : BigInt(l.leaf)));
    expect(all[gone.leafIndex]).toBe(0n);
    expect(tree.root).toBe(buildTree(all).root);
    db.close();
  });
});

describe("privacy (invariant 1)", () => {
  it("5. no table has a column that can hold personal data", () => {
    const db = freshDb();
    const forbidden = /name|phone|email|mobile|user|ip|dob|aadhaar|pan/i;
    for (const [table, allowed] of Object.entries(TABLES)) {
      const cols = (db.raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
      expect(cols.sort()).toEqual([...allowed].sort());
      for (const c of cols) expect(c).not.toMatch(forbidden);
    }
    db.close();
  });

  it("6. a purchase log line contains no idCommitment", () => {
    const sink = new PassThrough();
    let out = "";
    sink.on("data", (b) => (out += b.toString()));
    const log = makeLogger(sink);
    const secret = randomSecret();
    const commit = idCommitment(secret).toString();
    log.info({ product: "day-pass" }, "purchase");
    // even if a caller leaks it, redaction censors it:
    log.info({ idCommitment: commit, leaf: "123", leafIndex: 4 }, "should be redacted");
    expect(out).not.toContain(commit);
    expect(out).toContain("[redacted]");
    expect(out).toContain("purchase");
  });
});

describe("auto-publish after a purchase (src/autopublish.ts)", () => {
  it("7. waits at least AUTO_PUBLISH_DELAY and never before the on-chain minRootInterval", () => {
    expect(autoPublishDelay(1_000, undefined, 60)).toBe(AUTO_PUBLISH_DELAY);
    expect(autoPublishDelay(1_000, 0, 60)).toBe(AUTO_PUBLISH_DELAY); // last root long ago
    expect(autoPublishDelay(1_000, 990 - 30, 60)).toBe(AUTO_PUBLISH_DELAY); // 40 s after: 22 s left < 30 s delay
    expect(autoPublishDelay(1_000, 990, 60)).toBe(52); // 10 s after the last root: 50 s left + 2 s slack
    expect(autoPublishDelay(1_000, 1_000 - 10, 900)).toBe(892); // production 15 min interval batches purchases
  });

  it("8. publishes only when a purchased leaf is not yet in the latest root", () => {
    const db = freshDb();
    expect(hasUnpublishedLeaves(db)).toBe(false);
    purchase(db, PRODUCTS, idCommitment(randomSecret()), "day-pass");
    expect(hasUnpublishedLeaves(db)).toBe(true);
    db.recordRoot({ rootId: 1, root: "0x01", issuedAt: 1, expiresAt: 1 + 36 * 3600, leafCount: 1, revSeq: 0, signature: "0x", txHash: "0x" });
    expect(hasUnpublishedLeaves(db)).toBe(false);
    purchase(db, PRODUCTS, idCommitment(randomSecret()), "month-pass");
    expect(hasUnpublishedLeaves(db)).toBe(true);
    db.close();
  });
});

describe("purchase abuse limit (src/ratelimit.ts)", () => {
  it("9. caps purchases per client per hour and in total per day, and forgets clients after an hour", () => {
    const l = new PurchaseLimiter(2, 3);
    const t0 = 1_000_000_000;
    expect(l.allow("a", t0)).toBe(true);
    expect(l.allow("a", t0 + 1)).toBe(true);
    expect(l.allow("a", t0 + 2)).toBe(false); // per-client cap
    expect(l.allow("b", t0 + 3)).toBe(true);
    expect(l.allow("c", t0 + 4)).toBe(false); // global cap (3 per day)
    expect(l.clientsHeld).toBe(2);
    expect(l.allow("a", t0 + 3_600_001)).toBe(false); // hour passed for "a", but still 3 in the day
    expect(l.clientsHeld).toBe(1); // "a" is forgotten (its hour is over); "b" (t0 + 3) is still inside its hour
    expect(l.allow("d", t0 + 86_400_005)).toBe(true); // a day later the global window has moved on
  });

  it("10. behind the hosted VM proxy, req.ip is the client; nobody else can set it", async () => {
    const app = Fastify({ trustProxy: "127.0.0.1" });
    app.get("/ip", async (req) => ({ ip: req.ip }));
    const viaCaddy = await app.inject({ url: "/ip", remoteAddress: "127.0.0.1", headers: { "x-forwarded-for": "203.0.113.9" } });
    expect(viaCaddy.json().ip).toBe("203.0.113.9");
    const direct = await app.inject({ url: "/ip", remoteAddress: "198.51.100.7", headers: { "x-forwarded-for": "203.0.113.9" } });
    expect(direct.json().ip).toBe("198.51.100.7"); // a forged header from an untrusted address is ignored
    await app.close();
  });
});

describe("no client address in issuer logs (invariant 1)", () => {
  it("11. a request object in a log line keeps method + path only: no IP, port or headers", () => {
    const sink = new PassThrough();
    let out = "";
    sink.on("data", (b) => (out += b.toString()));
    const log = makeLogger(sink);
    // The shape Fastify passes when it logs a request (e.g. its error handler, if request logging is ever enabled).
    const req = { method: "POST", url: "/purchase?x=1", ip: "203.0.113.9", socket: { remoteAddress: "203.0.113.9", remotePort: 51515 },
      headers: { "x-forwarded-for": "203.0.113.9", "x-admin-token": "s3cret" } };
    log.error({ req, res: { statusCode: 500, headers: { a: 1 } } }, "boom");
    expect(out).toContain("boom");
    expect(out).toContain("/purchase");
    for (const leak of ["203.0.113.9", "51515", "s3cret", "x-forwarded-for", "?x=1"]) expect(out).not.toContain(leak);
  });
});
