import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  RouteHandlerMethod,
} from "fastify";
import { getCcUsers, hasMinRole } from "../services/commandCenterAuth.js";
import {
  REST_API_KEYS_MAX_PER_USER,
  checkRevealRateLimit,
  createRestApiKey,
  createRestApiKeySchema,
  deleteRestApiKey,
  getRestApiKey,
  listRestApiKeys,
  revealRestApiKey,
  setPrimaryRestApiKey,
  updateRestApiKey,
  updateRestApiKeySchema,
  type RestApiKeyPublic,
} from "../services/restApiKeys.js";
import { viewerRoutePaths } from "./viewerPaths.js";

type RouteOpts = Record<string, unknown>;

function requireViewerSession(
  request: FastifyRequest,
  reply: FastifyReply,
): request is FastifyRequest & { ccUsername: string } {
  if (request.ccRole !== "viewer" || !request.ccUsername) {
    reply.status(403).send({
      error: "forbidden",
      message: "Viewer session required",
    });
    return false;
  }
  return true;
}

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

function toListItem(record: RestApiKeyPublic) {
  return {
    id: record.id,
    label: record.label,
    keyMasked: record.keyMasked,
    status: record.status,
    isPrimary: record.isPrimary,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastUsedAt: record.lastUsedAt,
  };
}

function toDetailItem(record: RestApiKeyPublic) {
  return toListItem(record);
}

function toCreateItem(record: RestApiKeyPublic, plaintext: string) {
  return {
    id: record.id,
    label: record.label,
    apiKey: plaintext,
    keyMasked: record.keyMasked,
    status: record.status,
    isPrimary: record.isPrimary,
    createdAt: record.createdAt,
  };
}

function listMeta() {
  return {
    source: "shamal-platform" as const,
    maxKeys: REST_API_KEYS_MAX_PER_USER,
  };
}

function handleServiceError(err: unknown, reply: FastifyReply) {
  const message = (err as Error).message;
  if (message === "API key not found") {
    return reply.status(404).send({ error: "not_found", message });
  }
  if (
    message.startsWith("Invalid") ||
    message.startsWith("Cannot") ||
    message.startsWith("Maximum") ||
    message.startsWith("API key label") ||
    message.startsWith("API keys must") ||
    message.startsWith("Revoked") ||
    message.startsWith("Only active") ||
    message.startsWith("Unknown viewer")
  ) {
    return reply.status(400).send({ error: "validation_error", message });
  }
  return reply.status(500).send({ error: "internal_error", message });
}

function registerViewerRoutes(
  app: FastifyInstance,
  method: "get" | "post" | "patch" | "delete",
  legacyPath: string,
  opts: RouteOpts,
  handler: RouteHandlerMethod,
): void {
  for (const path of viewerRoutePaths(legacyPath)) {
    app[method](path, opts, handler);
  }
}

export const restApiKeysRoutes: FastifyPluginAsync = async (app) => {
  registerViewerRoutes(
    app,
    "get",
    "/v1/marafiq/rest-api-keys",
    {
      schema: {
        summary: "List REST API keys for the signed-in viewer account",
        tags: ["REST API Keys"],
      },
    },
    async (request, reply) => {
      if (!requireViewerSession(request, reply)) return;
      const keys = listRestApiKeys(request.ccUsername).map(toListItem);
      return reply.send({ data: keys, meta: listMeta() });
    },
  );

  registerViewerRoutes(
    app,
    "post",
    "/v1/marafiq/rest-api-keys",
    {
      schema: {
        summary: "Create a REST API key (plaintext shown once)",
        tags: ["REST API Keys"],
      },
    },
    async (request, reply) => {
      if (!requireViewerSession(request, reply)) return;

      const parsed = createRestApiKeySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }

      try {
        const { record, plaintext } = createRestApiKey(
          request.ccUsername,
          parsed.data.label,
          request.ccUsername,
        );
        return reply.status(201).send({
          data: toCreateItem(record, plaintext),
          meta: {
            note: "Store this key securely. It is shown in full only once.",
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
    "/v1/marafiq/rest-api-keys/:id",
    {
      schema: {
        summary: "Get one REST API key (masked)",
        tags: ["REST API Keys"],
      },
    },
    async (request, reply) => {
      if (!requireViewerSession(request, reply)) return;
      const { id } = request.params as { id: string };
      const record = getRestApiKey(request.ccUsername, id);
      if (!record) {
        return reply.status(404).send({
          error: "not_found",
          message: "API key not found",
        });
      }
      return reply.send({ data: toDetailItem(record), meta: listMeta() });
    },
  );

  registerViewerRoutes(
    app,
    "patch",
    "/v1/marafiq/rest-api-keys/:id",
    {
      schema: {
        summary: "Update REST API key label or status",
        tags: ["REST API Keys"],
      },
    },
    async (request, reply) => {
      if (!requireViewerSession(request, reply)) return;
      const { id } = request.params as { id: string };
      const parsed = updateRestApiKeySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }
      if (!parsed.data.label && !parsed.data.status) {
        return reply.status(400).send({
          error: "validation_error",
          message: "At least one of label or status is required",
        });
      }

      try {
        const record = updateRestApiKey(request.ccUsername, id, parsed.data);
        return reply.send({ data: toDetailItem(record), meta: listMeta() });
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  registerViewerRoutes(
    app,
    "delete",
    "/v1/marafiq/rest-api-keys/:id",
    {
      schema: {
        summary: "Permanently delete a REST API key",
        tags: ["REST API Keys"],
      },
    },
    async (request, reply) => {
      if (!requireViewerSession(request, reply)) return;
      const { id } = request.params as { id: string };

      try {
        deleteRestApiKey(request.ccUsername, id);
        return reply.send({
          data: { id, deleted: true },
          meta: { source: "shamal-platform" },
        });
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  registerViewerRoutes(
    app,
    "post",
    "/v1/marafiq/rest-api-keys/:id/reveal",
    {
      schema: {
        summary: "Reveal full REST API key value (rate-limited)",
        tags: ["REST API Keys"],
      },
    },
    async (request, reply) => {
      if (!requireViewerSession(request, reply)) return;
      const { id } = request.params as { id: string };

      const rate = checkRevealRateLimit(request.ccUsername);
      if (!rate.allowed) {
        return reply.status(429).send({
          error: "rate_limited",
          message: "Reveal limit reached. Try again later.",
          retryAfterSec: rate.retryAfterSec,
        });
      }

      const record = getRestApiKey(request.ccUsername, id);
      if (!record) {
        return reply.status(404).send({
          error: "not_found",
          message: "API key not found",
        });
      }

      const apiKey = revealRestApiKey(request.ccUsername, id);
      if (!apiKey) {
        return reply.status(404).send({
          error: "not_available",
          message: "API key cannot be revealed",
        });
      }

      return reply.send({
        data: { id, apiKey },
        meta: { source: "shamal-platform" },
      });
    },
  );

  registerViewerRoutes(
    app,
    "post",
    "/v1/marafiq/rest-api-keys/:id/set-primary",
    {
      schema: {
        summary: "Set the primary REST API key for Command Center login",
        tags: ["REST API Keys"],
      },
    },
    async (request, reply) => {
      if (!requireViewerSession(request, reply)) return;
      const { id } = request.params as { id: string };

      try {
        const record = setPrimaryRestApiKey(request.ccUsername, id);
        return reply.send({ data: toDetailItem(record), meta: listMeta() });
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );
};

export function registerAdminRestApiKeyRoutes(app: FastifyInstance): void {
  app.get(
    "/v1/marafiq/admin/integration-accounts/:accountId/rest-api-keys",
    {
      schema: {
        summary: "List REST API keys for an integration account (admin only)",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }

      const { accountId } = request.params as { accountId: string };
      if (!findIntegrationAccount(accountId)) {
        return reply.status(404).send({
          error: "not_found",
          message: `Integration account "${accountId}" was not found.`,
        });
      }

      const keys = listRestApiKeys(accountId).map(toListItem);
      return reply.send({ data: keys, meta: listMeta() });
    },
  );

  app.post(
    "/v1/marafiq/admin/integration-accounts/:accountId/rest-api-keys",
    {
      schema: {
        summary: "Create REST API key for an integration account (admin only)",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }

      const { accountId } = request.params as { accountId: string };
      if (!findIntegrationAccount(accountId)) {
        return reply.status(404).send({
          error: "not_found",
          message: `Integration account "${accountId}" was not found.`,
        });
      }

      const parsed = createRestApiKeySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }

      try {
        const { record, plaintext } = createRestApiKey(
          accountId,
          parsed.data.label,
          request.ccUsername ?? "admin",
        );
        return reply.status(201).send({
          data: toCreateItem(record, plaintext),
          meta: {
            note: "Store this key securely. It is shown in full only once.",
          },
        });
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  app.patch(
    "/v1/marafiq/admin/integration-accounts/:accountId/rest-api-keys/:id",
    {
      schema: {
        summary: "Update REST API key for an integration account (admin only)",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }

      const { accountId, id } = request.params as { accountId: string; id: string };
      if (!findIntegrationAccount(accountId)) {
        return reply.status(404).send({
          error: "not_found",
          message: `Integration account "${accountId}" was not found.`,
        });
      }

      const parsed = updateRestApiKeySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "validation_error",
          details: parsed.error.flatten(),
        });
      }
      if (!parsed.data.label && !parsed.data.status) {
        return reply.status(400).send({
          error: "validation_error",
          message: "At least one of label or status is required",
        });
      }

      try {
        const record = updateRestApiKey(accountId, id, parsed.data);
        return reply.send({ data: toDetailItem(record), meta: listMeta() });
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  app.delete(
    "/v1/marafiq/admin/integration-accounts/:accountId/rest-api-keys/:id",
    {
      schema: {
        summary: "Delete REST API key for an integration account (admin only)",
        tags: ["Admin"],
      },
    },
    async (request, reply) => {
      const gate = requireAdmin(request.ccRole);
      if (!gate.ok) {
        return reply.status(403).send({ error: "forbidden", message: gate.message });
      }

      const { accountId, id } = request.params as { accountId: string; id: string };
      if (!findIntegrationAccount(accountId)) {
        return reply.status(404).send({
          error: "not_found",
          message: `Integration account "${accountId}" was not found.`,
        });
      }

      try {
        deleteRestApiKey(accountId, id);
        return reply.send({
          data: { id, deleted: true },
          meta: { source: "shamal-platform" },
        });
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );
}

function findIntegrationAccount(accountId: string): boolean {
  return getCcUsers().some((u) => u.role === "viewer" && u.username === accountId);
}
