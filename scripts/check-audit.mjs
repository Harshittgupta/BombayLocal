// Runs audit/index.html's own logic (the AUDIT-LOGIC block) in Node against the LIVE Sepolia Registry and Arkiv,
// with the exact ethers file the page pins, after checking that file against the page's SRI hash.
// Prints every claim; exits 1 if any claim is false. Usage (repo root):  node scripts/check-audit.mjs
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("audit/index.html", "utf8");
const src = html.match(/<script src="([^"]+)"\s+integrity="([^"]+)"/);
if (!src) throw new Error("pinned ethers <script> with integrity not found");
const [, url, integrity] = src;
const lib = Buffer.from(await (await fetch(url)).arrayBuffer());
const sri = "sha384-" + createHash("sha384").update(lib).digest("base64");
if (sri !== integrity) throw new Error(`SRI mismatch for ${url}: page ${integrity}, file ${sri}`);
console.log(`PASS  ${url} matches the page's SRI hash`);

const logic = html.split("/*AUDIT-LOGIC-START*/")[1]?.split("/*AUDIT-LOGIC-END*/")[0];
if (!logic) throw new Error("AUDIT-LOGIC block not found");
const ctx = vm.createContext({ fetch, console, URLSearchParams, TextEncoder, TextDecoder, setTimeout, clearTimeout, AbortController, Headers, Request, Response });
ctx.globalThis = ctx;
ctx.self = ctx;
ctx.window = ctx;
vm.runInContext(lib.toString("utf8"), ctx);
vm.runInContext(`${logic}\n;globalThis.__audit = { CONFIG, loadChain, loadArkiv, buildClaims };`, ctx);
const { CONFIG, loadChain, loadArkiv, buildClaims } = ctx.__audit;

const chain = await loadChain(CONFIG.sepoliaRpc);
const arkiv = await loadArkiv(CONFIG.arkivRpc, chain.issuers);
const claims = buildClaims(chain, arkiv, Math.floor(Date.now() / 1000));
let failed = 0;
for (const c of claims) {
  const mark = c.ok === true ? "PASS" : c.ok === "warn" ? "WARN" : "FAIL";
  if (c.ok === false || c.ok === null) failed++;
  const left = c.countdown ? `${Math.round((c.countdown - Date.now() / 1000) / 360) / 10} h left` : "";
  console.log(`${mark}  ${c.title} — ${c.detail}${left}`);
}
console.log(`\nblock ${chain.head}; issuers ${chain.issuers.length}; RootPosted events ${chain.events.roots.length}; scanner list ${JSON.stringify(arkiv.perIssuer[chain.issuers[0]]?.scannerList)}`);
process.exit(failed ? 1 : 0);
