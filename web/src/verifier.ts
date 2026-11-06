/**
 * The TC scanner's check, SPEC §5 steps 1–10, in TypeScript for the browser demo. A port of the Android scanner's
 * OfflineVerifier.kt (apps/scanner/verifier) held to the same conformance suite: every fixtures/qr case must give the
 * same status, reason, warnings and nullifier count (web/test/verifier.test.ts, invariant 5).
 *
 * It uses only `store` and the Groth16 function it is given: no network, no logging. The demo wraps each call in a
 * network-request counter to show that (web/src/scanner.ts).
 */
import { EPOCH, SKEW, ROOT_TTL, EXPIRY_WARN, STALE_WARN, STALE_MAX, DEBOUNCE_GAP, QR_BYTES } from "@unlink/protocol";
import { base45Decode, bytesToHex, bytesToUint, dayOfEpoch, recoverDigestSigner, rootDigest } from "@unlink/protocol";
import { FIELD_R, isInG2, isOnG1, type Fp2 } from "./bn254.ts";

/** Coordinates exactly as carried (no reduction), so a coordinate >= p fails the twist check instead of wrapping. */
const fp2Raw = (c0: bigint, c1: bigint): Fp2 => ({ c0, c1 });

export type Status = "GREEN" | "AMBER" | "RED";
export type Reason =
  | "OK" | "MALFORMED" | "WRONG_EPOCH" | "SCANNER_STALE" | "ISSUER_INACTIVE" | "BAD_SIGNATURE" | "BELOW_FLOOR"
  | "BAD_ROOT_TTL" | "ROOT_EXPIRED" | "BAD_PROOF" | "WRONG_CLASS" | "SEEN_BEFORE" | "DUPLICATE" | "ROOT_NEAR_EXPIRY"
  | "SCANNER_UNSYNCED" | "VERIFIER_ERROR";

export type Result = { status: Status; reason: Reason; warnings: Reason[]; sameShowing: boolean; zoneClass?: number };

export type IssuerRecord = { active: boolean; floor: bigint; latestRootId?: bigint };
export type NullifierRecord = { nullifier: bigint; epochId: number; count: number; firstSeenMs: number; lastReadMs: number };

export interface VerifierStore {
  readonly chainId: number;
  /** 0x Registry address: the scanner's own deployment config, never read from the QR. */
  readonly registry: string;
  lastSyncMs(): number;
  /** Keyed by lowercase 0x address. */
  issuer(address: string): IssuerRecord | undefined;
  /** snarkjs verification_key.json (hash-checked at sync), or null if none. */
  vk(): object | null;
  requiredClass(): number | null;
  nullifier(n: bigint): NullifierRecord | undefined;
  putNullifier(r: NullifierRecord): void;
  purgeBefore(epochId: number): void;
}

/** snarkjs `groth16.verify(vk, publicSignals, proof)`. Throws only if the engine itself fails. */
export type Groth16Verify = (vk: object, publicSignals: string[], proof: object) => Promise<boolean>;

export type ParsedQr = {
  zoneClass: number;
  epochId: number;
  nullifier: bigint;
  proof: object;
  issuer: string; // lowercase 0x
  rootId: bigint; // uint64
  root: string; // 0x bytes32
  rootValue: bigint;
  issuedAt: number;
  expiresAt: number;
  signature: string;
};

/**
 * SPEC §5 step 1. Null (MALFORMED) unless: valid strict Base45, 427 bytes, version 1, zoneClass ≤ 2, root nonzero and
 * < r, nullifier < r, every coordinate < p, A and C on G1, B on G2 and in its prime-order subgroup.
 */
export function parseQr(text: string): ParsedQr | null {
  let b: Uint8Array;
  try {
    b = base45Decode(text);
  } catch {
    return null;
  }
  if (b.length !== QR_BYTES || b[0] !== 1) return null;
  const zoneClass = b[1]!;
  if (zoneClass > 2) return null;
  let o = 2;
  const take = (n: number): Uint8Array => b.subarray(o, (o += n));
  const uint = (n: number): bigint => bytesToUint(take(n));
  const epochId = Number(uint(4));
  const nullifier = uint(32);
  const ax = uint(32), ay = uint(32);
  const bx1 = uint(32), bx0 = uint(32), by1 = uint(32), by0 = uint(32); // EIP-197 order
  const cx = uint(32), cy = uint(32);
  const issuer = bytesToHex(take(20));
  const rootId = uint(8);
  const rootBytes = take(32);
  const issuedAt = Number(uint(4));
  const expiresAt = Number(uint(4));
  const signature = bytesToHex(take(65));

  const rootValue = bytesToUint(rootBytes);
  if (rootValue === 0n || rootValue >= FIELD_R) return null;
  if (nullifier >= FIELD_R) return null;
  if (!isOnG1(ax, ay) || !isOnG1(cx, cy)) return null; // also rejects coordinates >= p
  if (!isInG2(fp2Raw(bx0, bx1), fp2Raw(by0, by1))) return null; // on the twist (coordinates < p) and [r]B = O
  const proof = {
    pi_a: [ax.toString(), ay.toString(), "1"],
    pi_b: [[bx0.toString(), bx1.toString()], [by0.toString(), by1.toString()], ["1", "0"]],
    pi_c: [cx.toString(), cy.toString(), "1"],
    protocol: "groth16",
    curve: "bn128",
  };
  return { zoneClass, epochId, nullifier, proof, issuer, rootId, root: bytesToHex(rootBytes), rootValue, issuedAt, expiresAt, signature };
}

const red = (reason: Reason): Result => ({ status: "RED", reason, warnings: [], sameShowing: false });

function signer(store: VerifierStore, q: ParsedQr): string | null {
  try {
    const digest = rootDigest({
      chainId: store.chainId,
      registry: store.registry,
      issuer: q.issuer,
      rootId: q.rootId as unknown as number, // uint64: the encoder takes bigint at runtime (uintBytes)
      root: q.root,
      issuedAt: q.issuedAt,
      expiresAt: q.expiresAt,
    });
    return recoverDigestSigner(digest, q.signature); // enforces v ∈ {27, 28}, 1 ≤ r < n, low s
  } catch {
    return null;
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** SPEC §5 `verify(qrText, now)`. Calls are serialised, so the nullifier log and debounce see one read at a time. */
export function verify(qrText: string, nowMs: number, store: VerifierStore, groth16: Groth16Verify): Promise<Result> {
  const run = queue.then(() => verifyOnce(qrText, nowMs, store, groth16));
  queue = run.catch(() => undefined);
  return run;
}

async function verifyOnce(qrText: string, nowMs: number, store: VerifierStore, groth16: Groth16Verify): Promise<Result> {
  // 1. Parse.
  const q = parseQr(qrText);
  if (!q) return red("MALFORMED");
  const now = Math.floor(nowMs / 1000);

  // 2. Epoch.
  const e = Math.floor(now / EPOCH);
  const t = now - e * EPOCH;
  const epochOk = q.epochId === e || (q.epochId === e - 1 && t <= SKEW) || (q.epochId === e + 1 && EPOCH - t <= SKEW);
  if (!epochOk) return red("WRONG_EPOCH");

  // 3. Scanner freshness. A lastSync more than SKEW in the future means the clock moved back: sync again.
  const sinceSync = nowMs - store.lastSyncMs();
  if (sinceSync > STALE_MAX * 1000 || sinceSync < -SKEW * 1000) return red("SCANNER_STALE");

  // 4. Issuer.
  const issuer = store.issuer(q.issuer);
  if (!issuer || !issuer.active) return red("ISSUER_INACTIVE");

  // 5. Signed root.
  if (signer(store, q) !== q.issuer) return red("BAD_SIGNATURE");
  if (q.rootId < issuer.floor) return red("BELOW_FLOOR");
  if (q.expiresAt - q.issuedAt !== ROOT_TTL) return red("BAD_ROOT_TTL");
  if (!(q.issuedAt <= now + SKEW && now < q.expiresAt)) return red("ROOT_EXPIRED");

  // 6. Proof. currentDay is derived from epochId, never read from the QR.
  const vk = store.vk();
  if (!vk) return red("VERIFIER_ERROR");
  const signals = [q.rootValue, q.nullifier, BigInt(q.epochId), BigInt(dayOfEpoch(q.epochId)), BigInt(q.zoneClass)].map(String);
  let ok: boolean;
  try {
    ok = await groth16(vk, signals, q.proof);
  } catch {
    return red("VERIFIER_ERROR");
  }
  if (!ok) return red("BAD_PROOF");

  // 7. Class.
  const required = store.requiredClass();
  if (required !== null && q.zoneClass < required) return red("WRONG_CLASS");

  // 8. Nullifier. No gap >= DEBOUNCE_GAP since the last read = the same showing (not counted). A negative gap (the
  // clock moved back) counts as a new showing, so a clock change can never hide a repeat.
  const prev = store.nullifier(q.nullifier);
  const gap = prev ? nowMs - prev.lastReadMs : -1;
  const sameShowing = !!prev && gap >= 0 && gap < DEBOUNCE_GAP * 1000;
  const count = sameShowing ? prev!.count : (prev?.count ?? 0) + 1;

  // 9. Store, then purge entries older than the previous epoch.
  store.putNullifier({ nullifier: q.nullifier, epochId: q.epochId, count, firstSeenMs: prev?.firstSeenMs ?? nowMs, lastReadMs: nowMs });
  store.purgeBefore(e - 1);

  // 10. Result.
  if (count >= 3) return { status: "RED", reason: "DUPLICATE", warnings: [], sameShowing, zoneClass: q.zoneClass };
  const warnings: Reason[] = [];
  if (count === 2) warnings.push("SEEN_BEFORE");
  if (q.expiresAt - now < EXPIRY_WARN) warnings.push("ROOT_NEAR_EXPIRY");
  if (sinceSync > STALE_WARN * 1000) warnings.push("SCANNER_UNSYNCED");
  return warnings.length === 0
    ? { status: "GREEN", reason: "OK", warnings, sameShowing, zoneClass: q.zoneClass }
    : { status: "AMBER", reason: warnings[0]!, warnings, sameShowing, zoneClass: q.zoneClass };
}

/** An in-memory store (the browser scanner keeps its log only in this tab, like the app keeps it on the phone). */
export class MemoryStore implements VerifierStore {
  readonly issuers = new Map<string, IssuerRecord>();
  readonly log = new Map<bigint, NullifierRecord>();
  constructor(
    readonly chainId: number,
    readonly registry: string,
    public lastSync: number,
    public vkJson: object | null,
    public required: number | null,
  ) {}
  lastSyncMs() { return this.lastSync; }
  issuer(a: string) { return this.issuers.get(a.toLowerCase()); }
  vk() { return this.vkJson; }
  requiredClass() { return this.required; }
  nullifier(n: bigint) { return this.log.get(n); }
  putNullifier(r: NullifierRecord) { this.log.set(r.nullifier, r); }
  purgeBefore(epochId: number) { for (const [k, v] of this.log) if (v.epochId < epochId) this.log.delete(k); }
}
