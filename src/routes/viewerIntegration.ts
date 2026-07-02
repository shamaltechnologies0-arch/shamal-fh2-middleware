import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { getCcUsers } from "../services/commandCenterAuth.js";
import {
  getViewerIntegrationPublic,
  resolveApiBaseUrl,
  revealViewerToken,
} from "../services/viewerIntegration.js";
import {
  hasViewerScope,
  scopeForIntegrationPath,
  type ViewerApiScope,
} from "../services/viewerScopes.js";
import {
  fetchViewerAlertsEvents,
  fetchViewerBatteryStatus,
  fetchViewerCameraStream,
  fetchViewerDockTelemetry,
  fetchViewerDroneTelemetry,
  fetchViewerFleet,
  fetchViewerGpsLocation,
  fetchViewerMediaHistory,
  fetchViewerOnlineStatus,
} from "../services/viewerApiData.js";

function apiBaseFromRequest(request: FastifyRequest): string {
  const host = request.headers.host;
  return resolveApiBaseUrl(host);
}

function requireIntegrationAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  requiredScope: ViewerApiScope,
): boolean {
  const ctx = request.viewerIntegration;
  if (!ctx) {
    reply.status(401).send({
      error: "unauthorized",
      message: "Valid integration Bearer access key required",
    });
    return false;
  }
  if (!hasViewerScope(ctx.scopes, requiredScope)) {
    reply.status(403).send({
      error: "forbidden",
      message: "Access to this data is not enabled for your account.",
    });
    return false;
  }
  return true;
}

type DataHandler = () => Promise<unknown>;

function scopedHandler(path: string, handler: DataHandler) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const scope = scopeForIntegrationPath(path);
    if (!scope || !requireIntegrationAuth(request, reply, scope)) return;
    const payload = await handler();
    return reply.send(payload);
  };
}

function registerDataRoute(
  app: Parameters<FastifyPluginAsync>[0],
  publicPath: string,
  deprecatedPath: string,
  summary: string,
  handler: DataHandler,
) {
  const routeHandler = scopedHandler(publicPath, handler);
  const schema = { summary, tags: ["Integration"] as const };

  app.get(publicPath, { schema }, routeHandler);
  // @deprecated — backward-compat alias; do not document or show in UI
  app.get(deprecatedPath, { schema: { ...schema, hide: true } }, routeHandler);
}

async function integrationProfileHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (request.ccRole !== "viewer" || !request.ccUsername) {
    return reply.status(403).send({
      error: "forbidden",
      message: "Integration account session required",
    });
  }

  const user = getCcUsers().find((u) => u.username === request.ccUsername);
  const apiBaseUrl = apiBaseFromRequest(request);
  const info = getViewerIntegrationPublic(request.ccUsername, apiBaseUrl);
  return reply.send({
    data: {
      ...info,
      platformApiKey: user?.apiKey ?? null,
      authHeaders: {
        restApi: "X-Api-Key",
        integrationApi: "Authorization: Bearer <integration access key>",
      },
    },
    meta: { source: "shamal-platform" },
  });
}

async function integrationAccessKeyHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (request.ccRole !== "viewer" || !request.ccUsername) {
    return reply.status(403).send({
      error: "forbidden",
      message: "Integration account session required",
    });
  }

  const token = revealViewerToken(request.ccUsername);
  if (!token) {
    return reply.status(404).send({
      error: "not_available",
      message:
        "API integration is not enabled or no active access key exists for your account.",
    });
  }

  return reply.send({
    data: { accessKey: token },
    meta: { source: "shamal-platform" },
  });
}

export const viewerIntegrationRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/v1/marafiq/integration/profile",
    {
      schema: {
        summary: "Integration account access details (session auth)",
        tags: ["Integration"],
      },
    },
    integrationProfileHandler,
  );
  // @deprecated — backward-compat alias
  app.get(
    "/v1/marafiq/viewer/integration",
    { schema: { hide: true } },
    integrationProfileHandler,
  );

  app.get(
    "/v1/marafiq/integration/access-key",
    {
      schema: {
        summary: "Reveal integration access key for clipboard copy (session auth)",
        tags: ["Integration"],
      },
    },
    integrationAccessKeyHandler,
  );
  // @deprecated — backward-compat alias; returns apiKey field for legacy clients
  app.get(
    "/v1/marafiq/viewer/integration/token",
    { schema: { hide: true } },
    async (request, reply) => {
      if (request.ccRole !== "viewer" || !request.ccUsername) {
        return reply.status(403).send({
          error: "forbidden",
          message: "Integration account session required",
        });
      }
      const token = revealViewerToken(request.ccUsername);
      if (!token) {
        return reply.status(404).send({
          error: "not_available",
          message:
            "API integration is not enabled or no active access key exists for your account.",
        });
      }
      return reply.send({
        data: { accessKey: token, apiKey: token },
        meta: { source: "shamal-platform" },
      });
    },
  );

  registerDataRoute(
    app,
    "/v1/marafiq/integration/fleet",
    "/v1/marafiq/viewer/fleet",
    "Fleet overview",
    async () => {
      const fleet = await fetchViewerFleet();
      return { data: fleet, meta: { source: "flighthub2" } };
    },
  );

  registerDataRoute(
    app,
    "/v1/marafiq/integration/drone-telemetry",
    "/v1/marafiq/viewer/drone-telemetry",
    "Drone telemetry",
    async () => fetchViewerDroneTelemetry(),
  );

  registerDataRoute(
    app,
    "/v1/marafiq/integration/dock-telemetry",
    "/v1/marafiq/viewer/dock-telemetry",
    "Dock telemetry",
    async () => fetchViewerDockTelemetry(),
  );

  registerDataRoute(
    app,
    "/v1/marafiq/integration/battery-status",
    "/v1/marafiq/viewer/battery-status",
    "Battery status",
    async () => fetchViewerBatteryStatus(),
  );

  registerDataRoute(
    app,
    "/v1/marafiq/integration/gps-location",
    "/v1/marafiq/viewer/gps-location",
    "GPS locations",
    async () => fetchViewerGpsLocation(),
  );

  registerDataRoute(
    app,
    "/v1/marafiq/integration/online-status",
    "/v1/marafiq/viewer/online-status",
    "Online/offline status",
    async () => fetchViewerOnlineStatus(),
  );

  registerDataRoute(
    app,
    "/v1/marafiq/integration/camera",
    "/v1/marafiq/viewer/camera",
    "Dock live camera info",
    async () => fetchViewerCameraStream("dock"),
  );

  registerDataRoute(
    app,
    "/v1/marafiq/integration/fpv",
    "/v1/marafiq/viewer/fpv",
    "Drone FPV stream info",
    async () => fetchViewerCameraStream("drone"),
  );

  registerDataRoute(
    app,
    "/v1/marafiq/integration/alerts-events",
    "/v1/marafiq/viewer/alerts-events",
    "Alerts and events",
    async () => fetchViewerAlertsEvents(),
  );

  registerDataRoute(
    app,
    "/v1/marafiq/integration/media-history",
    "/v1/marafiq/viewer/media-history",
    "Mission and media history",
    async () => fetchViewerMediaHistory(),
  );
};
