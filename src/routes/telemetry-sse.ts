import type { FastifyPluginAsync } from "fastify";
import { config } from "../config.js";
import { createFh2Client } from "../fh2/client.js";
import { resolveTelemetry } from "../services/telemetryStore.js";
import { registerViewerGet } from "./viewerPaths.js";

export const telemetrySseRoutes: FastifyPluginAsync = async (app) => {
  const fh2 = createFh2Client();

  registerViewerGet(
    app,
    "/v1/marafiq/devices/:sn/telemetry/stream",
    {
      schema: {
        summary: "Telemetry stream (SSE) — CAFM substitute for MQTT polling",
        description:
          "Server-Sent Events: pushes telemetry snapshots every TELEMETRY_SSE_INTERVAL_MS (default 10s). Marafiq can subscribe instead of polling /telemetry/latest.",
        tags: ["Telemetry"],
      },
    },
    async (request, reply) => {
      const { sn } = request.params as { sn: string };

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const send = async () => {
        try {
          const result = await resolveTelemetry(sn, () => fh2.getDeviceState(sn));
          reply.raw.write(
            `event: telemetry\ndata: ${JSON.stringify({ ...result.data, freshness: result.freshness })}\n\n`,
          );
        } catch (err) {
          reply.raw.write(
            `event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`,
          );
        }
      };

      await send();
      const interval = setInterval(send, config.TELEMETRY_SSE_INTERVAL_MS);

      request.raw.on("close", () => {
        clearInterval(interval);
      });
    },
  );
};
