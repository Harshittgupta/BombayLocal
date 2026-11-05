import { ethers } from "ethers";
import { ROOT_TTL } from "@unlink/protocol";

/** The fields a signed root commits to (SPEC §3.3). issuedAt is the on-chain postedAt; expiresAt = issuedAt + ROOT_TTL. */
export type SignedRootFields = {
  chainId: number;
  registry: string;
  issuer: string;
  rootId: number;
  root: string; // bytes32 hex
  issuedAt: number;
  expiresAt: number;
};

/**
 * The 134-byte preimage digest (SPEC §3.3):
 *   keccak256(abi.encodePacked("UNLINK-ROOT-v1", chainId:uint256, registry:address, issuer:address,
 *                              rootId:uint64, root:bytes32, issuedAt:uint32, expiresAt:uint32))
 */
export function rootDigest(f: SignedRootFields): string {
  return ethers.solidityPackedKeccak256(
    ["string", "uint256", "address", "address", "uint64", "bytes32", "uint32", "uint32"],
    ["UNLINK-ROOT-v1", f.chainId, f.registry, f.issuer, f.rootId, f.root, f.issuedAt, f.expiresAt],
  );
}

/** EIP-191 personal_sign over the 32-byte digest (not the hex string): prefix is "\x19…\n32". */
export async function signRoot(wallet: ethers.Wallet, f: SignedRootFields): Promise<string> {
  return wallet.signMessage(ethers.getBytes(rootDigest(f)));
}

/** Recovers the signer address from a signed root — exactly what the Kotlin scanner does (SPEC §5 step 5). */
export function recoverRootSigner(f: SignedRootFields, signature: string): string {
  return ethers.verifyMessage(ethers.getBytes(rootDigest(f)), signature);
}

export function expiresAtFor(issuedAt: number): number {
  return issuedAt + ROOT_TTL;
}
