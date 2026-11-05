// Phase-2 contribution for the Groth16 key. DEMO-GRADE: exactly one contribution, so whoever ran this
// script could, in principle, have kept the toxic waste. Production needs a multi-party ceremony (README).
// Entropy: 64 bytes from the OS CSPRNG (node:crypto.randomBytes, the same source as /dev/urandom), never stored.
import { randomBytes } from "node:crypto";
import * as snarkjs from "snarkjs";
import { PTAU_PATH } from "./ptau-path.ts";

async function main(): Promise<void> {
  const entropy = randomBytes(64).toString("hex");
  const hash = await snarkjs.zKey.contribute(
    "build/pass_0000.zkey",
    "build/pass_final.zkey",
    "Unlink demo contribution (single, demo-grade)",
    entropy,
  );
  console.log(`contribution hash: ${Buffer.from(hash).toString("hex").slice(0, 32)}…`);

  const ok = await snarkjs.zKey.verifyFromR1cs("build/pass.r1cs", PTAU_PATH, "build/pass_final.zkey");
  if (!ok) throw new Error("zkey does not verify against r1cs + ptau");
  console.log("zkey verified against r1cs and ptau");
  process.exit(0); // snarkjs leaves worker threads alive
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
