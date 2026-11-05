// fixtures/vectors.json is what the Kotlin apps test against, so it must never drift from protocol/ or the
// committed artifacts. Recompute every value and re-verify every proof.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FIELD_R,
  buildTree,
  day,
  dayOfEpoch,
  epochId,
  hash1,
  hash2,
  hash3,
  idCommitment,
  merkleProof,
  nullifier,
  passLeaf,
} from "@unlink/protocol";
import { verify } from "./helpers.ts";

const V = JSON.parse(readFileSync("../fixtures/vectors.json", "utf8"));
const B = (x: string | number) => BigInt(x);
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

describe("fixtures/vectors.json", () => {
  it("was generated against the committed artifacts", () => {
    expect(V.meta.fieldR).toBe(FIELD_R.toString());
    for (const [name, hash] of Object.entries(V.meta.artifactsSha256)) expect(sha256(`artifacts/${name}`), name).toBe(hash);
  });

  it("poseidon vectors match protocol/", () => {
    for (const v of V.poseidon.poseidon1) expect(hash1(B(v.in[0])).toString()).toBe(v.out);
    for (const v of V.poseidon.poseidon2) expect(hash2(B(v.in[0]), B(v.in[1])).toString()).toBe(v.out);
    for (const v of V.poseidon.poseidon3) expect(hash3(B(v.in[0]), B(v.in[1]), B(v.in[2])).toString()).toBe(v.out);
  });

  it("time vectors match protocol/", () => {
    for (const t of V.time) {
      expect(day(t.unixSeconds)).toBe(t.day);
      expect(epochId(t.unixSeconds)).toBe(t.epochId);
      expect(dayOfEpoch(t.epochId)).toBe(t.dayOfEpoch);
    }
  });

  for (const [i, c] of (V.cases as any[]).entries()) {
    it(`case ${i}: ${c.name}`, async () => {
      const secret = B(c.secret);
      expect(idCommitment(secret).toString()).toBe(c.idCommitment);
      expect(passLeaf(idCommitment(secret), c.validUntilDay, c.zoneClass).toString()).toBe(c.leaf);
      expect(c.leaves[c.leafIndex]).toBe(c.leaf);
      const tree = buildTree(c.leaves.map(B));
      expect(tree.root.toString()).toBe(c.root);
      const p = merkleProof(tree, c.leafIndex);
      expect(p.depth).toBe(c.depth);
      expect(p.pathIndex).toBe(c.pathIndex);
      expect(p.siblings.map(String)).toEqual(c.siblings);
      expect(dayOfEpoch(c.epochId)).toBe(c.currentDay);
      expect(nullifier(secret, c.epochId).toString()).toBe(c.nullifier);
      expect(c.publicSignals).toEqual([c.root, c.nullifier, String(c.epochId), String(c.currentDay), String(c.zoneClass)]);
      expect(await verify(c.publicSignals, c.proof)).toBe(true);
    });
  }
});
