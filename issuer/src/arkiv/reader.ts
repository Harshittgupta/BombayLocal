import { createHash } from "node:crypto";
import { and, asc, desc, eq } from "@arkiv-network/sdk/query";
import { addr, u64 } from "@arkiv-network/sdk/schema";
import { bytesToHex, getAddress, hexToBytes, type Hex } from "viem";
import type { ArkivPublic } from "./client.ts";
import { decodeAddresses, decodeLeaves } from "./codec.ts";
import {
  APP,
  LeafBatchSchema,
  RevocationSchema,
  ScannerListSchema,
  SignedRootSchema,
  TYPE,
  VerifyKeySchema,
} from "./schemas.ts";
import type { Keyed, LeafBatch, Revocation, SignedRoot } from "./types.ts";

const PAGE = 100; // node maximum per query

type Owned = { $key?: Hex | undefined; $owner?: Hex | undefined; $creator?: Hex | undefined };
type Page<R> = { entities: readonly R[]; skipped: number };

function same(a: string | undefined, b: string): boolean {
  return a !== undefined && a.toLowerCase() === b.toLowerCase();
}

/** Fetch every page (offset paging, 100 per page). A page that is short, counting skipped rows, is the last. */
async function all<R>(fetchPage: (offset: number) => Promise<Page<R>>): Promise<R[]> {
  const out: R[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await fetchPage(offset);
    out.push(...page.entities);
    if (page.entities.length + page.skipped < PAGE) return out;
  }
}

/** SPEC §3.1/§9: keep only rows whose $creator AND $owner equal the expected writer (re-checked in code). */
function ownedBy<R extends Owned>(rows: R[], writer: string): R[] {
  return rows.filter((r) => same(r.$creator, writer) && same(r.$owner, writer));
}

/** Collapse byte-identical duplicates (SPEC §3.1 step 2); throw if one id has two different contents. */
function uniqueBy<T extends { entityKey: string }>(items: T[], id: (t: T) => string, what: string): T[] {
  const byId = new Map<string, { body: string; item: T }>();
  for (const it of items) {
    const { entityKey: _k, ...rest } = it;
    const body = JSON.stringify(rest, (_, v) => (typeof v === "bigint" ? v.toString() : v));
    const prev = byId.get(id(it));
    if (prev && prev.body !== body) throw new Error(`two different ${what} entities for ${id(it)}`);
    if (!prev) byId.set(id(it), { body, item: it });
  }
  return [...byId.values()].map((v) => v.item);
}

export type VerifyKeyRecord = Keyed<{ vkSha256: string; vk: Uint8Array }>;

/**
 * Reads Unlink entities back from Arkiv. Every query filters on app, type and the writer address, AND on
 * $creator = $owner = writer (in the query and again in code). This is the same read path the phone and
 * scanner implement over raw JSON-RPC (arkiv_query).
 */
export class ArkivReader {
  constructor(readonly client: ArkivPublic) {}

  private base(type: string, writer: string) {
    return [eq("app", APP), eq("type", type), eq("issuer", addr(writer))] as const;
  }

  /** The SignedRoot for exactly `rootId`, or undefined if not on Arkiv (yet). Throws on two different ones. */
  async signedRoot(issuer: string, rootId: number): Promise<Keyed<SignedRoot> | undefined> {
    const rows = await all((offset) =>
      this.client
        .select()
        .from(SignedRootSchema)
        .where(and(...this.base(TYPE.signedRoot, issuer), eq("rootId", u64(rootId))))
        .createdBy(issuer as Hex)
        .ownedBy(issuer as Hex)
        .orderBy(asc("$key"))
        .limit(PAGE)
        .offset(offset)
        .fetch(),
    );
    const roots = ownedBy(rows, issuer).map(
      (r): Keyed<SignedRoot> => ({
        entityKey: r.$key,
        chainId: Number(r.chainId.value),
        registry: getAddress(r.registry.value),
        issuer: getAddress(r.issuer.value),
        rootId: Number(r.rootId.value),
        root: r.root.value,
        issuedAt: Number(r.issuedAt.value),
        expiresAt: Number(r.expiresAt.value),
        leafCount: Number(r.leafCount.value),
        revSeq: Number(r.revSeq.value),
        signature: r.signature.value,
        txHash: r.txHash.value,
      }),
    );
    const unique = uniqueBy(roots, (r) => String(r.rootId), "SignedRoot");
    return unique[0];
  }

  /** The SignedRoot with the highest rootId this issuer wrote. Phones use signedRoot(issuer, latestRootId). */
  async latestSignedRoot(issuer: string): Promise<Keyed<SignedRoot> | undefined> {
    const top = await this.client
      .select({ $key: true, $owner: true, $creator: true, rootId: true })
      .from(SignedRootSchema)
      .where(and(...this.base(TYPE.signedRoot, issuer)))
      .createdBy(issuer as Hex)
      .ownedBy(issuer as Hex)
      .orderBy(desc("rootId"))
      .limit(1)
      .fetch();
    const row = ownedBy([...top.entities], issuer)[0];
    return row ? this.signedRoot(issuer, Number(row.rootId.value)) : undefined;
  }

  /** All live LeafBatch entities (optionally one batchNo). Identical duplicates collapse; conflicts throw. */
  async leafBatches(issuer: string, batchNo?: number): Promise<Keyed<LeafBatch>[]> {
    const filters = this.base(TYPE.leafBatch, issuer);
    const rows = await all((offset) =>
      this.client
        .select()
        .from(LeafBatchSchema)
        .where(batchNo === undefined ? and(...filters) : and(...filters, eq("batchNo", u64(batchNo))))
        .createdBy(issuer as Hex)
        .ownedBy(issuer as Hex)
        .orderBy(asc("$key"))
        .limit(PAGE)
        .offset(offset)
        .fetch(),
    );
    const batches = ownedBy(rows, issuer).map((r): Keyed<LeafBatch> => {
      const leaves = decodeLeaves(r.leaves.value);
      if (leaves.length !== Number(r.count.value)) throw new Error(`batch ${r.batchNo.value}: count mismatch`);
      return {
        entityKey: r.$key,
        batchNo: Number(r.batchNo.value),
        fromIndex: Number(r.fromIndex.value),
        lastValidDay: Number(r.lastValidDay.value),
        leaves,
      };
    });
    return uniqueBy(batches, (b) => String(b.batchNo), "LeafBatch").sort((a, b) => a.batchNo - b.batchNo);
  }

  /** All live Revocation entities (optionally one seq). Identical duplicates collapse; conflicts throw. */
  async revocations(issuer: string, seq?: number): Promise<Keyed<Revocation>[]> {
    const filters = this.base(TYPE.revocation, issuer);
    const rows = await all((offset) =>
      this.client
        .select()
        .from(RevocationSchema)
        .where(seq === undefined ? and(...filters) : and(...filters, eq("seq", u64(seq))))
        .createdBy(issuer as Hex)
        .ownedBy(issuer as Hex)
        .orderBy(asc("$key"))
        .limit(PAGE)
        .offset(offset)
        .fetch(),
    );
    const revs = ownedBy(rows, issuer).map((r): Keyed<Revocation> => {
      const reason = r.reason.value;
      if (reason !== "revoked" && reason !== "expired") throw new Error(`revocation ${r.seq.value}: bad reason`);
      return {
        entityKey: r.$key,
        seq: Number(r.seq.value),
        fromIndex: Number(r.fromIndex.value),
        count: Number(r.count.value),
        reason,
      };
    });
    return uniqueBy(revs, (r) => String(r.seq), "Revocation").sort((a, b) => a.seq - b.seq);
  }

  /** The issuer's newest ScannerList (highest listNo), optionally a specific listNo. */
  async scannerList(issuer: string, listNo?: number): Promise<Keyed<{ listNo: number; keys: string[] }> | undefined> {
    const filters = this.base(TYPE.scannerList, issuer);
    const page = await this.client
      .select()
      .from(ScannerListSchema)
      .where(listNo === undefined ? and(...filters) : and(...filters, eq("listNo", u64(listNo))))
      .createdBy(issuer as Hex)
      .ownedBy(issuer as Hex)
      .orderBy(desc("listNo"))
      .limit(PAGE)
      .fetch();
    const lists = ownedBy([...page.entities], issuer).map((r) => ({
      entityKey: r.$key,
      listNo: Number(r.listNo.value),
      keys: decodeAddresses(r.keys.value),
    }));
    const unique = uniqueBy(lists, (l) => String(l.listNo), "ScannerList").sort((a, b) => b.listNo - a.listNo);
    return unique[0];
  }

  /** VerifyKey entities written by the authority (optionally one sha256). Each payload's sha256 is re-checked. */
  async vk(authority: string, vkSha256?: string): Promise<VerifyKeyRecord[]> {
    const filters = this.base(TYPE.verifyKey, authority);
    const rows = await all((offset) =>
      this.client
        .select()
        .from(VerifyKeySchema)
        .where(vkSha256 === undefined ? and(...filters) : and(...filters, eq("vkSha256", vkSha256)))
        .createdBy(authority as Hex)
        .ownedBy(authority as Hex)
        .orderBy(asc("$key"))
        .limit(PAGE)
        .offset(offset)
        .fetch(),
    );
    const out: VerifyKeyRecord[] = [];
    for (const r of ownedBy(rows, authority)) {
      const vk = hexToBytes(r.vk.value);
      const sha = createHash("sha256").update(vk).digest("hex");
      if (sha !== r.vkSha256.value) continue; // payload does not match its own hash attribute: ignore it
      out.push({ entityKey: r.$key, vkSha256: sha, vk });
    }
    return uniqueBy(
      out.map((v) => ({ ...v, vkHex: bytesToHex(v.vk) })),
      (v) => v.vkSha256,
      "VerifyKey",
    ).map(({ vkHex: _h, ...v }) => v);
  }
}
