import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getCcUsers, login } from "../services/commandCenterAuth.js";
import { issueClientCredentialsToken } from "../services/serviceAccounts.js";
import { getViewerDashboardPermissions } from "../services/viewerDashboardPermissions.js";
import {
  listViewerProjectOptions,
  resolveFallbackProjectCode,
} from "../services/fh2Projects.js";
import { registerViewerGet, registerViewerPost } from "./viewerPaths.js";

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
    "/v1/viewer/auth/token",
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
    "/v1/viewer/auth/login",
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

        return reply.send({
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

  registerViewerGet(
    app,
    "/v1/viewer/auth/me",
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
