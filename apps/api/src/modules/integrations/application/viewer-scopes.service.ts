import type { ViewerDashboardPermissions } from "../../users/application/viewer-dashboard-permissions.service.js";
import { normalizeApiPath } from "../../../shared/http/viewer-paths.js";

export type ViewerApiScope =
  | "fleet:read"
  | "drone:read"
  | "dock:read"
  | "battery:read"
  | "gps:read"
  | "status:read"
  | "camera:read"
  | "fpv:read"
  | "events:read"
  | "media:read";

const PERMISSION_SCOPE_MAP: Partial<
  Record<keyof ViewerDashboardPermissions, ViewerApiScope>
> = {
  fleetOverview: "fleet:read",
  droneTelemetry: "drone:read",
  dockTelemetry: "dock:read",
  batteryStatus: "battery:read",
  gpsLocation: "gps:read",
  onlineOffline: "status:read",
  liveCamera: "camera:read",
  droneFpv: "fpv:read",
  alertsEvents: "events:read",
  missionMediaHistory: "media:read",
};

/** Friendly labels for admin "Enabled Data Access" (never expose raw scope names). */
export const DATA_ACCESS_LABELS: Partial<
  Record<keyof ViewerDashboardPermissions, string>
> = {
  fleetOverview: "Fleet Overview",
  droneTelemetry: "Drone Telemetry",
  dockTelemetry: "Dock Telemetry",
  batteryStatus: "Battery Status",
  gpsLocation: "GPS / Location",
  onlineOffline: "Online Status",
  liveCamera: "Live Camera",
  droneFpv: "Drone FPV",
  alertsEvents: "Alerts & Events",
  missionMediaHistory: "Mission & Media History",
};

const DATA_ACCESS_PERMISSION_KEYS = Object.keys(
  DATA_ACCESS_LABELS,
) as (keyof ViewerDashboardPermissions)[];

export const INTEGRATION_ROUTE_SCOPES: Record<string, ViewerApiScope> = {
  "/v1/platform/integration/fleet": "fleet:read",
  "/v1/platform/integration/drone-telemetry": "drone:read",
  "/v1/platform/integration/dock-telemetry": "dock:read",
  "/v1/platform/integration/battery-status": "battery:read",
  "/v1/platform/integration/gps-location": "gps:read",
  "/v1/platform/integration/online-status": "status:read",
  "/v1/platform/integration/camera": "camera:read",
  "/v1/platform/integration/fpv": "fpv:read",
  "/v1/platform/integration/alerts-events": "events:read",
  "/v1/platform/integration/media-history": "media:read",
};

export const INTEGRATION_ROUTE_SLUGS: Record<string, string> = {
  fleet: "/v1/platform/integration/fleet",
  "drone-telemetry": "/v1/platform/integration/drone-telemetry",
  "dock-telemetry": "/v1/platform/integration/dock-telemetry",
  battery: "/v1/platform/integration/battery-status",
  gps: "/v1/platform/integration/gps-location",
  online: "/v1/platform/integration/online-status",
  camera: "/v1/platform/integration/camera",
  "drone-fpv": "/v1/platform/integration/fpv",
  alerts: "/v1/platform/integration/alerts-events",
  missions: "/v1/platform/integration/media-history",
};

export function deriveViewerScopes(
  permissions: ViewerDashboardPermissions,
): ViewerApiScope[] {
  const scopes = new Set<ViewerApiScope>();
  for (const [perm, scope] of Object.entries(PERMISSION_SCOPE_MAP)) {
    if (permissions[perm as keyof ViewerDashboardPermissions] === true && scope) {
      scopes.add(scope);
    }
  }
  return [...scopes];
}

export function hasViewerScope(
  scopes: ViewerApiScope[],
  required: ViewerApiScope,
): boolean {
  return scopes.includes(required);
}

export function scopeForIntegrationPath(path: string): ViewerApiScope | null {
  return INTEGRATION_ROUTE_SCOPES[normalizeApiPath(path)] ?? null;
}

export type DataScopeRequirement =
  | { kind: "unrestricted" }
  | { kind: "any"; scopes: ViewerApiScope[] }
  | { kind: "deny" };

const UNRESTRICTED_EXACT_PATHS = new Set([
  "/v1/auth/me",
  "/v1/capabilities",
  "/v1/api-keys",
  "/v1/service-accounts",
  "/v1/platform/integration/profile",
  "/v1/platform/integration/access-key",
]);

function isUnrestrictedPath(path: string): boolean {
  if (UNRESTRICTED_EXACT_PATHS.has(path)) return true;
  if (path.startsWith("/v1/api-keys/")) return true;
  if (path.startsWith("/v1/service-accounts/")) return true;
  return false;
}

function isClientDataPath(path: string): boolean {
  return (
    path.startsWith("/v1/devices") ||
    path.startsWith("/v1/fleet") ||
    path.startsWith("/v1/docks") ||
    path.startsWith("/v1/tasks") ||
    path.startsWith("/v1/media") ||
    path.startsWith("/v1/events") ||
    path.startsWith("/v1/mapping") ||
    path.startsWith("/v1/platform/integration/")
  );
}

function readCameraPref(query?: Record<string, unknown>): "drone" | "dock" | "auto" {
  const raw = query?.camera;
  if (raw === "drone" || raw === "dock" || raw === "auto") return raw;
  return "auto";
}

/**
 * Maps every client data route to Platform Admin permissions.
 * Unmapped data paths deny by default so new endpoints cannot skip the check.
 */
export function dataScopeRequirementForPath(
  path: string,
  query?: Record<string, unknown>,
): DataScopeRequirement {
  const canonical = normalizeApiPath(path);

  if (isUnrestrictedPath(canonical) || !isClientDataPath(canonical)) {
    return { kind: "unrestricted" };
  }

  const integrationScope = INTEGRATION_ROUTE_SCOPES[canonical];
  if (integrationScope) {
    return { kind: "any", scopes: [integrationScope] };
  }

  if (canonical === "/v1/fleet/summary") {
    return { kind: "any", scopes: ["fleet:read"] };
  }
  if (canonical === "/v1/fleet/positions") {
    return { kind: "any", scopes: ["gps:read"] };
  }

  if (canonical === "/v1/devices") {
    return { kind: "any", scopes: ["fleet:read"] };
  }
  if (/^\/v1\/devices\/[^/]+\/telemetry\/(latest|stream)$/.test(canonical)) {
    return { kind: "any", scopes: ["drone:read", "dock:read"] };
  }
  if (/^\/v1\/devices\/[^/]+\/live-stream$/.test(canonical)) {
    const camera = readCameraPref(query);
    if (camera === "drone") return { kind: "any", scopes: ["fpv:read"] };
    if (camera === "dock") return { kind: "any", scopes: ["camera:read"] };
    return { kind: "any", scopes: ["camera:read", "fpv:read"] };
  }
  if (/^\/v1\/devices\/[^/]+$/.test(canonical)) {
    return { kind: "any", scopes: ["fleet:read"] };
  }

  if (canonical === "/v1/docks" || /^\/v1\/docks\/[^/]+$/.test(canonical)) {
    return { kind: "any", scopes: ["dock:read"] };
  }

  if (canonical === "/v1/events" || /^\/v1\/events\/[^/]+\/ack$/.test(canonical)) {
    return { kind: "any", scopes: ["events:read"] };
  }

  if (
    canonical === "/v1/media/recent" ||
    canonical === "/v1/tasks" ||
    /^\/v1\/tasks\/[^/]+$/.test(canonical) ||
    /^\/v1\/tasks\/[^/]+\/media$/.test(canonical) ||
    canonical.startsWith("/v1/mapping/")
  ) {
    return { kind: "any", scopes: ["media:read"] };
  }

  if (
    /^\/v1\/tasks\/[^/]+\/trajectory/.test(canonical)
  ) {
    return { kind: "any", scopes: ["gps:read"] };
  }

  return { kind: "deny" };
}

export function hasAnyViewerScope(
  scopes: ViewerApiScope[],
  required: ViewerApiScope[],
): boolean {
  return required.some((scope) => scopes.includes(scope));
}

export function telemetryScopeForDeviceRole(
  role: string | undefined,
): ViewerApiScope {
  return role === "gateway" ? "dock:read" : "drone:read";
}

export function enabledDataAccessLabels(
  permissions: ViewerDashboardPermissions,
): string[] {
  const labels: string[] = [];
  for (const key of DATA_ACCESS_PERMISSION_KEYS) {
    if (permissions[key] === true) {
      const label = DATA_ACCESS_LABELS[key];
      if (label) labels.push(label);
    }
  }
  return labels;
}
