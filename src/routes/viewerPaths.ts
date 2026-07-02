import type { FastifyInstance, RouteHandlerMethod } from "fastify";

const LEGACY_PREFIX = "/v1/marafiq";
const CANONICAL_PREFIX = "/v1/viewer";

/** Shamal-internal /v1/marafiq paths that must not receive /v1/viewer aliases. */
const INTERNAL_MARAFIQ_PREFIXES = [
  "/v1/marafiq/admin/",
  "/v1/marafiq/ops/",
  "/v1/marafiq/integration/",
  "/v1/marafiq/viewer/",
];

/**
 * Canonical `/v1/viewer/*` and legacy `/v1/marafiq/*` paths for a viewer API route.
 * Internal admin/ops/integration routes return legacy only.
 */
export function viewerRoutePaths(legacyPath: string): string[] {
  if (!legacyPath.startsWith(`${LEGACY_PREFIX}/`)) {
    return [legacyPath];
  }
  if (INTERNAL_MARAFIQ_PREFIXES.some((prefix) => legacyPath.startsWith(prefix))) {
    return [legacyPath];
  }
  const canonicalPath = legacyPath.replace(LEGACY_PREFIX, CANONICAL_PREFIX);
  return [canonicalPath, legacyPath];
}

/** Map canonical viewer paths to legacy paths for shared auth/permission checks. */
export function legacyMarafiqPath(path: string): string {
  if (path.startsWith(`${CANONICAL_PREFIX}/`)) {
    return path.replace(CANONICAL_PREFIX, LEGACY_PREFIX);
  }
  return path;
}

export function isViewerOrLegacyApiPath(path: string): boolean {
  return path.startsWith(LEGACY_PREFIX) || path.startsWith(`${CANONICAL_PREFIX}/`);
}

type RouteOpts = Record<string, unknown>;

export function registerViewerGet(
  app: FastifyInstance,
  legacyPath: string,
  opts: RouteOpts,
  handler: RouteHandlerMethod,
): void {
  for (const path of viewerRoutePaths(legacyPath)) {
    app.get(path, opts, handler);
  }
}

export function registerViewerPost(
  app: FastifyInstance,
  legacyPath: string,
  opts: RouteOpts,
  handler: RouteHandlerMethod,
): void {
  for (const path of viewerRoutePaths(legacyPath)) {
    app.post(path, opts, handler);
  }
}

export function registerViewerGetBare(
  app: FastifyInstance,
  legacyPath: string,
  handler: RouteHandlerMethod,
): void {
  for (const path of viewerRoutePaths(legacyPath)) {
    app.get(path, handler);
  }
}

export function registerViewerPostBare(
  app: FastifyInstance,
  legacyPath: string,
  handler: RouteHandlerMethod,
): void {
  for (const path of viewerRoutePaths(legacyPath)) {
    app.post(path, handler);
  }
}
