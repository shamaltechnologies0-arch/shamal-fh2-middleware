import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getCcUsers, login, verifySessionToken } from "../../infrastructure/command-center-auth.service.js";
import {
  buildClearSessionCookieHeader,
  buildSessionCookieHeader,
  isSecureCookieEnvironment,
} from "../../shared/session-cookie.js";
import { issueClientCredentialsToken } from "../../../service-accounts/application/service-accounts.service.js";
import { getViewerDashboardPermissions } from "../../../users/application/viewer-dashboard-permissions.service.js";
import {
  listViewerProjectOptions,
  resolveFallbackProjectCode,
} from "../../../projects/application/fh2-projects.service.js";
import { registerViewerGet, registerViewerPost } from "../../../../shared/http/viewer-paths.js";

const loginSchema = z.object({
  username: z.string().min(2),
  password: z.string().min(4),
});

function parseTokenBody(body: unknown): Record<string, string> {
  if (typeof body === "string") {
    return Object.fromEntries(new URLSearchParams(body));
  }
  if (body && typeof body === "object") {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  }
  return {};
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      try {
        done(null, Object.fromEntries(new URLSearchParams(body as string)));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  registerViewerPost(
    app,
    "/v1/auth/token",
    {
      schema: {
        summary: "OAuth 2.0 Client Credentials — service account M2M authentication",
        tags: ["Auth"],
        security: [],
      },
    },
    async (request, reply) => {
      const form = parseTokenBody(request.body);
      if (form.grant_type?.trim() !== "client_credentials") {
        return reply.status(400).send({
          error: "unsupported_grant_type",
          error_description: "Only grant_type=client_credentials is supported",
        });
      }

      const clientId = form.client_id?.trim();
      const clientSecret = form.client_secret?.trim();
      if (!clientId || !clientSecret) {
        return reply.status(400).send({
          error: "invalid_request",
          error_description: "client_id and client_secret are required",
        });
      }

      const tokens = issueClientCredentialsToken(clientId, clientSecret);
      if (!tokens) {
        return reply.status(401).send({
          error: "invalid_client",
          error_description: "Invalid, expired, or revoked service account credentials",
        });
      }

      return reply.send({
        access_token: tokens.accessToken,
        token_type: tokens.tokenType,
        expires_in: tokens.expiresIn,
      });
    },
  );

  registerViewerPost(
    app,
    "/v1/auth/login",
    {
      schema: {
        summary: "Shamal Platform login (human users)",
        tags: ["Auth"],
        security: [],
      },
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }

      try {
        const session = login(parsed.data.username, parsed.data.password);
        if (!session) {
          return reply.status(401).send({
            error: "invalid_credentials",
            message: "Invalid username or password",
          });
        }

        const secureCookie = isSecureCookieEnvironment();
        return reply
          .header(
            "Set-Cookie",
            buildSessionCookieHeader(session.sessionToken, { secure: secureCookie }),
          )
          .send({
            data: {
              apiKey: session.apiKey,
              role: session.role,
              displayName: session.displayName,
              sessionToken: session.sessionToken,
              username: parsed.data.username.trim(),
              permissions: {
                canView: true,
                canOperate: session.role === "operator" || session.role === "admin",
                canAdmin: session.role === "admin",
              },
              viewerDashboardPermissions:
                session.role === "viewer"
                  ? getViewerDashboardPermissions(parsed.data.username.trim())
                  : undefined,
              assignedProjects:
                session.role === "viewer"
                  ? listViewerProjectOptions(parsed.data.username.trim())
                  : undefined,
              fallbackProjectCode: resolveFallbackProjectCode(),
            },
            meta: { source: "shamal-platform" },
          });
      } catch (err) {
        return reply.status(500).send({
          error: "auth_config_error",
          message: (err as Error).message,
        });
      }
    },
  );

  registerViewerPost(
    app,
    "/v1/auth/session-cookie",
    {
      schema: {
        summary: "Refresh Shamal Platform browser session cookie from an active session",
        tags: ["Auth"],
        security: [],
      },
    },
    async (request, reply) => {
      const apiKeyHeader = request.headers["x-api-key"];
      const apiKey = typeof apiKeyHeader === "string" ? apiKeyHeader.trim() : "";
      const sessionHeader = request.headers["x-cc-session"];
      const sessionToken =
        typeof sessionHeader === "string" ? sessionHeader.trim() : "";

      if (!apiKey || !sessionToken) {
        return reply.status(401).send({
          error: "unauthorized",
          message: "X-Api-Key and X-CC-Session are required",
        });
      }

      const verified = verifySessionToken(sessionToken, apiKey);
      if (!verified) {
        return reply.status(401).send({
          error: "unauthorized",
          message: "Invalid or expired session",
        });
      }

      const secureCookie = isSecureCookieEnvironment();
      return reply
        .header(
          "Set-Cookie",
          buildSessionCookieHeader(sessionToken, { secure: secureCookie }),
        )
        .send({
          data: { ok: true, role: verified.role },
          meta: { source: "shamal-platform" },
        });
    },
  );

  registerViewerPost(
    app,
    "/v1/auth/logout",
    {
      schema: {
        summary: "Clear Shamal Platform browser session cookie",
        tags: ["Auth"],
        security: [],
      },
    },
    async (_request, reply) => {
      const secureCookie = isSecureCookieEnvironment();
      return reply
        .header("Set-Cookie", buildClearSessionCookieHeader({ secure: secureCookie }))
        .send({
          data: { ok: true },
          meta: { source: "shamal-platform" },
        });
    },
  );

  registerViewerGet(
    app,
    "/v1/auth/me",
    {
      schema: {
        summary: "Current Shamal Platform session and effective permissions",
        tags: ["Auth"],
      },
    },
    async (request, reply) => {
      const username = request.ccUsername;
      const role = request.ccRole;
      if (!role || !username) {
        return reply.status(401).send({
          error: "unauthorized",
          message: "Valid session required",
        });
      }

      const user = getCcUsers().find((u) => u.username === username);
      return reply.send({
        data: {
          username,
          role,
          displayName: user?.displayName ?? username,
          permissions: {
            canView: true,
            canOperate: role === "operator" || role === "admin",
            canAdmin: role === "admin",
          },
          viewerDashboardPermissions:
            role === "viewer"
              ? getViewerDashboardPermissions(username)
              : undefined,
          assignedProjects:
            role === "viewer" ? listViewerProjectOptions(username) : undefined,
          fallbackProjectCode: resolveFallbackProjectCode(),
        },
        meta: { source: "shamal-platform" },
      });
    },
  );
};
