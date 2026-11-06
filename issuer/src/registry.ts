import { ethers } from "ethers";

/** Minimal ABI for the parts of the Registry the issuer uses (SPEC §7.1). */
export const REGISTRY_ABI = [
  "function postRoot(bytes32 root) returns (uint64 rootId)",
  "function issuerState(address issuer) view returns (bool active, uint64 floor, bytes32 latestRoot, uint64 latestRootId, uint64 latestPostedAt)",
  "function isActive(address issuer) view returns (bool)",
  "event RootPosted(address indexed issuer, uint64 indexed rootId, bytes32 root, uint64 postedAt)",
];

export type PostRootResult = { rootId: number; root: string; postedAt: number; txHash: string };

export class RegistryClient {
  readonly provider: ethers.JsonRpcProvider;
  readonly wallet: ethers.Wallet;
  readonly contract: ethers.Contract;

  constructor(rpcUrl: string, issuerPrivateKey: string, registryAddress: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(issuerPrivateKey, this.provider);
    this.contract = new ethers.Contract(registryAddress, REGISTRY_ABI, this.wallet);
  }

  /**
   * Post a root on-chain, wait for the receipt, and read rootId + postedAt from the RootPosted event. `onSent` gets
   * the tx hash as soon as the tx is broadcast (the publisher records it for crash recovery).
   */
  async postRoot(root: string, onSent?: (txHash: string) => void): Promise<PostRootResult> {
    const tx = await this.contract.postRoot(root);
    onSent?.(tx.hash);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) throw new Error(`postRoot tx failed: ${tx.hash}`);
    for (const log of receipt.logs) {
      try {
        const parsed = this.contract.interface.parseLog(log);
        if (parsed?.name === "RootPosted") {
          return {
            rootId: Number(parsed.args.rootId),
            root: parsed.args.root,
            postedAt: Number(parsed.args.postedAt),
            txHash: tx.hash,
          };
        }
      } catch {
        // not our event
      }
    }
    throw new Error("RootPosted event not found in receipt");
  }

  async issuerState(issuer: string): Promise<{
    active: boolean;
    floor: number;
    latestRoot: string;
    latestRootId: number;
    latestPostedAt: number;
  }> {
    const s = await this.contract.issuerState(issuer);
    return {
      active: s[0],
      floor: Number(s[1]),
      latestRoot: s[2],
      latestRootId: Number(s[3]),
      latestPostedAt: Number(s[4]),
    };
  }
}
