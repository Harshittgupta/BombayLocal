// Downloads the Hermez powers-of-tau file listed in the snarkjs README and verifies its hash.
// Power 13 (2^13 = 8192) fits the circuit: 5,697 constraints + 5 public inputs + 1.
// URL and blake2b-512 hash copied from https://github.com/iden3/snarkjs/blob/master/README.md (read 2026-11-05).
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { PTAU_PATH } from "./ptau-path.ts";

const POWER = 13;
const URL = `https://circom.info/powersOfTau28_hez_final_${POWER}.ptau`;
const BLAKE2B_512 =
  "58efc8bf2834d04768a3d7ffcd8e1e23d461561729beaac4e3e7a47829a1c9066d5320241e124a1a8e8aa6c75be0ba66f65bc8239a0542ed38e11276f6fdb4d9";

async function fileHash(path: string, algo: string): Promise<string> {
  const h = createHash(algo);
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest("hex");
}

async function main(): Promise<void> {
  mkdirSync("ptau", { recursive: true });
  if (!existsSync(PTAU_PATH)) {
    console.log(`downloading ${URL}`);
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    writeFileSync(PTAU_PATH, Buffer.from(await res.arrayBuffer()));
  }
  const got = await fileHash(PTAU_PATH, "blake2b512");
  if (got !== BLAKE2B_512) throw new Error(`ptau blake2b-512 mismatch: got ${got}`);
  console.log(`ptau OK  power=${POWER}  blake2b512=${got.slice(0, 16)}…  sha256=${await fileHash(PTAU_PATH, "sha256")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
