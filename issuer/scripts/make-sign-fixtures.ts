// Writes fixtures/sign-vectors.json: shared signed-root and scan-batch vectors (SPEC §3.3, §5) that the Kotlin
// scanner (M8) and any other implementation must reproduce exactly. Uses a TEST-ONLY private key (pk = 1), never
// a real issuer key. Run from issuer/:  npm run sign-fixtures
import { writeFileSync } from "node:fs";
import { ethers } from "ethers";
import { ROOT_TTL } from "@unlink/protocol";
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
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
