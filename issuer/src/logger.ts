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
      // Fastify's error handler logs `req`/`res` on failures. Keep only method + path: the default serializer would
      // add the client address, port and headers (incl. x-admin-token), which must never reach a log (invariant 1).
      serializers: {
        req: (r: { method?: string; url?: string; routeOptions?: { url?: string } }) => ({ method: r.method, path: r.routeOptions?.url ?? r.url?.split("?")[0] }),
        res: (r: { statusCode?: number }) => ({ statusCode: r.statusCode }),
      },
    },
    stream as never,
  );
}

export type Logger = ReturnType<typeof makeLogger>;
