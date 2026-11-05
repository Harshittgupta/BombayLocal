import { describe, expect, it } from "vitest";
import {
  EPOCH,
  FIELD_R,
  MAX_DEPTH,
  buildCircuitInput,
  buildTree,
  day,
  dayOfEpoch,
  epochId,
  hash1,
  hash2,
  idCommitment,
  merkleProof,
  nullifier,
  passLeaf,
  randomSecret,
} from "../src/index.ts";

/**
 * Re-implements zk-kit BinaryMerkleRoot(MAX_DEPTH) exactly as the circom template computes it:
 * indices = Num2Bits(MAX_DEPTH)(pathIndex); nodes[i+1] = Poseidon2(bit ? [sib, node] : [node, sib]);
 * out = nodes[depth]. If this agrees with LeanIMT's root, the circuit will too (checked for real in circuits/test).
 */
function circuitRoot(leaf: bigint, depth: number, pathIndex: number, siblings: bigint[]): bigint {
  expect(siblings).toHaveLength(MAX_DEPTH);
  const nodes = [leaf];
  for (let i = 0; i < MAX_DEPTH; i++) {
    const bit = (pathIndex >> i) & 1;
    nodes.push(bit ? hash2(siblings[i], nodes[i]) : hash2(nodes[i], siblings[i]));
  }
  return nodes[depth];
}

describe("time (SPEC §6, §9)", () => {
  it("epochId floors to 600 s", () => {
    expect(epochId(0)).toBe(0);
    expect(epochId(599)).toBe(0);
    expect(epochId(600)).toBe(1);
  });
  it("day rolls over at IST midnight (UTC 18:30)", () => {
    const firstIstMidnight = 86_400 - 19_800; // 1970-01-01T18:30:00Z
    expect(day(firstIstMidnight - 1)).toBe(0);
    expect(day(firstIstMidnight)).toBe(1);
  });
  it("day boundaries fall on epoch boundaries", () => {
    const t = 1_793_000_000 - (1_793_000_000 % EPOCH);
    for (let e = epochId(t); e < epochId(t) + 300; e++) {
      expect(dayOfEpoch(e)).toBe(day(e * EPOCH + EPOCH - 1)); // whole epoch is in one day
    }
  });
});

describe("hashing (SPEC §3.1, §6)", () => {
  it("matches circomlib Poseidon reference vectors", () => {
    expect(hash1(1n)).toBe(18586133768512220936620570745912940619677854269274689475585506675881198879027n);
    expect(hash2(1n, 2n)).toBe(7853200120776062878684798364095072458815029376092732009249414926327459813530n);
  });
  it("rejects non-canonical field elements instead of reducing them", () => {
    expect(() => hash1(FIELD_R)).toThrow();
    expect(() => hash2(1n, FIELD_R + 1n)).toThrow();
    expect(() => hash1(-1n)).toThrow();
  });
  it("rejects out-of-range secret, day and zoneClass", () => {
    expect(() => idCommitment(0n)).toThrow();
    expect(() => idCommitment(1n << 248n)).toThrow();
    expect(() => passLeaf(1n, 65_536, 0)).toThrow();
    expect(() => passLeaf(1n, 20_000, 3)).toThrow();
  });
  it("nullifier is deterministic per epoch and differs across epochs", () => {
    const s = randomSecret();
    expect(nullifier(s, 100)).toBe(nullifier(s, 100));
    expect(nullifier(s, 100)).not.toBe(nullifier(s, 101));
    expect(nullifier(s, 100)).toBe(hash2(s, 100n));
  });
  it("randomSecret is a nonzero 248-bit value", () => {
    for (let i = 0; i < 50; i++) {
      const s = randomSecret();
      expect(s > 0n && s < 1n << 248n).toBe(true);
    }
  });
});

describe("LeanIMT ↔ circuit agreement (SPEC §3.2, invariant 5)", () => {
  const leaves = (n: number) => Array.from({ length: n }, (_, i) => passLeaf(idCommitment(BigInt(i + 1)), 20_500 + i, i % 3));

  for (const n of [1, 2, 3, 5, 8, 1000]) {
    for (const which of ["first", "middle", "last"] as const) {
      it(`${n} leaves, ${which} leaf`, () => {
        const tree = buildTree(leaves(n));
        const idx = which === "first" ? 0 : which === "middle" ? Math.floor(n / 2) : n - 1;
        const p = merkleProof(tree, idx);
        expect(p.siblings).toHaveLength(MAX_DEPTH);
        expect(p.siblings.slice(p.depth).every((s) => s === 0n)).toBe(true);
        expect(p.depth).toBeLessThanOrEqual(tree.depth);
        expect(circuitRoot(p.leaf, p.depth, p.pathIndex, p.siblings)).toBe(tree.root);
      });
    }
  }

  it("single-leaf tree: depth 0 and root = leaf", () => {
    const [l] = leaves(1);
    const p = merkleProof(buildTree([l]), 0);
    expect(p.depth).toBe(0);
    expect(p.root).toBe(l);
  });

  it("promotion: the last leaf of a 3-leaf tree has one sibling, and pathIndex is compressed", () => {
    const ls = leaves(3);
    const p = merkleProof(buildTree(ls), 2);
    expect(p.depth).toBe(1);
    expect(p.siblings[0]).toBe(hash2(ls[0], ls[1]));
    expect(p.pathIndex).toBe(1); // leaf index 2 = 0b10, compressed to 0b1
    expect(p.root).toBe(hash2(hash2(ls[0], ls[1]), ls[2]));
  });

  it("revocation: setting a neighbour to 0 keeps other proofs valid and changes the root", () => {
    const tree = buildTree(leaves(8));
    const before = tree.root;
    tree.update(2, 0n);
    expect(tree.root).not.toBe(before);
    for (const idx of [0, 3, 7]) {
      const p = merkleProof(tree, idx);
      expect(circuitRoot(p.leaf, p.depth, p.pathIndex, p.siblings)).toBe(tree.root);
    }
    const revoked = merkleProof(tree, 2);
    expect(revoked.leaf).toBe(0n);
  });

  it("rejects leaves that are not canonical field elements", () => {
    expect(() => buildTree([FIELD_R])).toThrow();
  });
});

describe("circuit input (SPEC §4)", () => {
  it("derives currentDay from epochId and uses the compressed path", () => {
    const secret = randomSecret();
    const leafs = [passLeaf(idCommitment(secret), 21_000, 1), passLeaf(idCommitment(7n), 21_000, 0)];
    const proof = merkleProof(buildTree(leafs), 0);
    const e = epochId(1_793_000_000);
    const input = buildCircuitInput({ secret, validUntilDay: 21_000, zoneClass: 1, proof, epochId: e });
    expect(input.currentDay).toBe(String(dayOfEpoch(e)));
    expect(input.nullifier).toBe(String(nullifier(secret, e)));
    expect(input.siblings).toHaveLength(MAX_DEPTH);
    expect(Object.keys(input)).toEqual([
      "root", "nullifier", "epochId", "currentDay", "zoneClass",
      "secret", "validUntilDay", "depth", "pathIndex", "siblings",
    ]);
  });
});
