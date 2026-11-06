// Regenerates apps/scanner/app assets from their single sources of truth. Run from the repo root:
//   node apps/scanner/prepare-assets.mjs        (needs `npm ci` in circuits/ for the pinned snarkjs 0.7.6)
// The copies are committed so the APK builds without Node; apps/scanner/check-assets.mjs (CI) fails on any drift.
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";

const APP = "apps/scanner/app/src";
mkdirSync(`${APP}/main/assets/www`, { recursive: true });
copyFileSync("circuits/node_modules/snarkjs/build/snarkjs.min.js", `${APP}/main/assets/www/snarkjs.min.js`);
// The verification key the APK ships with; its sha256 is BuildConfig.VK_HASH (from circuits/artifacts/manifest.json).
copyFileSync("circuits/artifacts/verification_key.json", `${APP}/main/assets/verification_key.json`);

// Instrumented tests run every scanner fixture on the device.
const QR = `${APP}/androidTest/assets/qr`;
mkdirSync(QR, { recursive: true });
for (const f of readdirSync(QR)) rmSync(`${QR}/${f}`);
const cases = readdirSync("fixtures/qr").filter((f) => f.endsWith(".json"));
for (const f of cases) copyFileSync(`fixtures/qr/${f}`, `${QR}/${f}`);
copyFileSync("fixtures/qr-vectors.json", `${APP}/androidTest/assets/qr-vectors.json`);
console.log(`scanner assets prepared (snarkjs, vk, ${cases.length} QR fixtures)`);
