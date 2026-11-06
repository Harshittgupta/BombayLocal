import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { MAX_ENTITY_BYTES } from "@arkiv-network/sdk/schema";
import { DAY_SECONDS, FIELD_R, LEAF_BATCH_MAX, MAX_PASS_DAYS, day, idCommitment, randomSecret } from "@unlink/protocol";
import { IssuerDb, TABLES } from "../src/db.ts";
import { purchase } from "../src/purchase.ts";
import { loadProducts } from "../src/config.ts";
import { rebuildTree } from "../src/tree.ts";
import {
  ARKIV_MAX_SECONDS,
  MIN_LIFETIME,
  decodeAddresses,
  decodeLeaves,
  encodeAddresses,
  encodeLeaves,
  endOfDay,
  leafBatchDeadline,
  lifetimeSeconds,
  rebuildFromArkiv,
  revocationDeadline,
  splitBatches,
  type BatchData,
} from "../src/arkiv/index.ts";
import { bytesToHex } from "viem";

const PRODUCTS = loadProducts();

function dbWith(n: number): IssuerDb {
  const db = new IssuerDb(":memory:");
  for (let i = 0; i < n; i++) purchase(db, PRODUCTS, idCommitment(randomSecret()), i % 2 ? "month-pass" : "day-pass");
  return db;
}

/** What a phone sees on Arkiv: every recorded batch (minus any that expired off Arkiv) and every revocation. */
function arkivView(db: IssuerDb, dropBatches: number[] = []): { batches: BatchData[]; revs: { seq: number; fromIndex: number; count: number }[] } {
  const batches = db
    .batches()
    .filter((b) => !dropBatches.includes(b.batchNo))
    .map((b) => ({ batchNo: b.batchNo, fromIndex: b.fromIndex, leaves: db.batchLeaves(b) }));
  const revs = db.raw.prepare("SELECT seq, fromIndex, count FROM revocations ORDER BY seq").all() as {
    seq: number;
    fromIndex: number;
    count: number;
  }[];
  return { batches, revs };
}

describe("LeafBatch / ScannerList payload encoding", () => {
  it("leaves round-trip as 32-byte big-endian words; out-of-field leaves are refused", () => {
    const leaves = [0n, 1n, FIELD_R - 1n, 0xdeadbeefn];
    const bytes = encodeLeaves(leaves);
    expect(bytes.length).toBe(leaves.length * 32);
    expect(bytesToHex(bytes.subarray(32, 64))).toBe(`0x${"0".repeat(63)}1`);
    expect(decodeLeaves(bytesToHex(bytes))).toEqual(leaves);
    expect(() => encodeLeaves([FIELD_R])).toThrow();
    expect(() => decodeLeaves("0x00")).toThrow();
  });

  it("a full LEAF_BATCH_MAX batch fits Arkiv's per-entity byte limit", () => {
    expect(encodeLeaves(new Array(LEAF_BATCH_MAX).fill(1n)).length).toBeLessThanOrEqual(MAX_ENTITY_BYTES);
  });

  it("splits leaves into batches of at most LEAF_BATCH_MAX with consecutive fromIndex and batchNo", () => {
    const b = splitBatches(new Array(4500).fill(7n), 100, 3, LEAF_BATCH_MAX);
    expect(b.map((x) => [x.batchNo, x.fromIndex, x.leaves.length])).toEqual([
      [3, 100, 2000],
      [4, 2100, 2000],
      [5, 4100, 500],
    ]);
  });

  it("scanner addresses round-trip as 20-byte words", () => {
    const a = ["0x8d3713fbad1a2e40f40de56d37eab09513cb060b", "0x153d390680704090aaa24657697f15e6b91da23f"];
    expect(decodeAddresses(bytesToHex(encodeAddresses(a)))).toEqual(a);
  });
});

describe("rebuild from Arkiv data (SPEC §3.1 step 4)", () => {
  it("batches + revocations rebuild exactly the issuer's tree", () => {
    const db = dbWith(5);
    db.batchNewLeaves(2); // 3 batches: [0,2) [2,4) [4,5)
    db.revokeLeaf(3);
    const { batches, revs } = arkivView(db);
    expect(batches.map((b) => b.leaves.length)).toEqual([2, 2, 1]);
    const t = rebuildFromArkiv(5, db.revSeq(), batches, revs);
    expect(t.root).toBe(rebuildTree(db).tree.root);
    expect(t.leaves[3]).toBe(0n);
  });

  it("after zeroing, the expired batch dropping off Arkiv does not change the root", () => {
    const db = dbWith(4);
    db.batchNewLeaves(2);
    db.batchNewLeaves(2); // no-op: every leaf is already batched
    expect(db.batches().length).toBe(2);
    const first = db.batches()[0]!;
    const seqs = db.zeroExpiredBatches(first.lastValidDay + 1); // the day after batch 0's last valid day
    expect(seqs.length).toBeGreaterThanOrEqual(1);
    expect(db.zeroExpiredBatches(first.lastValidDay + 1)).toEqual([]); // zeroed once only
    const issuerRoot = rebuildTree(db).tree.root;
    const withBatch = arkivView(db);
    const withoutBatch = arkivView(db, [0]); // batch 0 expired off Arkiv (end of day D + 2)
    expect(rebuildFromArkiv(4, db.revSeq(), withBatch.batches, withBatch.revs).root).toBe(issuerRoot);
    expect(rebuildFromArkiv(4, db.revSeq(), withoutBatch.batches, withoutBatch.revs).root).toBe(issuerRoot);
  });

  it("a missing batch counts as 0; a revocation above revSeq is not applied", () => {
    const b: BatchData[] = [{ batchNo: 1, fromIndex: 2, leaves: [5n, 6n] }];
    expect(rebuildFromArkiv(4, 0, b, []).leaves).toEqual([0n, 0n, 5n, 6n]);
    expect(rebuildFromArkiv(4, 1, b, [{ seq: 2, fromIndex: 2, count: 1 }]).leaves).toEqual([0n, 0n, 5n, 6n]);
    expect(rebuildFromArkiv(4, 2, b, [{ seq: 2, fromIndex: 2, count: 1 }]).leaves).toEqual([0n, 0n, 0n, 6n]);
  });

  it("leaves beyond leafCount are ignored (published ahead of the root that covers them)", () => {
    const b: BatchData[] = [{ batchNo: 0, fromIndex: 0, leaves: [1n, 2n, 3n] }];
    expect(rebuildFromArkiv(2, 0, b, []).leaves).toEqual([1n, 2n]);
  });

  it("overlapping non-identical batches and leaves >= r are rejected; identical duplicates are fine", () => {
    const a: BatchData = { batchNo: 0, fromIndex: 0, leaves: [1n, 2n] };
    expect(() => rebuildFromArkiv(2, 0, [a, { batchNo: 1, fromIndex: 1, leaves: [9n] }], [])).toThrow(/overlapping/);
    expect(rebuildFromArkiv(2, 0, [a, { ...a }], []).leaves).toEqual([1n, 2n]);
    expect(() => rebuildFromArkiv(1, 0, [{ batchNo: 0, fromIndex: 0, leaves: [FIELD_R] }], [])).toThrow(/>= r/);
  });
});

describe("Arkiv expiry (SPEC §9, blocks via seconds)", () => {
  it("endOfDay is the first second of the next IST day", () => {
    const t = 1_793_929_568;
    const d = day(t);
    expect(day(endOfDay(d) - 1)).toBe(d);
    expect(day(endOfDay(d))).toBe(d + 1);
  });

  it("LeafBatch lives to the end of D + 2; Revocation one day past its latest batch", () => {
    expect(leafBatchDeadline(100)).toBe(endOfDay(102));
    expect(revocationDeadline([100, 105])).toBe(endOfDay(107) + DAY_SECONDS);
    expect(() => revocationDeadline([])).toThrow();
  });

  it("lifetimes are floored at MIN_LIFETIME and capped at Arkiv's max; MAX_PASS_DAYS always fits", () => {
    const now = 1_793_929_568;
    expect(lifetimeSeconds(now - 10, now)).toBe(MIN_LIFETIME);
    // the SDK throws unless the lifetime is a whole number of 2 s blocks (found on the live run: 133187 s)
    expect(lifetimeSeconds(now + 133_187, now)).toBe(133_188);
    for (let d = 3601; d < 3700; d++) expect(lifetimeSeconds(now + d, now) % 2).toBe(0);
    expect(() => lifetimeSeconds(now + ARKIV_MAX_SECONDS + 1, now)).toThrow();
    const longest = revocationDeadline([day(now) + MAX_PASS_DAYS - 1]);
    expect(lifetimeSeconds(longest, now)).toBeLessThan(ARKIV_MAX_SECONDS);
  });
});

describe("issuer DB (M6 schema)", () => {
  it("an M5 database's single-leaf revocations table is migrated in place", () => {
    const path = join(mkdtempSync(join(tmpdir(), "unlink-")), "old.db");
    const old = new DatabaseSync(path);
    old.exec(
      "CREATE TABLE revocations (seq INTEGER PRIMARY KEY, leafIndex INTEGER NOT NULL, reason TEXT NOT NULL, createdAt INTEGER NOT NULL);" +
        "INSERT INTO revocations VALUES (1, 4, 'revoked', 0);",
    );
    old.close();
    const db = new IssuerDb(path);
    const cols = (db.raw.prepare("PRAGMA table_info(revocations)").all() as { name: string }[]).map((c) => c.name);
    expect(cols.sort()).toEqual([...TABLES.revocations!].sort());
    expect(db.unpublishedRevocations()).toEqual([{ seq: 1, fromIndex: 4, count: 1, reason: "revoked" }]);
    db.close();
  });
});
