// CI guard (invariant 5): the committed apps/scanner assets match their sources byte for byte. Run from the repo
// root after `npm ci` in circuits/:  node apps/scanner/check-assets.mjs
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

const APP = "apps/scanner/app/src";
const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
function fail(m) {
  console.error(`FAIL  ${m} — run: node apps/scanner/prepare-assets.mjs`);
  process.exit(1);
}

const pairs = [
  [`${APP}/main/assets/www/snarkjs.min.js`, "circuits/node_modules/snarkjs/build/snarkjs.min.js"],
  [`${APP}/main/assets/verification_key.json`, "circuits/artifacts/verification_key.json"],
  [`${APP}/androidTest/assets/qr-vectors.json`, "fixtures/qr-vectors.json"],
];
const src = readdirSync("fixtures/qr").filter((f) => f.endsWith(".json")).sort();
const dst = readdirSync(`${APP}/androidTest/assets/qr`).filter((f) => f.endsWith(".json")).sort();
if (src.join() !== dst.join()) fail("androidTest QR fixtures differ from fixtures/qr");
for (const f of src) pairs.push([`${APP}/androidTest/assets/qr/${f}`, `fixtures/qr/${f}`]);
for (const [a, s] of pairs) if (sha256(a) !== sha256(s)) fail(`${a} differs from ${s}`);

const pinned = JSON.parse(readFileSync("circuits/artifacts/manifest.json", "utf8")).sha256["verification_key.json"];
if (sha256(`${APP}/main/assets/verification_key.json`) !== pinned) fail("bundled vk does not match the pinned VK_HASH");
console.log(`PASS  scanner assets (snarkjs, vk = pinned hash, ${src.length} QR fixtures) match their sources`);
