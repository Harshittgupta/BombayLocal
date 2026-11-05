// Prints the constraint count and the median Groth16 proving / verify time over 5 runs (SPEC §10).
// This measures Node + snarkjs on the machine it runs on; the phone number comes from Module 3.
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import * as snarkjs from "snarkjs";
import { buildCircuitInput, buildTree, day, epochId, idCommitment, merkleProof, passLeaf } from "@unlink/protocol";

const RUNS = 5;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function main(): Promise<void> {
  const manifest = JSON.parse(readFileSync("artifacts/manifest.json", "utf8"));
  const vk = JSON.parse(readFileSync("artifacts/verification_key.json", "utf8"));
  const now = 1_793_000_000;
  const secrets = Array.from({ length: 8 }, (_, i) => 1_000_000_007n * BigInt(i + 1));
  const leaves = secrets.map((s, i) => passLeaf(idCommitment(s), day(now) + 30, i % 3));
  const input = buildCircuitInput({
    secret: secrets[3],
    validUntilDay: day(now) + 30,
    zoneClass: 0,
    proof: merkleProof(buildTree(leaves), 3),
    epochId: epochId(now),
  });

  await snarkjs.groth16.fullProve(input, "artifacts/pass.wasm", "artifacts/pass_final.zkey"); // warm-up
  const prove: number[] = [];
  const verify: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, "artifacts/pass.wasm", "artifacts/pass_final.zkey");
    prove.push(performance.now() - t0);
    const t1 = performance.now();
    if (!(await snarkjs.groth16.verify(vk, publicSignals, proof))) throw new Error("bench proof did not verify");
    verify.push(performance.now() - t1);
  }
  console.log(`constraints:          ${manifest.constraints}`);
  console.log(`prove  median of ${RUNS}:  ${median(prove).toFixed(0)} ms   (runs: ${prove.map((x) => x.toFixed(0)).join(", ")})`);
  console.log(`verify median of ${RUNS}:  ${median(verify).toFixed(0)} ms`);
  console.log(`machine: ${cpus()[0].model.trim()} x${cpus().length}, Node ${process.version}, ${process.platform}`);
  process.exit(0); // snarkjs leaves worker threads alive
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
