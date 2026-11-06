import { createHash } from "node:crypto";
import { ExpirationTime } from "@arkiv-network/sdk";
import { addr, u64 } from "@arkiv-network/sdk/schema";
import { getBytes } from "ethers";
import type { Hex } from "viem";
import type { ArkivWallet } from "./client.ts";
import { encodeAddresses, encodeLeaves } from "./codec.ts";
import {
  SCANNER_LIST_TTL,
  VERIFY_KEY_TTL,
  leafBatchDeadline,
  lifetimeSeconds,
  revocationDeadline,
  signedRootDeadline,
} from "./expiry.ts";
import type { ArkivReader } from "./reader.ts";
import {
  APP,
  LeafBatchSchema,
  RevocationSchema,
  SCHEMA_VERSION,
  ScannerListSchema,
  SignedRootSchema,
  TYPE,
  VerifyKeySchema,
} from "./schemas.ts";
import type { LeafBatch, Revocation, SignedRoot } from "./types.ts";

export type WriteResult = { entityKey: string; txHash: string | undefined; reused: boolean };

const now = (): number => Math.floor(Date.now() / 1000);
const sameLeaves = (a: bigint[], b: bigint[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/** Retry a write a few times; safe because every write first checks Arkiv for an existing identical entity. */
async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw last;
}

/**
 * Writes Unlink entities to Arkiv with the writer's own wallet ($creator = $owner = writer). Every write is
 * idempotent (SPEC §3.1): it first queries for an entity with the same batchNo / seq / rootId / listNo / vkSha256,
 * skips if identical, and refuses if different, so a retried publish never creates a second, different entity.
 * Expiry follows SPEC §9 (blocks, via ExpirationTime.fromSeconds).
 */
export class ArkivWriter {
  readonly address: Hex;

  constructor(
    readonly wallet: ArkivWallet,
    readonly reader: ArkivReader,
    private readonly clock: () => number = now,
  ) {
    this.address = wallet.account.address;
  }

  private common(type: string) {
    return { app: APP, v: u64(SCHEMA_VERSION), type, issuer: addr(this.address) };
  }

  private expiry(deadline: number) {
    return { expiration: ExpirationTime.fromSeconds(lifetimeSeconds(deadline, this.clock())) };
  }

  /** One LeafBatch (at most LEAF_BATCH_MAX leaves; the publisher splits). */
  async publishLeafBatch(b: LeafBatch): Promise<WriteResult> {
    return retry(async () => {
      const [existing] = await this.reader.leafBatches(this.address, b.batchNo);
      if (existing) {
        if (existing.fromIndex !== b.fromIndex || !sameLeaves(existing.leaves, b.leaves)) {
          throw new Error(`LeafBatch ${b.batchNo} already on Arkiv with different contents`);
        }
        return { entityKey: existing.entityKey, txHash: undefined, reused: true };
      }
      const { entityKey, txHash } = await this.wallet.createEntity(
        LeafBatchSchema,
        {
          ...this.common(TYPE.leafBatch),
          batchNo: u64(b.batchNo),
          fromIndex: u64(b.fromIndex),
          count: u64(b.leaves.length),
          lastValidDay: u64(b.lastValidDay),
          leaves: encodeLeaves(b.leaves),
        },
        this.expiry(leafBatchDeadline(b.lastValidDay)),
      );
      return { entityKey, txHash, reused: false };
    });
  }

  /** One Revocation. `touchedLastValidDays` = lastValidDay of each batch it touches (for its SPEC §9 expiry). */
  async publishRevocation(r: Revocation, touchedLastValidDays: number[]): Promise<WriteResult> {
    return retry(async () => {
      const [existing] = await this.reader.revocations(this.address, r.seq);
      if (existing) {
        if (existing.fromIndex !== r.fromIndex || existing.count !== r.count || existing.reason !== r.reason) {
          throw new Error(`Revocation seq ${r.seq} already on Arkiv with different contents`);
        }
        return { entityKey: existing.entityKey, txHash: undefined, reused: true };
      }
      const { entityKey, txHash } = await this.wallet.createEntity(
        RevocationSchema,
        {
          ...this.common(TYPE.revocation),
          seq: u64(r.seq),
          fromIndex: u64(r.fromIndex),
          count: u64(r.count),
          reason: r.reason,
        },
        this.expiry(revocationDeadline(touchedLastValidDays)),
      );
      return { entityKey, txHash, reused: false };
    });
  }

  /** The SignedRoot (after postRoot + sign). */
  async publishSignedRoot(sr: SignedRoot): Promise<WriteResult> {
    if (sr.issuer.toLowerCase() !== this.address.toLowerCase()) throw new Error("SignedRoot issuer != Arkiv writer");
    return retry(async () => {
      const existing = await this.reader.signedRoot(this.address, sr.rootId);
      if (existing) {
        if (existing.root !== sr.root || existing.signature.toLowerCase() !== sr.signature.toLowerCase()) {
          throw new Error(`SignedRoot ${sr.rootId} already on Arkiv with different contents`);
        }
        return { entityKey: existing.entityKey, txHash: undefined, reused: true };
      }
      const { entityKey, txHash } = await this.wallet.createEntity(
        SignedRootSchema,
        {
          ...this.common(TYPE.signedRoot),
          rootId: u64(sr.rootId),
          chainId: u64(sr.chainId),
          registry: addr(sr.registry),
          root: sr.root,
          issuedAt: u64(sr.issuedAt),
          expiresAt: u64(sr.expiresAt),
          leafCount: u64(sr.leafCount),
          revSeq: u64(sr.revSeq),
          signature: getBytes(sr.signature),
          txHash: sr.txHash,
        },
        this.expiry(signedRootDeadline(sr.expiresAt)),
      );
      return { entityKey, txHash, reused: false };
    });
  }

  /** The scanner allowlist as list `listNo`. Re-publishing the same list extends it by SCANNER_LIST_TTL. */
  async publishScannerList(listNo: number, pubKeys: string[]): Promise<WriteResult> {
    const keys = [...pubKeys].map((k) => k.toLowerCase()).sort();
    return retry(async () => {
      const existing = await this.reader.scannerList(this.address, listNo);
      if (existing) {
        if (existing.keys.join() !== keys.join()) throw new Error(`ScannerList ${listNo} already on Arkiv with different keys`);
        const { txHash } = await this.wallet.extendEntity({
          entityKey: existing.entityKey as Hex,
          expiration: ExpirationTime.fromSeconds(SCANNER_LIST_TTL),
        });
        return { entityKey: existing.entityKey, txHash, reused: true };
      }
      const { entityKey, txHash } = await this.wallet.createEntity(
        ScannerListSchema,
        { ...this.common(TYPE.scannerList), listNo: u64(listNo), keys: encodeAddresses(keys) },
        { expiration: ExpirationTime.fromSeconds(SCANNER_LIST_TTL) },
      );
      return { entityKey, txHash, reused: false };
    });
  }

  /** The Groth16 verification key (exact file bytes). Must be called with the AUTHORITY wallet (SPEC §9). */
  async publishVk(vkFileBytes: Uint8Array): Promise<WriteResult & { vkSha256: string }> {
    const vkSha256 = createHash("sha256").update(vkFileBytes).digest("hex");
    return retry(async () => {
      const [existing] = await this.reader.vk(this.address, vkSha256);
      if (existing) {
        const { txHash } = await this.wallet.extendEntity({
          entityKey: existing.entityKey as Hex,
          expiration: ExpirationTime.fromSeconds(VERIFY_KEY_TTL),
        });
        return { entityKey: existing.entityKey, txHash, reused: true, vkSha256 };
      }
      const { entityKey, txHash } = await this.wallet.createEntity(
        VerifyKeySchema,
        { ...this.common(TYPE.verifyKey), vkSha256, vk: vkFileBytes },
        { expiration: ExpirationTime.fromSeconds(VERIFY_KEY_TTL) },
      );
      return { entityKey, txHash, reused: false, vkSha256 };
    });
  }
}
