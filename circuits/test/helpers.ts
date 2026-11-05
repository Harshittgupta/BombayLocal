// Shared helpers for circuit tests. Every proof is a real Groth16 proof from the committed artifacts.
import { readFileSync } from "node:fs";
import * as snarkjs from "snarkjs";
import {
  EPOCH,
  buildCircuitInput,
  buildTree,
  day,
  idCommitment,
  merkleProof,
  passLeaf,
  type CircuitInput,
  type PassTree,
} from "@unlink/protocol";

export const WASM = "artifacts/pass.wasm";
export const ZKEY = "artifacts/pass_final.zkey";
export const VK = JSON.parse(readFileSync("artifacts/verification_key.json", "utf8"));
export const MANIFEST = JSON.parse(readFileSync("artifacts/manifest.json", "utf8"));

/** Fixed clock so tests are deterministic: 2026-10-26T09:33:20Z, mid-epoch. */
export const NOW = 1_793_000_000;
export const EPOCH_NOW = Math.floor(NOW / EPOCH);
export const TODAY = day(NOW);

export async function prove(input: CircuitInput | Record<string, unknown>) {
  return snarkjs.groth16.fullProve(input as Record<string, unknown>, WASM, ZKEY);
}

export async function verify(publicSignals: string[], proof: snarkjs.Groth16Proof): Promise<boolean> {
  return snarkjs.groth16.verify(VK, publicSignals, proof);
}

/** Witness generation enforces every === constraint, so an unsatisfiable statement cannot be proven at all. */
export async function expectCannotProve(input: Record<string, unknown>): Promise<void> {
  let proved = false;
  try {
    await prove(input);
    proved = true;
  } catch {
    // expected: "Assert Failed" or a Num2Bits/range failure during witness calculation
  }
  if (proved) throw new Error("statement was provable but must not be");
}

/** Deterministic secret i (nonzero, < 2^248). */
export const secretOf = (i: number): bigint => 0x5eed_0000n * 1_000_003n + BigInt(i) * 7_919n + 1n;

export type Pass = { secret: bigint; validUntilDay: number; zoneClass: 0 | 1 | 2 };

export function passes(n: number): Pass[] {
  return Array.from({ length: n }, (_, i) => ({
    secret: secretOf(i),
    validUntilDay: TODAY + 1 + (i % 30),
    zoneClass: (i % 3) as 0 | 1 | 2,
  }));
}

export function treeOf(ps: Pass[]): PassTree {
  return buildTree(ps.map((p) => passLeaf(idCommitment(p.secret), p.validUntilDay, p.zoneClass)));
}

export function inputFor(ps: Pass[], index: number, epochId = EPOCH_NOW, tree = treeOf(ps)): CircuitInput {
  const p = ps[index];
  return buildCircuitInput({ ...p, proof: merkleProof(tree, index), epochId });
}
