import { DatabaseSync } from "node:sqlite";

/**
 * Issuer store (SPEC v0.3). Uses Node's built-in node:sqlite (real SQLite, no native build) — chosen over
 * better-sqlite3 because its prebuilt binary segfaults on this Node/ABI. DatabaseSync has the same synchronous
 * prepared-statement model.
 *
 * NOTHING PERSONAL is ever stored: no name, phone, email or IP. The issuer holds only pass commitments, the
 * tree, posted roots, and the nullifier batches scanners upload. The leaf/leafIndex are hiding commitments the
 * issuer legitimately needs to build the tree; they are never logged (invariant 1).
 */
export const TABLES: Record<string, string[]> = {
  purchases: ["id", "product", "createdAt", "leafIndex"],
  leaves: ["leafIndex", "leaf", "validUntilDay", "revoked"],
  roots: ["rootId", "root", "issuedAt", "expiresAt", "leafCount", "revSeq", "signature", "txHash"],
  revocations: ["seq", "fromIndex", "count", "reason", "createdAt", "published"],
  arkiv_batches: ["batchNo", "fromIndex", "count", "lastValidDay", "zeroed", "published"],
  scan_nullifiers: ["epochId", "nullifier", "scannerPubKey"],
  meta: ["key", "value"],
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  leafIndex INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS leaves (
  leafIndex INTEGER PRIMARY KEY,
  leaf TEXT NOT NULL,
  validUntilDay INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS roots (
  rootId INTEGER PRIMARY KEY,
  root TEXT NOT NULL,
  issuedAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  leafCount INTEGER NOT NULL,
  revSeq INTEGER NOT NULL,
  signature TEXT NOT NULL,
  txHash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS revocations (
  seq INTEGER PRIMARY KEY,
  fromIndex INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  published INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS arkiv_batches (
  batchNo INTEGER PRIMARY KEY,
  fromIndex INTEGER NOT NULL,
  count INTEGER NOT NULL,
  lastValidDay INTEGER NOT NULL,
  zeroed INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS scan_nullifiers (
  epochId INTEGER NOT NULL,
  nullifier TEXT NOT NULL,
  scannerPubKey TEXT NOT NULL,
  PRIMARY KEY (epochId, nullifier, scannerPubKey)
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export type Leaf = { leafIndex: number; leaf: string; validUntilDay: number; revoked: number };
export type BatchRow = {
  batchNo: number;
  fromIndex: number;
  count: number;
  lastValidDay: number;
  zeroed: number;
  published: number;
};
export type RootRow = {
  rootId: number;
  root: string;
  issuedAt: number;
  expiresAt: number;
  leafCount: number;
  revSeq: number;
  signature: string;
  txHash: string;
};
export type PendingRoot = { root: string; leafCount: number; revSeq: number; txHash?: string };
export type RevocationRow = { seq: number; fromIndex: number; count: number; reason: "revoked" | "expired" };

export class IssuerDb {
  readonly raw: DatabaseSync;

  constructor(path = ":memory:") {
    this.raw = new DatabaseSync(path);
    this.raw.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
    this.raw.exec(SCHEMA);
  }

  /** M5 databases had single-leaf revocations (seq, leafIndex, reason, createdAt): upgrade them in place. */
  private migrate(): void {
    const cols = (this.raw.prepare("PRAGMA table_info(revocations)").all() as { name: string }[]).map((c) => c.name);
    if (cols.length === 0) return; // fresh database
    if (cols.includes("leafIndex")) this.raw.exec("ALTER TABLE revocations RENAME COLUMN leafIndex TO fromIndex");
    if (!cols.includes("count")) this.raw.exec("ALTER TABLE revocations ADD COLUMN count INTEGER NOT NULL DEFAULT 1");
    if (!cols.includes("published")) {
      this.raw.exec("ALTER TABLE revocations ADD COLUMN published INTEGER NOT NULL DEFAULT 0");
    }
  }

  close(): void {
    this.raw.close();
  }

  private depth = 0;

  /** Run `fn` atomically (nested calls join the outer transaction). A throw or crash leaves no partial write. */
  private tx<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.raw.exec("BEGIN IMMEDIATE");
    this.depth++;
    try {
      const out = fn();
      this.raw.exec("COMMIT");
      return out;
    } catch (e) {
      this.raw.exec("ROLLBACK");
      throw e;
    } finally {
      this.depth--;
    }
  }

  /**
   * The root about to be posted on-chain, recorded BEFORE postRoot. If the process dies after the tx is mined but
   * before recordRoot, the publisher matches this against Registry.issuerState and finishes signing + recording it.
   */
  setPendingRoot(p: PendingRoot): void {
    this.raw.prepare("INSERT INTO meta(key, value) VALUES('pendingRoot', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify(p));
  }

  pendingRoot(): PendingRoot | undefined {
    const row = this.raw.prepare("SELECT value FROM meta WHERE key = 'pendingRoot'").get() as { value: string } | undefined;
    return row ? JSON.parse(row.value) : undefined;
  }

  clearPendingRoot(): void {
    this.raw.prepare("DELETE FROM meta WHERE key = 'pendingRoot'").run();
  }

  private metaGet(key: string, fallback: number): number {
    const row = this.raw.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
    return row ? Number(row.value) : fallback;
  }

  private metaSet(key: string, value: number): void {
    this.raw.prepare("INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, String(value));
  }

  /** Append a new leaf and record the purchase. Returns the new leafIndex. */
  appendLeaf(product: string, leaf: string, validUntilDay: number): number {
    return this.tx(() => {
      const leafIndex = this.metaGet("nextLeafIndex", 0);
      const now = Math.floor(Date.now() / 1000);
      this.raw.prepare("INSERT INTO leaves(leafIndex, leaf, validUntilDay, revoked) VALUES(?, ?, ?, 0)")
        .run(leafIndex, leaf, validUntilDay);
      this.raw.prepare("INSERT INTO purchases(product, createdAt, leafIndex) VALUES(?, ?, ?)")
        .run(product, now, leafIndex);
      this.metaSet("nextLeafIndex", leafIndex + 1);
      return leafIndex;
    });
  }

  /** Revoke one pass (refund, lost phone, fraud). Returns the revocation seq; the current seq if already revoked. */
  revokeLeaf(leafIndex: number): number {
    const leaf = this.raw.prepare("SELECT revoked FROM leaves WHERE leafIndex = ?").get(leafIndex) as
      | { revoked: number }
      | undefined;
    if (!leaf) throw new Error(`unknown leafIndex ${leafIndex}`);
    if (leaf.revoked) return this.metaGet("revSeq", 0);
    return this.revokeRange(leafIndex, 1, "revoked");
  }

  /** Set leaves [fromIndex, fromIndex+count) to 0 under the next revocation seq (SPEC §3.1 Revocation). */
  revokeRange(fromIndex: number, count: number, reason: "revoked" | "expired"): number {
    return this.tx(() => {
      const { n } = this.raw.prepare("SELECT count(*) AS n FROM leaves WHERE leafIndex >= ? AND leafIndex < ?")
        .get(fromIndex, fromIndex + count) as { n: number };
      if (count < 1 || n !== count) throw new Error("revocation range is not all issued leaves");
      const seq = this.metaGet("revSeq", 0) + 1;
      this.raw.prepare("UPDATE leaves SET revoked = 1 WHERE leafIndex >= ? AND leafIndex < ?").run(fromIndex, fromIndex + count);
      this.raw.prepare("INSERT INTO revocations(seq, fromIndex, count, reason, createdAt) VALUES(?, ?, ?, ?, ?)")
        .run(seq, fromIndex, count, reason, Math.floor(Date.now() / 1000));
      this.metaSet("revSeq", seq);
      return seq;
    });
  }

  /**
   * Assign every leaf not yet in a LeafBatch to new batches of at most `max`. Recorded BEFORE publishing, so a
   * retried publish re-sends exactly the same batch. Returns the new batch rows.
   */
  batchNewLeaves(max: number): BatchRow[] {
    return this.tx(() => this.batchNewLeavesTx(max));
  }

  private batchNewLeavesTx(max: number): BatchRow[] {
    const last = this.raw.prepare("SELECT batchNo, fromIndex, count FROM arkiv_batches ORDER BY batchNo DESC LIMIT 1")
      .get() as { batchNo: number; fromIndex: number; count: number } | undefined;
    let batchNo = last ? last.batchNo + 1 : 0;
    let from = last ? last.fromIndex + last.count : 0;
    const total = this.metaGet("nextLeafIndex", 0);
    const ins = this.raw.prepare("INSERT INTO arkiv_batches(batchNo, fromIndex, count, lastValidDay) VALUES(?, ?, ?, ?)");
    const maxDay = this.raw.prepare("SELECT max(validUntilDay) AS d FROM leaves WHERE leafIndex >= ? AND leafIndex < ?");
    const out: BatchRow[] = [];
    while (from < total) {
      const count = Math.min(max, total - from);
      const { d } = maxDay.get(from, from + count) as { d: number };
      ins.run(batchNo, from, count, d);
      out.push({ batchNo, fromIndex: from, count, lastValidDay: d, zeroed: 0, published: 0 });
      batchNo++;
      from += count;
    }
    return out;
  }

  batches(): BatchRow[] {
    return this.raw.prepare("SELECT * FROM arkiv_batches ORDER BY batchNo").all() as BatchRow[];
  }

  /** A batch's leaf values as issued (revocations zero them separately). */
  batchLeaves(b: { fromIndex: number; count: number }): bigint[] {
    const rows = this.raw.prepare("SELECT leaf FROM leaves WHERE leafIndex >= ? AND leafIndex < ? ORDER BY leafIndex")
      .all(b.fromIndex, b.fromIndex + b.count) as { leaf: string }[];
    return rows.map((r) => BigInt(r.leaf));
  }

  /**
   * SPEC §3.1 zeroing: every batch whose latest validUntilDay is before `today` gets one `expired` revocation over
   * its whole range. Returns the new revocation seqs.
   */
  zeroExpiredBatches(today: number): number[] {
    const due = this.raw.prepare("SELECT * FROM arkiv_batches WHERE zeroed = 0 AND lastValidDay < ? ORDER BY batchNo")
      .all(today) as BatchRow[];
    return due.map((b) =>
      this.tx(() => {
        const seq = this.revokeRange(b.fromIndex, b.count, "expired");
        this.raw.prepare("UPDATE arkiv_batches SET zeroed = 1 WHERE batchNo = ?").run(b.batchNo);
        return seq;
      }),
    );
  }

  markBatchPublished(batchNo: number): void {
    this.raw.prepare("UPDATE arkiv_batches SET published = 1 WHERE batchNo = ?").run(batchNo);
  }

  unpublishedRevocations(): RevocationRow[] {
    return this.raw.prepare("SELECT seq, fromIndex, count, reason FROM revocations WHERE published = 0 ORDER BY seq")
      .all() as RevocationRow[];
  }

  markRevocationPublished(seq: number): void {
    this.raw.prepare("UPDATE revocations SET published = 1 WHERE seq = ?").run(seq);
  }

  /** lastValidDay of every batch overlapping [fromIndex, fromIndex+count): sets a Revocation's expiry. */
  batchDaysOverlapping(fromIndex: number, count: number): number[] {
    const rows = this.raw.prepare("SELECT lastValidDay FROM arkiv_batches WHERE fromIndex < ? AND fromIndex + count > ?")
      .all(fromIndex + count, fromIndex) as { lastValidDay: number }[];
    return rows.map((r) => r.lastValidDay);
  }

  /** The newest root recorded (heartbeat timing; re-publishing a SignedRoot a crashed run left off Arkiv). */
  latestRoot(): RootRow | undefined {
    return this.raw.prepare("SELECT * FROM roots ORDER BY rootId DESC LIMIT 1").get() as RootRow | undefined;
  }

  /** All leaves in index order. */
  allLeaves(): Leaf[] {
    return this.raw.prepare("SELECT leafIndex, leaf, validUntilDay, revoked FROM leaves ORDER BY leafIndex").all() as Leaf[];
  }

  revSeq(): number {
    return this.metaGet("revSeq", 0);
  }

  recordRoot(r: {
    rootId: number;
    root: string;
    issuedAt: number;
    expiresAt: number;
    leafCount: number;
    revSeq: number;
    signature: string;
    txHash: string;
  }): void {
    this.tx(() => {
      this.raw.prepare(
        "INSERT INTO roots(rootId, root, issuedAt, expiresAt, leafCount, revSeq, signature, txHash) VALUES(?,?,?,?,?,?,?,?)",
      ).run(r.rootId, r.root, r.issuedAt, r.expiresAt, r.leafCount, r.revSeq, r.signature, r.txHash);
      this.clearPendingRoot();
    });
  }

  /** Store a scanner's nullifiers for an epoch; returns how many were already present (cross-scanner duplicates). */
  storeScanBatch(epochId: number, nullifiers: string[], scannerPubKey: string): number {
    const seen = this.raw.prepare("SELECT 1 FROM scan_nullifiers WHERE epochId = ? AND nullifier = ?");
    const ins = this.raw.prepare(
      "INSERT OR IGNORE INTO scan_nullifiers(epochId, nullifier, scannerPubKey) VALUES(?, ?, ?)",
    );
    let duplicates = 0;
    for (const n of nullifiers) {
      if (seen.get(epochId, n)) duplicates++;
      ins.run(epochId, n, scannerPubKey);
    }
    return duplicates;
  }
}
