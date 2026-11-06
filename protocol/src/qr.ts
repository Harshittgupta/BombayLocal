import { QR_BYTES } from "./constants.ts";
import { bytesToHex, bytesToUint, concatBytes, hexToBytes, uintBytes } from "./bytes.ts";
import { base45Decode, base45Encode } from "./base45.ts";
import { dayOfEpoch } from "./time.ts";

export const QR_VERSION = 1;

/** snarkjs Groth16 proof shape (decimal strings; projective z = "1"). */
export type SnarkjsProof = {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
  protocol: "groth16";
  curve: "bn128";
};

/** Everything in the SPEC §3.4 QR payload. */
export type QrPayload = {
  zoneClass: number;
  epochId: number;
  nullifier: bigint;
  proof: SnarkjsProof;
  issuer: string; // 0x, 20 B
  rootId: number;
  root: string; // 0x bytes32
  issuedAt: number;
  expiresAt: number;
  signature: string; // 0x, 65 B r ‖ s ‖ v
};

const w32 = (dec: string): Uint8Array => uintBytes(BigInt(dec), 32);

/** SPEC §3.4 byte layout, 427 bytes. G2 in EIP-197 order: x.c1, x.c0, y.c1, y.c0 (snarkjs pi_b[i] = [c0, c1]). */
export function encodeQrPayload(p: QrPayload): Uint8Array {
  const { pi_a: a, pi_b: b, pi_c: c } = p.proof;
  if (a[2] !== "1" || c[2] !== "1" || b[2][0] !== "1" || b[2][1] !== "0") throw new Error("proof must be affine (z = 1)");
  const out = concatBytes(
    uintBytes(QR_VERSION, 1),
    uintBytes(p.zoneClass, 1),
    uintBytes(p.epochId, 4),
    uintBytes(p.nullifier, 32),
    w32(a[0]), w32(a[1]),
    w32(b[0][1]), w32(b[0][0]), w32(b[1][1]), w32(b[1][0]),
    w32(c[0]), w32(c[1]),
    hexToBytes(p.issuer, 20),
    uintBytes(p.rootId, 8),
    hexToBytes(p.root, 32),
    uintBytes(p.issuedAt, 4),
    uintBytes(p.expiresAt, 4),
    hexToBytes(p.signature, 65),
  );
  if (out.length !== QR_BYTES) throw new Error(`QR payload is ${out.length} bytes, expected ${QR_BYTES}`);
  return out;
}

export function decodeQrPayload(bytes: Uint8Array): QrPayload {
  if (bytes.length !== QR_BYTES) throw new Error(`QR payload must be ${QR_BYTES} bytes`);
  if (bytes[0] !== QR_VERSION) throw new Error("unknown QR payload version");
  let o = 1;
  const take = (n: number): Uint8Array => bytes.subarray(o, (o += n));
  const num = (n: number): number => Number(bytesToUint(take(n)));
  const dec = (): string => bytesToUint(take(32)).toString();
  const zoneClass = num(1);
  const epochId = num(4);
  const nullifier = bytesToUint(take(32));
  const ax = dec(), ay = dec();
  const bx1 = dec(), bx0 = dec(), by1 = dec(), by0 = dec();
  const cx = dec(), cy = dec();
  return {
    zoneClass,
    epochId,
    nullifier,
    proof: {
      pi_a: [ax, ay, "1"],
      pi_b: [[bx0, bx1], [by0, by1], ["1", "0"]],
      pi_c: [cx, cy, "1"],
      protocol: "groth16",
      curve: "bn128",
    },
    issuer: bytesToHex(take(20)),
    rootId: num(8),
    root: bytesToHex(take(32)),
    issuedAt: num(4),
    expiresAt: num(4),
    signature: bytesToHex(take(65)),
  };
}

export function qrEncode(p: QrPayload): string {
  return base45Encode(encodeQrPayload(p));
}

export function qrDecode(text: string): QrPayload {
  return decodeQrPayload(base45Decode(text));
}

/** The public signals a scanner verifies against, in SPEC §4 order; currentDay is derived from epochId. */
export function qrPublicSignals(p: QrPayload): string[] {
  return [BigInt(p.root).toString(), p.nullifier.toString(), String(p.epochId), String(dayOfEpoch(p.epochId)), String(p.zoneClass)];
}
