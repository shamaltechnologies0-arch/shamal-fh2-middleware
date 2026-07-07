import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { readCcCredentialEnv } from "../config.js";
import {
  CREDENTIAL_EXPIRATION_OPTIONS,
  credentialExpirationPresetSchema,
} from "../services/credentialExpiration.js";
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
import {
  assignViewerToProject,
  getFh2ProjectSyncStatus,
  listAssignedViewerIds,
  listFh2Projects,
  removeViewerFromAllProjects,
  removeViewerFromProject,
  setFh2ProjectLocalStatus,
  syncFh2ProjectsFromSource,
} from "../services/fh2Projects.js";
import { registerAdminRestApiKeyRoutes } from "./restApiKeys.js";
import { registerAdminServiceAccountRoutes } from "./serviceAccounts.js";
import {
  registerAdminDelete,
  registerAdminGet,
  registerAdminPatch,
  registerAdminPost,
} from "./viewerPaths.js";

const integrationPatchSchema = z.object({
  enabled: z.boolean(),
});

const integrationTokenSchema = z.object({
  expiration: credentialExpirationPresetSchema,
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

function findAccount(accountId: string) {
  return listIntegrationAccounts().find((a) => a.accountId === accountId);
}

function apiBaseFromRequest(request: { headers: { host?: string } }): string {
  return resolveApiBaseUrl(request.headers.host);
}

function listProjectsWithAssignments() {
  const viewers = getCcUsers()
    .filter((u) => u.role === "viewer")
    .map((u) => ({ id: u.username, displayName: u.displayName }));
  return listFh2Projects().map((project) => {
    const assignedViewerIds = listAssignedViewerIds(project.fh2ProjectId);
    return {
      ...project,
      assignedViewers: assignedViewerIds.map((viewerId) => {
        const viewer = viewers.find((v) => v.id === viewerId);
        return {
          viewerId,
          displayName: viewer?.displayName ?? viewerId,
        };
      }),
      assignedCount: assignedViewerIds.length,
    };
  });
}

function registerIntegrationAccountRoutes(app: FastifyInstance): void {
  registerAdminGet(
    app,
    "/v1/platform/admin/integration-accounts",
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

  registerAdminPost(
    app,
    "/v1/platform/admin/integration-accounts",
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

      const taken = getCcUsers().some((u) => u.username === parsed.data.username);
      if (taken) {
        return reply.status(409).send({
          error: "conflict",
          message: `Username "${parsed.data.username}" is already in use`,
        });
      }

      try {
        const created = await createManagedViewer(parsed.data);
        const { token } = await generateViewerIntegrationToken(created.record.username, "1y");
        return reply.status(201).send({
          data: {
            accountId: created.record.username,
            displayName: created.record.displayName,
            apiKey: created.initialApiKey,
            primaryRestApiKeyMasked: created.primaryRestApiKeyMasked,
            integrationAccessKey: token,
            source: "admin" as const,
            deletable: true,
            permissions: mergeViewerPermissions(null),
          },
          meta: {
            source: "shamal-platform",
            note: "Store apiKey securely. It is shown in full only once.",
            expirationOptions: CREDENTIAL_EXPIRATION_OPTIONS,
          },
        });
      } catch (err) {
        return reply.status(400).send({
          error: "validation_error",
          message: (err as Error).message,
        });
      }
    },
  );

  registerAdminDelete(
    app,
    "/v1/platform/admin/integration-accounts/:accountId",
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
        await deleteManagedViewer(accountId);
        await deleteViewerDashboardPermissions(accountId);
        await deleteViewerIntegration(accountId);
        await removeViewerFromAllProjects(accountId);
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

  registerAdminGet(
    app,
    "/v1/platform/admin/integration-accounts/:accountId/access",
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

  registerAdminPatch(
    app,
    "/v1/platform/admin/integration-accounts/:accountId/access",
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
        const permissions = await updateViewerDashboardPermissions(accountId, parsed.data);
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

  registerAdminGet(
    app,
    "/v1/platform/admin/integration-accounts/:accountId/key",
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

  registerAdminPatch(
    app,
    "/v1/platform/admin/integration-accounts/:accountId/key",
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
        await setViewerIntegrationEnabled(accountId, parsed.data.enabled);
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

  registerAdminPost(
    app,
    "/v1/platform/admin/integration-accounts/:accountId/key/generate",
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
      const parsed = integrationTokenSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }
      try {
        const { token } = await generateViewerIntegrationToken(accountId, parsed.data.expiration);
        return reply.send({
          data: {
            ...getAdminIntegrationView(accountId, apiBaseFromRequest(request)),
            accessKey: token,
          },
          meta: {
            source: "shamal-platform",
            note: "Store this access key securely. It is shown in full only once.",
            expirationOptions: CREDENTIAL_EXPIRATION_OPTIONS,
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

  registerAdminPost(
    app,
    "/v1/platform/admin/integration-accounts/:accountId/key/regenerate",
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
      const parsed = integrationTokenSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }
      try {
        const { token } = await regenerateViewerIntegrationToken(accountId, parsed.data.expiration);
        return reply.send({
          data: {
            ...getAdminIntegrationView(accountId, apiBaseFromRequest(request)),
            accessKey: token,
          },
          meta: {
            source: "shamal-platform",
            note: "Previous access key is now invalid. Store this key securely.",
            expirationOptions: CREDENTIAL_EXPIRATION_OPTIONS,
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

  registerAdminPost(
    app,
    "/v1/platform/admin/integration-accounts/:accountId/key/revoke",
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
        await revokeViewerIntegrationToken(accountId);
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
  registerAdminRestApiKeyRoutes(app);
  registerAdminServiceAccountRoutes(app);

  registerAdminGet(
    app,
    "/v1/platform/admin/fh2-projects",
    { schema: { summary: "List FH2 projects (admin only)", tags: ["Admin"] } },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) return reply.status(403).send({ error: "forbidden", message: gate.message });
      return reply.send({
        data: {
          projects: listProjectsWithAssignments(),
          sync: getFh2ProjectSyncStatus(),
          sourceOfTruth: "FH2",
        },
        meta: { source: "shamal-platform" },
      });
    },
  );

  registerAdminPost(
    app,
    "/v1/platform/admin/fh2-projects/sync",
    { schema: { summary: "Sync FH2 projects from FlightHub 2 (admin only)", tags: ["Admin"] } },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) return reply.status(403).send({ error: "forbidden", message: gate.message });
      try {
        const synced = await syncFh2ProjectsFromSource();
        return reply.send({
          data: {
            syncedCount: synced.syncedCount,
            projects: listProjectsWithAssignments(),
            sync: getFh2ProjectSyncStatus(),
          },
          meta: { source: "shamal-platform" },
        });
      } catch (err) {
        return reply.status(502).send({
          error: "sync_failed",
          message:
            "Unable to sync projects from FlightHub 2. Please check FH2 credentials/API access.",
          details: (err as Error).message,
        });
      }
    },
  );

  registerAdminPost(
    app,
    "/v1/platform/admin/fh2-projects/:projectId/assign-viewer",
    { schema: { summary: "Assign viewer to synced FH2 project (admin only)", tags: ["Admin"] } },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) return reply.status(403).send({ error: "forbidden", message: gate.message });
      const { projectId } = request.params as { projectId: string };
      const { viewerId } = request.body as { viewerId?: string };
      if (!viewerId) {
        return reply.status(400).send({ error: "validation_error", message: "viewerId is required" });
      }
      try {
        const viewerSet = new Set(
          getCcUsers()
            .filter((u) => u.role === "viewer")
            .map((u) => u.username),
        );
        if (!viewerSet.has(viewerId)) {
          return reply.status(400).send({
            error: "validation_error",
            message: `Only viewer users can be assigned: ${viewerId}`,
          });
        }
        await assignViewerToProject(projectId, viewerId);
        return reply.send({ data: { projectId, viewerId }, meta: { source: "shamal-platform" } });
      } catch (err) {
        const message = (err as Error).message;
        return reply
          .status(message.includes("not found") ? 404 : 400)
          .send({ error: "validation_error", message });
      }
    },
  );

  registerAdminDelete(
    app,
    "/v1/platform/admin/fh2-projects/:projectId/remove-viewer/:viewerId",
    { schema: { summary: "Remove viewer assignment (admin only)", tags: ["Admin"] } },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) return reply.status(403).send({ error: "forbidden", message: gate.message });
      const { projectId, viewerId } = request.params as { projectId: string; viewerId: string };
      await removeViewerFromProject(projectId, viewerId);
      return reply.send({ data: { projectId, viewerId, removed: true }, meta: { source: "shamal-platform" } });
    },
  );

  registerAdminPost(
    app,
    "/v1/platform/admin/fh2-projects/:projectId/deactivate",
    { schema: { summary: "Deactivate FH2 project locally (admin only)", tags: ["Admin"] } },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) return reply.status(403).send({ error: "forbidden", message: gate.message });
      const { projectId } = request.params as { projectId: string };
      try {
        const project = await setFh2ProjectLocalStatus(projectId, false);
        return reply.send({ data: project, meta: { source: "shamal-platform" } });
      } catch (err) {
        const message = (err as Error).message;
        return reply
          .status(message.includes("not found") ? 404 : 400)
          .send({ error: "validation_error", message });
      }
    },
  );
};
