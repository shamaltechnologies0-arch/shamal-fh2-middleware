import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  RouteHandlerMethod,
} from "fastify";

/** Canonical external integration API prefix (resource-based). */
export const API_V1_PREFIX = "/v1";

/** @deprecated Legacy integrator prefix — kept as backward-compatible alias only. */
export const VIEWER_LEGACY_PREFIX = "/v1/viewer";

/** @deprecated Use VIEWER_LEGACY_PREFIX */
export const VIEWER_PREFIX = VIEWER_LEGACY_PREFIX;

/** Shamal Platform internal routes (admin, integration session, ops). */
export const PLATFORM_PREFIX = "/v1/platform";

const LEGACY_TO_CANONICAL_SEGMENT: Record<string, string> = {
  "rest-api-keys": "api-keys",
};

const CANONICAL_TO_LEGACY_SEGMENT: Record<string, string> = {
  "api-keys": "rest-api-keys",
};

/** Top-level resource segments for the public integration API. */
export const INTEGRATION_API_ROOTS = new Set([
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
  "projects",
]);

type RouteOpts = Record<string, unknown>;
type HttpMethod = "get" | "post" | "patch" | "delete" | "put";

function splitPathSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function joinPathSegments(segments: string[]): string {
  return segments.length === 0 ? "" : `/${segments.join("/")}`;
}

function rewriteFirstSegment(
  segments: string[],
  map: Record<string, string>,
): string[] {
  if (segments.length === 0) return segments;
  const first = segments[0]!;
  const mapped = map[first];
  if (!mapped) return segments;
  return [mapped, ...segments.slice(1)];
}

/** Map legacy `/v1/viewer/*` paths to canonical `/v1/*` resource paths. */
export function toCanonicalPath(path: string): string {
  const clean = path.split("?")[0] ?? path;
  if (
    clean === VIEWER_LEGACY_PREFIX ||
    clean.startsWith(`${VIEWER_LEGACY_PREFIX}/`)
  ) {
    const suffix = clean.slice(VIEWER_LEGACY_PREFIX.length);
    const segments = rewriteFirstSegment(
      splitPathSegments(suffix),
      LEGACY_TO_CANONICAL_SEGMENT,
    );
    return `${API_V1_PREFIX}${joinPathSegments(segments)}`;
  }
  return clean;
}

/** Map canonical integration paths back to legacy `/v1/viewer/*` aliases. */
export function toLegacyViewerPath(canonicalPath: string): string | null {
  const clean = canonicalPath.split("?")[0] ?? canonicalPath;
  if (clean.startsWith(`${PLATFORM_PREFIX}/`) || clean === PLATFORM_PREFIX) {
    return null;
  }
  if (!clean.startsWith(`${API_V1_PREFIX}/`) && clean !== API_V1_PREFIX) {
    return null;
  }
  const suffix = clean.slice(API_V1_PREFIX.length);
  const canonicalSegments = splitPathSegments(suffix);
  const root = canonicalSegments[0];
  if (!root || !INTEGRATION_API_ROOTS.has(root)) {
    return null;
  }
  const segments = rewriteFirstSegment(
    canonicalSegments,
    CANONICAL_TO_LEGACY_SEGMENT,
  );
  return `${VIEWER_LEGACY_PREFIX}${joinPathSegments(segments)}`;
}

/** Normalize any integration path to its canonical form for auth and access checks. */
export function normalizeApiPath(path: string): string {
  return toCanonicalPath(path);
}

export function isCanonicalIntegrationPath(path: string): boolean {
  const canonical = normalizeApiPath(path);
  if (
    canonical.startsWith(`${PLATFORM_PREFIX}/`) ||
    canonical === PLATFORM_PREFIX
  ) {
    return false;
  }
  if (!canonical.startsWith(`${API_V1_PREFIX}/`)) {
    return false;
  }
  const root = splitPathSegments(canonical.slice(API_V1_PREFIX.length))[0];
  return Boolean(root && INTEGRATION_API_ROOTS.has(root));
}

export function isPlatformApiPath(path: string): boolean {
  const clean = path.split("?")[0] ?? path;
  if (clean.startsWith(`${PLATFORM_PREFIX}/`)) {
    return true;
  }
  return isCanonicalIntegrationPath(clean);
}

/** @deprecated Use isPlatformApiPath */
export const isViewerOrLegacyApiPath = isPlatformApiPath;

function resolveRegistrationPaths(path: string): {
  canonical: string;
  legacy: string | null;
} {
  const canonical = toCanonicalPath(path);
  const legacyFromCanonical = toLegacyViewerPath(canonical);
  const legacy =
    legacyFromCanonical && legacyFromCanonical !== canonical
      ? legacyFromCanonical
      : null;
  return { canonical, legacy };
}

function legacyAliasRouteOpts(
  canonical: string,
  opts: RouteOpts,
): RouteOpts {
  const merged: RouteOpts = { ...opts };
  merged.schema = { hide: true };

  const priorOnSend = merged.onSend as
    | ((
        request: FastifyRequest,
        reply: FastifyReply,
        payload: unknown,
      ) => unknown)
    | undefined;

  merged.onSend = async (
    request: FastifyRequest,
    reply: FastifyReply,
    payload: unknown,
  ) => {
    reply.header("Deprecation", "true");
    reply.header("Link", `<${canonical}>; rel="successor-version"`);
    if (priorOnSend) {
      return priorOnSend(request, reply, payload);
    }
    return payload;
  };

  return merged;
}

function registerRoute(
  app: FastifyInstance,
  method: HttpMethod,
  path: string,
  opts: RouteOpts,
  handler: RouteHandlerMethod,
): void {
  const { canonical, legacy } = resolveRegistrationPaths(path);

  app[method](canonical, opts, handler);

  if (legacy) {
    app[method](legacy, legacyAliasRouteOpts(canonical, opts), handler);
  }
}

function registerBareRoute(
  app: FastifyInstance,
  method: HttpMethod,
  path: string,
  handler: RouteHandlerMethod,
  opts: RouteOpts = {},
): void {
  const { canonical, legacy } = resolveRegistrationPaths(path);

  app[method](canonical, opts, handler);

  if (legacy) {
    app[method](legacy, legacyAliasRouteOpts(canonical, opts), handler);
  }
}

export function adminDocsOnlySchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...schema,
    adminDocsOnly: true,
  };
}

export function publicDocsSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...schema,
    publicDocs: true,
  };
}

export function registerViewerGet(
  app: FastifyInstance,
  path: string,
  opts: RouteOpts,
  handler: RouteHandlerMethod,
): void {
  registerRoute(app, "get", path, opts, handler);
}

export function registerViewerPost(
  app: FastifyInstance,
  path: string,
  opts: RouteOpts,
  handler: RouteHandlerMethod,
): void {
  registerRoute(app, "post", path, opts, handler);
}

export function registerViewerPatch(
  app: FastifyInstance,
  path: string,
  opts: RouteOpts,
  handler: RouteHandlerMethod,
): void {
  registerRoute(app, "patch", path, opts, handler);
}

export function registerViewerDelete(
  app: FastifyInstance,
  path: string,
  opts: RouteOpts,
  handler: RouteHandlerMethod,
): void {
  registerRoute(app, "delete", path, opts, handler);
}

export function registerViewerRoutes(
  app: FastifyInstance,
  method: HttpMethod,
  path: string,
  opts: RouteOpts,
  handler: RouteHandlerMethod,
): void {
  registerRoute(app, method, path, opts, handler);
}

export function registerViewerGetBare(
  app: FastifyInstance,
  path: string,
  handler: RouteHandlerMethod,
  opts: RouteOpts = {},
): void {
  registerBareRoute(app, "get", path, handler, opts);
}

export function registerViewerPostBare(
  app: FastifyInstance,
  path: string,
  handler: RouteHandlerMethod,
  opts: RouteOpts = {},
): void {
  registerBareRoute(app, "post", path, handler, opts);
}

export function registerPlatformGet(
  app: FastifyInstance,
  path: string,
  opts: RouteOpts,
  handler: RouteHandlerMethod,
): void {
  registerRoute(app, "get", path, opts, handler);
}

export function registerPlatformPost(
  app: FastifyInstance,
  path: string,
  opts: RouteOpts,
  handler: RouteHandlerMethod,
): void {
  registerRoute(app, "post", path, opts, handler);
}

export function registerPlatformPatch(
  app: FastifyInstance,
  path: string,
  opts: RouteOpts,
  handler: RouteHandlerMethod,
): void {
  registerRoute(app, "patch", path, opts, handler);
}

export function registerPlatformDelete(
  app: FastifyInstance,
  path: string,
  opts: RouteOpts,
  handler: RouteHandlerMethod,
): void {
  registerRoute(app, "delete", path, opts, handler);
}

export const registerAdminGet = registerPlatformGet;
export const registerAdminPost = registerPlatformPost;
export const registerAdminPatch = registerPlatformPatch;
export const registerAdminDelete = registerPlatformDelete;

export function registerPlatformRoute(
  app: FastifyInstance,
  method: HttpMethod,
  path: string,
  opts: RouteOpts,
  handler: RouteHandlerMethod,
): void {
  registerRoute(app, method, path, opts, handler);
}
