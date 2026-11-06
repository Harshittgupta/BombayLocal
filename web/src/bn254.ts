/**
 * The BN254 (alt_bn128) point checks SPEC §5 step 1 needs before Groth16 runs: A and C on G1, and B on the G2 twist
 * AND in its prime-order subgroup. G1 has cofactor 1, so on-curve is enough there; G2 does not, so B is checked with
 * [r]B = O. The point at infinity, (0, 0) in EIP-197 encoding, is rejected. A line-for-line port of the Kotlin
 * scanner's Bn254.kt (apps/scanner/verifier), so both scanners reject exactly the same points.
 */
export const FIELD_P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
export const FIELD_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const P = FIELD_P;

const mod = (a: bigint): bigint => ((a % P) + P) % P;

/** Fp2 = Fp[u] / (u² + 1); element c0 + c1·u. */
export type Fp2 = { c0: bigint; c1: bigint };
const fp2 = (c0: bigint, c1: bigint): Fp2 => ({ c0: mod(c0), c1: mod(c1) });
const add = (a: Fp2, b: Fp2) => fp2(a.c0 + b.c0, a.c1 + b.c1);
const sub = (a: Fp2, b: Fp2) => fp2(a.c0 - b.c0, a.c1 - b.c1);
const mul = (a: Fp2, b: Fp2) => fp2(a.c0 * b.c0 - a.c1 * b.c1, a.c0 * b.c1 + a.c1 * b.c0);
const k = (a: Fp2, n: bigint) => fp2(a.c0 * n, a.c1 * n);
const sq = (a: Fp2) => mul(a, a);
const isZero = (a: Fp2) => a.c0 === 0n && a.c1 === 0n;
const eq = (a: Fp2, b: Fp2) => a.c0 === b.c0 && a.c1 === b.c1;
const ZERO = fp2(0n, 0n);
const ONE = fp2(1n, 0n);

function modInverse(a: bigint, m: bigint): bigint {
  let [r0, r1] = [mod(a), m];
  let [s0, s1] = [1n, 0n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  return ((s0 % m) + m) % m;
}

/** Twist coefficient b' = 3 / (9 + u) = 3·(9 − u) / 82. */
const B_TWIST: Fp2 = (() => {
  const inv82 = modInverse(82n, P);
  return fp2(27n * inv82, -3n * inv82);
})();

export const inField = (x: bigint): boolean => x >= 0n && x < P;

/** y² = x³ + 3 over Fp, coordinates canonical, not the point at infinity. */
export function isOnG1(x: bigint, y: bigint): boolean {
  if (!inField(x) || !inField(y)) return false;
  if (x === 0n && y === 0n) return false;
  return mod(y * y) === mod(x * x * x + 3n);
}

export function isOnTwist(x: Fp2, y: Fp2): boolean {
  if (![x.c0, x.c1, y.c0, y.c1].every(inField)) return false;
  if (isZero(x) && isZero(y)) return false;
  return eq(sq(y), add(mul(sq(x), x), B_TWIST));
}

/** B is a valid G2 element: on the twist and [r]B is the point at infinity. */
export function isInG2(x: Fp2, y: Fp2): boolean {
  return isOnTwist(x, y) && mulIsInfinity(x, y, FIELD_R);
}

type Jac = { x: Fp2; y: Fp2; z: Fp2 };

function double(p: Jac): Jac {
  if (isZero(p.z)) return p;
  // dbl-2009-l (a = 0)
  const a = sq(p.x);
  const b = sq(p.y);
  const c = sq(b);
  const d = k(sub(sub(sq(add(p.x, b)), a), c), 2n);
  const e = k(a, 3n);
  const f = sq(e);
  const x3 = sub(f, k(d, 2n));
  const y3 = sub(mul(e, sub(d, x3)), k(c, 8n));
  const z3 = k(mul(p.y, p.z), 2n);
  return { x: x3, y: y3, z: z3 };
}

/** p + q, q affine (madd-2007-bl). */
function addAffine(p: Jac, qx: Fp2, qy: Fp2): Jac {
  if (isZero(p.z)) return { x: qx, y: qy, z: ONE };
  const z1z1 = sq(p.z);
  const u2 = mul(qx, z1z1);
  const s2 = mul(mul(qy, p.z), z1z1);
  const h = sub(u2, p.x);
  const rr = k(sub(s2, p.y), 2n);
  if (isZero(h)) return isZero(rr) ? double(p) : { x: ONE, y: ONE, z: ZERO };
  const hh = sq(h);
  const i = k(hh, 4n);
  const j = mul(h, i);
  const v = mul(p.x, i);
  const x3 = sub(sub(sq(rr), j), k(v, 2n));
  const y3 = sub(mul(rr, sub(v, x3)), k(mul(p.y, j), 2n));
  const z3 = sub(sub(sq(add(p.z, h)), z1z1), hh);
  return { x: x3, y: y3, z: z3 };
}

function mulIsInfinity(x: Fp2, y: Fp2, n: bigint): boolean {
  let acc: Jac = { x: ONE, y: ONE, z: ZERO };
  for (let bit = n.toString(2).length - 1; bit >= 0; bit--) {
    acc = double(acc);
    if ((n >> BigInt(bit)) & 1n) acc = addAffine(acc, x, y);
  }
  return isZero(acc.z);
}

export { fp2 };
