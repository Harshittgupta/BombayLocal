// Shared helpers for circuit tests. Every proof is a real Groth16 proof from the committed artifacts.
import { readFileSync } from "node:fs";
import * as snarkjs from "snarkjs";
import {
  EPOCH,
  FIELD_R,
  buildCircuitInput,
  buildTree,
  day,
  idCommitment,
  merkleProof,
  passLeaf,
  type CircuitInput,
  type PassTree,
} from "@bombaylocal/protocol";

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

/**
 * The circom witness generator asserts every === constraint, so an unsatisfiable statement can't even produce a
 * witness. Only an "Assert Failed" error counts: a missing file or a misspelt signal name must not pass as a
 * rejection. This checks the wasm; `proveTamperedWitness` below checks the R1CS itself.
 */
export async function expectCannotProve(input: Record<string, unknown>): Promise<void> {
  let error: unknown;
  try {
    await prove(input);
  } catch (e) {
    error = e;
  }
  if (error === undefined) throw new Error("statement was provable but must not be");
  if (!String((error as Error)?.message ?? error).includes("Assert Failed")) throw error;
}

/**
 * Witness layout (snarkjs, 0 outputs): [1, root, nullifier, epochId, currentDay, zoneClass, secret, validUntilDay,
 * depth, pathIndex, siblings[0..19], internal wires...].
 */
export const WIRE = { root: 1, nullifier: 2, epochId: 3, currentDay: 4, zoneClass: 5, secret: 6 } as const;

/** Encodes a witness in snarkjs .wtns format v2 (section 1: n8, prime, count; section 2: values, 32-byte LE). */
function encodeWtns(witness: bigint[]): Uint8Array {
  const n8 = 32;
  const le = (x: bigint) => {
    const b = new Uint8Array(n8);
    for (let i = 0; i < n8; i++) b[i] = Number((x >> BigInt(8 * i)) & 0xffn);
    return b;
  };
  const header = 12 + 12 + (4 + n8 + 4) + 12;
  const buf = new Uint8Array(header + n8 * witness.length);
  const dv = new DataView(buf.buffer);
  buf.set(new TextEncoder().encode("wtns"), 0);
  dv.setUint32(4, 2, true); // version
  dv.setUint32(8, 2, true); // sections
  dv.setUint32(12, 1, true); // section 1: header
  dv.setBigUint64(16, BigInt(4 + n8 + 4), true);
  dv.setUint32(24, n8, true);
  buf.set(le(FIELD_R), 28);
  dv.setUint32(28 + n8, witness.length, true);
  const s2 = 28 + n8 + 4;
  dv.setUint32(s2, 2, true); // section 2: witness values
  dv.setBigUint64(s2 + 4, BigInt(n8 * witness.length), true);
  witness.forEach((w, i) => buf.set(le(((w % FIELD_R) + FIELD_R) % FIELD_R), s2 + 12 + i * n8));
  return buf;
}

/**
 * R1CS-level negative test: compute a valid witness, change it, and prove from the changed witness directly
 * (bypassing the witness generator's asserts). If the R1CS still constrains what was changed, the resulting
 * proof cannot verify.
 */
export async function proveTamperedWitness(input: Record<string, unknown>, mutate: (w: bigint[]) => void) {
  const mem = { type: "mem" } as { type: "mem"; data?: Uint8Array };
  await snarkjs.wtns.calculate(input, WASM, mem);
  const witness = (await snarkjs.wtns.exportJson(mem)).map((x) => BigInt(x));
  mutate(witness);
  const { proof, publicSignals } = await snarkjs.groth16.prove(ZKEY, { type: "mem", data: encodeWtns(witness) });
  return { proof, publicSignals, valid: await verify(publicSignals, proof) };
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
