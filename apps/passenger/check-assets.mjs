// CI guard (invariant 5): the committed apps/passenger assets must match their sources. Pure Node, no esbuild
// or npm install needed, so it runs anywhere. Run from the repo root:  node apps/passenger/check-assets.mjs
//
// 1. The binary/fixture assets are byte-identical (sha256) to circuits/artifacts/ and fixtures/.
// 2. The committed protocol.js bundle computes Poseidon and the LeanIMT tree identically to fixtures/vectors.json.
//    fixtures/vectors.json is tied to protocol/src by circuits/test/fixtures.test.ts (the "tests" CI job), so this
//    chains the on-phone bundle back to protocol/src. If protocol/src changes, rerun prepare-assets.mjs.
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const WWW = "apps/passenger/app/src/main/assets/www";
const ASSETS = "apps/passenger/app/src/main/assets";

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exit(1);
}
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

// 1. Byte-identical binary and fixture assets.
const pairs = [
  [`${WWW}/pass.wasm`, "circuits/artifacts/pass.wasm"],
  [`${WWW}/pass_final.zkey`, "circuits/artifacts/pass_final.zkey"],
  [`${WWW}/verification_key.json`, "circuits/artifacts/verification_key.json"],
  [`${ASSETS}/vectors.json`, "fixtures/vectors.json"],
  [`${ASSETS}/qr-vectors.json`, "fixtures/qr-vectors.json"],
  [`${ASSETS}/sign-vectors.json`, "fixtures/sign-vectors.json"],
];
for (const [asset, source] of pairs) {
  if (sha256(asset) !== sha256(source)) fail(`${asset} differs from ${source} — run: node apps/passenger/prepare-assets.mjs`);
}
console.log("PASS  wasm/zkey/vk/vectors assets are byte-identical to circuits/artifacts and fixtures");

// 2. The committed protocol.js bundle matches fixtures (and thus protocol/src).
const ctx = { atob: (s) => Buffer.from(s, "base64").toString("binary"), crypto: webcrypto, console, TextEncoder, TextDecoder };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(`${WWW}/protocol.js`, "utf8"), ctx);
const u = ctx.bombaylocalProtocol;
if (!u || typeof u.hash2 !== "function") fail("protocol.js did not expose the bombaylocalProtocol API");

const V = JSON.parse(readFileSync("fixtures/vectors.json", "utf8"));
const B = (x) => BigInt(x);
for (const v of V.poseidon.poseidon1) if (u.hash1(B(v.in[0])).toString() !== v.out) fail("protocol.js poseidon1 drift");
for (const v of V.poseidon.poseidon2) if (u.hash2(B(v.in[0]), B(v.in[1])).toString() !== v.out) fail("protocol.js poseidon2 drift");
for (const v of V.poseidon.poseidon3) if (u.hash3(B(v.in[0]), B(v.in[1]), B(v.in[2])).toString() !== v.out) fail("protocol.js poseidon3 drift");
for (const c of V.cases) {
  const proof = u.merkleProof(u.buildTree(c.leaves.map(B)), c.leafIndex);
  if (proof.root.toString() !== c.root || proof.depth !== c.depth || proof.pathIndex !== c.pathIndex) {
    fail(`protocol.js tree drift on case "${c.name}"`);
  }
}
console.log(`PASS  protocol.js bundle matches fixtures (${V.cases.length} cases, poseidon1/2/3) — in sync with protocol/src`);

// 3. The bundle's SPEC §3.3 signature recovery and §3.4 QR codec match the shared vectors (also checked against
//    protocol/src and the issuer's ethers code by the vitest suites).
const SV = JSON.parse(readFileSync("fixtures/sign-vectors.json", "utf8"));
if (u.rootDigest(SV.signedRoot.fields) !== SV.signedRoot.digest) fail("protocol.js rootDigest drift");
if (u.recoverRootSigner(SV.signedRoot.fields, SV.signedRoot.eip191Signature) !== SV.signedRoot.signer.toLowerCase()) {
  fail("protocol.js recoverRootSigner drift");
}
const QV = JSON.parse(readFileSync("fixtures/qr-vectors.json", "utf8"));
const qp = u.qrDecode(QV.base45);
if (u.qrEncode(qp) !== QV.base45 || u.qrPublicSignals(qp).join() !== QV.publicSignals.join()) fail("protocol.js QR codec drift");
console.log("PASS  protocol.js signed-root recovery and QR codec match fixtures/sign-vectors.json and qr-vectors.json");
