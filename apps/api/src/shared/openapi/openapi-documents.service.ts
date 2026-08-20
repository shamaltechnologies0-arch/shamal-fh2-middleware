import {
  applyCatalogToOperation,
  isPublicDocsOperation,
  PUBLIC_DOCS_GROUPS,
  PUBLIC_DOCS_OPERATIONS,
  sanitizeClientCopy,
} from "./public-docs-catalog.js";

export type OpenApiOperation = {
  tags?: string[];
  summary?: string;
  description?: string;
  deprecated?: boolean;
  hide?: boolean;
  adminDocsOnly?: boolean;
  publicDocs?: boolean;
  internal?: boolean;
  platformAdmin?: boolean;
  excludeFromPublicDocs?: boolean;
  [key: string]: unknown;
};

export type OpenApiPathItem = Record<string, OpenApiOperation | undefined>;

export type OpenApiDocument = {
  openapi?: string;
  info?: Record<string, unknown>;
  paths?: Record<string, OpenApiPathItem>;
  components?: Record<string, unknown>;
  security?: unknown[];
  [key: string]: unknown;
};

const LEGACY_VIEWER_PREFIX = "/v1/viewer";
const ADMIN_API_PREFIX = "/v1/platform/admin";

const INTERNAL_EXACT_PATHS = new Set([
  "/",
  "/openapi.json",
  "/openapi.yaml",
  "/docs",
  "/docs/",
  "/docs/json",
  "/admin-docs/json",
]);

const PUBLIC_INTEGRATION_ROOTS = new Set([
  "auth",
  "api-keys",
  "service-accounts",
  "capabilities",
  "devices",
  "docks",
  "fleet",
  "tasks",
  "events",
  "media",
  "mapping",
]);

const SECRET_PATTERNS = [
  /demo-viewer-key/i,
  /change-me/i,
  /client_secret/i,
  /FH2_ORG_TOKEN/i,
  /WEBHOOK_SECRET/i,
  /password\s*[:=]/i,
];

function pathRoot(path: string): string | null {
  const segments = path.split("/").filter(Boolean);
  if (segments[0] !== "v1") return segments[0] ?? null;
  return segments[1] ?? null;
}

function isCanonicalIntegrationPath(path: string): boolean {
  const root = pathRoot(path);
  return Boolean(root && PUBLIC_INTEGRATION_ROOTS.has(root));
}

function operationFlags(operation: OpenApiOperation | undefined): {
  hide: boolean;
  adminDocsOnly: boolean;
  publicDocs: boolean;
  internal: boolean;
} {
  if (!operation || typeof operation !== "object") {
    return {
      hide: false,
      adminDocsOnly: false,
      publicDocs: false,
      internal: false,
    };
  }
  return {
    hide: operation.hide === true,
    adminDocsOnly:
      operation.adminDocsOnly === true ||
      operation.platformAdmin === true ||
      operation.excludeFromPublicDocs === true,
    publicDocs: operation.publicDocs === true,
    internal: operation.internal === true,
  };
}

function pathHasAdminOnlyOperation(pathItem: OpenApiPathItem | undefined): boolean {
  if (!pathItem) return false;
  for (const operation of Object.values(pathItem)) {
    if (!operation || typeof operation !== "object") continue;
    if (operationFlags(operation).adminDocsOnly) return true;
    if (operation.tags?.includes("Admin")) return true;
  }
  return false;
}

export function isAdminOnlyOpenApiPath(
  path: string,
  pathItem?: OpenApiPathItem,
): boolean {
  if (path.startsWith(ADMIN_API_PREFIX)) return true;
  return pathHasAdminOnlyOperation(pathItem);
}

export function isPublicIntegrationOpenApiPath(
  path: string,
  pathItem?: OpenApiPathItem,
): boolean {
  if (INTERNAL_EXACT_PATHS.has(path)) return false;
  if (path.startsWith(LEGACY_VIEWER_PREFIX)) return false;
  if (isAdminOnlyOpenApiPath(path, pathItem)) return false;

  if (path === "/health") return true;
  if (path.startsWith("/v1/platform/integration/")) return true;
  if (isCanonicalIntegrationPath(path)) return true;

  if (pathItem) {
    for (const operation of Object.values(pathItem)) {
      if (!operation || typeof operation !== "object") continue;
      const flags = operationFlags(operation);
      if (flags.publicDocs) return true;
    }
  }

  return false;
}

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);

function shouldIncludeInPublicDoc(
  path: string,
  pathItem: OpenApiPathItem,
): boolean {
  if (!isPublicIntegrationOpenApiPath(path, pathItem)) return false;

  for (const [method, operation] of Object.entries(pathItem)) {
    if (!HTTP_METHODS.has(method.toLowerCase())) continue;
    if (!operation || typeof operation !== "object") continue;
    const flags = operationFlags(operation);
    if (flags.hide && !flags.publicDocs) continue;
    if (flags.internal) continue;
    if (isPublicDocsOperation(method, path)) return true;
  }

  return false;
}

function shouldIncludeInAdminDoc(path: string, pathItem: OpenApiPathItem): boolean {
  if (INTERNAL_EXACT_PATHS.has(path)) return false;
  if (path.startsWith(LEGACY_VIEWER_PREFIX)) return false;

  for (const operation of Object.values(pathItem)) {
    if (!operation || typeof operation !== "object") continue;
    if (operationFlags(operation).hide) return false;
  }

  return true;
}

function stripDocMetadata<T extends OpenApiOperation>(operation: T): T {
  const {
    hide: _hide,
    adminDocsOnly: _adminDocsOnly,
    publicDocs: _publicDocs,
    internal: _internal,
    platformAdmin: _platformAdmin,
    excludeFromPublicDocs: _excludeFromPublicDocs,
    ...rest
  } = operation;
  return rest as T;
}

function clonePathItem(pathItem: OpenApiPathItem): OpenApiPathItem {
  const cloned: OpenApiPathItem = {};
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!operation || typeof operation !== "object") continue;
    cloned[method] = stripDocMetadata({ ...operation });
  }
  return cloned;
}

function clonePublicPathItem(
  path: string,
  pathItem: OpenApiPathItem,
): OpenApiPathItem {
  const cloned: OpenApiPathItem = {};
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!HTTP_METHODS.has(method.toLowerCase())) continue;
    if (!operation || typeof operation !== "object") continue;
    if (!isPublicDocsOperation(method, path)) continue;
    const cleaned = stripDocMetadata({ ...operation });
    cloned[method] = applyCatalogToOperation(
      method,
      path,
      cleaned,
    ) as OpenApiOperation;
  }
  return cloned;
}

function sanitizeInfo(
  info: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const next = { ...(info ?? {}) };
  for (const key of ["title", "description", "summary"] as const) {
    if (typeof next[key] === "string") {
      next[key] = sanitizeClientCopy(next[key] as string);
    }
  }
  return next;
}

export const PUBLIC_OPENAPI_INFO = {
  title: "Shamal Platform Integration API",
  version: "2.3.0",
  description:
    "REST API for Command Center integrations — fleet, live view, telemetry, events, and media. " +
    "Authenticate with `X-Api-Key` for resource routes, " +
    "OAuth 2.0 Client Credentials (`POST /v1/auth/token`) for service accounts, " +
    "or a Bearer integration token for `/v1/platform/integration/*` overview routes.",
};

export const ADMIN_OPENAPI_INFO = {
  title: "Shamal Platform Admin API",
  version: "2.3.0",
  description:
    "Complete platform administration and integration API documentation for authorized Shamal administrators. " +
    "Includes all public integration routes plus `/v1/platform/admin/*` management APIs.",
};

export const PUBLIC_OPENAPI_COMPONENTS = {
  securitySchemes: {
    ApiKeyAuth: {
      type: "apiKey",
      in: "header",
      name: "X-Api-Key",
    },
    OAuth2ClientCredentials: {
      type: "oauth2",
      flows: {
        clientCredentials: {
          tokenUrl: "/v1/auth/token",
          scopes: {},
        },
      },
    },
    IntegrationBearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "shm_live",
      description: "Integration access key for `/v1/platform/integration/*` routes.",
    },
  },
};

export const ADMIN_OPENAPI_COMPONENTS = {
  securitySchemes: {
    ...PUBLIC_OPENAPI_COMPONENTS.securitySchemes,
    AdminSessionAuth: {
      type: "apiKey",
      in: "header",
      name: "X-CC-Session",
      description:
        "Shamal Platform admin session token from `POST /v1/auth/login`, sent together with `X-Api-Key`.",
    },
  },
};

export function buildPublicOpenApiDocument<T extends OpenApiDocument>(doc: T): T {
  if (!doc.paths) return doc;

  const filteredPaths: Record<string, OpenApiPathItem> = {};
  for (const [path, pathItem] of Object.entries(doc.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    if (!shouldIncludeInPublicDoc(path, pathItem)) continue;
    const cloned = clonePublicPathItem(path, pathItem);
    if (Object.keys(cloned).length === 0) continue;
    filteredPaths[path] = cloned;
  }

  return {
    ...doc,
    info: {
      ...sanitizeInfo(doc.info),
      ...PUBLIC_OPENAPI_INFO,
    },
    tags: PUBLIC_DOCS_GROUPS.map((group) => ({
      name: group.label,
      description: group.description,
    })),
    "x-docsCatalog": {
      groups: PUBLIC_DOCS_GROUPS,
      operations: PUBLIC_DOCS_OPERATIONS,
    },
    components: {
      ...(doc.components ?? {}),
      ...PUBLIC_OPENAPI_COMPONENTS,
    },
    security: [{ ApiKeyAuth: [] }],
    paths: filteredPaths,
  };
}

export function buildAdminOpenApiDocument<T extends OpenApiDocument>(doc: T): T {
  if (!doc.paths) return doc;

  const filteredPaths: Record<string, OpenApiPathItem> = {};
  for (const [path, pathItem] of Object.entries(doc.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    if (!shouldIncludeInAdminDoc(path, pathItem)) continue;
    filteredPaths[path] = clonePathItem(pathItem);
  }

  return {
    ...doc,
    info: {
      ...(doc.info ?? {}),
      ...ADMIN_OPENAPI_INFO,
    },
    components: {
      ...(doc.components ?? {}),
      ...ADMIN_OPENAPI_COMPONENTS,
    },
    security: [{ ApiKeyAuth: [] }, { AdminSessionAuth: [] }],
    paths: filteredPaths,
  };
}

export function listOpenApiPaths(doc: OpenApiDocument): string[] {
  return Object.keys(doc.paths ?? {}).sort();
}

export function findAdminPaths(doc: OpenApiDocument): string[] {
  return listOpenApiPaths(doc).filter((path) => path.startsWith(ADMIN_API_PREFIX));
}

export function findSecretLeaks(doc: OpenApiDocument): string[] {
  const serialized = JSON.stringify(doc);
  return SECRET_PATTERNS.filter((pattern) => pattern.test(serialized)).map(
    (pattern) => pattern.source,
  );
}

/** @deprecated Use buildPublicOpenApiDocument */
export const filterPublicOpenApiDocument = buildPublicOpenApiDocument;
