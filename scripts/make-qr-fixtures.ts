// Writes fixtures/qr/*.json: end-to-end cases for the scanner's OfflineVerifier (SPEC §5 steps 1–10). Each file is
// { name, note, qrText, nowMs, storeState, expected: { result, reason, warnings?, nullifierCount?, absent? } }.
// Proofs are REAL Groth16 proofs from circuits/artifacts (self-checked with snarkjs before writing). Signed roots use a
// TEST-ONLY key (pk = 1), never a real issuer key. The scanner loads the vk from circuits/artifacts/verification_key.json.
// Run:  cd protocol && npm ci;  cd ../scripts && npm ci && npm run qr-fixtures
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { bn254 } from "@noble/curves/bn254.js";
import { ethers } from "ethers";
// @ts-expect-error snarkjs ships no types
import * as snarkjs from "snarkjs";
import {
  EPOCH, FIELD_R, ROOT_TTL, base45Encode, buildCircuitInput, buildTree, bytesToHex, dayOfEpoch, encodeQrPayload,
  hexToBytes, idCommitment, merkleProof, passLeaf, rootDigest, uintBytes, type QrPayload, type SignedRootFields,
  type SnarkjsProof,
} from "@bombaylocal/protocol";

const ART = "../circuits/artifacts";
const OUT = "../fixtures/qr";
const vk = JSON.parse(readFileSync(`${ART}/verification_key.json`, "utf8"));
const dep = JSON.parse(readFileSync("../deployments.json", "utf8")).sepolia;

const TEST_KEY = "0x" + "00".repeat(31) + "01"; // TEST ONLY
const OTHER_KEY = "0x" + "00".repeat(31) + "02"; // TEST ONLY, a signer that is not the issuer
const issuerWallet = new ethers.Wallet(TEST_KEY);
const otherWallet = new ethers.Wallet(OTHER_KEY);
const ISSUER = issuerWallet.address;

const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n; // BN254 base field
const SECP_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

// Fixed timeline. E is the epoch every proof is made for; NOW sits mid-epoch.
const E = 2_988_400;
const NOW = (E * EPOCH + 300) * 1000;
const H = 3600 * 1000;
const sec = (ms: number): number => Math.floor(ms / 1000);
const ROOT_ID = 12;
const ISSUED_AT = sec(NOW) - 3 * 3600;

type Store = {
  chainId: number;
  registry: string;
  vk: string | null;
  lastSyncMs: number;
  requiredClass: number | null;
  issuers: { address: string; active: boolean; floor: number; latestRootId: number }[];
  nullifiers: { nullifier: string; epochId: number; count: number; firstSeenMs: number; lastReadMs: number }[];
};
type Expected = {
  result: "GREEN" | "AMBER" | "RED";
  reason: string;
  warnings?: string[];
  nullifierCount?: number;
  absent?: string[];
};

function baseStore(): Store {
  return {
    chainId: dep.chainId,
    registry: dep.registry,
    vk: "circuits/artifacts/verification_key.json",
    lastSyncMs: NOW - 1 * H,
    requiredClass: null,
    issuers: [{ address: ISSUER, active: true, floor: 10, latestRootId: ROOT_ID }],
    nullifiers: [],
  };
}

type Proved = { zoneClass: number; epochId: number; nullifier: bigint; root: string; proof: SnarkjsProof };

async function prove(secret: bigint, zoneClass: number, epochId: number): Promise<Proved> {
  const validUntilDay = dayOfEpoch(epochId) + 30;
  const leaves = [11n, passLeaf(idCommitment(secret), validUntilDay, zoneClass), 22n, 33n, 44n];
  const tree = buildTree(leaves);
  const input = buildCircuitInput({ secret, validUntilDay, zoneClass, proof: merkleProof(tree, 1), epochId });
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, `${ART}/pass.wasm`, `${ART}/pass_final.zkey`);
  if (!(await snarkjs.groth16.verify(vk, publicSignals, proof))) throw new Error("fresh proof does not verify");
  const p: SnarkjsProof = { pi_a: proof.pi_a, pi_b: proof.pi_b, pi_c: proof.pi_c, protocol: "groth16", curve: "bn128" };
  const root = ethers.zeroPadValue(ethers.toBeHex(BigInt(publicSignals[0])), 32);
  return { zoneClass, epochId, nullifier: BigInt(publicSignals[1]), root, proof: p };
}

type RootOpts = { rootId?: number; issuedAt?: number; ttl?: number; root?: string; chainId?: number; wallet?: ethers.Wallet };

async function payload(pr: Proved, o: RootOpts = {}): Promise<QrPayload> {
  const issuedAt = o.issuedAt ?? ISSUED_AT;
  const f: SignedRootFields = {
    chainId: o.chainId ?? dep.chainId,
    registry: dep.registry,
    issuer: ISSUER,
    rootId: o.rootId ?? ROOT_ID,
    root: o.root ?? pr.root,
    issuedAt,
    expiresAt: issuedAt + (o.ttl ?? ROOT_TTL),
  };
  const signature = await (o.wallet ?? issuerWallet).signMessage(ethers.getBytes(rootDigest(f)));
  return {
    zoneClass: pr.zoneClass, epochId: pr.epochId, nullifier: pr.nullifier, proof: pr.proof,
    issuer: f.issuer, rootId: f.rootId, root: f.root, issuedAt: f.issuedAt, expiresAt: f.expiresAt, signature,
  };
}

const qr = (p: QrPayload): string => base45Encode(encodeQrPayload(p));

/** Byte surgery on a valid payload (for parse / tamper cases). */
function patch(p: QrPayload, edits: [offset: number, bytes: Uint8Array][], length?: number): string {
  let b = encodeQrPayload(p).slice();
  for (const [o, v] of edits) b.set(v, o);
  if (length !== undefined) {
    const n = new Uint8Array(length);
    n.set(b.subarray(0, Math.min(length, b.length)));
    b = n;
  }
  return base45Encode(b);
}
const w32 = (x: bigint): Uint8Array => uintBytes(x, 32);
const OFF = { version: 0, zoneClass: 1, epochId: 2, nullifier: 6, ax: 38, ay: 70, bx1: 102, bx0: 134, by1: 166, by0: 198, cx: 230, cy: 262, root: 322, sig: 362 };

const cases: { name: string; note: string; qrText: string; nowMs: number; store: Store; expected: Expected }[] = [];
function add(name: string, note: string, qrText: string, expected: Expected, nowMs = NOW, edit: (s: Store) => void = () => {}): void {
  const store = baseStore();
  edit(store);
  cases.push({ name, note, qrText, nowMs, store, expected });
}
const nul = (pr: Proved, count: number, lastReadMs: number) => ({
  nullifier: pr.nullifier.toString(), epochId: pr.epochId, count, firstSeenMs: lastReadMs - 60_000, lastReadMs,
});

async function main(): Promise<void> {
  const p0 = await prove(0x1234567890abcdefn, 0, E); // 2nd class
  const p2 = await prove(0xfeedfacecafebeefn, 2, E); // AC
  const pE1 = await prove(0x1234567890abcdefn, 0, E + 1); // same pass, next epoch
  const v0 = await payload(p0);
  const valid = qr(v0);
  const GREEN: Expected = { result: "GREEN", reason: "OK", nullifierCount: 1 };
  const R = (reason = "MALFORMED"): Expected => ({ result: "RED", reason });
  const amber = (reason: string, count = 1, warnings = [reason]): Expected => ({ result: "AMBER", reason, warnings, nullifierCount: count });
  const at = (epoch: number, s: number): number => (epoch * EPOCH + s) * 1000;

  // ---- Valid and accepted variants
  add("valid", "A fresh real proof, signed root from the active issuer, mid-epoch, synced 1 h ago.", valid, GREEN);
  add("valid-class2-required1", "AC (2) meets a checkpoint that requires 1st class (1): 'at least that class'.", qr(await payload(p2)), GREEN, NOW, (s) => { s.requiredClass = 1; });
  add("valid-class0-required0", "2nd class meets a 2nd-class checkpoint.", valid, GREEN, NOW, (s) => { s.requiredClass = 0; });
  add("unknown-higher-rootid", "rootId 12 is newer than the last synced latestRootId 5: accepted when every check passes (SPEC §5 step 5).", valid, GREEN, NOW, (s) => { s.issuers[0]!.latestRootId = 5; });
  add("rootid-equals-floor", "rootId == floor is accepted (rootId >= floor).", valid, GREEN, NOW, (s) => { s.issuers[0]!.floor = ROOT_ID; });
  add("next-epoch-proof-valid", "A real proof for epoch E+1 scanned in epoch E+1.", qr(await payload(pE1)), GREEN, at(E + 1, 300));

  // ---- Step 1: malformed
  add("malformed-empty", "Empty text.", "", R());
  add("malformed-bad-char", "A lowercase character is not in the Base45 alphabet.", "a" + valid.slice(1), R());
  add("malformed-bad-length", "640 chars: a length of 1 mod 3 is not valid Base45.", valid.slice(0, 640), R());
  add("malformed-base45-overflow", "A 3-char group that decodes above 65535.", "GGW" + valid.slice(3), R());
  add("malformed-short", "426-byte payload.", patch(v0, [], 426), R());
  add("malformed-long", "428-byte payload.", patch(v0, [], 428), R());
  add("malformed-version", "version byte 2.", patch(v0, [[OFF.version, uintBytes(2, 1)]]), R());
  add("malformed-zoneclass-3", "zoneClass 3 is not a fare class.", patch(v0, [[OFF.zoneClass, uintBytes(3, 1)]]), R());
  add("malformed-root-zero", "root = 0.", patch(v0, [[OFF.root, w32(0n)]]), R());
  add("malformed-root-ge-r", "root = r (non-canonical).", patch(v0, [[OFF.root, w32(FIELD_R)]]), R());
  add("malformed-nullifier-plus-r", "nullifier + r: would otherwise verify as a fresh nullifier (SPEC §5 step 1).", patch(v0, [[OFF.nullifier, w32(p0.nullifier + FIELD_R)]]), R());
  add("malformed-coord-ge-p", "A.x + p (>= p).", patch(v0, [[OFF.ax, w32(BigInt(p0.proof.pi_a[0]) + P)]]), R());
  add("malformed-a-off-curve", "A.y + 1: not on G1.", patch(v0, [[OFF.ay, w32((BigInt(p0.proof.pi_a[1]) + 1n) % P)]]), R());
  add("malformed-c-off-curve", "C.y + 1: not on G1.", patch(v0, [[OFF.cy, w32((BigInt(p0.proof.pi_c[1]) + 1n) % P)]]), R());
  add("malformed-a-infinity", "A = (0, 0), the EIP-197 encoding of the point at infinity.", patch(v0, [[OFF.ax, w32(0n)], [OFF.ay, w32(0n)]]), R());
  add("malformed-b-off-curve", "B.y.c0 + 1: not on the G2 twist.", patch(v0, [[OFF.by0, w32((BigInt(p0.proof.pi_b[1][0]) + 1n) % P)]]), R());
  // A point on the twist curve that is NOT in the prime-order subgroup (G2's cofactor is not 1).
  const Fp2 = bn254.fields.Fp2;
  const bTwist = bn254.G2.Point.CURVE().b;
  let bad: { x: { c0: bigint; c1: bigint }; y: { c0: bigint; c1: bigint } } | undefined;
  for (let k = 1n; k < 100n && !bad; k++) {
    const x = Fp2.fromBigTuple([k, 1n]);
    let y;
    try {
      y = Fp2.sqrt(Fp2.add(Fp2.mul(Fp2.sqr(x), x), bTwist));
    } catch {
      continue;
    }
    const pt = bn254.G2.Point.fromAffine({ x, y });
    try {
      pt.assertValidity();
    } catch (e) {
      if (String(e).includes("subgroup")) bad = { x, y };
    }
  }
  if (!bad) throw new Error("no non-subgroup twist point found");
  add("malformed-b-not-in-subgroup", "B is on the twist curve but not in the prime-order subgroup.",
    patch(v0, [[OFF.bx1, w32(bad.x.c1)], [OFF.bx0, w32(bad.x.c0)], [OFF.by1, w32(bad.y.c1)], [OFF.by0, w32(bad.y.c0)]]), R());

  // ---- Step 2: epoch and skew
  add("wrong-epoch", "Proof for E scanned in E+2.", valid, R("WRONG_EPOCH"), at(E + 2, 300));
  add("wrong-epoch-past", "Proof for E scanned in E-2.", valid, R("WRONG_EPOCH"), at(E - 2, 300));
  add("skew-after-119", "119 s into E+1: the previous epoch is still accepted.", valid, GREEN, at(E + 1, 119));
  add("skew-after-120", "Exactly 120 s into E+1: t <= SKEW, accepted.", valid, GREEN, at(E + 1, 120));
  add("skew-after-121", "121 s into E+1: rejected.", valid, R("WRONG_EPOCH"), at(E + 1, 121));
  add("skew-before-119", "119 s before E starts (scanner in E-1): the next epoch is accepted.", valid, GREEN, at(E, -119));
  add("skew-before-121", "121 s before E starts: rejected.", valid, R("WRONG_EPOCH"), at(E, -121));

  // ---- Step 3 / 10: scanner freshness
  add("stale-25h-amber", "Last sync 25 h ago: Amber SCANNER_UNSYNCED.", valid, amber("SCANNER_UNSYNCED"), NOW, (s) => { s.lastSyncMs = NOW - 25 * H; });
  add("stale-48h-amber", "Exactly 48 h: not > STALE_MAX, still Amber.", valid, amber("SCANNER_UNSYNCED"), NOW, (s) => { s.lastSyncMs = NOW - 48 * H; });
  add("stale-49h-red", "Last sync 49 h ago: Red SCANNER_STALE.", valid, R("SCANNER_STALE"), NOW, (s) => { s.lastSyncMs = NOW - 49 * H; });
  add("never-synced", "lastSync 0 (never synced): Red SCANNER_STALE.", valid, R("SCANNER_STALE"), NOW, (s) => { s.lastSyncMs = 0; });
  add("lastsync-in-future-121", "lastSync 121 s in the future (clock moved back after the sync): age unknown, Red SCANNER_STALE.", valid, R("SCANNER_STALE"), NOW, (s) => { s.lastSyncMs = NOW + 121_000; });
  add("lastsync-in-future-120", "lastSync 120 s in the future: within SKEW, accepted.", valid, GREEN, NOW, (s) => { s.lastSyncMs = NOW + 120_000; });

  // ---- Step 4: issuer
  add("suspended-issuer", "The issuer is suspended in the last sync.", valid, R("ISSUER_INACTIVE"), NOW, (s) => { s.issuers[0]!.active = false; });
  add("unknown-issuer", "The issuer is not in the local store at all.", valid, R("ISSUER_INACTIVE"), NOW, (s) => { s.issuers = []; });

  // ---- Step 5: signed root
  add("bad-signature-other-key", "A well-formed signature by a key that is not the issuer.", qr(await payload(p0, { wallet: otherWallet })), R("BAD_SIGNATURE"));
  const sig = hexToBytes(v0.signature, 65);
  const flipped = sig.slice();
  flipped[5] = flipped[5]! ^ 0x01;
  add("bad-signature-flipped-r", "One bit of r flipped.", patch(v0, [[OFF.sig, flipped]]), R("BAD_SIGNATURE"));
  const s = BigInt(bytesToHex(sig.subarray(32, 64)));
  const highS = sig.slice();
  highS.set(uintBytes(SECP_N - s, 32), 32);
  highS[64] = sig[64] === 27 ? 28 : 27;
  add("bad-signature-high-s", "The malleable twin (n - s, v flipped) recovers the same signer but s > n/2.", patch(v0, [[OFF.sig, highS]]), R("BAD_SIGNATURE"));
  const v29 = sig.slice();
  v29[64] = 29;
  add("bad-signature-v29", "v = 29.", patch(v0, [[OFF.sig, v29]]), R("BAD_SIGNATURE"));
  add("bad-signature-other-chain", "Signed by the issuer for chainId 1: the scanner's digest uses its own chainId.", qr(await payload(p0, { chainId: 1 })), R("BAD_SIGNATURE"));
  add("below-floor", "rootId 12 < floor 13.", valid, R("BELOW_FLOOR"), NOW, (st) => { st.issuers[0]!.floor = 13; });
  add("bad-root-ttl", "expiresAt - issuedAt = 36 h - 1 s (validly signed).", qr(await payload(p0, { ttl: ROOT_TTL - 1 })), R("BAD_ROOT_TTL"));
  add("expired-root", "now == expiresAt: now < expiresAt fails.", qr(await payload(p0, { issuedAt: sec(NOW) - ROOT_TTL })), R("ROOT_EXPIRED"));
  add("expired-root-long-ago", "Root expired a day ago.", qr(await payload(p0, { issuedAt: sec(NOW) - ROOT_TTL - 86_400 })), R("ROOT_EXPIRED"));
  add("root-issued-in-future-121", "issuedAt = now + 121 s > now + SKEW.", qr(await payload(p0, { issuedAt: sec(NOW) + 121 })), R("ROOT_EXPIRED"));
  add("root-issued-in-future-120", "issuedAt = now + 120 s: accepted (clock skew).", qr(await payload(p0, { issuedAt: sec(NOW) + 120 })), GREEN);
  add("root-near-expiry", "expiresAt - now = 1 h < EXPIRY_WARN (2 h): Amber.", qr(await payload(p0, { issuedAt: sec(NOW) - ROOT_TTL + 3600 })), amber("ROOT_NEAR_EXPIRY"));

  // ---- Step 6: proof
  const g7 = bn254.G1.Point.BASE.multiply(7n).toAffine();
  add("bad-proof", "A replaced by a valid G1 point (7·G): parses, fails Groth16.", patch(v0, [[OFF.ax, w32(g7.x)], [OFF.ay, w32(g7.y)]]), R("BAD_PROOF"));
  add("bad-proof-swapped", "The AC pass's proof points pasted into the 2nd-class QR.", qr({ ...v0, proof: p2.proof }), R("BAD_PROOF"));
  add("tampered-nullifier", "nullifier + 1 (still canonical): the proof no longer matches.", patch(v0, [[OFF.nullifier, w32(p0.nullifier + 1n)]]), R("BAD_PROOF"));
  add("tampered-zoneclass", "zoneClass 0 -> 1: a 2nd-class pass claiming 1st.", patch(v0, [[OFF.zoneClass, uintBytes(1, 1)]]), R("BAD_PROOF"));
  add("tampered-epoch", "epochId E -> E+1, scanned in E+1: the epoch input differs from the proof.", patch(v0, [[OFF.epochId, uintBytes(E + 1, 4)]]), R("BAD_PROOF"), at(E + 1, 300));
  const otherRoot = ethers.zeroPadValue(ethers.toBeHex(12345n), 32);
  add("root-not-in-proof", "A validly signed root that is not the root the proof was made for.", qr(await payload(p0, { root: otherRoot })), R("BAD_PROOF"));

  // ---- Step 7: class
  add("wrong-class", "2nd-class pass at a 1st-class checkpoint.", valid, R("WRONG_CLASS"), NOW, (st) => { st.requiredClass = 1; });

  // ---- Steps 8–10: nullifier log
  add("second-showing", "Seen once before (10 s ago, out of view since): Amber SEEN_BEFORE.", valid, amber("SEEN_BEFORE", 2), NOW, (st) => { st.nullifiers = [nul(p0, 1, NOW - 10_000)]; });
  add("third-showing", "Seen twice before: Red DUPLICATE.", valid, { result: "RED", reason: "DUPLICATE", nullifierCount: 3 }, NOW, (st) => { st.nullifiers = [nul(p0, 2, NOW - 10_000)]; });
  add("fourth-showing", "Seen three times before: still Red DUPLICATE.", valid, { result: "RED", reason: "DUPLICATE", nullifierCount: 4 }, NOW, (st) => { st.nullifiers = [nul(p0, 3, NOW - 10_000)]; });
  add("debounce-same-showing", "Last read 0.5 s ago (< DEBOUNCE_GAP 1 s): the same showing, not counted.", valid, GREEN, NOW, (st) => { st.nullifiers = [nul(p0, 1, NOW - 500)]; });
  add("debounce-same-showing-amber", "Count 2, re-read 0.5 s later: still the same Amber showing, not counted.", valid, amber("SEEN_BEFORE", 2), NOW, (st) => { st.nullifiers = [nul(p0, 2, NOW - 500)]; });
  add("debounce-gap-1000ms", "A gap of exactly 1 s counts as a new showing.", valid, amber("SEEN_BEFORE", 2), NOW, (st) => { st.nullifiers = [nul(p0, 1, NOW - 1000)]; });
  add("debounce-gap-1500ms", "A gap of 1.5 s counts as a new showing.", valid, amber("SEEN_BEFORE", 2), NOW, (st) => { st.nullifiers = [nul(p0, 1, NOW - 1500)]; });
  add("debounce-clock-backwards", "Last read 5 s in the future (clock moved back): a negative gap counts as a new showing.", valid, amber("SEEN_BEFORE", 2), NOW, (st) => { st.nullifiers = [nul(p0, 1, NOW + 5000)]; });
  add("no-vk", "The store holds no verification key: Red VERIFIER_ERROR (fail closed), nothing stored.", valid, R("VERIFIER_ERROR"), NOW, (st) => { st.vk = null; });
  add("purge-old-epochs", "An entry from epoch E-2 is purged (epochId < e - 1); the scan itself is stored.", valid, { ...GREEN, absent: ["777"] }, NOW, (st) => {
    st.nullifiers = [
      { nullifier: "777", epochId: E - 2, count: 1, firstSeenMs: NOW - 1_200_000, lastReadMs: NOW - 1_200_000 },
      { nullifier: "888", epochId: E - 1, count: 1, firstSeenMs: NOW - 600_000, lastReadMs: NOW - 600_000 },
    ];
  });
  add("amber-precedence", "Seen before + near expiry + unsynced: reason is the first (SEEN_BEFORE), all three are warnings.",
    qr(await payload(p0, { issuedAt: sec(NOW) - ROOT_TTL + 3600 })),
    amber("SEEN_BEFORE", 2, ["SEEN_BEFORE", "ROOT_NEAR_EXPIRY", "SCANNER_UNSYNCED"]), NOW,
    (st) => { st.lastSyncMs = NOW - 30 * H; st.nullifiers = [nul(p0, 1, NOW - 5000)]; });

  // ---- Order of checks (first failure wins; nothing is stored before step 8)
  add("order-epoch-before-stale", "Wrong epoch and stale scanner: step 2 comes first.", valid, R("WRONG_EPOCH"), at(E + 2, 300), (st) => { st.lastSyncMs = 0; });
  add("order-stale-before-issuer", "Stale scanner and suspended issuer: step 3 comes first.", valid, R("SCANNER_STALE"), NOW, (st) => { st.lastSyncMs = NOW - 49 * H; st.issuers[0]!.active = false; });
  add("order-signature-before-floor", "Bad signature and below floor: the signature is checked first.", qr(await payload(p0, { wallet: otherWallet })), R("BAD_SIGNATURE"), NOW, (st) => { st.issuers[0]!.floor = 99; });
  add("order-proof-before-class", "Bad proof at a 1st-class checkpoint: step 6 comes first.", patch(v0, [[OFF.nullifier, w32(p0.nullifier + 1n)]]), R("BAD_PROOF"), NOW, (st) => { st.requiredClass = 1; });
  add("order-class-before-nullifier", "Wrong class with a seen nullifier: Red WRONG_CLASS and the count is not touched.", valid, { result: "RED", reason: "WRONG_CLASS", nullifierCount: 2 }, NOW, (st) => { st.requiredClass = 1; st.nullifiers = [nul(p0, 2, NOW - 10_000)]; });

  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.endsWith(".json")) rmSync(`${OUT}/${f}`);
  for (const c of cases) {
    const { store, ...rest } = c;
    writeFileSync(`${OUT}/${c.name}.json`, JSON.stringify({ ...rest, storeState: store }, null, 2) + "\n");
  }
  console.log(`wrote ${cases.length} cases to fixtures/qr/ (issuer ${ISSUER}, epoch ${E})`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
