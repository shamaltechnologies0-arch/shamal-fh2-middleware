import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import {
  getPrimaryRestApiKeyMasked,
  listRestApiKeys,
} from "../services/restApiKeys.js";
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
import { PLATFORM_PREFIX, registerPlatformGet } from "./viewerPaths.js";

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
  path: string,
  summary: string,
  handler: DataHandler,
) {
  registerPlatformGet(
    app,
    path,
    { summary, tags: ["Integration"] as const },
    scopedHandler(path, handler),
  );
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

  const apiBaseUrl = apiBaseFromRequest(request);
  const info = getViewerIntegrationPublic(request.ccUsername, apiBaseUrl);
  const primaryRestApiKeyMasked = getPrimaryRestApiKeyMasked(request.ccUsername);
  const restApiKeys = listRestApiKeys(request.ccUsername);
  return reply.send({
    data: {
      ...info,
      primaryRestApiKeyMasked,
      restApiKeyCount: restApiKeys.length,
      platformApiKey: primaryRestApiKeyMasked,
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
  registerPlatformGet(
    app,
    `${PLATFORM_PREFIX}/integration/profile`,
    {
      schema: {
        summary: "Integration account access details (session auth)",
        tags: ["Integration"],
      },
    },
    integrationProfileHandler,
  );

  registerPlatformGet(
    app,
    `${PLATFORM_PREFIX}/integration/access-key`,
    {
      schema: {
        summary: "Reveal integration access key for clipboard copy (session auth)",
        tags: ["Integration"],
      },
    },
    integrationAccessKeyHandler,
  );

  registerDataRoute(
    app,
    `${PLATFORM_PREFIX}/integration/fleet`,
    "Fleet overview",
    async () => {
      const fleet = await fetchViewerFleet();
      return { data: fleet, meta: { source: "flighthub2" } };
    },
  );

  registerDataRoute(
    app,
    `${PLATFORM_PREFIX}/integration/drone-telemetry`,
    "Drone telemetry",
    async () => fetchViewerDroneTelemetry(),
  );

  registerDataRoute(
    app,
    `${PLATFORM_PREFIX}/integration/dock-telemetry`,
    "Dock telemetry",
    async () => fetchViewerDockTelemetry(),
  );

  registerDataRoute(
    app,
    `${PLATFORM_PREFIX}/integration/battery-status`,
    "Battery status",
    async () => fetchViewerBatteryStatus(),
  );

  registerDataRoute(
    app,
    `${PLATFORM_PREFIX}/integration/gps-location`,
    "GPS locations",
    async () => fetchViewerGpsLocation(),
  );

  registerDataRoute(
    app,
    `${PLATFORM_PREFIX}/integration/online-status`,
    "Online/offline status",
    async () => fetchViewerOnlineStatus(),
  );

  registerDataRoute(
    app,
    `${PLATFORM_PREFIX}/integration/camera`,
    "Dock live camera info",
    async () => fetchViewerCameraStream("dock"),
  );

  registerDataRoute(
    app,
    `${PLATFORM_PREFIX}/integration/fpv`,
    "Drone FPV stream info",
    async () => fetchViewerCameraStream("drone"),
  );

  registerDataRoute(
    app,
    `${PLATFORM_PREFIX}/integration/alerts-events`,
    "Alerts and events",
    async () => fetchViewerAlertsEvents(),
  );

  registerDataRoute(
    app,
    `${PLATFORM_PREFIX}/integration/media-history`,
    "Mission and media history",
    async () => fetchViewerMediaHistory(),
  );
};
