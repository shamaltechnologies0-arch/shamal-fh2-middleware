import type { CcRole } from "./commandCenterAuth.js";
import { legacyMarafiqPath } from "../routes/viewerPaths.js";

/** GET paths allowed for viewer role (read-only monitoring). */
const VIEWER_GET_PREFIXES = [
  "/v1/marafiq/capabilities",
  "/v1/marafiq/auth/me",
  "/v1/marafiq/integration/profile",
  "/v1/marafiq/integration/access-key",
  "/v1/marafiq/rest-api-keys",
  // @deprecated backward-compat aliases
  "/v1/marafiq/viewer/integration",
  "/v1/marafiq/viewer/integration/token",
  "/v1/marafiq/devices",
  "/v1/marafiq/fleet/",
  "/v1/marafiq/docks",
  "/v1/marafiq/tasks",
  "/v1/marafiq/media/",
  "/v1/marafiq/events",
  "/v1/marafiq/mapping/",
];

function isViewerRestApiKeyPath(path: string): boolean {
  const legacyPath = legacyMarafiqPath(path);
  return (
    legacyPath === "/v1/marafiq/rest-api-keys" ||
    legacyPath.startsWith("/v1/marafiq/rest-api-keys/")
  );
}

export function isViewerReadOnlyAllowed(method: string, path: string): boolean {
  if (method !== "GET") return false;
  const legacyPath = legacyMarafiqPath(path);
  if (legacyPath.startsWith("/v1/marafiq/ops/")) return false;
  return VIEWER_GET_PREFIXES.some(
    (prefix) =>
      legacyPath === prefix.replace(/\/$/, "") || legacyPath.startsWith(prefix),
  );
}

export function assertRoleAccess(
  role: CcRole,
  method: string,
  path: string,
): { allowed: boolean; requiredRole?: CcRole; message?: string } {
  const legacyPath = legacyMarafiqPath(path);

  if (legacyPath.startsWith("/v1/marafiq/admin/")) {
    if (role !== "admin") {
      return {
        allowed: false,
        requiredRole: "admin",
        message: "Admin role required for integration account settings.",
      };
    }
    return { allowed: true };
  }

  if (role === "viewer") {
    if (isViewerRestApiKeyPath(path)) {
      return { allowed: true };
    }
    if (method === "PATCH" || method === "PUT" || method === "DELETE") {
      return {
        allowed: false,
        requiredRole: "operator",
        message:
          "This account is read-only. This endpoint requires operator or admin access.",
      };
    }
    if (!isViewerReadOnlyAllowed(method, path)) {
      return {
        allowed: false,
        requiredRole: "operator",
        message:
          "This account is read-only. This endpoint requires operator or admin access.",
      };
    }
    return { allowed: true };
  }

  if (method === "POST" && legacyPath.startsWith("/v1/marafiq/ops/")) {
    if (role === "operator" || role === "admin") return { allowed: true };
    return {
      allowed: false,
      requiredRole: "operator",
      message: "Operator or admin required for flight/dock commands.",
    };
  }

  if (method === "POST" && /^\/v1\/marafiq\/events\/[^/]+\/ack$/.test(legacyPath)) {
    if (role === "operator" || role === "admin") return { allowed: true };
    return {
      allowed: false,
      requiredRole: "operator",
      message: "Operator or admin required to acknowledge events.",
    };
  }

  return { allowed: true };
}
