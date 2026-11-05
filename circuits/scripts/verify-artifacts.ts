// Proves the committed artifacts come from this repo's pass.circom (rule R1). Run after `npm run compile` and
// `npm run ptau` (CI does this on every push):
//   1. the freshly compiled r1cs has the constraint count recorded in the manifest, and it is < 20k;
//   2. the committed zkey verifies against that r1cs and the hash-checked ptau (zkey verify);
//   3. the verification key exported from the committed zkey equals the committed verification_key.json;
//   4. the committed files match the sha256 values in manifest.json.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import * as snarkjs from "snarkjs";
import { PTAU_PATH } from "./ptau-path.ts";

const fail = (msg: string): never => {
  console.error(`FAIL  ${msg}`);
  process.exit(1);
};
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

async function main(): Promise<void> {
  const manifest = JSON.parse(readFileSync("artifacts/manifest.json", "utf8"));

  const info = await snarkjs.r1cs.info("build/pass.r1cs");
  if (info.nConstraints !== manifest.constraints) fail(`r1cs has ${info.nConstraints} constraints, manifest says ${manifest.constraints}`);
  if (info.nConstraints >= 20_000) fail(`${info.nConstraints} constraints exceeds the 20k budget`);
  console.log(`PASS  r1cs compiled from pass.circom: ${info.nConstraints} constraints (< 20k), matches manifest`);

  if (!(await snarkjs.zKey.verifyFromR1cs("build/pass.r1cs", PTAU_PATH, "artifacts/pass_final.zkey")))
    fail("committed zkey does not verify against the compiled r1cs and ptau");
  console.log("PASS  committed zkey verifies against the compiled r1cs and the hash-checked ptau");

  const vk = await snarkjs.zKey.exportVerificationKey("artifacts/pass_final.zkey");
  const committed = JSON.parse(readFileSync("artifacts/verification_key.json", "utf8"));
  if (!isDeepStrictEqual(JSON.parse(JSON.stringify(vk)), committed)) fail("verification_key.json differs from the key in the zkey");
  console.log("PASS  verification_key.json equals the key exported from the zkey");

  for (const [name, hash] of Object.entries(manifest.sha256 as Record<string, string>))
    if (sha256(`artifacts/${name}`) !== hash) fail(`${name} sha256 differs from manifest`);
  console.log("PASS  artifact sha256 values match manifest.json");
  process.exit(0); // snarkjs leaves worker threads alive
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
