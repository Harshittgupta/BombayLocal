/**
 * Public reads for the browser demo: the Sepolia Registry over raw JSON-RPC and Arkiv over `arkiv_query`. The same
 * read paths as the Android apps (apps/passenger/.../net/ArkivClient.kt, apps/scanner/.../sync/RegistryClient.kt):
 * every Arkiv query filters on type + writer AND `$creator = $owner = writer`, and every row is re-checked here,
 * because anyone can write entities with any attributes.
 */
import { keccakUtf8 } from "@bombaylocal/protocol";

declare const __UNLINK_CONFIG__: {
  chainId: number;
  registry: string;
  issuer: string;
  authority: string;
  vkSha256: string;
  issuerUrl: string;
  sepoliaRpcs: string[];
  arkivRpc: string;
  commit: string;
};

export const CONFIG = __UNLINK_CONFIG__;

async function rpc(url: string, method: string, params: unknown[], timeoutMs = 15_000): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`${method}: HTTP ${r.status}`);
    const j = await r.json();
    if (j.error) throw new Error(`${method}: ${j.error.message}`);
    return j.result;
  } finally {
    clearTimeout(t);
  }
}

const selector = (sig: string): string => keccakUtf8(sig).slice(0, 10);
const word = (hex: string, i: number): bigint => BigInt("0x" + hex.slice(2 + i * 64, 2 + (i + 1) * 64));

export type IssuerState = { active: boolean; floor: bigint; latestRoot: string; latestRootId: bigint; latestPostedAt: number };

async function issuerStateAt(url: string, block: string): Promise<IssuerState> {
  const data = selector("issuerState(address)") + CONFIG.issuer.slice(2).toLowerCase().padStart(64, "0");
  const hex: string = await rpc(url, "eth_call", [{ to: CONFIG.registry, data }, block]);
  if (hex.length < 2 + 5 * 64) throw new Error("short issuerState result");
  return {
    active: word(hex, 0) === 1n,
    floor: word(hex, 1),
    latestRoot: "0x" + hex.slice(2 + 2 * 64, 2 + 3 * 64),
    latestRootId: word(hex, 3),
    latestPostedAt: Number(word(hex, 4)),
  };
}

/** The issuer's state from the primary RPC (the passenger only needs one read, like the app). */
export async function issuerState(): Promise<IssuerState> {
  return issuerStateAt(CONFIG.sepoliaRpcs[0]!, "latest");
}

/**
 * The scanner's sync read (SPEC §5 M8b note): two independent providers at the same block must return identical
 * state, or nothing is applied. Also returns that block's timestamp for the clock offset.
 */
export async function agreedIssuerState(): Promise<{ state: IssuerState; blockTimeMs: number }> {
  const [a, b] = CONFIG.sepoliaRpcs;
  const heads = await Promise.all([a!, b!].map(async (u) => Number(BigInt(await rpc(u, "eth_blockNumber", [])))));
  const block = "0x" + (Math.min(...heads) - 2).toString(16);
  const [sa, sb] = await Promise.all([issuerStateAt(a!, block), issuerStateAt(b!, block)]);
  if (JSON.stringify(sa, (_, v) => (typeof v === "bigint" ? v.toString() : v)) !==
      JSON.stringify(sb, (_, v) => (typeof v === "bigint" ? v.toString() : v))) {
    throw new Error("the two Sepolia providers disagree");
  }
  const blk = await rpc(a!, "eth_getBlockByNumber", [block, false]);
  return { state: sa, blockTimeMs: Number(BigInt(blk.timestamp)) * 1000 };
}

// ---- Arkiv ----

type Row = Record<string, string>;

function base(type: string, writer: string): string {
  const w = writer.toLowerCase();
  return `app = str('unlink') AND type = str('${type}') AND issuer = addr(${w}) AND $creator = addr(${w}) AND $owner = addr(${w})`;
}

function rowsOf(result: any, writer: string): { key: string; attrs: Row }[] {
  const out: { key: string; attrs: Row }[] = [];
  for (const row of result?.data ?? []) {
    if (String(row.creator).toLowerCase() !== writer.toLowerCase() || String(row.owner).toLowerCase() !== writer.toLowerCase()) continue;
    const attrs: Row = {};
    for (const a of row.attributes ?? []) attrs[a.name] = String(a.value);
    out.push({ key: row.key, attrs });
  }
  return out;
}

const SELECT = { select: { key: true, owner: true, creator: true, attributes: true } };

async function first(query: string, writer: string): Promise<Row | null> {
  const r = await rpc(CONFIG.arkivRpc, "arkiv_query", [query, { ...SELECT, limit: "0xa" }]);
  return rowsOf(r, writer)[0]?.attrs ?? null;
}

async function all(filter: string, writer: string): Promise<Row[]> {
  const out: Row[] = [];
  let after = "0x" + "0".repeat(64);
  for (;;) {
    const r = await rpc(CONFIG.arkivRpc, "arkiv_query", [`${filter} AND $key > key(${after}) ORDER BY $key ASC`, { ...SELECT, limit: "0x64" }]);
    const data = r?.data ?? [];
    if (data.length) after = data[data.length - 1].key;
    out.push(...rowsOf(r, writer).map((x) => x.attrs));
    if (data.length < 100) return out;
  }
}

const u64 = (v: string | undefined): number => {
  if (v === undefined) throw new Error("missing attribute");
  return Number(BigInt(v));
};

export type SignedRootRow = {
  chainId: number; registry: string; issuer: string; rootId: number; root: string; issuedAt: number; expiresAt: number;
  leafCount: number; revSeq: number; signature: string; txHash: string;
};

/** Every SignedRoot for `rootId` (more than one distinct = equivocation; the caller refuses). */
export async function signedRoots(rootId: bigint): Promise<SignedRootRow[]> {
  const rows = await all(`${base("unlink.signedRoot", CONFIG.issuer)} AND rootId = u64(${rootId})`, CONFIG.issuer);
  return rows.map((a) => ({
    chainId: u64(a.chainId), registry: a.registry!, issuer: a.issuer!, rootId: u64(a.rootId), root: a.root!,
    issuedAt: u64(a.issuedAt), expiresAt: u64(a.expiresAt), leafCount: u64(a.leafCount), revSeq: u64(a.revSeq),
    signature: a.signature!, txHash: a.txHash ?? "",
  }));
}

export async function leafBatches(): Promise<{ batchNo: number; fromIndex: number; leavesHex: string }[]> {
  return (await all(base("unlink.leafBatch", CONFIG.issuer), CONFIG.issuer))
    .map((a) => ({ batchNo: u64(a.batchNo), fromIndex: u64(a.fromIndex), leavesHex: a.leaves! }));
}

export async function revocations(): Promise<{ seq: number; fromIndex: number; count: number }[]> {
  return (await all(base("unlink.revocation", CONFIG.issuer), CONFIG.issuer))
    .map((a) => ({ seq: u64(a.seq), fromIndex: u64(a.fromIndex), count: u64(a.count) }));
}

/** The authority's VerifyKey whose payload hashes to the pinned sha256: the exact verification_key.json, or null. */
export async function verifyKey(): Promise<object | null> {
  const a = await first(`${base("unlink.verifyKey", CONFIG.authority)} AND vkSha256 = str('${CONFIG.vkSha256}')`, CONFIG.authority);
  if (!a?.vk) return null;
  const hex = a.vk.startsWith("0x") ? a.vk.slice(2) : a.vk;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const sha = Array.from(digest, (x) => x.toString(16).padStart(2, "0")).join("");
  if (sha !== CONFIG.vkSha256) return null; // never accept a vk that is not the pinned one
  return JSON.parse(new TextDecoder().decode(bytes));
}

// ---- Hosted issuer (purchase only) ----

export async function purchase(idCommitment: string, product: string): Promise<{ leafIndex: number; validUntilDay: number; zoneClass: number }> {
  const r = await fetch(`${CONFIG.issuerUrl}/purchase`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idCommitment, product }),
  });
  if (r.status === 429) throw new Error("Too many passes bought from this network in the last hour. Try again later.");
  if (!r.ok) throw new Error(`The issuer turned the purchase down (HTTP ${r.status}).`);
  return r.json();
}
