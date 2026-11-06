// Every fixtures/qr/<case>.json through the browser scanner's verify() with the real snarkjs engine: the same
// conformance suite the Kotlin scanner passes (apps/scanner/verifier FixtureTest). Invariant 5: one behaviour.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import * as snarkjs from "snarkjs";
import { MemoryStore, parseQr, verify, type Groth16Verify } from "../src/verifier.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const DIR = join(ROOT, "fixtures", "qr");

type Fixture = {
  name: string;
  note: string;
  qrText: string;
  nowMs: number;
  expected: { result: string; reason: string; warnings?: string[]; nullifierCount?: number; absent?: string[] };
  storeState: {
    chainId: number;
    registry: string;
    vk: string | null;
    lastSyncMs: number;
    requiredClass: number | null;
    issuers: { address: string; active: boolean; floor: number; latestRootId?: number }[];
    nullifiers: { nullifier: string; epochId: number; count: number; firstSeenMs: number; lastReadMs: number }[];
  };
};

const fixtures: Fixture[] = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()
  .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")));

const groth16: Groth16Verify = (vk, signals, proof) => snarkjs.groth16.verify(vk as never, signals, proof as never);

function storeFor(f: Fixture): MemoryStore {
  const s = f.storeState;
  const vk = s.vk ? JSON.parse(readFileSync(join(ROOT, s.vk), "utf8")) : null;
  const store = new MemoryStore(s.chainId, s.registry, s.lastSyncMs, vk, s.requiredClass);
  for (const i of s.issuers) store.issuers.set(i.address.toLowerCase(), { active: i.active, floor: BigInt(i.floor), latestRootId: BigInt(i.latestRootId ?? 0) });
  for (const n of s.nullifiers) store.log.set(BigInt(n.nullifier), { ...n, nullifier: BigInt(n.nullifier) });
  return store;
}

afterAll(async () => {
  // snarkjs keeps worker threads for the curve; release them so the test process exits.
  const g = globalThis as { curve_bn128?: { terminate(): Promise<void> } };
  await g.curve_bn128?.terminate();
});

describe("browser scanner = SPEC §5 (fixtures/qr, shared with the Kotlin scanner)", () => {
  it("has the full conformance suite", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(73);
  });

  for (const f of fixtures) {
    it(`${f.name}: ${f.expected.result} ${f.expected.reason}`, async () => {
      const store = storeFor(f);
      const before = new Map(store.log);
      const r = await verify(f.qrText, f.nowMs, store, groth16);
      const ctx = `${f.name} (${f.note})`;
      expect(r.status, ctx).toBe(f.expected.result);
      expect(r.reason, ctx).toBe(f.expected.reason);
      if (f.expected.warnings) expect(r.warnings, `${ctx} warnings`).toEqual(f.expected.warnings);
      if (r.status === "GREEN") expect(r.warnings).toEqual([]);

      if (f.expected.nullifierCount !== undefined) {
        const q = parseQr(f.qrText)!;
        const rec = store.nullifier(q.nullifier);
        expect(rec, `${ctx}: nullifier stored`).toBeDefined();
        expect(rec!.count, `${ctx} count`).toBe(f.expected.nullifierCount);
        const reachedStep8 = r.status !== "RED" || r.reason === "DUPLICATE";
        if (reachedStep8) expect(rec!.lastReadMs, `${ctx} lastRead`).toBe(f.nowMs);
      }
      for (const a of f.expected.absent ?? []) expect(store.nullifier(BigInt(a)), `${ctx} purged`).toBeUndefined();
      // Steps 1–7 never write: a Red before step 8 leaves the log exactly as it was.
      if (r.status === "RED" && r.reason !== "DUPLICATE") expect(new Map(store.log)).toEqual(before);
    });
  }
});
