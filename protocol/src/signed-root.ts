import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, concatBytes, hexToBytes, uintBytes, utf8 } from "./bytes.ts";

/** The signed fields of a SignedRoot (SPEC §3.3). */
export type SignedRootFields = {
  chainId: number;
  registry: string;
  issuer: string;
  rootId: number;
  root: string; // bytes32 hex
  issuedAt: number;
  expiresAt: number;
};

const ROOT_TAG = utf8("UNLINK-ROOT-v1"); // 14 ASCII bytes, no length prefix
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/** The exact 134-byte preimage (SPEC §3.3): every integer at its exact width. */
export function rootPreimage(f: SignedRootFields): Uint8Array {
  return concatBytes(
    ROOT_TAG,
    uintBytes(f.chainId, 32),
    hexToBytes(f.registry, 20),
    hexToBytes(f.issuer, 20),
    uintBytes(f.rootId, 8),
    hexToBytes(f.root, 32),
    uintBytes(f.issuedAt, 4),
    uintBytes(f.expiresAt, 4),
  );
}

/** digest = keccak256(preimage), 0x-hex. */
export function rootDigest(f: SignedRootFields): string {
  return bytesToHex(keccak_256(rootPreimage(f)));
}

/**
 * Recovers the signer of an EIP-191 personal_sign over a 32-byte digest (the "\n32" form), as a lowercase 0x
 * address. The signature is 65 bytes r ‖ s ‖ v with v ∈ {27, 28} and low s (SPEC §3.3); anything else throws.
 */
export function recoverDigestSigner(digestHex: string, signatureHex: string): string {
  const sig = hexToBytes(signatureHex, 65);
  const v = sig[64]!;
  if (v !== 27 && v !== 28) throw new Error("signature v must be 27 or 28");
  const r = BigInt(bytesToHex(sig.subarray(0, 32)));
  const s = BigInt(bytesToHex(sig.subarray(32, 64)));
  if (r === 0n || s === 0n || r >= SECP256K1_N || s > SECP256K1_N / 2n) throw new Error("signature r/s out of range");
  const prefixed = keccak_256(concatBytes(utf8("\x19Ethereum Signed Message:\n32"), hexToBytes(digestHex, 32)));
  const point = new secp256k1.Signature(r, s, v - 27).recoverPublicKey(prefixed);
  const pub = point.toBytes(false); // 0x04 ‖ X ‖ Y
  return bytesToHex(keccak_256(pub.subarray(1)).subarray(12));
}

/** The signer of a SignedRoot, lowercase. Callers compare it with the expected issuer address. */
export function recoverRootSigner(f: SignedRootFields, signatureHex: string): string {
  return recoverDigestSigner(rootDigest(f), signatureHex);
}

/** keccak256 of a UTF-8 string (e.g. a function signature for an ABI selector), 0x-hex. */
export function keccakUtf8(s: string): string {
  return bytesToHex(keccak_256(utf8(s)));
}
