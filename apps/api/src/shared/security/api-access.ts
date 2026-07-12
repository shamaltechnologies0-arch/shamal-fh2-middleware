import type { CcRole } from "../../modules/auth/infrastructure/command-center-auth.service.js";
import { normalizeApiPath } from "../http/viewer-paths.js";

/** GET paths allowed for viewer role (read-only monitoring). Canonical resource paths. */
const VIEWER_GET_PREFIXES = [
  "/v1/capabilities",
  "/v1/auth/me",
  "/v1/platform/integration/profile",
  "/v1/platform/integration/access-key",
  "/v1/api-keys",
  "/v1/service-accounts",
  "/v1/devices",
  "/v1/fleet/",
  "/v1/docks",
  "/v1/tasks",
  "/v1/media/",
  "/v1/events",
  "/v1/mapping/",
];

function isViewerRestApiKeyPath(path: string): boolean {
  const canonicalPath = normalizeApiPath(path);
  return (
    canonicalPath === "/v1/api-keys" ||
    canonicalPath.startsWith("/v1/api-keys/")
  );
}

function isViewerServiceAccountPath(path: string): boolean {
  const canonicalPath = normalizeApiPath(path);
  return (
    canonicalPath === "/v1/service-accounts" ||
    canonicalPath.startsWith("/v1/service-accounts/")
  );
}

export function isViewerReadOnlyAllowed(method: string, path: string): boolean {
  if (method !== "GET") return false;
  const canonicalPath = normalizeApiPath(path);
  if (canonicalPath.startsWith("/v1/platform/ops/")) return false;
  return VIEWER_GET_PREFIXES.some(
    (prefix) =>
      canonicalPath === prefix.replace(/\/$/, "") ||
      canonicalPath.startsWith(prefix),
  );
}

export function assertRoleAccess(
  role: CcRole,
  method: string,
  path: string,
): { allowed: boolean; requiredRole?: CcRole; message?: string } {
  const canonicalPath = normalizeApiPath(path);

  if (canonicalPath.startsWith("/v1/platform/admin/")) {
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
    if (isViewerRestApiKeyPath(path) || isViewerServiceAccountPath(path)) {
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

  if (method === "POST" && canonicalPath.startsWith("/v1/platform/ops/")) {
    if (role === "operator" || role === "admin") return { allowed: true };
    return {
      allowed: false,
      requiredRole: "operator",
      message: "Operator or admin required for flight/dock commands.",
    };
  }

  if (method === "POST" && /^\/v1\/events\/[^/]+\/ack$/.test(canonicalPath)) {
    if (role === "operator" || role === "admin") return { allowed: true };
    return {
      allowed: false,
      requiredRole: "operator",
      message: "Operator or admin required to acknowledge events.",
    };
  }

  return { allowed: true };
}
