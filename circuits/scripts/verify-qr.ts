// Verifies an Unlink pass QR on the laptop, independently of the phone and the scanner app:
//   decode the SPEC §3.4 payload → Groth16 verify with circuits/artifacts/verification_key.json → recover the §3.3
//   signer → compare the root with the issuer's latest root on the Sepolia Registry (one public eth_call).
// Usage (from circuits/):  npm run verify-qr -- <file-with-the-641-char-QR-text>
import { readFileSync } from "node:fs";
import * as snarkjs from "snarkjs";
import { dayOfEpoch, keccakUtf8, qrDecode, qrPublicSignals, recoverRootSigner } from "@unlink/protocol";

const file = process.argv[2];
if (!file) throw new Error("usage: npm run verify-qr -- <qr-text-file>");
const RPC = process.env.SEPOLIA_RPC_URL_BACKUP || "https://ethereum-sepolia-rpc.publicnode.com";
const d = JSON.parse(readFileSync("../deployments.json", "utf8")).sepolia;
const p = qrDecode(readFileSync(file, "utf8").trim());
const vk = JSON.parse(readFileSync("artifacts/verification_key.json", "utf8"));

const proofOk = await snarkjs.groth16.verify(vk, qrPublicSignals(p), p.proof);
const signer = recoverRootSigner(
  { chainId: d.chainId, registry: d.registry, issuer: p.issuer, rootId: p.rootId, root: p.root, issuedAt: p.issuedAt, expiresAt: p.expiresAt },
  p.signature,
);
const selector = keccakUtf8("issuerState(address)").slice(0, 10);
const res = await fetch(RPC, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: d.registry, data: selector + p.issuer.slice(2).padStart(64, "0") }, "latest"],
  }),
}).then((r) => r.json() as Promise<{ result: string }>);
const word = (i: number) => "0x" + res.result.slice(2 + 64 * i, 2 + 64 * (i + 1));
const chain = { active: BigInt(word(0)) === 1n, latestRoot: word(2), latestRootId: Number(BigInt(word(3))) };

const nowEpoch = Math.floor(Date.now() / 1000 / 600);
const checks: [string, boolean][] = [
  ["Groth16 proof verifies (SPEC §4 public signals)", proofOk],
  ["signed root recovers the issuer (SPEC §3.3)", signer === d.issuer.toLowerCase()],
  ["issuer active on the Registry", chain.active],
  ["root is a root the Registry recorded (latest or older)", p.rootId <= chain.latestRootId],
  ["expiresAt - issuedAt == 36 h", p.expiresAt - p.issuedAt === 36 * 3600],
];
console.log(`epoch ${p.epochId} (now ${nowEpoch}), day ${dayOfEpoch(p.epochId)}, class ${p.zoneClass}, rootId ${p.rootId} (chain latest ${chain.latestRootId}${p.root === chain.latestRoot ? ", same root" : ""})`);
for (const [what, ok] of checks) console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}`);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
