import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { config } from "../config.js";
import {
  hasMinRole,
  verifySessionToken,
  roleFromApiKey,
  type CcRole,
} from "../services/commandCenterAuth.js";
import { normalizeApiPath, isPlatformApiPath } from "../routes/viewerPaths.js";
import { assertRoleAccess } from "../services/apiAccess.js";
import {
  hasConfiguredFh2Projects,
  listViewerAssignedProjectCodes,
  resolveFallbackProjectCode,
} from "../services/fh2Projects.js";
import { setFh2RequestContext } from "../services/fh2ProjectContext.js";
import {
  isViewerIntegrationToken,
  verifyViewerIntegrationToken,
} from "../services/viewerIntegration.js";
import {
  isServiceAccountAccessToken,
  verifyAccessToken,
} from "../services/serviceAccounts.js";
import {
  importLegacyViewerApiKey,
  touchRestApiKeyLastUsed,
  userHasRestApiKeys,
  verifyRestApiKey,
} from "../services/restApiKeys.js";
import { getLegacyViewerApiKey, listManagedViewerRecords } from "../services/viewerUsers.js";

function clientIp(request: FastifyRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]!.trim();
  }
  return request.ip;
}

function requestPath(url: string): string {
  return url.split("?")[0] ?? url;
}

function requiresOperatorRole(path: string, method: string): boolean {
  const canonicalPath = normalizeApiPath(path);
  if (method === "POST" && canonicalPath.startsWith("/v1/platform/ops/")) return true;
  if (method === "POST" && /^\/v1\/events\/[^/]+\/ack$/.test(canonicalPath)) return true;
  return false;
}

function resolveLegacyViewerApiKey(apiKey: string): boolean {
  for (const viewer of listManagedViewerRecords()) {
    const legacy = getLegacyViewerApiKey(viewer.username);
    if (!legacy || legacy !== apiKey) continue;
    if (userHasRestApiKeys(viewer.username)) return false;

    console.warn(
      `[auth] Migrating legacy REST API key for viewer "${viewer.username}" into restApiKeys store`,
    );
    if (!importLegacyViewerApiKey(viewer.username, apiKey)) return false;
    return verifyRestApiKey(apiKey) !== null;
  }
  return false;
}

function isValidApiKey(apiKey: string): boolean {
  if (config.viewerApiKeys.includes(apiKey)) return true;
  if (verifyRestApiKey(apiKey)) return true;
  return resolveLegacyViewerApiKey(apiKey);
}

function requestProjectCode(request: FastifyRequest): string | undefined {
  const header = request.headers["x-fh2-project-code"] ?? request.headers["x-project-uuid"];
  const headerValue = typeof header === "string" ? header.trim() : "";
  if (headerValue) return headerValue;
  const query = request.query as { projectCode?: string; projectId?: string } | undefined;
  return query?.projectCode?.trim() || query?.projectId?.trim() || undefined;
}

function isProjectDataPath(path: string): boolean {
  const canonicalPath = normalizeApiPath(path);
  if (
    canonicalPath === "/v1/platform/integration/profile" ||
    canonicalPath === "/v1/platform/integration/access-key"
  ) {
    return false;
  }
  return (
    canonicalPath.startsWith("/v1/devices") ||
    canonicalPath.startsWith("/v1/fleet") ||
    canonicalPath.startsWith("/v1/docks") ||
    canonicalPath.startsWith("/v1/tasks") ||
    canonicalPath.startsWith("/v1/mapping") ||
    canonicalPath.startsWith("/v1/media") ||
    canonicalPath.startsWith("/v1/platform/integration/")
  );
}

function applyViewerProjectScope(
  request: FastifyRequest,
  reply: FastifyReply,
  path: string,
  role: CcRole,
  username: string,
): void {
  let selectedProjectCode = requestProjectCode(request);
  let allowedProjectCodes: string[] = [];
  if (role === "viewer") {
    allowedProjectCodes = listViewerAssignedProjectCodes(username);
    const fallback = resolveFallbackProjectCode();
    if (allowedProjectCodes.length === 0 && !hasConfiguredFh2Projects() && fallback) {
      allowedProjectCodes = [fallback];
    }
    if (selectedProjectCode && !allowedProjectCodes.includes(selectedProjectCode)) {
      reply.status(403).send({
        error: "forbidden",
        message: "Selected FH2 project is not assigned to this viewer account.",
      });
      return;
    }
    selectedProjectCode = selectedProjectCode || allowedProjectCodes[0];
    request.allowedProjectCodes = allowedProjectCodes;
    request.selectedProjectCode = selectedProjectCode;
    if (isProjectDataPath(path) && allowedProjectCodes.length === 0) {
      reply.status(403).send({
        error: "forbidden",
        message: "No project assigned. Please contact your admin.",
      });
      return;
    }
  } else {
    selectedProjectCode = selectedProjectCode || resolveFallbackProjectCode();
    request.selectedProjectCode = selectedProjectCode;
  }

  setFh2RequestContext({
    role,
    username,
    allowedProjectCodes,
    projectCode: selectedProjectCode,
  });

  const access = assertRoleAccess(role, request.method, path);
  if (!access.allowed) {
    reply.status(403).send({
      error: "forbidden",
      message: access.message,
      requiredRole: access.requiredRole,
    });
    return;
  }

  if (requiresOperatorRole(path, request.method)) {
    if (!hasMinRole(role, "operator")) {
      reply.status(403).send({
        error: "forbidden",
        message: `Role "${role}" cannot perform this action. Operator or admin required.`,
        requiredRole: "operator",
      });
      return;
    }
  }

  if (normalizeApiPath(path).startsWith("/v1/platform/admin/")) {
    if (!hasMinRole(role, "admin")) {
      reply.status(403).send({
        error: "forbidden",
        message: "Admin role required for this endpoint.",
        requiredRole: "admin",
      });
      return;
    }
  }

  if (config.viewerIpAllowlist.length > 0) {
    const ip = clientIp(request);
    if (!config.viewerIpAllowlist.includes(ip)) {
      reply.status(403).send({
        error: "forbidden",
        message: "IP address not allowlisted",
      });
    }
  }
}

/** Register on the root Fastify instance (not as an encapsulated plugin). */
export async function registerPlatformAuth(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    setFh2RequestContext({});
    if (request.method === "OPTIONS") {
      return;
    }

    if (
      request.url.startsWith("/health") ||
      request.url.startsWith("/docs") ||
      request.url.startsWith("/admin-docs") ||
      request.url.startsWith("/webhooks/fh2") ||
      requestPath(request.url) === "/" ||
      request.url.startsWith("/admin") ||
      request.url.startsWith("/bg-image/") ||
      request.url.startsWith("/platform") ||
      request.url.startsWith("/command-center")
    ) {
      return;
    }

    const path = requestPath(request.url);
    if (!isPlatformApiPath(path)) {
      return;
    }

    if (
      path === "/v1/auth/login" ||
      path === "/v1/auth/logout" ||
      path === "/v1/auth/session-cookie" ||
      path === "/v1/auth/token" ||
      path === "/v1/viewer/auth/login" ||
      path === "/v1/viewer/auth/logout" ||
      path === "/v1/viewer/auth/session-cookie" ||
      path === "/v1/viewer/auth/token"
    ) {
      return;
    }

    const authHeader = request.headers.authorization;
    const bearerToken =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : undefined;

    if (bearerToken && isServiceAccountAccessToken(bearerToken)) {
      const verified = verifyAccessToken(bearerToken);
      if (!verified) {
        return reply.status(401).send({
          error: "unauthorized",
          message: "Invalid or expired service account access token",
        });
      }
      request.serviceAccount = {
        accountId: verified.accountId,
        ownerUserId: verified.ownerUserId,
        clientId: verified.clientId,
        scopes: verified.scopes,
      };
      request.ccRole = "viewer";
      request.ccUsername = verified.ownerUserId;
      return applyViewerProjectScope(request, reply, path, "viewer", verified.ownerUserId);
    }

    const isIntegrationSessionRoute =
      path === "/v1/platform/integration/profile" ||
      path === "/v1/platform/integration/access-key";

    const isIntegrationBearerRoute =
      path.startsWith("/v1/platform/integration/") && !isIntegrationSessionRoute;

    if (isIntegrationBearerRoute) {
      if (!bearerToken || !isViewerIntegrationToken(bearerToken)) {
        return reply.status(401).send({
          error: "unauthorized",
          message: "Valid integration Bearer access key required (shm_live_…)",
        });
      }

      const ctx = verifyViewerIntegrationToken(bearerToken);
      if (!ctx) {
        return reply.status(401).send({
          error: "unauthorized",
          message: "Invalid, revoked, or disabled integration access key",
        });
      }

      request.viewerIntegration = ctx;
      return;
    }

    const apiKeyHeader = request.headers["x-api-key"];
    const apiKey =
      typeof apiKeyHeader === "string"
        ? apiKeyHeader
        : bearerToken && !isViewerIntegrationToken(bearerToken)
          ? bearerToken
          : undefined;

    if (!apiKey || !isValidApiKey(apiKey)) {
      return reply.status(401).send({
        error: "unauthorized",
        message: "Valid X-Api-Key or Bearer token required",
      });
    }

    const restApiKeyCtx = verifyRestApiKey(apiKey);
    if (restApiKeyCtx) {
      request.restApiKey = restApiKeyCtx;
      touchRestApiKeyLastUsed(restApiKeyCtx.keyId);
    }

    const sessionHeader = request.headers["x-cc-session"];
    const sessionToken =
      typeof sessionHeader === "string" ? sessionHeader : undefined;

    let role: CcRole | null = null;
    let username: string | undefined;

    if (sessionToken) {
      const verified = verifySessionToken(sessionToken, apiKey);
      if (!verified) {
        return reply.status(401).send({
          error: "invalid_session",
          message: "Invalid or expired Shamal Platform session. Sign in again.",
        });
      }
      role = verified.role;
      username = verified.username;
    } else {
      role = roleFromApiKey(apiKey);
      if (restApiKeyCtx) {
        username = restApiKeyCtx.userId;
      }
    }

    if (!role) {
      return reply.status(401).send({
        error: "invalid_session",
        message: "Invalid or expired Shamal Platform session. Sign in again.",
      });
    }

    request.ccRole = role;
    request.ccUsername = username;
    applyViewerProjectScope(request, reply, path, role, username ?? "");
  });
}

/** @deprecated Use registerPlatformAuth on the root instance */
export const platformAuthPlugin: FastifyPluginAsync = registerPlatformAuth;
