// Circuit tests for SPEC v0.3 §4 and §6. Real proofs only (no mocks).
import { describe, expect, it } from "vitest";
import {
  FIELD_R,
  MAX_DEPTH,
  PUBLIC_SIGNAL_ORDER,
  buildTree,
  dayOfEpoch,
  hash1,
  hash2,
  hash3,
  idCommitment,
  merkleProof,
  nullifier,
  passLeaf,
  buildCircuitInput,
} from "@bombaylocal/protocol";
import {
  EPOCH_NOW,
  MANIFEST,
  TODAY,
  VK,
  WIRE,
  expectCannotProve,
  inputFor,
  passes,
  prove,
  proveTamperedWitness,
  secretOf,
  treeOf,
  verify,
} from "./helpers.ts";

const PS = passes(8);

describe("validity (SPEC §4)", () => {
  it("1 a valid proof verifies", async () => {
    const { proof, publicSignals } = await prove(inputFor(PS, 3));
    expect(await verify(publicSignals, proof)).toBe(true);
  });

  it("2 a wrong secret cannot prove (leaf and nullifier both depend on it)", async () => {
    const input = inputFor(PS, 3);
    const wrong = secretOf(999);
    await expectCannotProve({ ...input, secret: wrong.toString(), nullifier: nullifier(wrong, EPOCH_NOW).toString() });
    await expectCannotProve({ ...input, secret: wrong.toString() });
  });

  it("3 a wrong path cannot prove (sibling or pathIndex changed)", async () => {
    const input = inputFor(PS, 3);
    const siblings = [...input.siblings];
    siblings[1] = (BigInt(siblings[1]) + 1n).toString();
    await expectCannotProve({ ...input, siblings });
    await expectCannotProve({ ...input, pathIndex: "2" });
    await expectCannotProve({ ...input, depth: String(Number(input.depth) + 1) });
  });

  it("4 a wrong root cannot prove", async () => {
    const input = inputFor(PS, 3);
    await expectCannotProve({ ...input, root: (BigInt(input.root) + 1n).toString() });
    await expectCannotProve({ ...input, root: treeOf(passes(9)).root.toString() });
  });

  it("8 validUntilDay < currentDay cannot prove; validUntilDay == currentDay can", async () => {
    // Pass 0 is valid through TODAY + 1. Find the first epoch of TODAY + 2 and the last epoch of TODAY + 1.
    let e = EPOCH_NOW;
    while (dayOfEpoch(e) <= PS[0].validUntilDay) e++;
    await expectCannotProve(inputFor(PS, 0, e));
    const lastValid = inputFor(PS, 0, e - 1);
    expect(Number(lastValid.currentDay)).toBe(PS[0].validUntilDay);
    const { proof, publicSignals } = await prove(lastValid);
    expect(await verify(publicSignals, proof)).toBe(true);
  });

  it("9 a wrong zoneClass cannot prove", async () => {
    const input = inputFor(PS, 1); // pass 1 is class 1
    await expectCannotProve({ ...input, zoneClass: "2" });
    await expectCannotProve({ ...input, zoneClass: "0" });
  });

  it("9b zoneClass outside {0,1,2} cannot prove even with a leaf built for it", async () => {
    const secret = secretOf(42);
    const leaves = [hash3(idCommitment(secret), BigInt(TODAY + 5), 3n), hash1(7n)];
    const tree = buildTree(leaves);
    const p = merkleProof(tree, 0);
    await expectCannotProve({
      root: tree.root.toString(),
      nullifier: nullifier(secret, EPOCH_NOW).toString(),
      epochId: String(EPOCH_NOW),
      currentDay: String(dayOfEpoch(EPOCH_NOW)),
      zoneClass: "3",
      secret: secret.toString(),
      validUntilDay: String(TODAY + 5),
      depth: String(p.depth),
      pathIndex: String(p.pathIndex),
      siblings: p.siblings.map(String),
    });
  });
});

describe("R1CS-level: prove from a tampered witness, bypassing the witness generator's asserts", () => {
  it("control: an untampered witness through the same path verifies (so the cases below fail for the right reason)", async () => {
    const r = await proveTamperedWitness(inputFor(PS, 3), () => {});
    expect(r.valid).toBe(true);
  });

  it("constraint 4: nullifier + 1 is rejected", async () => {
    const r = await proveTamperedWitness(inputFor(PS, 3), (w) => (w[WIRE.nullifier] += 1n));
    expect(r.valid).toBe(false);
  });

  it("constraint 4: epochId + 1 with the old nullifier is rejected", async () => {
    const r = await proveTamperedWitness(inputFor(PS, 3), (w) => (w[WIRE.epochId] += 1n));
    expect(r.valid).toBe(false);
  });

  it("constraint 3: a different root is rejected", async () => {
    const r = await proveTamperedWitness(inputFor(PS, 3), (w) => (w[WIRE.root] = treeOf(passes(9)).root));
    expect(r.valid).toBe(false);
  });

  it("constraint 5: claiming a currentDay after validUntilDay is rejected", async () => {
    const r = await proveTamperedWitness(inputFor(PS, 0), (w) => (w[WIRE.currentDay] = BigInt(PS[0].validUntilDay + 1)));
    expect(r.valid).toBe(false);
  });

  it("constraint 1/6: a different zoneClass is rejected", async () => {
    const r = await proveTamperedWitness(inputFor(PS, 1), (w) => (w[WIRE.zoneClass] = 2n));
    expect(r.valid).toBe(false);
  });
});

describe("hardening (SPEC v0.3 §4 constraints 2, 3 and 5)", () => {
  it("2 + nullifier: correct secret with nullifier + 1, or epochId + 1 with the old nullifier, cannot prove", async () => {
    const input = inputFor(PS, 3);
    await expectCannotProve({ ...input, nullifier: (BigInt(input.nullifier) + 1n).toString() });
    await expectCannotProve({ ...input, epochId: String(EPOCH_NOW + 1) });
  });

  it("depth > MAX_DEPTH against root 0 cannot prove (template would output 0)", async () => {
    const input = inputFor(PS, 3);
    await expectCannotProve({ ...input, root: "0", depth: String(MAX_DEPTH + 1) });
    await expectCannotProve({ ...input, root: "0", depth: "31" });
    await expectCannotProve({ ...input, root: "0", depth: (FIELD_R - 1n).toString() });
  });

  it("depth = MAX_DEPTH (20) is accepted: a full-depth path built from synthetic siblings proves", async () => {
    const secret = secretOf(77);
    const leaf = passLeaf(idCommitment(secret), TODAY + 3, 2);
    const siblings = Array.from({ length: MAX_DEPTH }, (_, i) => hash1(BigInt(i + 1)));
    const pathIndex = 0b1011_0010_1110_0101_1001; // 20 bits, both directions at many levels
    let node = leaf;
    for (let i = 0; i < MAX_DEPTH; i++) node = (pathIndex >> i) & 1 ? hash2(siblings[i], node) : hash2(node, siblings[i]);
    const input = buildCircuitInput({
      secret,
      validUntilDay: TODAY + 3,
      zoneClass: 2,
      proof: { root: node, leaf, depth: MAX_DEPTH, pathIndex, siblings },
      epochId: EPOCH_NOW,
    });
    const { proof, publicSignals } = await prove(input);
    expect(await verify(publicSignals, proof)).toBe(true);
  });

  it("day values >= 2^16 cannot prove (Num2Bits(16) guards LessEqThan(16))", async () => {
    const secret = secretOf(55);
    const bigDay = 65_536 + TODAY;
    const tree = buildTree([hash3(idCommitment(secret), BigInt(bigDay), 0n), hash1(9n)]);
    const p = merkleProof(tree, 0);
    const base = {
      root: tree.root.toString(),
      nullifier: nullifier(secret, EPOCH_NOW).toString(),
      epochId: String(EPOCH_NOW),
      currentDay: String(dayOfEpoch(EPOCH_NOW)),
      zoneClass: "0",
      secret: secret.toString(),
      validUntilDay: String(bigDay),
      depth: String(p.depth),
      pathIndex: String(p.pathIndex),
      siblings: p.siblings.map(String),
    };
    await expectCannotProve(base);
    const valid = inputFor(PS, 3);
    await expectCannotProve({ ...valid, currentDay: String(65_536 + Number(valid.currentDay)) });
  });

  it("pathIndex >= 2^MAX_DEPTH cannot prove (Num2Bits inside BinaryMerkleRoot)", async () => {
    const input = inputFor(PS, 3);
    await expectCannotProve({ ...input, pathIndex: String(Number(input.pathIndex) + 2 ** MAX_DEPTH) });
  });

  it("constraint count is recorded and under 20k", () => {
    console.log(`constraints: ${MANIFEST.constraints}`);
    expect(MANIFEST.constraints).toBeGreaterThan(0);
    expect(MANIFEST.constraints).toBeLessThan(20_000);
    expect(MANIFEST.outputs).toBe(0);
  });
});

describe("nullifiers (SPEC §6)", () => {
  it("5 + 7 changing epochId changes the nullifier; different epochs give different nullifiers", async () => {
    const a = await prove(inputFor(PS, 3, EPOCH_NOW));
    const b = await prove(inputFor(PS, 3, EPOCH_NOW + 1));
    const c = await prove(inputFor(PS, 3, EPOCH_NOW + 2));
    const ns = new Set([a, b, c].map((x) => x.publicSignals[1]));
    expect(ns.size).toBe(3);
    for (const x of [a, b, c]) expect(await verify(x.publicSignals, x.proof)).toBe(true);
  });

  it("6 same secret + epoch gives the same nullifier, with re-randomised proofs", async () => {
    const a = await prove(inputFor(PS, 3));
    const b = await prove(inputFor(PS, 3));
    expect(a.publicSignals[1]).toBe(b.publicSignals[1]);
    expect(JSON.stringify(a.proof)).not.toBe(JSON.stringify(b.proof));
  });

  it("13 the protocol/ nullifier equals the circuit's public nullifier", async () => {
    const { publicSignals } = await prove(inputFor(PS, 5, EPOCH_NOW + 7));
    expect(publicSignals[1]).toBe(nullifier(PS[5].secret, EPOCH_NOW + 7).toString());
    expect(publicSignals[1]).toBe(hash2(PS[5].secret, BigInt(EPOCH_NOW + 7)).toString());
  });
});

describe("public signals (SPEC §4)", () => {
  it("14 public-signal order equals SPEC §4", async () => {
    const input = inputFor(PS, 3);
    const { publicSignals } = await prove(input);
    expect(VK.nPublic).toBe(5);
    expect(PUBLIC_SIGNAL_ORDER).toEqual(["root", "nullifier", "epochId", "currentDay", "zoneClass"]);
    expect(publicSignals).toEqual(PUBLIC_SIGNAL_ORDER.map((k) => input[k]));
  });

  it("10 tampering any one public signal makes verify false", async () => {
    const { proof, publicSignals } = await prove(inputFor(PS, 3));
    for (let i = 0; i < publicSignals.length; i++) {
      const tampered = [...publicSignals];
      tampered[i] = (BigInt(tampered[i]) + 1n).toString();
      expect(await verify(tampered, proof), `signal ${PUBLIC_SIGNAL_ORDER[i]}`).toBe(false);
    }
  });

  it("10b snarkjs rejects a non-canonical nullifier (n + r)", async () => {
    // A verifier that reduced public signals mod r would accept n + r, and a scanner looking up n + r in its
    // nullifier log would see a "fresh" nullifier. snarkjs 0.7.6 refuses signals >= r. The Kotlin scanner's
    // engine gives no such guarantee, so SPEC §5 step 1 rejects any value >= r before verify regardless.
    const { proof, publicSignals } = await prove(inputFor(PS, 3));
    const aliased = [...publicSignals];
    aliased[1] = (BigInt(aliased[1]) + FIELD_R).toString();
    expect(await verify(aliased, proof)).toBe(false);
  });
});

describe("LeanIMT agreement (SPEC §3.2, invariant 5)", () => {
  for (const n of [1, 2, 3, 5, 8, 1000]) {
    const ps = passes(n);
    const tree = treeOf(ps);
    const indices = [...new Set([0, Math.floor(n / 2), n - 1])];
    it(`11 ${n} leaves: prove first, middle and last (${indices.join(", ")})`, async () => {
      for (const idx of indices) {
        const input = inputFor(ps, idx, EPOCH_NOW, tree);
        const { proof, publicSignals } = await prove(input);
        expect(publicSignals[0], `leaf ${idx}`).toBe(tree.root.toString());
        expect(await verify(publicSignals, proof), `leaf ${idx}`).toBe(true);
      }
    });
  }

  it("12 a revoked (0) neighbour leaf doesn't break other leaves' proofs", async () => {
    const tree = treeOf(PS);
    tree.update(2, 0n); // revoke pass 2
    for (const idx of [3, 0, 7]) {
      const { proof, publicSignals } = await prove(inputFor(PS, idx, EPOCH_NOW, tree));
      expect(publicSignals[0]).toBe(tree.root.toString());
      expect(await verify(publicSignals, proof)).toBe(true);
    }
    // ... and the revoked pass itself can no longer prove against the new root.
    await expectCannotProve(inputFor(PS, 2, EPOCH_NOW, tree));
  });
});
