import type { FastifyInstance } from "fastify";
import { buildServer } from "./app.js";
import { config } from "./config.js";
import { initDatabase, insertWebhookEvent, listWebhookEvents } from "./db/index.js";
import { ensureRestApiKeysMigrated } from "./services/restApiKeys.js";
import { seedTelemetryFromEvents } from "./services/telemetryStore.js";

let appPromise: Promise<FastifyInstance> | undefined;

export async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = (async () => {
      await initDatabase();
      const seeded = await seedTelemetryFromEvents();
      if (seeded > 0) {
        console.info(`[telemetry] Seeded ${seeded} cached snapshot(s) from event history`);
      }

      if (config.FH2_MODE === "mock") {
        const existing = await listWebhookEvents(undefined, 1);
        if (existing.length === 0) {
          await insertWebhookEvent("mission_completed", {
            task_uuid: "0bbc74b4-5e5a-4390-9256-8e4ee08a241b",
            status: "success",
            name: "Facility Perimeter Inspection",
            message: "Auto-seeded demo event (mock mode)",
          });
        }
      }

      ensureRestApiKeysMigrated();

      const app = await buildServer();
      await app.ready();
      return app;
    })();
  }
  return appPromise;
}
