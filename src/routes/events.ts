import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { listWebhookEvents } from "../db/index.js";
import { registerViewerGetBare, registerViewerPostBare } from "./viewerPaths.js";

const eventsQuerySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
});
const ackedEventIds = new Set<string>();

export const eventRoutes: FastifyPluginAsync = async (app) => {
  registerViewerGetBare(
    app,
    "/v1/events",
    async (request, reply) => {
      const parsed = eventsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "validation_error", details: parsed.error.flatten() });
      }

      const rows = await listWebhookEvents(parsed.data.since, parsed.data.limit);
      return reply.send({
        data: rows.map((row) => ({
          id: row.id,
          type: row.event_type,
          source: row.source,
          payload: row.payload,
          receivedAt: row.received_at.toISOString(),
          acknowledged: ackedEventIds.has(row.id),
        })),
        meta: { count: rows.length },
      });
    },
    {
      schema: {
        summary: "Webhook event feed",
        tags: ["Events"],
      },
    },
  );

  registerViewerPostBare(
    app,
    "/v1/events/:id/ack",
    async (request, reply) => {
      ackedEventIds.add((request.params as { id: string }).id);
      return reply.send({
        data: { id: (request.params as { id: string }).id, acknowledged: true },
        meta: { source: "shamal-middleware" },
      });
    },
    {
      schema: {
        summary: "Acknowledge an event (operator/admin)",
        tags: ["Events"],
      },
    },
  );
};
