// LIVE end-to-end check of the demo's code paths (no browser, no DOM): run `npm run e2e` from web/.
// It BUYS ONE REAL DAY PASS on the hosted issuer (simulated payment; counts against the purchase limit), waits for the
// auto-published root on Sepolia, rebuilds the list from Arkiv, proves with the real circuit, renders the QR, decodes
// its pixels with jsQR and runs the browser scanner's offline check three times: Green, Amber, Red, 0 requests each.
import * as snarkjs from "snarkjs";
import qrcode from "qrcode-generator";
import jsQR from "jsqr";
import { Passenger } from "../src/passenger.ts";
import { Scanner } from "../src/scanner.ts";

(globalThis as { snarkjs?: unknown }).snarkjs = snarkjs;
const fail = (m: string): never => { console.error(`E2E FAILED: ${m}`); process.exit(1); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const scanner = new Scanner();
await scanner.sync();
console.log("scanner synced (two agreeing Sepolia providers + pinned vk from Arkiv)");

const t0 = Date.now();
const p = new Passenger((s) => console.log(`  [${s.done ? "x" : " "}] ${s.text}${s.link ? `  ${s.link}` : ""}`), (l) => console.log(`  ${l}`));
await p.buy("day-pass");
const text = await p.proveNow();
console.log(`pass ready in ${((Date.now() - t0) / 1000).toFixed(0)} s (proof ${p.qr!.proveMs} ms), QR ${text.length} chars`);
if (text.length !== 641) fail("QR text is not 641 Base45 characters");

// Render exactly like the page (4-module quiet zone, whole pixels per module), then decode the pixels.
const qr = qrcode(0, "M");
qr.addData(text, "Alphanumeric");
qr.make();
const n = qr.getModuleCount(), scale = 4, size = (n + 8) * scale;
const rgba = new Uint8ClampedArray(size * size * 4).fill(255);
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) {
  for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
    const i = (((r + 4) * scale + y) * size + (c + 4) * scale + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
  }
}
const decoded = jsQR(rgba, size, size)?.data;
if (decoded !== text) fail(`jsQR decode mismatch (QR version ${(n - 17) / 4})`);
console.log(`QR version ${(n - 17) / 4}-M decoded from pixels`);

const expect = ["GREEN", "AMBER", "RED"];
for (let i = 0; i < 3; i++) {
  if (i) await sleep(1_200); // a new showing: the code left the camera for more than DEBOUNCE_GAP
  const c = await scanner.check(decoded);
  console.log(`scan ${i + 1}: ${c.result.status} ${c.result.reason}  ${c.ms} ms, ${c.requests} network requests`);
  if (c.result.status !== expect[i]) fail(`scan ${i + 1} expected ${expect[i]}`);
  if (c.requests !== 0) fail("the offline check made a network request");
}
const same = await scanner.check(decoded);
if (!same.result.sameShowing) fail("a read within 1 s should be the same showing");
console.log("E2E PASSED");
await (globalThis as { curve_bn128?: { terminate(): Promise<void> } }).curve_bn128?.terminate();
process.exit(0);
