import { ARKIV_BLOCK_TIME, DAY_OFFSET, DAY_SECONDS } from "@bombaylocal/protocol";

/**
 * Arkiv lifetimes (SPEC §9) as absolute unix deadlines, plus the lifetime in seconds from `now`. Arkiv counts
 * expiry in BLOCKS (2 s each); the SDK's ExpirationTime.fromSeconds converts. Max ~182.5 d per create/extend.
 */
export const ARKIV_MAX_BLOCKS = 7_884_000;
export const ARKIV_MAX_SECONDS = ARKIV_MAX_BLOCKS * ARKIV_BLOCK_TIME;
/** Floor, so a write whose deadline already passed (e.g. zeroing a long-gone batch) still lands and is readable. */
export const MIN_LIFETIME = 3600;
export const SCANNER_LIST_TTL = 7 * DAY_SECONDS;
export const VERIFY_KEY_TTL = 30 * DAY_SECONDS;

/** First unix second AFTER IST day `d` ends, since day(t) = floor((t + DAY_OFFSET) / 86400). */
export function endOfDay(d: number): number {
  return (d + 1) * DAY_SECONDS - DAY_OFFSET;
}

/** SignedRoot: until expiresAt + 1 h. */
export function signedRootDeadline(expiresAt: number): number {
  return expiresAt + 3600;
}

/** LeafBatch: until the end of day D + 2, where D is the batch's latest validUntilDay. */
export function leafBatchDeadline(lastValidDay: number): number {
  return endOfDay(lastValidDay + 2);
}

/** Revocation: the latest deadline among the batches it touches, + 1 d. */
export function revocationDeadline(touchedBatchLastValidDays: number[]): number {
  if (touchedBatchLastValidDays.length === 0) throw new Error("revocation touches no batch");
  return Math.max(...touchedBatchLastValidDays.map(leafBatchDeadline)) + DAY_SECONDS;
}

/**
 * Seconds from `now` until `deadline`, floored at MIN_LIFETIME and rounded UP to a whole number of blocks (the SDK
 * throws on a lifetime that is not a multiple of the 2 s block time); refuses anything past Arkiv's maximum.
 */
export function lifetimeSeconds(deadline: number, now: number): number {
  const raw = Math.max(deadline - now, MIN_LIFETIME);
  const s = Math.ceil(raw / ARKIV_BLOCK_TIME) * ARKIV_BLOCK_TIME;
  if (s > ARKIV_MAX_SECONDS) throw new Error(`lifetime ${s}s exceeds the Arkiv max ${ARKIV_MAX_SECONDS}s`);
  return s;
}
