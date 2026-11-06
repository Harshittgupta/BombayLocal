/**
 * Abuse limit for the public POST /purchase, keyed by req.ip (the hosted issuer is on the open internet and purchases are simulated, so
 * anyone could otherwise mint passes in a loop: each one is a leaf for life in a 2^20 tree, and triggers an
 * auto-publish that spends Sepolia gas and Arkiv writes).
 *
 * Privacy (invariant 1): the client address is held only in memory, only as long as its window lasts (at most one
 * hour), and is never logged or written anywhere. A restart forgets everything. On the hosted VM, Caddy is the only
 * trusted proxy (ISSUER_TRUST_PROXY=127.0.0.1), so req.ip is the client from its X-Forwarded-For header.
 */
export class PurchaseLimiter {
  private readonly perClient = new Map<string, number[]>();
  private global: number[] = [];

  constructor(
    private readonly perClientMax = 10, // per client per hour: plenty for a demo, too few for a loop
    private readonly globalMax = 300, // all clients per day
  ) {}

  /** Records the attempt and returns true if it is allowed. */
  allow(client: string, nowMs: number = Date.now()): boolean {
    const hourAgo = nowMs - 3_600_000;
    const dayAgo = nowMs - 86_400_000;
    this.global = this.global.filter((t) => t > dayAgo);
    for (const [k, ts] of this.perClient) {
      const live = ts.filter((t) => t > hourAgo);
      if (live.length === 0) this.perClient.delete(k);
      else this.perClient.set(k, live);
    }
    const mine = this.perClient.get(client) ?? [];
    if (mine.length >= this.perClientMax || this.global.length >= this.globalMax) return false;
    mine.push(nowMs);
    this.perClient.set(client, mine);
    this.global.push(nowMs);
    return true;
  }

  /** Number of client addresses currently held (for the test that they are forgotten). */
  get clientsHeld(): number {
    return this.perClient.size;
  }
}

