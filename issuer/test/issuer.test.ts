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
import { rebuildTree } from "../src/tree.ts";
import { makeLogger } from "../src/logger.ts";

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
    // digest is the pinned 134-byte preimage hash (32-byte output)
    expect(rootDigest(fields)).toMatch(/^0x[0-9a-f]{64}$/);
    // tampering any field breaks recovery
    expect(recoverRootSigner({ ...fields, rootId: 8 }, sig)).not.toBe(wallet.address);
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
