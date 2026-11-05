import { pino } from "pino";

/**
 * Logger that structurally cannot leak identifying values (invariant 1). Even if a caller slips an idCommitment,
 * leaf, leafIndex, nullifier or secret into a log object, pino redaction censors it. Log lines should carry only
 * counts, rootIds, product names and reason codes.
 */
export const REDACT_PATHS = [
  "idCommitment",
  "leaf",
  "leafIndex",
  "nullifier",
  "secret",
  "*.idCommitment",
  "*.leaf",
  "*.leafIndex",
  "*.nullifier",
  "*.secret",
  "req.body.idCommitment",
  "req.body.secret",
];

export function makeLogger(stream?: NodeJS.WritableStream) {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    },
    stream as never,
  );
}

export type Logger = ReturnType<typeof makeLogger>;
