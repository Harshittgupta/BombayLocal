// Regenerates apps/passenger/app/src/main/assets from the single sources of truth (protocol/ and
// circuits/artifacts/ and fixtures/). Run from the repo root after a circuit rebuild or a protocol change:
//   node apps/passenger/prepare-assets.mjs
// The generated assets are committed so the APK builds without Node. The "passenger-assets" CI job regenerates
// and diffs them, so a drift from circuits/artifacts, protocol/src or fixtures fails the build (invariant 5).
// Requires: `npm ci` in protocol/ (pinned esbuild) and in circuits/ (pinned snarkjs).
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";

const WWW = "apps/passenger/app/src/main/assets/www";
const ASSETS = "apps/passenger/app/src/main/assets";
mkdirSync(WWW, { recursive: true });

// 1. Bundle protocol/ for the browser (IIFE, global `unlinkProtocol`) with the pinned esbuild, so the output is
//    byte-reproducible (no minify, fixed version).
execFileSync(
  process.execPath,
  [
    "protocol/node_modules/esbuild/bin/esbuild",
    "protocol/src/index.ts",
    "--bundle",
    "--format=iife",
    "--global-name=unlinkProtocol",
    "--platform=browser",
    `--outfile=${WWW}/protocol.js`,
  ],
  { stdio: "inherit" },
);

// 2. snarkjs browser build + the committed circuit artifacts.
copyFileSync("circuits/node_modules/snarkjs/build/snarkjs.min.js", `${WWW}/snarkjs.min.js`);
for (const f of ["pass.wasm", "pass_final.zkey", "verification_key.json"]) {
  copyFileSync(`circuits/artifacts/${f}`, `${WWW}/${f}`);
}

// 3. Shared fixtures for the instrumented test.
for (const f of ["vectors.json", "qr-vectors.json", "sign-vectors.json"]) copyFileSync(`fixtures/${f}`, `${ASSETS}/${f}`);

console.log(`assets prepared in ${WWW} and ${ASSETS} (vectors, qr-vectors, sign-vectors)`);
