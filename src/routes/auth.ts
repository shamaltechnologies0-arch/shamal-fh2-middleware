import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getCcUsers, login } from "../services/commandCenterAuth.js";
import { getViewerDashboardPermissions } from "../services/viewerDashboardPermissions.js";
import { registerViewerGet, registerViewerPost } from "./viewerPaths.js";

const loginSchema = z.object({
  username: z.string().min(2),
  password: z.string().min(4),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  registerViewerPost(
    app,
    "/v1/marafiq/auth/login",
    {
      schema: {
        summary: "Shamal Platform login",
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
    "/v1/marafiq/auth/me",
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
        },
        meta: { source: "shamal-platform" },
      });
    },
  );
};
