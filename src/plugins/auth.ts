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
import { legacyMarafiqPath, isViewerOrLegacyApiPath } from "../routes/viewerPaths.js";
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
import { getManagedViewerUsers } from "../services/viewerUsers.js";

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
  const legacyPath = legacyMarafiqPath(path);
  if (method === "POST" && legacyPath.startsWith("/v1/marafiq/ops/")) return true;
  if (method === "POST" && /^\/v1\/marafiq\/events\/[^/]+\/ack$/.test(legacyPath)) return true;
  return false;
}

function isValidApiKey(apiKey: string): boolean {
  if (config.marafiqApiKeys.includes(apiKey)) return true;
  return getManagedViewerUsers().some((u) => u.apiKey === apiKey);
}

function requestProjectCode(request: FastifyRequest): string | undefined {
  const header = request.headers["x-fh2-project-code"] ?? request.headers["x-project-uuid"];
  const headerValue = typeof header === "string" ? header.trim() : "";
  if (headerValue) return headerValue;
  const query = request.query as { projectCode?: string; projectId?: string } | undefined;
  return query?.projectCode?.trim() || query?.projectId?.trim() || undefined;
}

function isProjectDataPath(path: string): boolean {
  const legacyPath = legacyMarafiqPath(path);
  if (
    legacyPath === "/v1/marafiq/integration/profile" ||
    legacyPath === "/v1/marafiq/integration/access-key" ||
    legacyPath === "/v1/marafiq/viewer/integration" ||
    legacyPath === "/v1/marafiq/viewer/integration/token"
  ) {
    return false;
  }
  return (
    legacyPath.startsWith("/v1/marafiq/devices") ||
    legacyPath.startsWith("/v1/marafiq/fleet") ||
    legacyPath.startsWith("/v1/marafiq/docks") ||
    legacyPath.startsWith("/v1/marafiq/tasks") ||
    legacyPath.startsWith("/v1/marafiq/mapping") ||
    legacyPath.startsWith("/v1/marafiq/media") ||
    legacyPath.startsWith("/v1/marafiq/gis") ||
    legacyPath.startsWith("/v1/marafiq/streams") ||
    legacyPath.startsWith("/v1/marafiq/telemetry") ||
    legacyPath.startsWith("/v1/marafiq/integration/")
  );
}

/** Register on the root Fastify instance (not as an encapsulated plugin). */
export async function registerMarafiqAuth(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    setFh2RequestContext({});
    if (request.method === "OPTIONS") {
      return;
    }

    if (
      request.url.startsWith("/health") ||
      request.url.startsWith("/docs") ||
      request.url.startsWith("/webhooks/fh2") ||
      requestPath(request.url) === "/" ||
      request.url.startsWith("/platform") ||
      request.url.startsWith("/command-center")
    ) {
      return;
    }

    const path = requestPath(request.url);
    if (!isViewerOrLegacyApiPath(path)) {
      return;
    }

    if (path === "/v1/marafiq/auth/login" || path === "/v1/viewer/auth/login") {
      return;
    }

    const authHeader = request.headers.authorization;
    const bearerToken =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : undefined;

    const isIntegrationSessionRoute =
      path === "/v1/marafiq/integration/profile" ||
      path === "/v1/marafiq/integration/access-key" ||
      // @deprecated backward-compat aliases
      path === "/v1/marafiq/viewer/integration" ||
      path === "/v1/marafiq/viewer/integration/token";

    const isIntegrationBearerRoute =
      (path.startsWith("/v1/marafiq/integration/") && !isIntegrationSessionRoute) ||
      (path.startsWith("/v1/marafiq/viewer/") && !isIntegrationSessionRoute);

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
    }

    if (!role) {
      return reply.status(401).send({
        error: "invalid_session",
        message: "Invalid or expired Shamal Platform session. Sign in again.",
      });
    }

    request.ccRole = role;
    request.ccUsername = username;

    let selectedProjectCode = requestProjectCode(request);
    let allowedProjectCodes: string[] = [];
    if (role === "viewer" && username) {
      allowedProjectCodes = listViewerAssignedProjectCodes(username);
      const fallback = resolveFallbackProjectCode();
      if (allowedProjectCodes.length === 0 && !hasConfiguredFh2Projects() && fallback) {
        allowedProjectCodes = [fallback];
      }
      if (selectedProjectCode && !allowedProjectCodes.includes(selectedProjectCode)) {
        return reply.status(403).send({
          error: "forbidden",
          message: "Selected FH2 project is not assigned to this viewer account.",
        });
      }
      selectedProjectCode = selectedProjectCode || allowedProjectCodes[0];
      request.allowedProjectCodes = allowedProjectCodes;
      request.selectedProjectCode = selectedProjectCode;
      if (isProjectDataPath(path) && allowedProjectCodes.length === 0) {
        return reply.status(403).send({
          error: "forbidden",
          message: "No project assigned. Please contact your admin.",
        });
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
      return reply.status(403).send({
        error: "forbidden",
        message: access.message,
        requiredRole: access.requiredRole,
      });
    }

    if (requiresOperatorRole(path, request.method)) {
      if (!hasMinRole(role, "operator")) {
        return reply.status(403).send({
          error: "forbidden",
          message: `Role "${role}" cannot perform this action. Operator or admin required.`,
          requiredRole: "operator",
        });
      }
    }

    if (legacyMarafiqPath(path).startsWith("/v1/marafiq/admin/")) {
      if (!hasMinRole(role, "admin")) {
        return reply.status(403).send({
          error: "forbidden",
          message: "Admin role required for this endpoint.",
          requiredRole: "admin",
        });
      }
    }

    if (config.marafiqIpAllowlist.length > 0) {
      const ip = clientIp(request);
      if (!config.marafiqIpAllowlist.includes(ip)) {
        return reply.status(403).send({
          error: "forbidden",
          message: "IP address not allowlisted",
        });
      }
    }
  });
}

/** @deprecated Use registerMarafiqAuth on the root instance */
export const marafiqAuthPlugin: FastifyPluginAsync = registerMarafiqAuth;
