import type { IssuerDb } from "./db.ts";

/**
 * Auto-publish after a purchase: a new pass can only be shown once a root that contains its leaf is on-chain, so the
 * issuer publishes on its own shortly after a purchase instead of waiting for the 6 h heartbeat or an admin call.
 *
 * Purchases arriving close together share one root: the first purchase arms a single timer, later ones ride on it.
 * The Registry allows one root per issuer per minRootInterval (60 s in the demo deployment, 15 min planned for
 * production), so the timer never fires before that interval has passed.
 *
 * Privacy cost (SPEC §8, "Anonymity set of a root"): at low traffic the root published right after a purchase is held
 * only by the buyer until other phones refresh, so it narrows who the buyer is. Production should publish on a fixed
 * ROOT_INTERVAL cadence instead, so that a root follows the clock rather than a purchase.
 */
export const AUTO_PUBLISH_DELAY = 30;

/** Retries after a failed auto-publish (RPC hiccup, interval not yet passed). The heartbeat remains the backstop. */
export const AUTO_PUBLISH_RETRIES = 3;

/** Seconds to wait before auto-publishing: at least AUTO_PUBLISH_DELAY, and past the on-chain interval (+2 s slack). */
export function autoPublishDelay(nowSec: number, lastIssuedAt: number | undefined, minRootInterval: number): number {
  const untilAllowed = lastIssuedAt === undefined ? 0 : lastIssuedAt + minRootInterval + 2 - nowSec;
  return Math.max(AUTO_PUBLISH_DELAY, untilAllowed);
}

/** True when some purchased leaf is not yet covered by the latest root (so a publish would change something). */
export function hasUnpublishedLeaves(db: IssuerDb): boolean {
  return db.allLeaves().length > (db.latestRoot()?.leafCount ?? 0);
}
