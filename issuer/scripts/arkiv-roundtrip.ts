// M6 round trip on the REAL Rabdi testnet + Sepolia:
//   simulated purchases + one refund -> publishRoot (Arkiv LeafBatches/Revocations -> Registry.postRoot -> sign ->
//   Arkiv SignedRoot) -> ScannerList + VerifyKey -> read everything back with a FRESH client, filtered on
//   $creator = $owner = writer -> rebuild the tree from Arkiv data alone -> assert it equals the signed root and the
//   on-chain root. Prints entity keys, the writer address and one query a judge can run.
// Usage (from issuer/):  npm run arkiv-roundtrip   (needs ../.env: ISSUER_PRIVATE_KEY, ADMIN_TOKEN, AUTHORITY_PRIVATE_KEY)
import { readFileSync } from "node:fs";
import { ROOT_TTL, idCommitment, randomSecret } from "@unlink/protocol";
import { IssuerDb } from "../src/db.ts";
import { loadDeployment, loadEnv, loadProducts, loadScannerAllowlist } from "../src/config.ts";
import { purchase } from "../src/purchase.ts";
import { RegistryClient } from "../src/registry.ts";
import { publishRoot } from "../src/publisher.ts";
import { recoverRootSigner } from "../src/sign.ts";
import { rebuildTree } from "../src/tree.ts";
import { makeLogger } from "../src/logger.ts";
import { ArkivReader, makeArkiv, makeArkivPublic, rebuildFromArkiv } from "../src/arkiv/index.ts";

const VK_PATH = "../circuits/artifacts/verification_key.json";
const RPC = process.env.ARKIV_RPC_URL || "https://rpc.rabdi.db-chain.testnet.arkiv.network";

function check(cond: boolean, what: string): void {
  if (!cond) throw new Error(`ROUND TRIP FAILED: ${what}`);
  console.log(`  ok  ${what}`);
}

const log = makeLogger();
const env = loadEnv();
const deployment = loadDeployment();
const products = loadProducts();
const db = new IssuerDb("issuer.db");
const registry = new RegistryClient(env.rpcUrl, env.issuerPrivateKey, deployment.registry);
const { writer } = makeArkiv(env.issuerPrivateKey);
const issuer = deployment.issuer;

console.log(`issuer / Arkiv writer: ${writer.address}`);

// 1. Purchases through the simulated payment in src/purchase.ts (SPEC R5), plus one refund.
const bought = ["day-pass", "month-pass", "month-first"].map((p) => purchase(db, products, idCommitment(randomSecret()), p));
db.revokeLeaf(bought[0]!.leafIndex);
console.log(`seeded ${bought.length} purchases and 1 refund (revocation)`);

// 2. Publish: Arkiv leaves + revocations -> postRoot (Sepolia) -> sign -> Arkiv SignedRoot.
const published = await publishRoot({ db, registry, arkiv: writer, deployment, log });
console.log(`postRoot rootId ${published.rootId}: https://sepolia.etherscan.io/tx/${published.txHash}`);

// 3. ScannerList (issuer wallet) and VerifyKey (authority wallet, SPEC §9).
const scanners = loadScannerAllowlist();
let scannerKey: string | undefined;
if (scanners.length > 0) {
  scannerKey = (await writer.publishScannerList(1, scanners)).entityKey;
} else {
  console.log("ScannerList: skipped (issuer/scanners.json is empty; M8 adds scanner keys)");
}
const vkBytes = new Uint8Array(readFileSync(VK_PATH));
const authorityPk = process.env.AUTHORITY_PRIVATE_KEY;
let vkKey: string | undefined;
if (!authorityPk) {
  console.log("VerifyKey: BLOCKED (AUTHORITY_PRIVATE_KEY not set)");
} else {
  const authority = makeArkiv(authorityPk);
  check(authority.writer.address.toLowerCase() === deployment.authority.toLowerCase(), "authority key matches deployments.json");
  const balance = await makeArkivPublic().getBalance({ address: authority.writer.address });
  if (balance === 0n) {
    console.log(`VerifyKey: BLOCKED (authority ${authority.writer.address} has 0 tGLM on Rabdi; fund it at https://hub.arkiv.network/faucet)`);
  } else {
    vkKey = (await authority.writer.publishVk(vkBytes)).entityKey;
  }
}

// 4. Read back with a FRESH client, exactly as a phone does (SPEC §3.1 refresh).
console.log("\nreading back from Arkiv (fresh client)");
const fresh = new ArkivReader(makeArkivPublic());
const state = await registry.issuerState(issuer);
check(state.active, "issuer active on-chain");
const sr = await fresh.signedRoot(issuer, state.latestRootId);
check(sr !== undefined, `SignedRoot for on-chain latestRootId ${state.latestRootId} found on Arkiv`);
if (!sr) process.exit(1);
check(sr.root.toLowerCase() === state.latestRoot.toLowerCase(), "SignedRoot.root == Registry latestRoot");
check(sr.issuedAt === state.latestPostedAt, "issuedAt == on-chain postedAt");
check(sr.expiresAt === sr.issuedAt + ROOT_TTL, "expiresAt == issuedAt + ROOT_TTL");
check(sr.chainId === deployment.chainId && sr.registry.toLowerCase() === deployment.registry.toLowerCase(), "chainId + registry");
check(recoverRootSigner(sr, sr.signature).toLowerCase() === issuer.toLowerCase(), "signature recovers the issuer (§3.3)");

const batches = await fresh.leafBatches(issuer);
const revocations = await fresh.revocations(issuer);
console.log(`  read ${batches.length} LeafBatch, ${revocations.length} Revocation entities (leafCount ${sr.leafCount}, revSeq ${sr.revSeq})`);
const rebuilt = rebuildFromArkiv(sr.leafCount, sr.revSeq, batches, revocations);
check(rebuilt.root === BigInt(sr.root), "root rebuilt from Arkiv data == signed root");
check(rebuilt.root === rebuildTree(db).tree.root, "== the issuer's own tree");
check(rebuilt.leaves[bought[0]!.leafIndex] === 0n, "the refunded pass is 0 in the rebuilt tree");
check(rebuilt.leaves[bought[1]!.leafIndex] !== 0n, "a live pass is present in the rebuilt tree");

if (scannerKey) {
  const list = await fresh.scannerList(issuer);
  check(list?.keys.join() === [...scanners].sort().join(), "ScannerList read back");
}
if (vkKey) {
  const vks = await fresh.vk(deployment.authority);
  const manifest = JSON.parse(readFileSync("../circuits/artifacts/manifest.json", "utf8"));
  const want: string = manifest.sha256["verification_key.json"];
  const vk = vks.find((v) => Buffer.from(v.vk).equals(Buffer.from(vkBytes)));
  check(vk !== undefined, "VerifyKey bytes read back == circuits/artifacts/verification_key.json");
  check(vk?.vkSha256 === want, `VerifyKey sha256 == manifest (${want.slice(0, 12)}…)`);
}

// 5. What a judge can check.
const judgeQuery =
  `type = str('unlink.signedRoot') AND issuer = addr(${issuer}) AND ` +
  `$creator = addr(${issuer}) AND $owner = addr(${issuer})`;
const curl =
  `curl -s -X POST ${RPC} -H 'content-type: application/json' --data ` +
  // '"'"' closes the shell's single quote, adds a literal ', and reopens it: the query language needs str('...').
  `'{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["${judgeQuery.replaceAll("'", `'"'"'`)} ORDER BY rootId:u64 DESC",` +
  `{"select":{"key":true,"owner":true,"creator":true,"attributes":true},"limit":"0x1"}]}'`;

console.log("\nentity keys");
for (const k of published.arkivKeys.batches) console.log(`  LeafBatch   ${k}`);
for (const k of published.arkivKeys.revocations) console.log(`  Revocation  ${k}`);
console.log(`  SignedRoot  ${published.arkivKeys.signedRoot}`);
if (scannerKey) console.log(`  ScannerList ${scannerKey}`);
if (vkKey) console.log(`  VerifyKey   ${vkKey}`);
console.log(`\nwriter (issuer): ${writer.address}   https://rabdi.explorer.arkiv.network/address/${writer.address}`);
console.log(`authority (VerifyKey writer): ${deployment.authority}`);
console.log(`\njudge query (latest signed root):\n${curl}`);
console.log("\nROUND TRIP OK: rebuilt root == signed root == on-chain root");
process.exit(0);
