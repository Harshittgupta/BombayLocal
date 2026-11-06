// Publishes issuer/scanners.json (the scanner-key allowlist the issuer's POST /scan-batches already enforces) to Arkiv
// as the issuer's ScannerList (SPEC §5 sync, arkiv/schema.md). Scanners read it back to show "this scanner is
// registered". Same keys as the newest list → that list is extended; different keys → a new list, listNo + 1.
// Usage (from issuer/):  npm run publish-scanners   (needs ../.env: ISSUER_PRIVATE_KEY, ARKIV_RPC_URL)
import { loadEnv, loadScannerAllowlist } from "../src/config.ts";
import { makeArkiv } from "../src/arkiv/index.ts";

const env = loadEnv();
const keys = loadScannerAllowlist();
if (keys.length === 0) {
  console.error("issuer/scanners.json is empty or missing: add the scanner address shown in the scanner's Settings");
  process.exit(1);
}
for (const k of keys) if (!/^0x[0-9a-f]{40}$/.test(k)) throw new Error(`not an address: ${k}`);

const { reader, writer } = makeArkiv(env.issuerPrivateKey);
const newest = await reader.scannerList(writer.address);
const sorted = [...keys].sort();
const same = newest !== undefined && newest.keys.join() === sorted.join();
const listNo = same ? newest!.listNo : (newest?.listNo ?? 0) + 1;
const res = await writer.publishScannerList(listNo, sorted);
console.log(`ScannerList ${listNo} (${sorted.length} key${sorted.length === 1 ? "" : "s"}) ${res.reused ? "extended" : "created"}: entity ${res.entityKey}, tx ${res.txHash}`);
process.exit(0);
