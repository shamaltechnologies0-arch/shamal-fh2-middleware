import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config/env.js";
import { registerAdminDocsAuth } from "./infrastructure/auth/admin-docs-auth.plugin.js";
import { registerPlatformAuth } from "./infrastructure/auth/platform-auth.plugin.js";
import { authRoutes } from "./modules/auth/presentation/routes/auth.routes.js";
import { adminRoutes } from "./modules/admin/presentation/routes/admin.routes.js";
import { viewerIntegrationRoutes } from "./modules/integrations/presentation/routes/integrations.routes.js";
import { capabilitiesRoutes } from "./modules/capabilities/presentation/routes/capabilities.routes.js";
import { commandCenterRoutes } from "./modules/platform/presentation/routes/command-center.routes.js";
import { deviceRoutes } from "./modules/devices/presentation/routes/devices.routes.js";
import { dockRoutes } from "./modules/docks/presentation/routes/docks.routes.js";
import { eventRoutes } from "./modules/events/presentation/routes/events.routes.js";
import { fleetRoutes } from "./modules/fleet/presentation/routes/fleet.routes.js";
import { gisRoutes } from "./modules/gis/presentation/routes/gis.routes.js";
import { healthRoutes } from "./modules/health/presentation/routes/health.routes.js";
import { mappingRoutes } from "./modules/mapping/presentation/routes/mapping.routes.js";
import { operationRoutes } from "./modules/operations/presentation/routes/operations.routes.js";
import { streamRoutes } from "./modules/streams/presentation/routes/streams.routes.js";
import { taskRoutes } from "./modules/tasks/presentation/routes/tasks.routes.js";
import { mediaRoutes } from "./modules/media/presentation/routes/media.routes.js";
import { telemetrySseRoutes } from "./modules/devices/presentation/routes/telemetry-sse.routes.js";
import { restApiKeysRoutes } from "./modules/api-keys/presentation/routes/api-keys.routes.js";
import { serviceAccountsRoutes } from "./modules/service-accounts/presentation/routes/service-accounts.routes.js";
import { webhookRoutes } from "./modules/webhooks/presentation/routes/webhooks.routes.js";
import {
  buildAdminOpenApiDocument,
  buildPublicOpenApiDocument,
} from "./shared/openapi/openapi-documents.service.js";

const openapiPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../openapi/shamal-platform-v1.yaml",
);

export async function buildServer() {
  const httpsOptions =
    config.HTTPS_REQUIRED && config.HTTPS_KEY_PATH && config.HTTPS_CERT_PATH
      ? {
          key: readFileSync(config.HTTPS_KEY_PATH),
          cert: readFileSync(config.HTTPS_CERT_PATH),
        }
      : undefined;

  if (config.HTTPS_REQUIRED && !httpsOptions) {
    throw new Error(
      "HTTPS_REQUIRED=true but HTTPS_KEY_PATH/HTTPS_CERT_PATH are missing in environment.",
    );
  }

  const app = Fastify({
    ...(httpsOptions ? ({ https: httpsOptions } as Record<string, unknown>) : {}),
    logger: { level: config.LOG_LEVEL },
    requestIdHeader: "x-request-id",
    genReqId: (req) =>
      (req.headers["x-request-id"] as string | undefined) ?? crypto.randomUUID(),
  }) as Awaited<ReturnType<typeof Fastify>>;

  await app.register(cors, {
    origin:
      config.NODE_ENV === "development"
        ? [
            /^http:\/\/localhost:\d+$/,
            /^http:\/\/127\.0\.0\.1:\d+$/,
            /^https:\/\/localhost:\d+$/,
            /^https:\/\/127\.0\.0\.1:\d+$/,
          ]
        : false,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "X-Api-Key",
      "X-CC-Session",
      "Content-Type",
      "X-Request-Id",
      "Accept",
    ],
  });
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
  });

  const openapiSpec = readFileSync(openapiPath, "utf-8");
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Shamal Platform Integration API",
        version: "2.3.0",
        description:
          "External API documentation for client developers and integration partners.",
      },
      servers: [{ url: "/", description: "Same origin" }],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "X-Api-Key",
          },
        },
      },
      security: [{ ApiKeyAuth: [] }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list" },
    transformSpecification: (swaggerObject: Record<string, unknown>) =>
      buildPublicOpenApiDocument(swaggerObject),
    transformSpecificationClone: true,
  });

  await registerAdminDocsAuth(app);

  const adminDocsAuthScript = `
(function () {
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    init = init || {};
    const headers = new Headers(init.headers || {});
    try {
      const raw = localStorage.getItem("shamalCcSession");
      if (raw) {
        const session = JSON.parse(raw);
        const url = typeof input === "string" ? input : input && input.url ? input.url : "";
        if (url.includes("/admin-docs/json") && session.apiKey) {
          if (!headers.has("X-Api-Key")) headers.set("X-Api-Key", session.apiKey);
          if (session.sessionToken && !headers.has("X-CC-Session")) {
            headers.set("X-CC-Session", session.sessionToken);
          }
        }
      }
    } catch (_) {}
    return originalFetch.call(this, input, Object.assign({}, init, { headers }));
  };
})();
`.trim();

  await app.register(async (adminDocsApp: Awaited<ReturnType<typeof Fastify>>) => {
    await adminDocsApp.register(swaggerUi, {
      routePrefix: "/admin-docs",
      uiConfig: { docExpansion: "list" },
      transformSpecification: (swaggerObject: Record<string, unknown>) =>
        buildAdminOpenApiDocument(swaggerObject),
      transformSpecificationClone: true,
      theme: {
        js: [{ filename: "admin-docs-auth.js", content: adminDocsAuthScript }],
      },
    });
  });

  app.get(
    "/openapi.yaml",
    { schema: { hide: true } },
    async (_req: unknown, reply: { type: (t: string) => { send: (b: string) => void } }) => {
      reply.type("application/yaml").send(openapiSpec);
    },
  );

  await registerPlatformAuth(app);

  await app.register(commandCenterRoutes);
  await app.register(authRoutes);
  await app.register(adminRoutes);
  await app.register(viewerIntegrationRoutes);
  await app.register(restApiKeysRoutes);
  await app.register(serviceAccountsRoutes);
  await app.register(healthRoutes);
  await app.register(capabilitiesRoutes);
  await app.register(deviceRoutes);
  await app.register(dockRoutes);
  await app.register(fleetRoutes);
  await app.register(streamRoutes);
  await app.register(mappingRoutes);
  await app.register(operationRoutes);
  await app.register(gisRoutes);
  await app.register(telemetrySseRoutes);
  await app.register(taskRoutes);
  await app.register(mediaRoutes);
  await app.register(eventRoutes);
  await app.register(webhookRoutes);

  app.get(
    "/openapi.json",
    { schema: { hide: true } },
    async () => buildPublicOpenApiDocument(app.swagger()),
  );

  return app;
}
