import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { config } from "../config.js";
import { insertWebhookEvent, mapFh2PayloadToEventType } from "../db/index.js";
import { notifyViewerEventCallback } from "../services/viewerEventNotify.js";
import { ingestEventPayload } from "../services/telemetryStore.js";

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
  app.post("/webhooks/fh2", { config: { rawBody: true } }, async (request, reply) => {
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
  });
};
