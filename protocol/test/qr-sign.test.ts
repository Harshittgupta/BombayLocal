import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FIELD_R,
  QR_BASE45_CHARS,
  QR_BYTES,
  base45Decode,
  base45Encode,
  bytesToHex,
  decodeLeaves,
  decodeQrPayload,
  encodeQrPayload,
  keccakUtf8,
  qrDecode,
  qrEncode,
  qrPublicSignals,
  rebuildFromArkiv,
  recoverDigestSigner,
  recoverRootSigner,
  rootDigest,
  rootPreimage,
  uintBytes,
  utf8,
} from "../src/index.ts";

const signVec = JSON.parse(readFileSync("../fixtures/sign-vectors.json", "utf8"));
const qrVec = JSON.parse(readFileSync("../fixtures/qr-vectors.json", "utf8"));
const case0 = JSON.parse(readFileSync("../fixtures/vectors.json", "utf8")).cases[0];

describe("Base45 (RFC 9285)", () => {
  it("matches the RFC's examples", () => {
    expect(base45Encode(utf8("AB"))).toBe("BB8");
    expect(base45Encode(utf8("Hello!!"))).toBe("%69 VD92EX0");
    expect(base45Encode(utf8("base-45"))).toBe("UJCLQE7W581");
    expect(new TextDecoder().decode(base45Decode("QED8WEX0"))).toBe("ietf!");
  });

  it("round-trips every byte value and rejects malformed input", () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(base45Decode(base45Encode(all))).toEqual(all);
    expect(base45Decode(base45Encode(all.subarray(0, 255)))).toEqual(all.subarray(0, 255));
    expect(() => base45Decode("GGW")).toThrow(); // 65535 < value: out of range
    expect(() => base45Decode("A")).toThrow(); // bad length
    expect(() => base45Decode("ab")).toThrow(); // lowercase is not in the alphabet
  });
});

describe("signed root (SPEC §3.3), cross-checked against the issuer's ethers implementation", () => {
  it("reproduces the pinned digest and recovers the signer from sign-vectors.json", () => {
    const f = signVec.signedRoot.fields;
    expect(rootPreimage(f).length).toBe(134);
    expect(rootDigest(f)).toBe(signVec.signedRoot.digest);
    expect(recoverRootSigner(f, signVec.signedRoot.eip191Signature)).toBe(signVec.signedRoot.signer.toLowerCase());
    expect(recoverDigestSigner(signVec.scanBatch.digest, signVec.scanBatch.eip191Signature)).toBe(
      signVec.scanBatch.signer.toLowerCase(),
    );
  });

  it("a tampered field recovers a different address; malformed signatures throw", () => {
    const f = signVec.signedRoot.fields;
    const sig: string = signVec.signedRoot.eip191Signature;
    expect(recoverRootSigner({ ...f, rootId: f.rootId + 1 }, sig)).not.toBe(signVec.signedRoot.signer.toLowerCase());
    expect(() => recoverRootSigner(f, sig.slice(0, -2) + "1d")).toThrow(/v must be/); // v = 29
    expect(() => recoverRootSigner(f, sig.slice(0, 130))).toThrow(); // 64 bytes
    // high-s malleated twin (s' = n - s, v flipped) must be refused
    const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const s = BigInt("0x" + sig.slice(66, 130));
    const v = parseInt(sig.slice(130), 16);
    const twin = sig.slice(0, 66) + (n - s).toString(16).padStart(64, "0") + (v === 27 ? "1c" : "1b");
    expect(() => recoverRootSigner(f, twin)).toThrow(/out of range/);
  });

  it("keccakUtf8 gives the ABI selector of issuerState(address)", () => {
    expect(keccakUtf8("transfer(address,uint256)").slice(0, 10)).toBe("0xa9059cbb");
    expect(keccakUtf8("issuerState(address)").slice(0, 10)).toMatch(/^0x[0-9a-f]{8}$/);
  });
});

describe("QR payload (SPEC §3.4)", () => {
  it("the committed vector is 427 bytes / 641 Base45 chars and decodes to its fields", () => {
    expect(qrVec.payloadBytes).toBe(QR_BYTES);
    expect(qrVec.base45.length).toBe(QR_BASE45_CHARS);
    const p = qrDecode(qrVec.base45);
    expect(p.zoneClass).toBe(qrVec.zoneClass);
    expect(p.epochId).toBe(qrVec.epochId);
    expect(p.nullifier.toString()).toBe(qrVec.nullifier);
    expect(p.proof).toEqual(qrVec.proof);
    expect(p.root).toBe(qrVec.signedRoot.fields.root.toLowerCase());
    expect(p.issuer).toBe(qrVec.signedRoot.fields.issuer.toLowerCase());
    expect(p.signature).toBe(qrVec.signedRoot.signature.toLowerCase());
    expect(qrPublicSignals(p)).toEqual(case0.publicSignals);
    expect(recoverRootSigner({ ...qrVec.signedRoot.fields, ...p, chainId: qrVec.signedRoot.fields.chainId, registry: qrVec.signedRoot.fields.registry }, p.signature)).toBe(
      qrVec.signedRoot.signer.toLowerCase(),
    );
  });

  it("encode(decode(x)) == x, and the layout offsets match the SPEC table", () => {
    const bytes = base45Decode(qrVec.base45);
    expect(bytesToHex(encodeQrPayload(decodeQrPayload(bytes)))).toBe(qrVec.payloadHex);
    expect(bytes[0]).toBe(1); // version
    expect(bytes[1]).toBe(qrVec.zoneClass);
    expect(bytesToHex(bytes.subarray(2, 6))).toBe(bytesToHex(uintBytes(qrVec.epochId, 4)));
    expect(bytesToHex(bytes.subarray(6, 38))).toBe(bytesToHex(uintBytes(BigInt(qrVec.nullifier), 32)));
    // B is EIP-197 order: x.c1 first (snarkjs pi_b[0][1])
    expect(bytesToHex(bytes.subarray(102, 134))).toBe(bytesToHex(uintBytes(BigInt(qrVec.proof.pi_b[0][1]), 32)));
    expect(bytesToHex(bytes.subarray(294, 314))).toBe(qrVec.signedRoot.fields.issuer.toLowerCase());
    expect(bytesToHex(bytes.subarray(362, 427))).toBe(qrVec.signedRoot.signature.toLowerCase());
  });

  it("rejects a wrong length or version", () => {
    const bytes = base45Decode(qrVec.base45);
    expect(() => decodeQrPayload(bytes.subarray(0, 426))).toThrow();
    const v2 = Uint8Array.from(bytes);
    v2[0] = 2;
    expect(() => decodeQrPayload(v2)).toThrow(/version/);
  });

  it("a fresh encode of the same fields is byte-identical (deterministic parts)", () => {
    expect(qrEncode(qrDecode(qrVec.base45))).toBe(qrVec.base45);
  });
});

describe("Arkiv rebuild (moved from the issuer; shared with the phone)", () => {
  it("decodeLeaves reads 32-byte big-endian words and refuses ragged input", () => {
    expect(decodeLeaves("0x" + "00".repeat(31) + "05" + "00".repeat(31) + "07")).toEqual([5n, 7n]);
    expect(() => decodeLeaves("0x0102")).toThrow();
  });

  it("gaps are 0, revocations above revSeq are ignored, overlaps and leaves >= r reject", () => {
    const b = [{ batchNo: 0, fromIndex: 1, leaves: [5n, 6n] }];
    expect(rebuildFromArkiv(3, 0, b, []).leaves).toEqual([0n, 5n, 6n]);
    expect(rebuildFromArkiv(3, 0, b, [{ seq: 1, fromIndex: 1, count: 1 }]).leaves).toEqual([0n, 5n, 6n]);
    expect(rebuildFromArkiv(3, 1, b, [{ seq: 1, fromIndex: 1, count: 1 }]).leaves).toEqual([0n, 0n, 6n]);
    expect(() => rebuildFromArkiv(3, 0, [...b, { batchNo: 1, fromIndex: 2, leaves: [9n] }], [])).toThrow(/overlapping/);
    expect(() => rebuildFromArkiv(1, 0, [{ batchNo: 0, fromIndex: 0, leaves: [FIELD_R] }], [])).toThrow(/>= r/);
  });
});
