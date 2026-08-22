import type { FastifyReply, FastifyRequest } from "fastify";
import {
  dataScopeRequirementForPath,
  deriveViewerScopes,
  hasAnyViewerScope,
  type ViewerApiScope,
} from "../../modules/integrations/application/viewer-scopes.service.js";
import {
  DEFAULT_VIEWER_DASHBOARD_PERMISSIONS,
  getViewerDashboardPermissions,
} from "../../modules/users/application/viewer-dashboard-permissions.service.js";

export const DATA_ACCESS_DENIED_MESSAGE =
  "Access to this data is not enabled for your account.";

export function sendDataAccessDenied(reply: FastifyReply) {
  return reply.status(403).send({
    error: "forbidden",
    message: DATA_ACCESS_DENIED_MESSAGE,
  });
}

/**
 * Live Platform Admin permissions for this request.
 * Admin/operator skip the check (null). Client accounts always use current toggles.
 * Service-account tokens are intersected with the owner account's current permissions
 * so a token cannot outrank an admin toggle that was later turned off.
 */
export function resolveRequestDataScopes(
  request: FastifyRequest,
): ViewerApiScope[] | null {
  if (request.ccRole === "admin" || request.ccRole === "operator") {
    return null;
  }

  if (request.viewerIntegration) {
    return request.viewerIntegration.scopes;
  }

  if (request.serviceAccount) {
    const live = deriveViewerScopes(
      getViewerDashboardPermissions(request.serviceAccount.ownerUserId),
    );
    const allowed = new Set(live);
    return request.serviceAccount.scopes.filter((scope) => allowed.has(scope));
  }

  const ownerId = request.restApiKey?.userId || request.ccUsername;
  if (ownerId) {
    return deriveViewerScopes(getViewerDashboardPermissions(ownerId));
  }

  if (request.ccRole === "viewer") {
    return deriveViewerScopes(DEFAULT_VIEWER_DASHBOARD_PERMISSIONS);
  }

  return null;
}

export function assertClientDataAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  path: string,
): boolean {
  const scopes = resolveRequestDataScopes(request);
  request.viewerScopes = scopes ?? undefined;
  if (scopes === null) return true;

  const query = (request.query ?? {}) as Record<string, unknown>;
  const requirement = dataScopeRequirementForPath(path, query);
  if (requirement.kind === "unrestricted") return true;
  if (requirement.kind === "deny" || !hasAnyViewerScope(scopes, requirement.scopes)) {
    sendDataAccessDenied(reply);
    return false;
  }
  return true;
}
