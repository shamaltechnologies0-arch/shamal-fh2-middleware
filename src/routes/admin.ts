import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { readCcCredentialEnv } from "../config.js";
import {
  getCcUsers,
  getEnvViewerUsernames,
  hasMinRole,
} from "../services/commandCenterAuth.js";
import {
  deleteViewerDashboardPermissions,
  getViewerDashboardPermissions,
  mergeViewerPermissions,
  updateViewerDashboardPermissions,
} from "../services/viewerDashboardPermissions.js";
import {
  deleteViewerIntegration,
  generateViewerIntegrationToken,
  getAdminIntegrationView,
  regenerateViewerIntegrationToken,
  resolveApiBaseUrl,
  revokeViewerIntegrationToken,
  setViewerIntegrationEnabled,
} from "../services/viewerIntegration.js";
import {
  createManagedViewer,
  createViewerSchema,
  deleteManagedViewer,
  isManagedViewer,
} from "../services/viewerUsers.js";

const integrationPatchSchema = z.object({
  enabled: z.boolean(),
});

const patchSchema = z.object({
  fleetOverview: z.boolean().optional(),
  droneTelemetry: z.boolean().optional(),
  dockTelemetry: z.boolean().optional(),
  batteryStatus: z.boolean().optional(),
  gpsLocation: z.boolean().optional(),
  onlineOffline: z.boolean().optional(),
  liveCamera: z.boolean().optional(),
  droneFpv: z.boolean().optional(),
  alertsEvents: z.boolean().optional(),
  missionMediaHistory: z.boolean().optional(),
  refreshButton: z.boolean().optional(),
  getApiButtons: z.boolean().optional(),
});

function requireAdmin(
  role: string | undefined,
): { ok: true } | { ok: false; message: string } {
  if (!role || !hasMinRole(role as "viewer" | "operator" | "admin", "admin")) {
    return {
      ok: false,
      message: "Admin role required for this endpoint.",
    };
  }
  return { ok: true };
}

function listIntegrationAccounts() {
  const envNames = getEnvViewerUsernames();
  return getCcUsers()
    .filter((u) => u.role === "viewer")
    .map((u) => ({
      accountId: u.username,
      displayName: u.displayName,
      source: isManagedViewer(u.username)
        ? ("admin" as const)
        : envNames.has(u.username)
          ? ("env" as const)
          : ("admin" as const),
      deletable: isManagedViewer(u.username),
      permissions: getViewerDashboardPermissions(u.username),
    }));
}

/** @deprecated Legacy shape for backward-compat admin routes */
function listViewerAccountsLegacy() {
  return listIntegrationAccounts().map((a) => ({
    viewerId: a.accountId,
    displayName: a.displayName,
    source: a.source,
    deletable: a.deletable,
    permissions: a.permissions,
  }));
}

function findAccount(accountId: string) {
  return listIntegrationAccounts().find((a) => a.accountId === accountId);
}

function apiBaseFromRequest(request: { headers: { host?: string } }): string {
  return resolveApiBaseUrl(request.headers.host);
}

function registerIntegrationAccountRoutes(app: FastifyInstance): void {
  app.get(
    "/v1/marafiq/admin/integration-accounts",
    {
      schema: {
        summary: "List integration accounts and dashboard access (admin only)",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }
      return reply.send({
        data: listIntegrationAccounts(),
        meta: { source: "shamal-platform" },
      });
    },
  );

  app.post(
    "/v1/marafiq/admin/integration-accounts",
    {
      schema: {
        summary: "Create an integration account (admin only)",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }

      const parsed = createViewerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }

      const apiKey =
        parsed.data.apiKey?.trim() || `vwr_${randomBytes(12).toString("hex")}`;

      const taken = getCcUsers().some((u) => u.username === parsed.data.username);
      if (taken) {
        return reply.status(409).send({
          error: "conflict",
          message: `Username "${parsed.data.username}" is already in use`,
        });
      }

      try {
        const record = createManagedViewer({
          ...parsed.data,
          apiKey,
        });
        const { token } = generateViewerIntegrationToken(record.username);
        return reply.status(201).send({
          data: {
            accountId: record.username,
            displayName: record.displayName,
            apiKey: record.apiKey,
            integrationAccessKey: token,
            source: "admin" as const,
            deletable: true,
            permissions: mergeViewerPermissions(null),
          },
          meta: { source: "shamal-platform" },
        });
      } catch (err) {
        return reply.status(400).send({
          error: "validation_error",
          message: (err as Error).message,
        });
      }
    },
  );

  app.delete(
    "/v1/marafiq/admin/integration-accounts/:accountId",
    {
      schema: {
        summary: "Delete an admin-managed integration account (admin only)",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }

      const { accountId } = request.params as { accountId: string };

      if (!isManagedViewer(accountId)) {
        return reply.status(400).send({
          error: "not_deletable",
          message:
            `Account "${accountId}" is configured in .env and cannot be deleted here. Remove it from the server environment instead.`,
        });
      }

      try {
        deleteManagedViewer(accountId);
        deleteViewerDashboardPermissions(accountId);
        deleteViewerIntegration(accountId);
        return reply.send({
          data: { accountId, deleted: true },
          meta: { source: "shamal-platform" },
        });
      } catch (err) {
        const message = (err as Error).message;
        if (message.includes("not found")) {
          return reply.status(404).send({ error: "not_found", message });
        }
        return reply.status(400).send({ error: "validation_error", message });
      }
    },
  );

  app.get(
    "/v1/marafiq/admin/integration-accounts/:accountId/access",
    {
      schema: {
        summary: "Read dashboard access settings (admin only)",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }

      const { accountId } = request.params as { accountId: string };
      const account = findAccount(accountId);
      if (!account) {
        return reply.status(404).send({
          error: "not_found",
          message: `Integration account "${accountId}" was not found.`,
        });
      }

      return reply.send({
        data: {
          accountId,
          displayName: account.displayName,
          permissions: getViewerDashboardPermissions(accountId),
        },
        meta: { source: "shamal-platform" },
      });
    },
  );

  app.patch(
    "/v1/marafiq/admin/integration-accounts/:accountId/access",
    {
      schema: {
        summary: "Update dashboard access settings (admin only)",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }

      const { accountId } = request.params as { accountId: string };
      const parsed = patchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }

      try {
        const permissions = updateViewerDashboardPermissions(accountId, parsed.data);
        const account = findAccount(accountId)!;
        return reply.send({
          data: {
            accountId,
            displayName: account.displayName,
            permissions,
          },
          meta: { source: "shamal-platform" },
        });
      } catch (err) {
        const message = (err as Error).message;
        if (message.startsWith("Unknown viewer")) {
          return reply.status(404).send({ error: "not_found", message });
        }
        return reply.status(400).send({ error: "validation_error", message });
      }
    },
  );

  app.get(
    "/v1/marafiq/admin/integration-accounts/:accountId/key",
    {
      schema: {
        summary: "Read integration key settings (admin only)",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }

      const { accountId } = request.params as { accountId: string };
      if (!findAccount(accountId)) {
        return reply.status(404).send({
          error: "not_found",
          message: `Integration account "${accountId}" was not found.`,
        });
      }

      return reply.send({
        data: getAdminIntegrationView(accountId, apiBaseFromRequest(request)),
        meta: { source: "shamal-platform" },
      });
    },
  );

  app.patch(
    "/v1/marafiq/admin/integration-accounts/:accountId/key",
    {
      schema: {
        summary: "Enable/disable integration API access (admin only)",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }

      const { accountId } = request.params as { accountId: string };
      const parsed = integrationPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }

      try {
        setViewerIntegrationEnabled(accountId, parsed.data.enabled);
        return reply.send({
          data: getAdminIntegrationView(accountId, apiBaseFromRequest(request)),
          meta: { source: "shamal-platform" },
        });
      } catch (err) {
        const message = (err as Error).message;
        if (message.startsWith("Unknown viewer")) {
          return reply.status(404).send({ error: "not_found", message });
        }
        return reply.status(400).send({ error: "validation_error", message });
      }
    },
  );

  app.post(
    "/v1/marafiq/admin/integration-accounts/:accountId/key/generate",
    {
      schema: {
        summary: "Generate integration access key (admin only)",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }

      const { accountId } = request.params as { accountId: string };
      try {
        const { token } = generateViewerIntegrationToken(accountId);
        return reply.send({
          data: {
            ...getAdminIntegrationView(accountId, apiBaseFromRequest(request)),
            accessKey: token,
          },
          meta: {
            source: "shamal-platform",
            note: "Store this access key securely. It is shown in full only once.",
          },
        });
      } catch (err) {
        const message = (err as Error).message;
        if (message.startsWith("Unknown viewer")) {
          return reply.status(404).send({ error: "not_found", message });
        }
        return reply.status(400).send({ error: "validation_error", message });
      }
    },
  );

  app.post(
    "/v1/marafiq/admin/integration-accounts/:accountId/key/regenerate",
    {
      schema: {
        summary: "Regenerate integration access key (admin only)",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }

      const { accountId } = request.params as { accountId: string };
      try {
        const { token } = regenerateViewerIntegrationToken(accountId);
        return reply.send({
          data: {
            ...getAdminIntegrationView(accountId, apiBaseFromRequest(request)),
            accessKey: token,
          },
          meta: {
            source: "shamal-platform",
            note: "Previous access key is now invalid. Store this key securely.",
          },
        });
      } catch (err) {
        const message = (err as Error).message;
        if (message.startsWith("Unknown viewer")) {
          return reply.status(404).send({ error: "not_found", message });
        }
        return reply.status(400).send({ error: "validation_error", message });
      }
    },
  );

  app.post(
    "/v1/marafiq/admin/integration-accounts/:accountId/key/revoke",
    {
      schema: {
        summary: "Revoke integration access key (admin only)",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }

      const { accountId } = request.params as { accountId: string };
      try {
        revokeViewerIntegrationToken(accountId);
        return reply.send({
          data: getAdminIntegrationView(accountId, apiBaseFromRequest(request)),
          meta: { source: "shamal-platform" },
        });
      } catch (err) {
        const message = (err as Error).message;
        if (message.startsWith("Unknown viewer")) {
          return reply.status(404).send({ error: "not_found", message });
        }
        return reply.status(400).send({ error: "validation_error", message });
      }
    },
  );
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  registerIntegrationAccountRoutes(app);

  // @deprecated backward-compat admin routes
  app.get(
    "/v1/marafiq/admin/viewers",
    { schema: { hide: true } },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }
      return reply.send({
        data: listViewerAccountsLegacy(),
        meta: { source: "shamal-platform" },
      });
    },
  );

  app.post(
    "/v1/marafiq/admin/viewers",
    { schema: { hide: true } },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }
      const parsed = createViewerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }
      const apiKey =
        parsed.data.apiKey?.trim() || `vwr_${randomBytes(12).toString("hex")}`;
      const taken = getCcUsers().some((u) => u.username === parsed.data.username);
      if (taken) {
        return reply.status(409).send({
          error: "conflict",
          message: `Username "${parsed.data.username}" is already in use`,
        });
      }
      try {
        const record = createManagedViewer({ ...parsed.data, apiKey });
        const { token } = generateViewerIntegrationToken(record.username);
        return reply.status(201).send({
          data: {
            viewerId: record.username,
            displayName: record.displayName,
            apiKey: record.apiKey,
            integrationAccessKey: token,
            source: "admin" as const,
            deletable: true,
            permissions: mergeViewerPermissions(null),
          },
          meta: { source: "shamal-platform" },
        });
      } catch (err) {
        return reply.status(400).send({
          error: "validation_error",
          message: (err as Error).message,
        });
      }
    },
  );

  app.delete(
    "/v1/marafiq/admin/viewers/:viewerId",
    { schema: { hide: true } },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }
      const { viewerId } = request.params as { viewerId: string };
      if (!isManagedViewer(viewerId)) {
        return reply.status(400).send({
          error: "not_deletable",
          message:
            `Account "${viewerId}" is configured in .env and cannot be deleted here.`,
        });
      }
      try {
        deleteManagedViewer(viewerId);
        deleteViewerDashboardPermissions(viewerId);
        deleteViewerIntegration(viewerId);
        return reply.send({
          data: { viewerId, deleted: true },
          meta: { source: "shamal-platform" },
        });
      } catch (err) {
        const message = (err as Error).message;
        if (message.includes("not found")) {
          return reply.status(404).send({ error: "not_found", message });
        }
        return reply.status(400).send({ error: "validation_error", message });
      }
    },
  );

  app.get(
    "/v1/marafiq/admin/viewer-settings/:viewerId",
    { schema: { hide: true } },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }
      const { viewerId } = request.params as { viewerId: string };
      const account = findAccount(viewerId);
      if (!account) {
        return reply.status(404).send({
          error: "not_found",
          message: `Integration account "${viewerId}" was not found.`,
        });
      }
      return reply.send({
        data: {
          viewerId,
          displayName: account.displayName,
          permissions: getViewerDashboardPermissions(viewerId),
        },
        meta: { source: "shamal-platform" },
      });
    },
  );

  app.patch(
    "/v1/marafiq/admin/viewer-settings/:viewerId",
    { schema: { hide: true } },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }
      const { viewerId } = request.params as { viewerId: string };
      const parsed = patchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }
      try {
        const permissions = updateViewerDashboardPermissions(viewerId, parsed.data);
        const account = findAccount(viewerId)!;
        return reply.send({
          data: {
            viewerId,
            displayName: account.displayName,
            permissions,
          },
          meta: { source: "shamal-platform" },
        });
      } catch (err) {
        const message = (err as Error).message;
        if (message.startsWith("Unknown viewer")) {
          return reply.status(404).send({ error: "not_found", message });
        }
        return reply.status(400).send({ error: "validation_error", message });
      }
    },
  );

  app.get(
    "/v1/marafiq/admin/viewers/:viewerId/integration",
    { schema: { hide: true } },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }
      const { viewerId } = request.params as { viewerId: string };
      if (!findAccount(viewerId)) {
        return reply.status(404).send({
          error: "not_found",
          message: `Integration account "${viewerId}" was not found.`,
        });
      }
      const view = getAdminIntegrationView(viewerId, apiBaseFromRequest(request));
      return reply.send({
        data: { ...view, viewerId, scopes: undefined },
        meta: { source: "shamal-platform" },
      });
    },
  );

  app.patch(
    "/v1/marafiq/admin/viewers/:viewerId/integration",
    { schema: { hide: true } },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }
      const { viewerId } = request.params as { viewerId: string };
      const parsed = integrationPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }
      try {
        setViewerIntegrationEnabled(viewerId, parsed.data.enabled);
        return reply.send({
          data: getAdminIntegrationView(viewerId, apiBaseFromRequest(request)),
          meta: { source: "shamal-platform" },
        });
      } catch (err) {
        const message = (err as Error).message;
        if (message.startsWith("Unknown viewer")) {
          return reply.status(404).send({ error: "not_found", message });
        }
        return reply.status(400).send({ error: "validation_error", message });
      }
    },
  );

  app.post(
    "/v1/marafiq/admin/viewers/:viewerId/integration/generate",
    { schema: { hide: true } },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }
      const { viewerId } = request.params as { viewerId: string };
      try {
        const { token } = generateViewerIntegrationToken(viewerId);
        return reply.send({
          data: {
            ...getAdminIntegrationView(viewerId, apiBaseFromRequest(request)),
            apiKey: token,
            accessKey: token,
          },
          meta: { source: "shamal-platform" },
        });
      } catch (err) {
        const message = (err as Error).message;
        if (message.startsWith("Unknown viewer")) {
          return reply.status(404).send({ error: "not_found", message });
        }
        return reply.status(400).send({ error: "validation_error", message });
      }
    },
  );

  app.post(
    "/v1/marafiq/admin/viewers/:viewerId/integration/regenerate",
    { schema: { hide: true } },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }
      const { viewerId } = request.params as { viewerId: string };
      try {
        const { token } = regenerateViewerIntegrationToken(viewerId);
        return reply.send({
          data: {
            ...getAdminIntegrationView(viewerId, apiBaseFromRequest(request)),
            apiKey: token,
            accessKey: token,
          },
          meta: { source: "shamal-platform" },
        });
      } catch (err) {
        const message = (err as Error).message;
        if (message.startsWith("Unknown viewer")) {
          return reply.status(404).send({ error: "not_found", message });
        }
        return reply.status(400).send({ error: "validation_error", message });
      }
    },
  );

  app.post(
    "/v1/marafiq/admin/viewers/:viewerId/integration/revoke",
    { schema: { hide: true } },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }
      const { viewerId } = request.params as { viewerId: string };
      try {
        revokeViewerIntegrationToken(viewerId);
        return reply.send({
          data: getAdminIntegrationView(viewerId, apiBaseFromRequest(request)),
          meta: { source: "shamal-platform" },
        });
      } catch (err) {
        const message = (err as Error).message;
        if (message.startsWith("Unknown viewer")) {
          return reply.status(404).send({ error: "not_found", message });
        }
        return reply.status(400).send({ error: "validation_error", message });
      }
    },
  );
};
