/**
 * The browser passenger: the same steps as the Android app (SPEC §3.1 purchase + refresh, §6 proving), run in this tab.
 * The secret is created here and lives only in this object's memory: it is never stored, sent or logged. Only
 * idCommitment = Poseidon(secret) goes to the issuer, exactly as on the phone.
 */
import {
  EPOCH, ROOT_TTL, buildCircuitInput, decodeLeaves, epochId as epochOf, idCommitment, merkleProof, passLeaf, qrEncode,
  randomSecret, rebuildFromArkiv, recoverRootSigner,
} from "@unlink/protocol";
import { CONFIG, issuerState, leafBatches, purchase, revocations, signedRoots, type SignedRootRow } from "./chain.ts";

declare const snarkjs: {
  groth16: {
    fullProve(input: object, wasm: string, zkey: string): Promise<{ proof: any; publicSignals: string[] }>;
    verify(vk: object, signals: string[], proof: object): Promise<boolean>;
  };
};

export type Pass = { product: string; leafIndex: number; validUntilDay: number; zoneClass: number; leaf: bigint };
export type Step = { id: "bought" | "root" | "rebuilt" | "proved"; text: string; done: boolean; link?: string };

export class Passenger {
  private secret: bigint | null = null;
  pass: Pass | null = null;
  root: SignedRootRow | null = null;
  private path: { depth: number; pathIndex: number; siblings: bigint[]; root: bigint } | null = null;
  /** The current code: Base45 QR text for `epoch`. */
  qr: { epoch: number; text: string; proveMs: number } | null = null;

  constructor(private readonly onStep: (s: Step) => void, private readonly log: (line: string) => void) {}

  /** Buy (simulated payment), then wait for the issuer's auto-published root that covers the new pass. */
  async buy(product: string): Promise<void> {
    this.secret = randomSecret();
    const idc = idCommitment(this.secret);
    const before = (await issuerState()).latestRootId;
    const r = await purchase(idc.toString(), product);
    if (![0, 1, 2].includes(r.zoneClass)) throw new Error("unexpected class from the issuer");
    this.pass = { product, leafIndex: r.leafIndex, validUntilDay: r.validUntilDay, zoneClass: r.zoneClass, leaf: passLeaf(idc, r.validUntilDay, r.zoneClass) };
    this.onStep({ id: "bought", text: "The issuer added your pass (it only saw a one-way hash of your secret)", done: true });
    this.log(`Bought: the issuer saw only idCommitment, not the secret.`);
    await this.waitForRoot(before);
  }

  /** Polls the Registry until a root newer than `before` covers our leaf, and its SignedRoot is on Arkiv. */
  private async waitForRoot(before: bigint): Promise<void> {
    this.onStep({ id: "root", text: "Waiting for the issuer to publish a new root on Ethereum (about a minute)", done: false });
    const deadline = Date.now() + 6 * 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5_000));
      const s = await issuerState().catch(() => null);
      if (!s || s.latestRootId <= before) continue;
      const rows = await signedRoots(s.latestRootId).catch(() => []);
      const distinct = new Map(rows.map((r) => [JSON.stringify(r), r]));
      if (distinct.size > 1) throw new Error("two different signed roots for one rootId: refusing (SPEC §8, tagging)");
      const sr = rows[0];
      if (!sr || sr.leafCount <= this.pass!.leafIndex) continue;
      this.onStep({ id: "root", text: `Root #${sr.rootId} posted on Ethereum Sepolia`, done: true, link: /^0x[0-9a-fA-F]{64}$/.test(sr.txHash) ? `https://sepolia.etherscan.io/tx/${sr.txHash}` : undefined });
      await this.refresh();
      return;
    }
    throw new Error("The issuer has not published a root yet. Try Refresh in a minute.");
  }

  /** SPEC §3.1 refresh: the issuer's latest on-chain root, its SignedRoot from Arkiv, rebuilt and checked here. */
  async refresh(): Promise<void> {
    const pass = this.pass!;
    const s = await issuerState();
    if (!s.active) throw new Error("issuer is not active");
    if (s.latestRootId < s.floor) throw new Error("latest root is below the issuer's floor");
    const rows = await signedRoots(s.latestRootId);
    if (new Set(rows.map((r) => JSON.stringify(r))).size !== 1) throw new Error("no single signed root on Arkiv for the latest rootId");
    const sr = rows[0]!;
    const fields = { chainId: sr.chainId, registry: sr.registry, issuer: sr.issuer, rootId: sr.rootId, root: sr.root, issuedAt: sr.issuedAt, expiresAt: sr.expiresAt };
    if (sr.chainId !== CONFIG.chainId || sr.registry.toLowerCase() !== CONFIG.registry.toLowerCase()) throw new Error("signed root is for another deployment");
    if (recoverRootSigner(fields, sr.signature) !== CONFIG.issuer.toLowerCase()) throw new Error("signature does not recover to the issuer");
    if (sr.root.toLowerCase() !== s.latestRoot.toLowerCase() || sr.issuedAt !== s.latestPostedAt) throw new Error("signed root differs from the chain");
    if (sr.expiresAt !== sr.issuedAt + ROOT_TTL) throw new Error("wrong root lifetime");

    const [batches, revs] = await Promise.all([leafBatches(), revocations()]);
    const tree = rebuildFromArkiv(
      sr.leafCount, sr.revSeq,
      batches.map((b) => ({ batchNo: b.batchNo, fromIndex: b.fromIndex, leaves: decodeLeaves(b.leavesHex) })),
      revs,
    );
    if (tree.root !== BigInt(sr.root)) throw new Error("the list rebuilt from Arkiv does not match the signed root");
    if (pass.leafIndex >= sr.leafCount) throw new Error("pass not in this root yet");
    if (tree.leaves[pass.leafIndex] !== pass.leaf) throw new Error(tree.leaves[pass.leafIndex] === 0n ? "pass revoked" : "pass mismatch");
    const p = merkleProof(tree, pass.leafIndex);
    this.root = sr;
    this.path = { depth: p.depth, pathIndex: p.pathIndex, siblings: p.siblings, root: p.root };
    this.onStep({ id: "rebuilt", text: `Rebuilt the list of ${sr.leafCount} passes from Arkiv; it matches Ethereum`, done: true });
    this.log(`Refreshed from public data: Arkiv (${Number(batches.length)} batches) + one Ethereum call. The issuer was not contacted.`);
  }

  /** Proves the current epoch (SPEC §6) and returns the Base45 QR text. Never proves a past epoch. */
  async proveNow(): Promise<string> {
    const pass = this.pass!, sr = this.root!, path = this.path!;
    const epoch = epochOf(Math.floor(Date.now() / 1000));
    if (this.qr?.epoch === epoch) return this.qr.text;
    const t0 = performance.now();
    const input = buildCircuitInput({
      secret: this.secret!, validUntilDay: pass.validUntilDay, zoneClass: pass.zoneClass, epochId: epoch,
      proof: { root: BigInt(sr.root), leaf: pass.leaf, depth: path.depth, pathIndex: path.pathIndex, siblings: path.siblings },
    });
    const out = await snarkjs.groth16.fullProve(input, "zk/pass.wasm", "zk/pass_final.zkey");
    const text = qrEncode({
      zoneClass: pass.zoneClass, epochId: epoch, nullifier: BigInt(out.publicSignals[1]!), proof: out.proof,
      issuer: sr.issuer, rootId: sr.rootId, root: sr.root, issuedAt: sr.issuedAt, expiresAt: sr.expiresAt, signature: sr.signature,
    });
    this.qr = { epoch, text, proveMs: Math.round(performance.now() - t0) };
    this.onStep({ id: "proved", text: `Made a zero-knowledge proof in this browser (${(this.qr.proveMs / 1000).toFixed(1)} s)`, done: true });
    return text;
  }

  /** Seconds until the current code's epoch ends. */
  static secondsLeft(): number {
    const now = Math.floor(Date.now() / 1000);
    return (Math.floor(now / EPOCH) + 1) * EPOCH - now;
  }
}
