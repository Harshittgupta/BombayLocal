// SIMULATED PAYMENT. This is the ONLY mock in the whole system (SPEC R5): no real money changes hands.
// A production issuer would take payment here before building the leaf. Everything else — the tree, the
// on-chain root, the Arkiv writes, the proofs — is real.
import { assertField, day, passLeaf, MAX_PASS_DAYS } from "@unlink/protocol";
import type { IssuerDb } from "./db.ts";
import type { Product } from "./config.ts";

export type PurchaseResult = { leafIndex: number; validUntilDay: number; zoneClass: number };

/**
 * Build a pass leaf from the product the passenger paid for and append it to the tree. The phone sends only
 * `idCommitment = Poseidon1(secret)`; the issuer sets validUntilDay and zoneClass (SPEC §3.1), so the phone
 * can't choose its own expiry or class.
 */
export function purchase(
  db: IssuerDb,
  products: Record<string, Product>,
  idCommitment: bigint,
  productName: string,
  now = Math.floor(Date.now() / 1000),
): PurchaseResult {
  assertField(idCommitment, "idCommitment"); // must be < field modulus r
  const product = products[productName];
  if (!product) throw new Error(`unknown product ${productName}`);

  const validUntilDay = day(now) + product.durationDays - 1; // inclusive last valid day
  if (validUntilDay - day(now) + 1 > MAX_PASS_DAYS) throw new Error("pass exceeds MAX_PASS_DAYS");

  const leaf = passLeaf(idCommitment, validUntilDay, product.zoneClass);
  const leafIndex = db.appendLeaf(productName, leaf.toString(), validUntilDay);
  return { leafIndex, validUntilDay, zoneClass: product.zoneClass };
}
