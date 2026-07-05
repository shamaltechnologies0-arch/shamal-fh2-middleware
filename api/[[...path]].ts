import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getApp } from "../dist/bootstrap.js";

/** Map /api and /api/* to Fastify root routes (e.g. /api/health → /health). */
function normalizeRequestUrl(req: VercelRequest): void {
  const url = req.url ?? "/";
  const q = url.indexOf("?");
  const path = q === -1 ? url : url.slice(0, q);
  const query = q === -1 ? "" : url.slice(q);

  if (path === "/api" || path === "/api/") {
    req.url = `/${query}`;
    return;
  }
  if (path.startsWith("/api/")) {
    req.url = `${path.slice("/api".length)}${query}`;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  normalizeRequestUrl(req);
  const app = await getApp();
  app.server.emit("request", req, res);
}
