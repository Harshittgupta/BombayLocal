// Writes fixtures/sign-vectors.json: shared signed-root and scan-batch vectors (SPEC §3.3, §5) that the Kotlin
// scanner (M8) and any other implementation must reproduce exactly. Uses a TEST-ONLY private key (pk = 1), never
// a real issuer key. Run from issuer/:  npm run sign-fixtures
import { readFileSync, writeFileSync } from "node:fs";
import { ethers, toBeHex, zeroPadValue } from "ethers";
import { ROOT_TTL, bytesToHex, encodeQrPayload, qrEncode, qrPublicSignals, type QrPayload } from "@unlink/protocol";
import { rootDigest, signRoot, type SignedRootFields } from "../src/sign.ts";
import { scanBatchDigest } from "../src/scan.ts";

const TEST_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001"; // TEST ONLY
const wallet = new ethers.Wallet(TEST_KEY);

const issuedAt = 1_793_000_000;
const fields: SignedRootFields = {
  chainId: 11155111,
  registry: "0xd13c3d5B02312AEFa4661aD1Fc8205807F255A16",
  issuer: wallet.address,
  rootId: 7,
  root: "0x" + "ab".repeat(32),
  issuedAt,
  expiresAt: issuedAt + ROOT_TTL,
};

const epochId = 2_988_333;
const nullifiersSorted = ["2", "5", "9"]; // ascending

async function main(): Promise<void> {
  const signedRootSig = await signRoot(wallet, fields);
  const scanDigest = scanBatchDigest(wallet.address, epochId, nullifiersSorted);
  const scanSig = await wallet.signMessage(ethers.getBytes(scanDigest));

  const out = {
    note:
      "Shared vectors for SPEC §3.3 (signed root) and §5 (scan batch). TEST-ONLY key (pk=1). EIP-191 personal_sign " +
      "over getBytes(digest) (the \\n32 form). The Kotlin scanner must recompute each digest and recover `signer`.",
    signedRoot: {
      fields,
      preimageBytes: 134,
      digest: rootDigest(fields),
      eip191Signature: signedRootSig,
      signer: wallet.address,
    },
    scanBatch: {
      scannerPubKey: wallet.address,
      epochId,
      nullifiersSorted,
      digest: scanDigest,
      eip191Signature: scanSig,
      signer: wallet.address,
    },
  };
  writeFileSync("../fixtures/sign-vectors.json", JSON.stringify(out, null, 2) + "\n");
  console.log("wrote fixtures/sign-vectors.json");

  // fixtures/qr-vectors.json: a complete, self-consistent SPEC §3.4 QR. The real Groth16 proof of fixture case 0, plus
  // a signed root over case 0's root (test key), encoded to the 427-byte payload and Base45. The M8 scanner must
  // decode it, verify the proof against verification_key.json, and recover `signer` from the signature.
  const case0 = JSON.parse(readFileSync("../fixtures/vectors.json", "utf8")).cases[0];
  const qrRoot: SignedRootFields = {
    ...fields,
    rootId: 9,
    root: zeroPadValue(toBeHex(BigInt(case0.root)), 32),
  };
  const qrSig = await signRoot(wallet, qrRoot);
  const payload: QrPayload = {
    zoneClass: case0.zoneClass,
    epochId: case0.epochId,
    nullifier: BigInt(case0.nullifier),
    proof: case0.proof,
    issuer: qrRoot.issuer,
    rootId: qrRoot.rootId,
    root: qrRoot.root,
    issuedAt: qrRoot.issuedAt,
    expiresAt: qrRoot.expiresAt,
    signature: qrSig,
  };
  const bytes = encodeQrPayload(payload);
  const qr = {
    note:
      "SPEC §3.4 QR vector: fixture case 0's real proof + a signed root over case 0's root (TEST-ONLY key pk=1). " +
      "G2 is EIP-197 order (x.c1, x.c0, y.c1, y.c0). publicSignals are what the scanner verifies (SPEC §4 order).",
    signedRoot: { fields: qrRoot, signature: qrSig, signer: wallet.address },
    zoneClass: payload.zoneClass,
    epochId: payload.epochId,
    nullifier: payload.nullifier.toString(),
    proof: payload.proof,
    publicSignals: qrPublicSignals(payload),
    payloadBytes: bytes.length,
    payloadHex: bytesToHex(bytes),
    base45: qrEncode(payload),
  };
  if (qr.publicSignals.join() !== case0.publicSignals.join()) throw new Error("QR public signals != fixture case 0");
  writeFileSync("../fixtures/qr-vectors.json", JSON.stringify(qr, null, 2) + "\n");
  console.log(`wrote fixtures/qr-vectors.json (${qr.base45.length} Base45 chars)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
