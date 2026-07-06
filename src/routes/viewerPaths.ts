import type { FastifyInstance, RouteHandlerMethod } from "fastify";

export const VIEWER_PREFIX = "/v1/viewer";
/** Shamal Platform internal routes (admin, integration session, ops). */
export const PLATFORM_PREFIX = "/v1/platform";

type RouteOpts = Record<string, unknown>;
type HttpMethod = "get" | "post" | "patch" | "delete" | "put";

function registerRoute(
  app: FastifyInstance,
  method: HttpMethod,
  path: string,
  opts: RouteOpts,
  handler: RouteHandlerMethod,
): void {
  app[method](path, opts, handler);
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
): void {
  app.get(path, handler);
}

export function registerViewerPostBare(
  app: FastifyInstance,
  path: string,
  handler: RouteHandlerMethod,
): void {
  app.post(path, handler);
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

export function isPlatformApiPath(path: string): boolean {
  return (
    path.startsWith(`${VIEWER_PREFIX}/`) || path.startsWith(`${PLATFORM_PREFIX}/`)
  );
}

/** @deprecated Use isPlatformApiPath */
export const isViewerOrLegacyApiPath = isPlatformApiPath;

export function normalizeApiPath(path: string): string {
  return path;
}
