import { assertDay, assertSecret, assertZoneClass, nullifier } from "./hash.ts";
import type { CircuitMerkleProof } from "./tree.ts";
import { dayOfEpoch } from "./time.ts";

/** Public signals in SPEC §4 order. snarkjs returns them as decimal strings in this order. */
export const PUBLIC_SIGNAL_ORDER = ["root", "nullifier", "epochId", "currentDay", "zoneClass"] as const;

export type CircuitInput = Record<
  "root" | "nullifier" | "epochId" | "currentDay" | "zoneClass" | "secret" | "validUntilDay" | "depth" | "pathIndex",
  string
> & { siblings: string[] };

/**
 * Builds the snarkjs witness input for one epoch. `currentDay` is always derived from `epochId`, exactly as the
 * scanner derives it (SPEC §5 step 6); it is never chosen independently.
 */
export function buildCircuitInput(args: {
  secret: bigint;
  validUntilDay: number;
  zoneClass: number;
  proof: CircuitMerkleProof;
  epochId: number;
}): CircuitInput {
  const { secret, validUntilDay, zoneClass, proof, epochId } = args;
  assertSecret(secret);
  assertDay(validUntilDay, "validUntilDay");
  assertZoneClass(zoneClass);
  return {
    root: proof.root.toString(),
    nullifier: nullifier(secret, epochId).toString(),
    epochId: epochId.toString(),
    currentDay: dayOfEpoch(epochId).toString(),
    zoneClass: zoneClass.toString(),
    secret: secret.toString(),
    validUntilDay: validUntilDay.toString(),
    depth: proof.depth.toString(),
    pathIndex: proof.pathIndex.toString(),
    siblings: proof.siblings.map((s) => s.toString()),
  };
}
