// End-to-end sample: 8-leaf tree, prove membership of leaf 3 with groth16.fullProve, verify, print
// the public signals and the proving time. Uses only the committed artifacts in circuits/artifacts/.
import { readFileSync } from "node:fs";
import * as snarkjs from "snarkjs";
import {
  PUBLIC_SIGNAL_ORDER,
  buildCircuitInput,
  buildTree,
  day,
  epochId,
  idCommitment,
  merkleProof,
  passLeaf,
  randomSecret,
} from "@unlink/protocol";

async function main(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const today = day(now);

  // Leaf 3 is ours: a 30-day 1st-class pass. The other 7 belong to other passengers.
  const secret = randomSecret();
  const mine = { validUntilDay: today + 29, zoneClass: 1 };
  const leaves = Array.from({ length: 8 }, (_, i) =>
    i === 3
      ? passLeaf(idCommitment(secret), mine.validUntilDay, mine.zoneClass)
      : passLeaf(idCommitment(randomSecret()), today + i, i % 3),
  );
  const tree = buildTree(leaves);
  const proof = merkleProof(tree, 3);
  const input = buildCircuitInput({ secret, ...mine, proof, epochId: epochId(now) });

  const t0 = performance.now();
  const { proof: groth16Proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    "artifacts/pass.wasm",
    "artifacts/pass_final.zkey",
  );
  const proveMs = performance.now() - t0;

  const vk = JSON.parse(readFileSync("artifacts/verification_key.json", "utf8"));
  const t1 = performance.now();
  const ok = await snarkjs.groth16.verify(vk, publicSignals, groth16Proof);
  const verifyMs = performance.now() - t1;

  console.log("public signals (SPEC §4 order):");
  PUBLIC_SIGNAL_ORDER.forEach((name, i) => console.log(`  ${name.padEnd(10)} ${publicSignals[i]}`));
  console.log(`depth=${proof.depth} pathIndex=${proof.pathIndex} (leaf index 3)`);
  console.log(`prove: ${proveMs.toFixed(0)} ms   verify: ${verifyMs.toFixed(0)} ms   valid: ${ok}`);
  if (!ok) throw new Error("proof did not verify");
  if (publicSignals[0] !== tree.root.toString()) throw new Error("public root != tree root");
  process.exit(0); // snarkjs leaves worker threads alive
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
