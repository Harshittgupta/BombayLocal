// Records REAL public responses for the passenger refresh test (androidTest RefreshTest): one Sepolia
// Registry.issuerState eth_call and the Arkiv arkiv_query results for the issuer's latest SignedRoot, its LeafBatches and
// Revocations, using the same queries the app's ArkivClient sends. The test replays them through the app's real parsing
// and verification, untampered (must be accepted) and tampered (must be rejected, old root kept).
// Run from the repo root:  node apps/passenger/record-arkiv.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "apps/passenger/app/src/androidTest/assets/recorded";
const ARKIV = process.env.ARKIV_RPC_URL || "https://rpc.rabdi.db-chain.testnet.arkiv.network";
const SEPOLIA = process.env.SEPOLIA_RPC_URL_BACKUP || "https://ethereum-sepolia-rpc.publicnode.com";
const { registry, issuer } = JSON.parse(readFileSync("deployments.json", "utf8")).sepolia;
const SELECTOR = "0x038ab50a"; // keccak256("issuerState(address)")[0:4]

async function rpc(url, method, params) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

const i = issuer.toLowerCase();
const base = (type) => `app = str('unlink') AND type = str('${type}') AND issuer = addr(${i}) AND $creator = addr(${i}) AND $owner = addr(${i})`;
const page = (filter) =>
  rpc(ARKIV, "arkiv_query", [
    `${filter} AND $key > key(0x${"0".repeat(64)}) ORDER BY $key ASC`,
    { select: { key: true, owner: true, creator: true, attributes: true }, limit: "0x64" },
  ]);

const issuerState = await rpc(SEPOLIA, "eth_call", [{ to: registry, data: SELECTOR + i.slice(2).padStart(64, "0") }, "latest"]);
const latestRootId = BigInt("0x" + issuerState.slice(2 + 3 * 64, 2 + 4 * 64));
const signedRoot = await page(`${base("unlink.signedRoot")} AND rootId = u64(${latestRootId})`);
const leafBatch = await page(base("unlink.leafBatch"));
const revocation = await page(base("unlink.revocation"));
for (const [name, r] of [["leafBatch", leafBatch], ["revocation", revocation]]) {
  if (r.data.length >= 100) throw new Error(`${name}: more than one page; extend the recorder`);
}

mkdirSync(OUT, { recursive: true });
const meta = { recordedAt: new Date().toISOString(), arkiv: ARKIV, sepolia: SEPOLIA, registry, issuer, latestRootId: Number(latestRootId) };
writeFileSync(`${OUT}/recorded.json`, JSON.stringify({ meta, issuerState, signedRoot, leafBatch, revocation }, null, 1) + "\n");
console.log(`recorded rootId ${latestRootId}: ${leafBatch.data.length} batches, ${revocation.data.length} revocations -> ${OUT}/recorded.json`);
