export type PublicDocsAuth = "none" | "apiKey" | "bearer" | "session" | "oauth";

export type PublicDocsGroupId =
  | "auth"
  | "integration"
  | "api-keys"
  | "service-accounts"
  | "system"
  | "meta"
  | "devices"
  | "docks"
  | "fleet"
  | "streams"
  | "mapping"
  | "gis"
  | "telemetry"
  | "tasks"
  | "events";

export type PublicDocsGroup = {
  id: PublicDocsGroupId;
  label: string;
  description: string;
};

export type PublicDocsOperation = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  group: PublicDocsGroupId;
  summary: string;
  description?: string;
  auth: PublicDocsAuth;
};

export const PUBLIC_DOCS_GROUPS: PublicDocsGroup[] = [
  {
    id: "auth",
    label: "Auth",
    description: "Sign in people, mint service-account tokens, and inspect the current session.",
  },
  {
    id: "integration",
    label: "Integration",
    description:
      "Command Center overview data: fleet, telemetry, live view, events, and media history.",
  },
  {
    id: "api-keys",
    label: "REST API Keys",
    description: "Create and manage REST keys for Command Center API & Integrations.",
  },
  {
    id: "service-accounts",
    label: "Service Accounts",
    description: "Machine-to-machine credentials for OAuth 2.0 client credentials.",
  },
  {
    id: "system",
    label: "System",
    description: "Service health for uptime checks.",
  },
  {
    id: "meta",
    label: "Meta",
    description: "Discover which platform capabilities are enabled for this environment.",
  },
  {
    id: "devices",
    label: "Devices",
    description: "Fleet devices, detail, and latest telemetry snapshots.",
  },
  {
    id: "docks",
    label: "Docks",
    description: "Dock gateways and health.",
  },
  {
    id: "fleet",
    label: "Fleet",
    description: "Dashboard counts and live map positions.",
  },
  {
    id: "streams",
    label: "Streams",
    description: "Live video availability for dock cameras and aircraft FPV.",
  },
  {
    id: "mapping",
    label: "Mapping",
    description: "2D/3D reconstruction models from completed missions.",
  },
  {
    id: "gis",
    label: "GIS",
    description: "Flight-path exports for GIS and CAFM layers.",
  },
  {
    id: "telemetry",
    label: "Telemetry",
    description: "Server-sent telemetry stream as an alternative to polling.",
  },
  {
    id: "tasks",
    label: "Tasks",
    description: "Flight and inspection jobs, media, and trajectories.",
  },
  {
    id: "events",
    label: "Events",
    description: "Alert feed and acknowledgements.",
  },
];

export const PUBLIC_DOCS_OPERATIONS: PublicDocsOperation[] = [
  {
    method: "POST",
    path: "/v1/auth/token",
    group: "auth",
    summary: "OAuth 2.0 Client Credentials — service account M2M authentication",
    auth: "oauth",
  },
  {
    method: "POST",
    path: "/v1/auth/login",
    group: "auth",
    summary: "Shamal Platform login (human users)",
    auth: "none",
  },
  {
    method: "POST",
    path: "/v1/auth/session-cookie",
    group: "auth",
    summary: "Refresh Shamal Platform browser session cookie from an active session",
    auth: "session",
  },
  {
    method: "POST",
    path: "/v1/auth/logout",
    group: "auth",
    summary: "Clear Shamal Platform browser session cookie",
    auth: "none",
  },
  {
    method: "GET",
    path: "/v1/auth/me",
    group: "auth",
    summary: "Current Shamal Platform session and effective permissions",
    auth: "session",
  },
  {
    method: "GET",
    path: "/v1/platform/integration/profile",
    group: "integration",
    summary: "Integration account access details (session auth)",
    auth: "session",
  },
  {
    method: "GET",
    path: "/v1/platform/integration/access-key",
    group: "integration",
    summary: "Reveal integration access key for clipboard copy (session auth)",
    auth: "session",
  },
  {
    method: "GET",
    path: "/v1/platform/integration/fleet",
    group: "integration",
    summary: "Fleet overview",
    auth: "bearer",
  },
  {
    method: "GET",
    path: "/v1/platform/integration/drone-telemetry",
    group: "integration",
    summary: "Drone telemetry",
    auth: "bearer",
  },
  {
    method: "GET",
    path: "/v1/platform/integration/dock-telemetry",
    group: "integration",
    summary: "Dock telemetry",
    auth: "bearer",
  },
  {
    method: "GET",
    path: "/v1/platform/integration/battery-status",
    group: "integration",
    summary: "Battery status",
    auth: "bearer",
  },
  {
    method: "GET",
    path: "/v1/platform/integration/gps-location",
    group: "integration",
    summary: "GPS locations",
    auth: "bearer",
  },
  {
    method: "GET",
    path: "/v1/platform/integration/online-status",
    group: "integration",
    summary: "Online/offline status",
    auth: "bearer",
  },
  {
    method: "GET",
    path: "/v1/platform/integration/camera",
    group: "integration",
    summary: "Dock live camera info",
    auth: "bearer",
  },
  {
    method: "GET",
    path: "/v1/platform/integration/fpv",
    group: "integration",
    summary: "Drone FPV stream info",
    auth: "bearer",
  },
  {
    method: "GET",
    path: "/v1/platform/integration/alerts-events",
    group: "integration",
    summary: "Alerts and events",
    auth: "bearer",
  },
  {
    method: "GET",
    path: "/v1/platform/integration/media-history",
    group: "integration",
    summary: "Mission and media history",
    auth: "bearer",
  },
  {
    method: "GET",
    path: "/v1/api-keys",
    group: "api-keys",
    summary: "List REST API keys for the signed-in viewer account",
    auth: "session",
  },
  {
    method: "POST",
    path: "/v1/api-keys",
    group: "api-keys",
    summary: "Create a REST API key (plaintext shown once)",
    auth: "session",
  },
  {
    method: "GET",
    path: "/v1/api-keys/{id}",
    group: "api-keys",
    summary: "Get one REST API key (masked)",
    auth: "session",
  },
  {
    method: "PATCH",
    path: "/v1/api-keys/{id}",
    group: "api-keys",
    summary: "Update REST API key label or status",
    auth: "session",
  },
  {
    method: "DELETE",
    path: "/v1/api-keys/{id}",
    group: "api-keys",
    summary: "Permanently delete a REST API key",
    auth: "session",
  },
  {
    method: "POST",
    path: "/v1/api-keys/{id}/reveal",
    group: "api-keys",
    summary: "Reveal full REST API key value (rate-limited)",
    auth: "session",
  },
  {
    method: "POST",
    path: "/v1/api-keys/{id}/set-primary",
    group: "api-keys",
    summary: "Set the primary REST API key for Command Center login",
    auth: "session",
  },
  {
    method: "GET",
    path: "/v1/service-accounts",
    group: "service-accounts",
    summary: "List service accounts owned by the signed-in user",
    auth: "session",
  },
  {
    method: "POST",
    path: "/v1/service-accounts",
    group: "service-accounts",
    summary: "Create a service account for machine-to-machine API access",
    auth: "session",
  },
  {
    method: "GET",
    path: "/v1/service-accounts/{id}",
    group: "service-accounts",
    summary: "Get one service account",
    auth: "session",
  },
  {
    method: "PATCH",
    path: "/v1/service-accounts/{id}",
    group: "service-accounts",
    summary: "Update service account metadata or scopes",
    auth: "session",
  },
  {
    method: "DELETE",
    path: "/v1/service-accounts/{id}",
    group: "service-accounts",
    summary: "Delete a service account permanently",
    auth: "session",
  },
  {
    method: "POST",
    path: "/v1/service-accounts/{id}/revoke",
    group: "service-accounts",
    summary: "Revoke a service account",
    auth: "session",
  },
  {
    method: "POST",
    path: "/v1/service-accounts/{id}/reactivate",
    group: "service-accounts",
    summary: "Reactivate a revoked service account",
    auth: "session",
  },
  {
    method: "POST",
    path: "/v1/service-accounts/{id}/rotate-secret",
    group: "service-accounts",
    summary: "Rotate client secret (shown once)",
    auth: "session",
  },
  {
    method: "GET",
    path: "/health",
    group: "system",
    summary: "Service health",
    auth: "none",
  },
  {
    method: "GET",
    path: "/v1/capabilities",
    group: "meta",
    summary: "API capabilities",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/devices",
    group: "devices",
    summary: "List Shamal fleet devices",
    description:
      "First endpoint to test. Copy data[].serialNumber from this response and use it as {sn} in device detail and telemetry endpoints.",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/devices/{sn}",
    group: "devices",
    summary: "Get Shamal device detail",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/devices/{sn}/telemetry/latest",
    group: "devices",
    summary: "Get latest Shamal telemetry snapshot",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/docks",
    group: "docks",
    summary: "List Shamal docks (gateways)",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/docks/{sn}",
    group: "docks",
    summary: "Dock detail and health",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/fleet/summary",
    group: "fleet",
    summary: "Fleet summary for dashboards",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/fleet/positions",
    group: "fleet",
    summary: "Fleet map positions (GPS pins for live map)",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/devices/{sn}/live-stream",
    group: "streams",
    summary: "Live video stream info (RTMP/WebRTC capacity)",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/mapping/models",
    group: "mapping",
    summary: "Cloud mapping / 2D-3D reconstruction jobs",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/mapping/models/{id}",
    group: "mapping",
    summary: "Mapping model detail",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/tasks/{id}/trajectory.geojson",
    group: "gis",
    summary: "Flight path as GeoJSON",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/tasks/{id}/trajectory.kml",
    group: "gis",
    summary: "Flight path as KML",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/devices/{sn}/telemetry/stream",
    group: "telemetry",
    summary: "Telemetry stream (SSE) — CAFM substitute for MQTT polling",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/tasks",
    group: "tasks",
    summary: "List Shamal flight / inspection tasks",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/tasks/{id}",
    group: "tasks",
    summary: "Get Shamal task detail",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/tasks/{id}/trajectory",
    group: "tasks",
    summary: "Get Shamal task trajectory",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/tasks/{id}/media",
    group: "tasks",
    summary: "Get Shamal task media",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/media/recent",
    group: "tasks",
    summary: "Recent flight tasks with media file names",
    auth: "apiKey",
  },
  {
    method: "GET",
    path: "/v1/events",
    group: "events",
    summary: "Webhook event feed",
    auth: "apiKey",
  },
  {
    method: "POST",
    path: "/v1/events/{id}/ack",
    group: "events",
    summary: "Acknowledge an event (operator/admin)",
    auth: "apiKey",
  },
];

const GROUP_LABEL = Object.fromEntries(
  PUBLIC_DOCS_GROUPS.map((group) => [group.id, group.label]),
) as Record<PublicDocsGroupId, string>;

export function normalizeOpenApiPath(path: string): string {
  const clean = path.split("?")[0] ?? path;
  return clean.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function operationKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizeOpenApiPath(path)}`;
}

const OPERATION_INDEX = new Map(
  PUBLIC_DOCS_OPERATIONS.map((operation) => [
    operationKey(operation.method, operation.path),
    operation,
  ]),
);

export function findPublicDocsOperation(
  method: string,
  path: string,
): PublicDocsOperation | undefined {
  return OPERATION_INDEX.get(operationKey(method, path));
}

export function isPublicDocsOperation(method: string, path: string): boolean {
  return OPERATION_INDEX.has(operationKey(method, path));
}

export function publicDocsTagForGroup(group: PublicDocsGroupId): string {
  return GROUP_LABEL[group];
}

const VENDOR_COPY_PATTERNS: Array<[RegExp, string]> = [
  [/DJI FlightHub 2/gi, "Shamal Platform"],
  [/FlightHub 2/gi, "Shamal Platform"],
  [/FlightHub/gi, "Shamal Platform"],
  [/\bflighthub2\b/gi, "shamal-platform"],
  [/\bFH2\b/g, "Shamal"],
  [/\bDJI\b/g, "Shamal"],
];

export function sanitizeClientCopy(value: string): string {
  let next = value;
  for (const [pattern, replacement] of VENDOR_COPY_PATTERNS) {
    next = next.replace(pattern, replacement);
  }
  return next.replace(/\s{2,}/g, " ").trim();
}

export function applyCatalogToOperation(
  method: string,
  path: string,
  operation: Record<string, unknown>,
): Record<string, unknown> {
  const catalog = findPublicDocsOperation(method, path);
  const next = { ...operation };
  if (catalog) {
    next.summary = catalog.summary;
    next.tags = [publicDocsTagForGroup(catalog.group)];
    if (catalog.description) next.description = catalog.description;
    next["x-docsAuth"] = catalog.auth;
    next["x-docsGroup"] = catalog.group;
  }
  if (typeof next.summary === "string") next.summary = sanitizeClientCopy(next.summary);
  if (typeof next.description === "string") {
    next.description = sanitizeClientCopy(next.description);
  }
  if (Array.isArray(next.parameters)) {
    next.parameters = next.parameters.map((parameter) => {
      if (!parameter || typeof parameter !== "object") return parameter;
      const item = parameter as Record<string, unknown>;
      if (typeof item.description !== "string") return parameter;
      return { ...item, description: sanitizeClientCopy(item.description) };
    });
  }
  return next;
}
