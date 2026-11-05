// Copies the final circuit artifacts into circuits/artifacts/ (committed, so the repo builds without a re-run,
// rule R1) and records their hashes. The verification-key hash is what the scanner APK and audit page pin.
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

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
const manifest = {
  circuit: "pass.circom",
  circom: "2.2.3",
  snarkjs: "0.7.6",
  ptau: "powersOfTau28_hez_final_13.ptau",
  trustedSetup: "demo-grade: one phase-2 contribution",
  protocol: vk.protocol,
  curve: vk.curve,
  nPublic: vk.nPublic,
  sha256: hashes,
};
writeFileSync("artifacts/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest, null, 2));
