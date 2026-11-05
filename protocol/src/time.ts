import { DAY_OFFSET, DAY_SECONDS, EPOCH } from "./constants.ts";

function assertUnixSeconds(t: number): void {
  if (!Number.isSafeInteger(t) || t < 0) throw new RangeError(`expected unix seconds, got ${t}`);
}

/** day(t) = floor((t + DAY_OFFSET) / 86400): the IST calendar day number (SPEC §9). */
export function day(unixSeconds: number): number {
  assertUnixSeconds(unixSeconds);
  return Math.floor((unixSeconds + DAY_OFFSET) / DAY_SECONDS);
}

/** epochId(t) = floor(t / EPOCH) (SPEC §6). */
export function epochId(unixSeconds: number): number {
  assertUnixSeconds(unixSeconds);
  return Math.floor(unixSeconds / EPOCH);
}

/** day(epochId) = day(epochId * EPOCH): the `currentDay` public input the scanner derives (SPEC §5 step 6). */
export function dayOfEpoch(epoch: number): number {
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new RangeError(`expected epochId, got ${epoch}`);
  return day(epoch * EPOCH);
}
