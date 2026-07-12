import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyPluginAsync } from "fastify";

const routesDir = dirname(fileURLToPath(import.meta.url));
const uiRoot = join(routesDir, "../../../../assets/ui");
const webPublicRoot = join(routesDir, "../../../../../web/public");
const spaIndexPath = join(uiRoot, "dist/index.html");
const legacyHtmlPath = join(uiRoot, "command-center.html");
const loginBgPath = join(routesDir, "../../../../assets/bg-image/bg-main.png");
const logoPath = join(routesDir, "../../../../assets/logo/logo-white.svg");

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function resolveUiFile(urlPath: string): string | null {
  const safe = urlPath.replace(/^\/+/, "");
  if (!safe || safe.includes("..")) return null;
  const distCandidate = join(uiRoot, "dist", safe);
  if (existsSync(distCandidate) && statSync(distCandidate).isFile()) return distCandidate;
  const publicCandidate = join(uiRoot, "dist", safe);
  if (existsSync(publicCandidate) && statSync(publicCandidate).isFile()) return publicCandidate;
  return null;
}

export const commandCenterRoutes: FastifyPluginAsync = async (app) => {
  const servePlatform = async (
    _request: unknown,
    reply: { type: (t: string) => { send: (b: string) => void } },
  ) => {
    const indexPath = existsSync(spaIndexPath) ? spaIndexPath : legacyHtmlPath;
    const platformHtml = readFileSync(indexPath, "utf-8");
    reply.type("text/html").send(platformHtml);
  };

  app.get(
    "/",
    {
      schema: {
        summary: "Shamal Platform UI",
        description:
          "Web platform for fleet, live camera, operations, events, and mission history.",
        tags: ["UI"],
        security: [],
      },
    },
    servePlatform,
  );

  app.get("/platform", { schema: { hide: true } }, async (_request, reply) => {
    return reply.redirect("/");
  });

  app.get("/command-center", { schema: { hide: true } }, async (_request, reply) => {
    return reply.redirect("/");
  });

  app.get("/settings", { schema: { hide: true } }, servePlatform);

  app.get("/admin", { schema: { hide: true } }, servePlatform);

  app.get("/bg-image/bg-main.png", { schema: { hide: true } }, async (_request, reply) => {
    reply.type("image/png").send(readFileSync(loginBgPath));
  });

  app.get("/logo/logo-white.svg", { schema: { hide: true } }, async (_request, reply) => {
    reply.type("image/svg+xml").send(readFileSync(logoPath));
  });

  app.get("/portal-legacy.js", { schema: { hide: true } }, async (_request, reply) => {
    const devLegacyJs = join(webPublicRoot, "portal-legacy.js");
    const legacyJs =
      process.env.NODE_ENV === "development" && existsSync(devLegacyJs)
        ? devLegacyJs
        : resolveUiFile("portal-legacy.js");
    if (!legacyJs) {
      return reply.status(404).send({ error: "portal-legacy.js not found" });
    }
    reply.type("application/javascript").send(readFileSync(legacyJs, "utf-8"));
  });

  app.get("/assets/*", { schema: { hide: true } }, async (request, reply) => {
    const url = (request as { url: string }).url.split("?")[0] ?? "";
    const filePath = resolveUiFile(url);
    if (!filePath) return reply.status(404).send({ error: "Not found" });
    const ext = extname(filePath);
    reply.type(MIME[ext] || "application/octet-stream").send(readFileSync(filePath));
  });

  for (const staticFile of ["favicon.svg", "icons.svg"]) {
    app.get(`/${staticFile}`, { schema: { hide: true } }, async (_request, reply) => {
      const filePath = resolveUiFile(staticFile);
      if (!filePath) return reply.status(404).send({ error: "Not found" });
      reply.type(MIME[extname(filePath)]).send(readFileSync(filePath));
    });
  }
};
