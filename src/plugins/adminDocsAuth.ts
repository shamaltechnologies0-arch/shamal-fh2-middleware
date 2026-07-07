import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  hasMinRole,
  roleFromApiKey,
  verifySessionToken,
  verifySessionTokenStandalone,
  type CcRole,
} from "../services/commandCenterAuth.js";
import { verifyRestApiKey } from "../services/restApiKeys.js";
import {
  parseCookieHeader,
  SESSION_COOKIE_NAME,
} from "../utils/sessionCookie.js";

function requestPath(url: string): string {
  return url.split("?")[0] ?? url;
}

export function isAdminDocsPath(path: string): boolean {
  return path.startsWith("/admin-docs");
}

function requiresAdminDocsAuth(path: string): boolean {
  return (
    path === "/admin-docs" ||
    path === "/admin-docs/" ||
    path === "/admin-docs/json" ||
    path === "/admin-docs/yaml"
  );
}

function resolveAdminRole(request: FastifyRequest): CcRole | null {
  const cookies = parseCookieHeader(request.headers.cookie);
  const sessionCookie = cookies[SESSION_COOKIE_NAME];
  if (sessionCookie) {
    const verified = verifySessionTokenStandalone(sessionCookie);
    if (verified) return verified.role;
  }

  const apiKeyHeader = request.headers["x-api-key"];
  const apiKey = typeof apiKeyHeader === "string" ? apiKeyHeader.trim() : "";
  if (!apiKey) return null;

  const sessionHeader = request.headers["x-cc-session"];
  const sessionToken =
    typeof sessionHeader === "string" ? sessionHeader.trim() : "";

  if (sessionToken) {
    const verified = verifySessionToken(sessionToken, apiKey);
    if (verified?.role === "admin") return "admin";
    if (verified?.role) return verified.role;
  }

  const restApiKeyCtx = verifyRestApiKey(apiKey);
  if (restApiKeyCtx) {
    return roleFromApiKey(apiKey);
  }

  return roleFromApiKey(apiKey);
}

function wantsHtml(request: FastifyRequest): boolean {
  const accept = request.headers.accept;
  return typeof accept === "string" && accept.includes("text/html");
}

export async function enforceAdminDocsAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const path = requestPath(request.url);
  if (!requiresAdminDocsAuth(path)) {
    return;
  }

  const role = resolveAdminRole(request);
  if (!role) {
    if ((path === "/admin-docs" || path === "/admin-docs/") && wantsHtml(request)) {
      return reply.redirect("/admin?returnTo=/admin-docs");
    }
    return reply.status(401).send({
      error: "unauthorized",
      message:
        "Admin documentation requires a valid Shamal Platform administrator session or API key.",
    });
  }

  if (!hasMinRole(role, "admin")) {
    return reply.status(403).send({
      error: "forbidden",
      message: "Platform administrator role required to access admin documentation.",
      requiredRole: "admin",
    });
  }
}

export async function registerAdminDocsAuth(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS") return;
    await enforceAdminDocsAccess(request, reply);
  });
}
