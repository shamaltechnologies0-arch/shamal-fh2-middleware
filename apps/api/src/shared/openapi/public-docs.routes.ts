import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  buildPublicOpenApiDocument,
  type OpenApiDocument,
} from "./openapi-documents.service.js";

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};

function resolveDocsRoot(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../../assets/docs"),
    join(process.cwd(), "apps/api/src/assets/docs"),
    join(process.cwd(), "dist/apps/api/src/assets/docs"),
  ];
  return candidates.find((dir) => existsSync(join(dir, "index.html"))) ?? null;
}

export async function registerPublicDocs(app: FastifyInstance): Promise<void> {
  const docsRoot = resolveDocsRoot();
  if (!docsRoot) {
    throw new Error("Public API docs assets were not found under apps/api/src/assets/docs");
  }

  const sendIndex = async (_request: FastifyRequest, reply: FastifyReply) => {
    reply
      .type("text/html; charset=utf-8")
      .header("cache-control", "no-store")
      .send(readFileSync(join(docsRoot, "index.html"), "utf-8"));
  };

  const hidden = { schema: { hide: true } };

  app.get("/docs", hidden, sendIndex);
  app.get("/docs/", hidden, sendIndex);

  app.get("/api", hidden, async (_request, reply) => reply.redirect("/docs"));
  app.get("/api/", hidden, async (_request, reply) => reply.redirect("/docs"));

  app.get("/docs/json", hidden, async () =>
    buildPublicOpenApiDocument(app.swagger() as OpenApiDocument),
  );

  app.get(
    "/docs/assets/:file",
    hidden,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const file = (request.params as { file?: string }).file ?? "";
      if (!/^(docs\.css|docs\.js)$/.test(file)) {
        return reply.status(404).send({ error: "not_found" });
      }
      const fullPath = join(docsRoot, file);
      if (!existsSync(fullPath)) {
        return reply.status(404).send({ error: "not_found" });
      }
      reply
        .type(MIME[extname(fullPath)] || "application/octet-stream")
        .header("cache-control", "public, max-age=60")
        .send(readFileSync(fullPath));
    },
  );
}
