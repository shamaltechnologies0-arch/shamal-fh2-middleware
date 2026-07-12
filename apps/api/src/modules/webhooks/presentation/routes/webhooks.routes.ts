import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { config } from "../../../../config/env.js";
import { insertWebhookEvent, mapFh2PayloadToEventType } from "../../../../infrastructure/database/index.js";
import { notifyViewerEventCallback } from "../../../events/application/viewer-event-notify.service.js";
import { ingestEventPayload } from "../../../devices/application/telemetry-store.service.js";

function verifyWebhookSecret(
  payload: string,
  signature: string | undefined,
): boolean {
  if (!signature && config.NODE_ENV === "development") {
    return true;
  }
  if (!signature) {
    return false;
  }
  const expected = createHmac("sha256", config.WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/webhooks/fh2",
    {
      config: { rawBody: true },
      schema: {
        publicDocs: true,
        summary: "FlightHub 2 webhook ingress (Shamal-operated callback)",
        description:
          "Inbound webhook endpoint configured in DJI FlightHub 2 for Shamal event ingestion. " +
          "External integrators receive outbound event callbacks separately via their assigned integration webhook URL.",
        tags: ["Webhooks"],
        security: [],
      },
    },
    async (request, reply) => {
      const rawBody =
        typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body ?? {});

      const signature =
        (request.headers["x-webhook-signature"] as string | undefined) ??
        (request.headers["x-fh2-signature"] as string | undefined);

      if (!verifyWebhookSecret(rawBody, signature)) {
        return reply.status(401).send({ error: "invalid_signature" });
      }

      const payload =
        typeof request.body === "object" && request.body !== null
          ? (request.body as Record<string, unknown>)
          : (JSON.parse(rawBody) as Record<string, unknown>);

      const eventType = mapFh2PayloadToEventType(payload);
      ingestEventPayload(payload);
      const row = await insertWebhookEvent(eventType, payload);

      void notifyViewerEventCallback({
        id: row.id,
        type: eventType,
        payload,
        receivedAt: row.received_at.toISOString(),
      });

      return reply.status(202).send({
        accepted: true,
        eventId: row.id,
        eventType,
      });
    },
  );
};
