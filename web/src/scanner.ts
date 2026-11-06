/**
 * The browser TC scanner: sync once (online), then every check is offline (SPEC §5). A counter wraps fetch and
 * XMLHttpRequest for the whole duration of each check, so the page can show how many network requests the check made.
 */
import { CONFIG, agreedIssuerState, verifyKey } from "./chain.ts";
import { MemoryStore, verify, type Result } from "./verifier.ts";

declare const snarkjs: { groth16: { verify(vk: object, signals: string[], proof: object): Promise<boolean> } };

let requests = 0;
let counting = false;
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((...a: Parameters<typeof fetch>) => {
  if (counting) requests++;
  return realFetch(...a);
}) as typeof fetch;
if (typeof XMLHttpRequest !== "undefined") {
  const realOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...a: any[]) {
    if (counting) requests++;
    return (realOpen as any).apply(this, a);
  } as typeof XMLHttpRequest.prototype.open;
}

export type Check = { result: Result; ms: number; requests: number };

export class Scanner {
  readonly store = new MemoryStore(CONFIG.chainId, CONFIG.registry, 0, null, null);
  private clockOffsetMs = 0;
  synced = false;

  now(): number {
    return Date.now() + this.clockOffsetMs;
  }

  /** Online sync: Registry state from two agreeing providers, the pinned vk from Arkiv, the clock from the block. */
  async sync(): Promise<void> {
    const [{ state, blockTimeMs }, vk] = await Promise.all([agreedIssuerState(), verifyKey()]);
    if (!vk) throw new Error("the verification key on Arkiv does not match the pinned hash");
    const drift = blockTimeMs - Date.now();
    this.clockOffsetMs = Math.abs(drift) > 60_000 ? drift : 0; // block time lags ~12 s: only fix a real drift
    // Rollback guards (SPEC §5, as on the Android scanner): a floor never decreases, a suspension is sticky and the
    // latest rootId never goes back, whatever a later sync returns. The demo trusts its one deployed issuer
    // (CONFIG.issuer) instead of looping over Registry.issuers().
    const key = CONFIG.issuer.toLowerCase();
    const prev = this.store.issuers.get(key);
    this.store.issuers.set(key, {
      active: state.active && (prev?.active ?? true),
      floor: prev && prev.floor > state.floor ? prev.floor : state.floor,
      latestRootId: prev?.latestRootId && prev.latestRootId > state.latestRootId ? prev.latestRootId : state.latestRootId,
    });
    this.store.vkJson = vk;
    this.store.lastSync = this.now();
    this.synced = true;
  }

  /** One offline check of a decoded QR text. */
  async check(text: string): Promise<Check> {
    requests = 0;
    counting = true;
    const t0 = performance.now();
    try {
      const result = await verify(text, this.now(), this.store, (vk, s, p) => snarkjs.groth16.verify(vk, s, p));
      return { result, ms: Math.round(performance.now() - t0), requests };
    } finally {
      counting = false;
    }
  }
}

/** Plain words for the TC (the Android app's ResultText.title, unchanged). */
export function title(reason: Result["reason"]): string {
  return ({
    OK: "Valid pass",
    SEEN_BEFORE: "Shown twice — check",
    ROOT_NEAR_EXPIRY: "Valid — pass needs an update soon",
    SCANNER_UNSYNCED: "Valid — scanner not synced for 24 h",
    DUPLICATE: "Already used — shown 3+ times",
    MALFORMED: "Not a BombayLocal pass",
    WRONG_EPOCH: "Old code — ask to reopen the pass",
    SCANNER_STALE: "Scanner out of date — sync now",
    ISSUER_INACTIVE: "Issuer not recognised",
    BAD_SIGNATURE: "Invalid pass",
    BELOW_FLOOR: "Pass withdrawn — needs an update",
    BAD_ROOT_TTL: "Invalid pass",
    ROOT_EXPIRED: "Expired — pass needs an update",
    BAD_PROOF: "Invalid pass",
    WRONG_CLASS: "Wrong class for this checkpoint",
    VERIFIER_ERROR: "Couldn't check — scan again",
  } as const)[reason];
}
