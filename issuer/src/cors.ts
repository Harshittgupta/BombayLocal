import type { FastifyReply, FastifyRequest } from "fastify";

/** The only routes a browser page may call cross-origin: buying a pass and the health check. */
const CORS_PATHS = new Set(["/purchase", "/health"]);

/**
 * CORS for the live demo page (web/). A browser on an allowed origin may call POST /purchase and GET /health; every
 * other origin, and every other route (admin, scan batches), gets no CORS headers, so browsers block those reads.
 * Preflight (OPTIONS) is answered here with 204.
 */
export function corsHook(origins: readonly string[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const origin = req.headers.origin;
    const path = req.url.split("?")[0]!;
    if (typeof origin !== "string" || !origins.includes(origin) || !CORS_PATHS.has(path)) return;
    reply.header("access-control-allow-origin", origin).header("vary", "origin");
    if (req.method === "OPTIONS") {
      await reply
        .header("access-control-allow-methods", "GET, POST")
        .header("access-control-allow-headers", "content-type")
        .header("access-control-max-age", "600")
        .code(204)
        .send();
    }
  };
}
