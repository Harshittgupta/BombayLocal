// Writes fixtures/vectors.json: shared test vectors for every implementation (invariant 5).
// The Kotlin apps (passenger ProtocolEngine/ProverService, scanner verifier) test against this file.
// Inputs are deterministic; only the Groth16 proofs change between runs (proofs are re-randomised).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as snarkjs from "snarkjs";
import {
  EPOCH,
  FIELD_R,
  buildCircuitInput,
  buildTree,
  day,
  dayOfEpoch,
  epochId,
  hash1,
  hash2,
  hash3,
  idCommitment,
  merkleProof,
  nullifier,
  passLeaf,
} from "@bombaylocal/protocol";

const NOW = 1_793_000_000; // fixed clock: 2026-10-26T09:33:20Z
const TODAY = day(NOW);
const OUT = "../fixtures/vectors.json";

type Case = { name: string; treeSize: number; leafIndex: number; zoneClass: 0 | 1 | 2; validDays: number; revoke?: number[]; epochOffset?: number };
const CASES: Case[] = [
  { name: "8 leaves, leaf 3, 1st class (canonical case)", treeSize: 8, leafIndex: 3, zoneClass: 1, validDays: 29 },
  { name: "single-leaf tree (depth 0, root = leaf)", treeSize: 1, leafIndex: 0, zoneClass: 0, validDays: 0 },
  { name: "3 leaves, last leaf (promotion, compressed pathIndex)", treeSize: 3, leafIndex: 2, zoneClass: 2, validDays: 89 },
  { name: "5 leaves, last leaf, neighbour 3 revoked to 0", treeSize: 5, leafIndex: 4, zoneClass: 0, validDays: 1, revoke: [3] },
  { name: "1000 leaves, last leaf, next epoch", treeSize: 1000, leafIndex: 999, zoneClass: 1, validDays: 6, epochOffset: 1 },
];

const s = (x: bigint | number) => x.toString();
const secretFor = (c: number, i: number) => (0xc0ffeen << 200n) + BigInt(c) * 1_000_003n + BigInt(i) * 7_919n + 1n;
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

async function main(): Promise<void> {
  const vk = JSON.parse(readFileSync("artifacts/verification_key.json", "utf8"));
  const cases = [];
  for (const [ci, c] of CASES.entries()) {
    const secrets = Array.from({ length: c.treeSize }, (_, i) => secretFor(ci, i));
    const terms = secrets.map((_, i) =>
      i === c.leafIndex ? { v: TODAY + c.validDays, z: c.zoneClass } : { v: TODAY + 1 + (i % 30), z: i % 3 },
    );
    const leaves = secrets.map((sec, i) => passLeaf(idCommitment(sec), terms[i].v, terms[i].z));
    for (const r of c.revoke ?? []) leaves[r] = 0n;
    const tree = buildTree(leaves);
    const proof = merkleProof(tree, c.leafIndex);
    const secret = secrets[c.leafIndex];
    const e = epochId(NOW) + (c.epochOffset ?? 0);
    const input = buildCircuitInput({ secret, validUntilDay: terms[c.leafIndex].v, zoneClass: c.zoneClass, proof, epochId: e });
    const { proof: groth16, publicSignals } = await snarkjs.groth16.fullProve(input, "artifacts/pass.wasm", "artifacts/pass_final.zkey");
    if (!(await snarkjs.groth16.verify(vk, publicSignals, groth16))) throw new Error(`case ${ci} did not verify`);
    if (publicSignals[1] !== s(nullifier(secret, e))) throw new Error(`case ${ci} nullifier mismatch`);

    cases.push({
      name: c.name,
      secret: s(secret),
      idCommitment: s(idCommitment(secret)),
      validUntilDay: terms[c.leafIndex].v,
      zoneClass: c.zoneClass,
      leaf: s(proof.leaf),
      leaves: leaves.map(s),
      leafIndex: c.leafIndex,
      root: s(tree.root),
      depth: proof.depth,
      pathIndex: proof.pathIndex,
      siblings: proof.siblings.map(s),
      epochId: e,
      currentDay: dayOfEpoch(e),
      nullifier: s(nullifier(secret, e)),
      circuitInput: input,
      proof: groth16,
      publicSignals,
    });
    console.log(`case ${ci}: ${c.name}  depth=${proof.depth} pathIndex=${proof.pathIndex}  verified`);
  }

  const R1 = FIELD_R - 1n;
  const vectors = {
    meta: {
      spec: "SPEC.md v0.3",
      generatedBy: "circuits/scripts/make-fixtures.ts",
      note:
        "All field elements are decimal strings. pathIndex is LeanIMT's compressed proof.index (one bit per level " +
        "that had a sibling, level 0 = LSB), not the leaf index; depth = number of real siblings; siblings are " +
        "padded with 0 to 20. Proofs are snarkjs JSON and re-randomised on every run; everything else is deterministic.",
      fieldR: s(FIELD_R),
      epochSeconds: EPOCH,
      clockNow: NOW,
      publicSignalOrder: ["root", "nullifier", "epochId", "currentDay", "zoneClass"],
      artifactsSha256: {
        "pass.wasm": sha256("artifacts/pass.wasm"),
        "pass_final.zkey": sha256("artifacts/pass_final.zkey"),
        "verification_key.json": sha256("artifacts/verification_key.json"),
      },
    },
    poseidon: {
      poseidon1: [[0n], [1n], [R1], [secretFor(0, 0)]].map(([a]) => ({ in: [s(a)], out: s(hash1(a)) })),
      poseidon2: [[0n, 0n], [1n, 2n], [R1, 1n], [secretFor(0, 0), BigInt(epochId(NOW))]].map(([a, b]) => ({
        in: [s(a), s(b)],
        out: s(hash2(a, b)),
      })),
      poseidon3: [[0n, 0n, 0n], [1n, 2n, 3n], [idCommitment(secretFor(0, 0)), BigInt(TODAY + 29), 1n]].map(([a, b, c]) => ({
        in: [s(a), s(b), s(c)],
        out: s(hash3(a, b, c)),
      })),
    },
    time: [0, 66_599, 66_600, NOW, NOW + 86_400].map((t) => ({ unixSeconds: t, day: day(t), epochId: epochId(t), dayOfEpoch: dayOfEpoch(epochId(t)) })),
    cases,
  };

  mkdirSync("../fixtures", { recursive: true });
  writeFileSync(OUT, JSON.stringify(vectors, null, 2) + "\n");
  console.log(`wrote ${OUT}`);
  process.exit(0); // snarkjs leaves worker threads alive
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
