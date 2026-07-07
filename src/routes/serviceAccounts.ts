import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  RouteHandlerMethod,
} from "fastify";
import { hasMinRole } from "../services/commandCenterAuth.js";
import {
  CREDENTIAL_EXPIRATION_OPTIONS,
  SERVICE_ACCOUNTS_MAX_PER_USER,
  createServiceAccount,
  createServiceAccountSchema,
  deleteServiceAccount,
  getServiceAccount,
  listAvailableScopes,
  listServiceAccounts,
  listAllServiceAccounts,
  reactivateServiceAccount,
  revokeServiceAccount,
  rotateServiceAccountSecret,
  updateServiceAccount,
  updateServiceAccountSchema,
  type ServiceAccountPublic,
} from "../services/serviceAccounts.js";
import {
  registerAdminGet,
  registerAdminPost,
  registerViewerRoutes,
} from "./viewerPaths.js";

function requireSignedInUser(
  request: FastifyRequest,
  reply: FastifyReply,
): request is FastifyRequest & { ccUsername: string } {
  if (!request.ccUsername) {
    reply.status(403).send({
      error: "forbidden",
      message: "Signed-in user session required",
    });
    return false;
  }
  return true;
}

function requireAdmin(role: string | undefined, reply: FastifyReply): boolean {
  if (!role || !hasMinRole(role as "viewer" | "operator" | "admin", "admin")) {
    reply.status(403).send({
      error: "forbidden",
      message: "Admin role required for this endpoint.",
    });
    return false;
  }
  return true;
}

function toApiRecord(record: ServiceAccountPublic, clientSecret?: string) {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    ownerUserId: record.ownerUserId,
    clientId: record.clientId,
    client_id: record.clientId,
    ...(clientSecret ? { clientSecret, client_secret: clientSecret } : {}),
    clientSecretMasked: record.clientSecretMasked,
    scopes: record.scopes,
    expiration: record.expirationPreset,
    expiresAt: record.expiresAt,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
    createdBy: record.createdBy,
  };
}

function listMeta(ownerUserId: string) {
  return {
    source: "shamal-platform" as const,
    maxAccounts: SERVICE_ACCOUNTS_MAX_PER_USER,
    expirationOptions: CREDENTIAL_EXPIRATION_OPTIONS,
    availableScopes: listAvailableScopes(ownerUserId),
  };
}

function handleServiceError(err: unknown, reply: FastifyReply) {
  const message = (err as Error).message;
  if (message === "Service account not found") {
    return reply.status(404).send({ error: "not_found", message });
  }
  if (
    message.startsWith("Invalid") ||
    message.startsWith("Maximum") ||
    message.startsWith("Revoked") ||
    message.startsWith("Expired") ||
    message.startsWith("Scopes not permitted") ||
    message.startsWith("Only active")
  ) {
    return reply.status(400).send({ error: "validation_error", message });
  }
  return reply.status(500).send({ error: "internal_error", message });
}

type RouteOpts = Record<string, unknown>;

export const serviceAccountsRoutes: FastifyPluginAsync = async (app) => {
  registerViewerRoutes(
    app,
    "get",
    "/v1/service-accounts",
    {
      schema: {
        summary: "List service accounts owned by the signed-in user",
        tags: ["Service Accounts"],
      },
    },
    async (request, reply) => {
      if (!requireSignedInUser(request, reply)) return;
      const data = listServiceAccounts(request.ccUsername).map((row) => toApiRecord(row));
      return reply.send({ data, meta: listMeta(request.ccUsername) });
    },
  );

  registerViewerRoutes(
    app,
    "post",
    "/v1/service-accounts",
    {
      schema: {
        summary: "Create a service account for machine-to-machine API access",
        tags: ["Service Accounts"],
      },
    },
    async (request, reply) => {
      if (!requireSignedInUser(request, reply)) return;
      const parsed = createServiceAccountSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }
      try {
        const { record, clientSecret } = createServiceAccount(
          request.ccUsername,
          parsed.data,
          request.ccUsername,
        );
        return reply.status(201).send({
          data: toApiRecord(record, clientSecret),
          meta: {
            ...listMeta(request.ccUsername),
            note: "Store client_secret securely. It is shown in full only once.",
          },
        });
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  registerViewerRoutes(
    app,
    "get",
    "/v1/service-accounts/:id",
    {
      schema: { summary: "Get one service account", tags: ["Service Accounts"] },
    },
    async (request, reply) => {
      if (!requireSignedInUser(request, reply)) return;
      const { id } = request.params as { id: string };
      const record = getServiceAccount(request.ccUsername, id);
      if (!record) {
        return reply.status(404).send({ error: "not_found", message: "Service account not found" });
      }
      return reply.send({ data: toApiRecord(record), meta: listMeta(request.ccUsername) });
    },
  );

  registerViewerRoutes(
    app,
    "patch",
    "/v1/service-accounts/:id",
    {
      schema: { summary: "Update service account metadata or scopes", tags: ["Service Accounts"] },
    },
    async (request, reply) => {
      if (!requireSignedInUser(request, reply)) return;
      const { id } = request.params as { id: string };
      const parsed = updateServiceAccountSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }
      try {
        const record = updateServiceAccount(request.ccUsername, id, parsed.data);
        return reply.send({ data: toApiRecord(record), meta: listMeta(request.ccUsername) });
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  registerViewerRoutes(
    app,
    "post",
    "/v1/service-accounts/:id/revoke",
    {
      schema: { summary: "Revoke a service account", tags: ["Service Accounts"] },
    },
    async (request, reply) => {
      if (!requireSignedInUser(request, reply)) return;
      const { id } = request.params as { id: string };
      try {
        const record = revokeServiceAccount(request.ccUsername, id);
        return reply.send({ data: toApiRecord(record), meta: listMeta(request.ccUsername) });
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  registerViewerRoutes(
    app,
    "post",
    "/v1/service-accounts/:id/reactivate",
    {
      schema: { summary: "Reactivate a revoked service account", tags: ["Service Accounts"] },
    },
    async (request, reply) => {
      if (!requireSignedInUser(request, reply)) return;
      const { id } = request.params as { id: string };
      try {
        const record = reactivateServiceAccount(request.ccUsername, id);
        return reply.send({ data: toApiRecord(record), meta: listMeta(request.ccUsername) });
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  registerViewerRoutes(
    app,
    "post",
    "/v1/service-accounts/:id/rotate-secret",
    {
      schema: {
        summary: "Rotate client secret (shown once)",
        tags: ["Service Accounts"],
      },
    },
    async (request, reply) => {
      if (!requireSignedInUser(request, reply)) return;
      const { id } = request.params as { id: string };
      try {
        const { record, clientSecret } = rotateServiceAccountSecret(request.ccUsername, id);
        return reply.send({
          data: toApiRecord(record, clientSecret),
          meta: {
            ...listMeta(request.ccUsername),
            note: "Previous client_secret is invalid. Store the new secret securely.",
          },
        });
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  registerViewerRoutes(
    app,
    "delete",
    "/v1/service-accounts/:id",
    {
      schema: { summary: "Delete a service account permanently", tags: ["Service Accounts"] },
    },
    async (request, reply) => {
      if (!requireSignedInUser(request, reply)) return;
      const { id } = request.params as { id: string };
      try {
        deleteServiceAccount(request.ccUsername, id);
        return reply.send({
          data: { id, deleted: true },
          meta: listMeta(request.ccUsername),
        });
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );
};

export function registerAdminServiceAccountRoutes(app: FastifyInstance): void {
  registerAdminGet(
    app,
    "/v1/platform/admin/service-accounts",
    {
      schema: {
        summary: "List service accounts (admin; optional ownerUserId filter)",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      if (!requireAdmin(request.ccRole, reply)) return;
      const ownerUserId = (request.query as { ownerUserId?: string }).ownerUserId?.trim();
      const data = listAllServiceAccounts(ownerUserId || undefined).map((row) => toApiRecord(row));
      return reply.send({
        data,
        meta: {
          source: "shamal-platform",
          filterOwnerUserId: ownerUserId || null,
        },
      });
    },
  );

  registerAdminPost(
    app,
    "/v1/platform/admin/service-accounts",
    {
      schema: {
        summary: "Create a service account for a user (admin)",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      if (!requireAdmin(request.ccRole, reply)) return;
      const parsed = createServiceAccountSchema.safeParse(request.body);
      if (!parsed.success || !parsed.data.ownerUserId) {
        return reply.status(400).send({
          error: "validation_error",
          message: "name, scopes, expiration, and ownerUserId are required",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
      }
      try {
        const { record, clientSecret } = createServiceAccount(
          parsed.data.ownerUserId,
          parsed.data,
          request.ccUsername ?? "admin",
        );
        return reply.status(201).send({
          data: toApiRecord(record, clientSecret),
          meta: {
            source: "shamal-platform",
            note: "Store client_secret securely. It is shown in full only once.",
          },
        });
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );
}
