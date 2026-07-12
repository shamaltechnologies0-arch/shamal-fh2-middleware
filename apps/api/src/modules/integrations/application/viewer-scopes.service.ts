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
