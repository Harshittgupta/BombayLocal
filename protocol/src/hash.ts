import { poseidon1 } from "poseidon-lite/poseidon1";
import { poseidon2 } from "poseidon-lite/poseidon2";
import { poseidon3 } from "poseidon-lite/poseidon3";
import { FIELD_R, SECRET_BITS, type ZoneClass } from "./constants.ts";

/** Throws unless x is a canonical field element (0 <= x < r). Never reduce silently (SPEC §5 step 1). */
export function assertField(x: bigint, name = "value"): bigint {
  if (typeof x !== "bigint" || x < 0n || x >= FIELD_R) throw new RangeError(`${name} is not a field element < r`);
  return x;
}

export function assertZoneClass(z: number): ZoneClass {
  if (z !== 0 && z !== 1 && z !== 2) throw new RangeError("zoneClass must be 0, 1 or 2");
  return z;
}

export function assertDay(d: number, name: string): number {
  if (!Number.isInteger(d) || d < 0 || d > 0xffff) throw new RangeError(`${name} must be a uint16`);
  return d;
}

export function assertSecret(secret: bigint): bigint {
  if (typeof secret !== "bigint" || secret <= 0n || secret >= 1n << BigInt(SECRET_BITS))
    throw new RangeError(`secret must be a nonzero ${SECRET_BITS}-bit integer`);
  return secret;
}

export const hash1 = (a: bigint): bigint => poseidon1([assertField(a)]);
export const hash2 = (a: bigint, b: bigint): bigint => poseidon2([assertField(a), assertField(b)]);
export const hash3 = (a: bigint, b: bigint, c: bigint): bigint =>
  poseidon3([assertField(a), assertField(b), assertField(c)]);

/** idCommitment = Poseidon1(secret). Computed on the phone (SPEC §3.1). */
export function idCommitment(secret: bigint): bigint {
  return hash1(assertSecret(secret));
}

/** leaf = Poseidon3(idCommitment, validUntilDay, zoneClass). Computed by the issuer (SPEC §3.1). */
export function passLeaf(idCommit: bigint, validUntilDay: number, zoneClass: number): bigint {
  return hash3(idCommit, BigInt(assertDay(validUntilDay, "validUntilDay")), BigInt(assertZoneClass(zoneClass)));
}

/** nullifier = Poseidon2(secret, epochId) (SPEC §6). */
export function nullifier(secret: bigint, epoch: number): bigint {
  if (!Number.isSafeInteger(epoch) || epoch < 0 || epoch > 0xffffffff) throw new RangeError("epochId must be a uint32");
  return hash2(assertSecret(secret), BigInt(epoch));
}

/** A fresh 248-bit secret from the platform CSPRNG. Used by tests and fixtures; the phone has its own generator. */
export function randomSecret(): bigint {
  const bytes = new Uint8Array(SECRET_BITS / 8);
  for (;;) {
    globalThis.crypto.getRandomValues(bytes);
    let x = 0n;
    for (const b of bytes) x = (x << 8n) | BigInt(b);
    if (x !== 0n) return x;
  }
}
