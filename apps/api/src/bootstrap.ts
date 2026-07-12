import type { FastifyInstance } from "fastify";
import { buildServer } from "./app.js";
import { config } from "./config/env.js";
import { initDatabase, insertWebhookEvent, listWebhookEvents } from "./infrastructure/database/index.js";
import { initPlatformDataStore } from "./infrastructure/persistence/platform-data-store.js";
import { ensureRestApiKeysMigrated } from "./modules/api-keys/application/rest-api-keys.service.js";
import { seedTelemetryFromEvents } from "./modules/devices/application/telemetry-store.service.js";

let appPromise: Promise<FastifyInstance> | undefined;

export async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = (async () => {
      await initDatabase();
      await initPlatformDataStore();
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

      await ensureRestApiKeysMigrated();

      const app = await buildServer();
      await app.ready();
      return app;
    })();
  }
  return appPromise;
}
