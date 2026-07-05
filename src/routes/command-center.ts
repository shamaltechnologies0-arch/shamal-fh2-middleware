import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyPluginAsync } from "fastify";

const uiPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../ui/command-center.html",
);

export const commandCenterRoutes: FastifyPluginAsync = async (app) => {
  const servePlatform = async (
    _request: unknown,
    reply: { type: (t: string) => { send: (b: string) => void } },
  ) => {
    const platformHtml = readFileSync(uiPath, "utf-8");
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

  app.get("/settings", { schema: { hide: true } }, async (_request, reply) => {
    return reply.redirect("/?tab=settings");
  });
};
