import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Arkiv Rabdi testnet clients (docs/notes/arkiv.md). With ARKIV_ACCESS_KEY set, the SDK puts the key in the RPC
 * path (https://rpc.rabdi.db-chain.testnet.arkiv.network/<key>). Without one, ARKIV_RPC_URL (or the chain default)
 * is used: the public endpoint, which is rate limited.
 */
export type ArkivEnv = { rpcUrl: string | undefined; accessKey: string; chainId: number | undefined };

export function loadArkivEnv(): ArkivEnv {
  return {
    rpcUrl: process.env.ARKIV_RPC_URL || undefined,
    accessKey: process.env.ARKIV_ACCESS_KEY ?? "",
    chainId: process.env.ARKIV_CHAIN_ID ? Number(process.env.ARKIV_CHAIN_ID) : undefined,
  };
}

function chainFor(env: ArkivEnv) {
  const chain = rabdi({ accessKey: env.accessKey });
  if (env.chainId !== undefined && env.chainId !== chain.id) {
    throw new Error(`ARKIV_CHAIN_ID ${env.chainId} != Rabdi chain id ${chain.id}`);
  }
  return chain;
}

function transportFor(env: ArkivEnv) {
  return env.accessKey ? http() : http(env.rpcUrl);
}

export function makeArkivPublic(env: ArkivEnv = loadArkivEnv()) {
  return createPublicClient({ chain: chainFor(env), transport: transportFor(env) });
}

export function makeArkivWallet(privateKey: string, env: ArkivEnv = loadArkivEnv()) {
  const pk = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex;
  return createWalletClient({ chain: chainFor(env), transport: transportFor(env), account: privateKeyToAccount(pk) });
}

export type ArkivPublic = ReturnType<typeof makeArkivPublic>;
export type ArkivWallet = ReturnType<typeof makeArkivWallet>;
