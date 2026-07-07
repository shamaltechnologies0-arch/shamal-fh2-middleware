import type { FastifyPluginAsync } from "fastify";
import { config } from "../config.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/health",
    {
      schema: {
        publicDocs: true,
        summary: "Service health",
        tags: ["System"],
        security: [],
      },
    },
    async () => ({
    status: "ok",
    service: "shamal-fh2-middleware",
    fh2Mode: config.FH2_MODE,
    fh2LiveReady: config.fh2LiveReady,
    timestamp: new Date().toISOString(),
  }),
  );
};
