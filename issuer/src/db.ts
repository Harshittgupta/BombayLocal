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
  revocations: ["seq", "leafIndex", "reason", "createdAt"],
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
  leafIndex INTEGER NOT NULL,
  reason TEXT NOT NULL,
  createdAt INTEGER NOT NULL
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

export class IssuerDb {
  readonly raw: DatabaseSync;

  constructor(path = ":memory:") {
    this.raw = new DatabaseSync(path);
    this.raw.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.raw.exec(SCHEMA);
  }

  close(): void {
    this.raw.close();
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
    const leafIndex = this.metaGet("nextLeafIndex", 0);
    const now = Math.floor(Date.now() / 1000);
    this.raw.prepare("INSERT INTO leaves(leafIndex, leaf, validUntilDay, revoked) VALUES(?, ?, ?, 0)")
      .run(leafIndex, leaf, validUntilDay);
    this.raw.prepare("INSERT INTO purchases(product, createdAt, leafIndex) VALUES(?, ?, ?)")
      .run(product, now, leafIndex);
    this.metaSet("nextLeafIndex", leafIndex + 1);
    return leafIndex;
  }

  /** Mark a leaf revoked and record a revocation with the next seq. Returns the seq. No-op seq if already revoked. */
  revokeLeaf(leafIndex: number, reason = "revoked"): number {
    const leaf = this.raw.prepare("SELECT revoked FROM leaves WHERE leafIndex = ?").get(leafIndex) as
      | { revoked: number }
      | undefined;
    if (!leaf) throw new Error(`unknown leafIndex ${leafIndex}`);
    if (leaf.revoked) return this.metaGet("revSeq", 0);
    const seq = this.metaGet("revSeq", 0) + 1;
    this.raw.prepare("UPDATE leaves SET revoked = 1 WHERE leafIndex = ?").run(leafIndex);
    this.raw.prepare("INSERT INTO revocations(seq, leafIndex, reason, createdAt) VALUES(?, ?, ?, ?)")
      .run(seq, leafIndex, reason, Math.floor(Date.now() / 1000));
    this.metaSet("revSeq", seq);
    return seq;
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
    this.raw.prepare(
      "INSERT INTO roots(rootId, root, issuedAt, expiresAt, leafCount, revSeq, signature, txHash) VALUES(?,?,?,?,?,?,?,?)",
    ).run(r.rootId, r.root, r.issuedAt, r.expiresAt, r.leafCount, r.revSeq, r.signature, r.txHash);
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
