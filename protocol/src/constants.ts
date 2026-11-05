// SPEC v0.3 §9 parameters. Times are in seconds unless noted.

/** BN254 scalar field modulus r. Every circuit signal and every Poseidon input/output is < R. */
export const FIELD_R =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const MAX_DEPTH = 20;
export const EPOCH = 600;
export const SKEW = 120;
export const DEBOUNCE_GAP = 1;
export const PREPROVE = 12;
export const ROOT_TTL = 36 * 3600;
export const ROOT_INTERVAL_PRODUCTION = 15 * 60;
export const ROOT_INTERVAL_DEMO = 60;
export const EXPIRY_WARN = 2 * 3600;
export const STALE_WARN = 24 * 3600;
export const STALE_MAX = 48 * 3600;
export const DAY_OFFSET = 19_800; // IST, UTC+5:30
export const DAY_SECONDS = 86_400;
export const QR_BYTES = 427;
export const QR_BASE45_CHARS = 641;
export const LEAF_BATCH_MAX = 2_000;
export const MAX_PASS_DAYS = 90;
export const ROOT_HEARTBEAT = 6 * 3600;
export const ARKIV_BLOCK_TIME = 2;

/** Fare classes (SPEC §3.1). Only these three values are valid; the circuit enforces it. */
export const ZONE_CLASS = { SECOND: 0, FIRST: 1, AC: 2 } as const;
export type ZoneClass = (typeof ZONE_CLASS)[keyof typeof ZONE_CLASS];

/** Secrets are 248 random bits, so they always fit in the field (SPEC §3.1). */
export const SECRET_BITS = 248;
