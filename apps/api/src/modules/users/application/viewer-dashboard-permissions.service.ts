import { z } from "zod";
import { getCcUsers } from "../../auth/infrastructure/command-center-auth.service.js";
import {
  getPlatformData,
  getPlatformStoreFilePath,
  PLATFORM_STORE_KEYS,
  putPlatformData,
} from "../../../infrastructure/persistence/platform-data-store.js";

const permissionsSchema = z.object({
  fleetOverview: z.boolean(),
  droneTelemetry: z.boolean(),
  dockTelemetry: z.boolean(),
  batteryStatus: z.boolean(),
  gpsLocation: z.boolean(),
  onlineOffline: z.boolean(),
  liveCamera: z.boolean(),
  droneFpv: z.boolean(),
  alertsEvents: z.boolean(),
  missionMediaHistory: z.boolean(),
  refreshButton: z.boolean(),
  getApiButtons: z.boolean(),
});

export type ViewerDashboardPermissions = z.infer<typeof permissionsSchema>;

export const DEFAULT_VIEWER_DASHBOARD_PERMISSIONS: ViewerDashboardPermissions = {
  fleetOverview: true,
  droneTelemetry: true,
  dockTelemetry: true,
  batteryStatus: true,
  gpsLocation: true,
  onlineOffline: true,
  liveCamera: true,
  droneFpv: false,
  alertsEvents: false,
  missionMediaHistory: true,
  refreshButton: true,
  getApiButtons: false,
};

type PermissionStore = Record<string, Partial<ViewerDashboardPermissions>>;

function readStore(): PermissionStore {
  return getPlatformData<PermissionStore>(
    PLATFORM_STORE_KEYS.VIEWER_DASHBOARD_PERMISSIONS,
    {},
  );
}

async function writeStore(store: PermissionStore): Promise<void> {
  await putPlatformData(PLATFORM_STORE_KEYS.VIEWER_DASHBOARD_PERMISSIONS, store);
}

export function mergeViewerPermissions(
  overrides?: Partial<ViewerDashboardPermissions> | null,
): ViewerDashboardPermissions {
  return { ...DEFAULT_VIEWER_DASHBOARD_PERMISSIONS, ...overrides };
}

export function getViewerDashboardPermissions(
  viewerId: string,
): ViewerDashboardPermissions {
  const store = readStore();
  return mergeViewerPermissions(store[viewerId]);
}

export function listViewerDashboardPermissionUsers(): Array<{
  viewerId: string;
  displayName: string;
  permissions: ViewerDashboardPermissions;
}> {
  const viewers = getCcUsers().filter((u) => u.role === "viewer");
  const store = readStore();
  return viewers.map((u) => ({
    viewerId: u.username,
    displayName: u.displayName,
    permissions: mergeViewerPermissions(store[u.username]),
  }));
}

export async function updateViewerDashboardPermissions(
  viewerId: string,
  patch: Partial<ViewerDashboardPermissions>,
): Promise<ViewerDashboardPermissions> {
  const viewers = getCcUsers().filter((u) => u.role === "viewer");
  if (!viewers.some((u) => u.username === viewerId)) {
    throw new Error(`Unknown viewer account: ${viewerId}`);
  }

  const parsed = permissionsSchema.partial().safeParse(patch);
  if (!parsed.success) {
    throw new Error("Invalid viewer dashboard permissions payload");
  }

  const store = readStore();
  const next = mergeViewerPermissions({
    ...store[viewerId],
    ...parsed.data,
  });
  store[viewerId] = next;
  await writeStore(store);
  return next;
}

export async function deleteViewerDashboardPermissions(
  viewerId: string,
): Promise<void> {
  const store = readStore();
  if (!(viewerId in store)) return;
  delete store[viewerId];
  await writeStore(store);
}

export function getPermissionsStorePath(): string {
  return getPlatformStoreFilePath(PLATFORM_STORE_KEYS.VIEWER_DASHBOARD_PERMISSIONS);
}
