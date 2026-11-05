// Copies the final circuit artifacts into circuits/artifacts/ (committed, so the repo builds without a re-run,
// rule R1) and records their hashes. The verification-key hash is what the scanner APK and audit page pin.
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as snarkjs from "snarkjs";

const FILES: Record<string, string> = {
  "pass.wasm": "build/pass_js/pass.wasm",
  "pass_final.zkey": "build/pass_final.zkey",
  "verification_key.json": "build/verification_key.json",
};

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

mkdirSync("artifacts", { recursive: true });
const hashes: Record<string, string> = {};
for (const [name, src] of Object.entries(FILES)) {
  copyFileSync(src, `artifacts/${name}`);
  hashes[name] = sha256(`artifacts/${name}`);
}
const vk = JSON.parse(readFileSync("artifacts/verification_key.json", "utf8"));
const r1cs = await snarkjs.r1cs.info("build/pass.r1cs");
const manifest = {
  circuit: "pass.circom",
  circom: execFileSync("circom", ["--version"], { encoding: "utf8", shell: true }).trim().replace(/^circom compiler /, ""),
  snarkjs: "0.7.6",
  ptau: "powersOfTau28_hez_final_13.ptau",
  trustedSetup: "demo-grade: one phase-2 contribution",
  protocol: vk.protocol,
  curve: vk.curve,
  nPublic: vk.nPublic,
  constraints: r1cs.nConstraints,
  privateInputs: r1cs.nPrvInputs,
  outputs: r1cs.nOutputs,
  sha256: hashes,
};
writeFileSync("artifacts/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest, null, 2));
process.exit(0); // snarkjs leaves worker threads alive
