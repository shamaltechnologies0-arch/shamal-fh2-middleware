import type { FastifyPluginAsync } from "fastify";
import { config } from "../../../../config/env.js";
import { registerViewerGet } from "../../../../shared/http/viewer-paths.js";

export const capabilitiesRoutes: FastifyPluginAsync = async (app) => {
  registerViewerGet(
    app,
    "/v1/capabilities",
    {
      schema: {
        summary: "API capabilities (phase 1 + phase 2)",
        tags: ["Meta"],
      },
    },
    async () => ({
      data: {
        phase1: [
          "devices",
          "device-detail",
          "telemetry-snapshot",
          "tasks",
          "task-media",
          "task-trajectory",
          "events",
        ],
        phase2: [
          "fleet-summary",
          "docks",
          "live-stream-info",
          "mapping-models",
          "trajectory-geojson",
          "trajectory-kml",
          "telemetry-sse",
          "viewer-event-callback",
          "operations-panel",
          "operations-catalog",
          "operations-readiness",
          "fh2-flight-dock-camera-commands",
          "event-acknowledge",
          "shamal-platform-ui",
        ],
        fh2Mode: config.FH2_MODE,
        fh2LiveReady: config.fh2LiveReady,
        fh2LiveShareConfigured: Boolean(config.FH2_LIVE_SHARE_URL),
        fh2CockpitUrl: config.FH2_COCKPIT_URL ?? null,
        viewerEventCallbackConfigured: Boolean(config.VIEWER_EVENT_CALLBACK_URL),
        readOnly: false,
      },
      meta: { version: "3.0.0" },
    }),
  );
};
