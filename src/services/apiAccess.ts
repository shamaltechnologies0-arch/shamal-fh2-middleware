import type { CcRole } from "./commandCenterAuth.js";
import { normalizeApiPath } from "../routes/viewerPaths.js";

/** GET paths allowed for viewer role (read-only monitoring). */
const VIEWER_GET_PREFIXES = [
  "/v1/viewer/capabilities",
  "/v1/viewer/auth/me",
  "/v1/platform/integration/profile",
  "/v1/platform/integration/access-key",
  "/v1/viewer/rest-api-keys",
  "/v1/viewer/service-accounts",
  "/v1/viewer/devices",
  "/v1/viewer/fleet/",
  "/v1/viewer/docks",
  "/v1/viewer/tasks",
  "/v1/viewer/media/",
  "/v1/viewer/events",
  "/v1/viewer/mapping/",
];

function isViewerRestApiKeyPath(path: string): boolean {
  const legacyPath = normalizeApiPath(path);
  return (
    legacyPath === "/v1/viewer/rest-api-keys" ||
    legacyPath.startsWith("/v1/viewer/rest-api-keys/")
  );
}

function isViewerServiceAccountPath(path: string): boolean {
  const legacyPath = normalizeApiPath(path);
  return (
    legacyPath === "/v1/viewer/service-accounts" ||
    legacyPath.startsWith("/v1/viewer/service-accounts/")
  );
}

export function isViewerReadOnlyAllowed(method: string, path: string): boolean {
  if (method !== "GET") return false;
  const legacyPath = normalizeApiPath(path);
  if (legacyPath.startsWith("/v1/platform/ops/")) return false;
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
  const legacyPath = normalizeApiPath(path);

  if (legacyPath.startsWith("/v1/platform/admin/")) {
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

  if (method === "POST" && legacyPath.startsWith("/v1/platform/ops/")) {
    if (role === "operator" || role === "admin") return { allowed: true };
    return {
      allowed: false,
      requiredRole: "operator",
      message: "Operator or admin required for flight/dock commands.",
    };
  }

  if (method === "POST" && /^\/v1\/viewer\/events\/[^/]+\/ack$/.test(legacyPath)) {
    if (role === "operator" || role === "admin") return { allowed: true };
    return {
      allowed: false,
      requiredRole: "operator",
      message: "Operator or admin required to acknowledge events.",
    };
  }

  return { allowed: true };
}
