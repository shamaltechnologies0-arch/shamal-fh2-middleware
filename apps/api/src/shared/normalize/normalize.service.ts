import type { Fh2DeviceEntry, Fh2HmsItem, Fh2MediaItem, Fh2Task, Fh2TrackPoint } from "../../infrastructure/fh2/types.js";

export interface NormalizedDevice {
  serialNumber: string;
  callsign: string | null;
  role: "drone" | "gateway" | "unknown";
  modelName: string | null;
  online: boolean | null;
  gatewaySerialNumber: string | null;
  droneSerialNumber: string | null;
}

export interface NormalizedTelemetry {
  serialNumber: string;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  altitudeM: number | null;
  horizontalSpeedMs: number | null;
  headingDeg: number | null;
  batteryPercent: number | null;
  flightModeCode: number | null;
  gpsSatellites: number | null;
  rtkFixed: boolean | null;
  rawState: Record<string, unknown>;
}

export interface NormalizedHmsAlert {
  level: string;
  module: string;
  code: string | null;
  message: string | null;
}

export interface NormalizedTask {
  id: string;
  name: string;
  status: string;
  taskType: string | null;
  deviceSerialNumber: string;
  waylineId: string | null;
  scheduledBeginAt: string | null;
  scheduledEndAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  mediaUploadStatus: string | null;
  folderId: number | null;
  folderLabel: string | null;
  waypointProgress: { current: number | null; total: number | null };
}

export interface NormalizedMedia {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  previewUrl: string;
  downloadUrl: string;
  capturedAt: string | null;
  urlExpiresNote: string;
}

export interface NormalizedTrajectory {
  taskId: string;
  droneSerialNumber: string | null;
  flightDistanceM: number | null;
  flightDurationSec: number | null;
  points: Array<{
    timestamp: number;
    latitude: number;
    longitude: number;
    altitudeM: number;
  }>;
}

function pickNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  return typeof v === "number" ? v : null;
}

export function flattenDevices(entries: Fh2DeviceEntry[]): NormalizedDevice[] {
  const result: NormalizedDevice[] = [];

  for (const entry of entries) {
    if (entry.gateway?.sn) {
      result.push({
        serialNumber: entry.gateway.sn,
        callsign: entry.gateway.callsign ?? null,
        role: "gateway",
        modelName: entry.gateway.device_model?.name ?? null,
        online: entry.gateway.device_online_status ?? null,
        gatewaySerialNumber: entry.gateway.sn,
        droneSerialNumber: entry.drone?.sn ?? null,
      });
    }
    if (entry.drone?.sn) {
      result.push({
        serialNumber: entry.drone.sn,
        callsign: entry.drone.callsign ?? null,
        role: "drone",
        modelName: entry.drone.device_model?.name ?? null,
        online: entry.drone.device_online_status ?? null,
        gatewaySerialNumber: entry.gateway?.sn ?? null,
        droneSerialNumber: entry.drone.sn,
      });
    }
  }

  return result;
}

export function normalizeTelemetry(
  serialNumber: string,
  statePayload: Record<string, unknown>,
): NormalizedTelemetry {
  const deviceState =
    (statePayload.device_state as Record<string, unknown> | undefined) ??
    statePayload;
  const battery =
    (deviceState.battery as Record<string, unknown> | undefined) ?? {};
  const positionState =
    (deviceState.position_state as Record<string, unknown> | undefined) ?? {};

  return {
    serialNumber,
    capturedAt: new Date().toISOString(),
    latitude: pickNumber(deviceState, "latitude"),
    longitude: pickNumber(deviceState, "longitude"),
    altitudeM: pickNumber(deviceState, "height") ?? pickNumber(deviceState, "elevation"),
    horizontalSpeedMs: pickNumber(deviceState, "horizontal_speed"),
    headingDeg: pickNumber(deviceState, "attitude_head"),
    batteryPercent: pickNumber(battery, "capacity_percent"),
    flightModeCode: pickNumber(deviceState, "mode_code"),
    gpsSatellites: pickNumber(positionState, "gps_number"),
    rtkFixed: positionState.is_fixed === 2 ? true : positionState.is_fixed === 0 ? false : null,
    rawState: deviceState,
  };
}

export function normalizeHms(items: Fh2HmsItem[]): NormalizedHmsAlert[] {
  return items.map((item) => ({
    level: item.level,
    module: item.module,
    code: item.code ?? null,
    message: item.message ?? null,
  }));
}

export function formatTaskFolderLabel(
  task: Pick<NormalizedTask, "name" | "completedAt" | "scheduledBeginAt">,
  dockLabel = "DJI Dock 3",
): string {
  const iso = task.completedAt || task.scheduledBeginAt;
  if (!iso) return task.name;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return task.name;
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())} ${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}`;
  return `${dockLabel}-FLY-TO-${stamp} (UTC)`;
}

export function normalizeTask(task: Fh2Task, dockLabel?: string): NormalizedTask {
  const base = {
    id: task.uuid,
    name: task.name,
    status: task.status,
    taskType: task.task_type ?? null,
    deviceSerialNumber: task.sn,
    waylineId: task.wayline_uuid ?? null,
    scheduledBeginAt: task.begin_at ?? null,
    scheduledEndAt: task.end_at ?? null,
    startedAt: task.run_at ?? null,
    completedAt: task.completed_at ?? null,
    mediaUploadStatus: task.media_upload_status ?? null,
    folderId: task.folder_id ?? null,
    waypointProgress: {
      current: task.current_waypoint_index ?? null,
      total: task.total_waypoints ?? null,
    },
  };
  return {
    ...base,
    folderLabel: formatTaskFolderLabel(base, dockLabel),
  };
}

export function normalizeMedia(items: Fh2MediaItem[]): NormalizedMedia[] {
  return items.map((item) => ({
    id: item.uuid,
    name: item.name,
    mediaType: item.file_type,
    sizeBytes: item.size,
    previewUrl: item.preview_url,
    downloadUrl: item.original_url,
    capturedAt: item.create_at ?? null,
    urlExpiresNote:
      "DJI media URLs are time-limited signed links. Re-fetch via GET /tasks/{id}/media before download.",
  }));
}

export function normalizeTrajectory(
  taskId: string,
  data: {
    points: Fh2TrackPoint[];
    flightDistance?: number;
    flightDuration?: number;
    droneSn?: string;
  },
): NormalizedTrajectory {
  return {
    taskId,
    droneSerialNumber: data.droneSn ?? null,
    flightDistanceM: data.flightDistance ?? null,
    flightDurationSec: data.flightDuration ?? null,
    points: data.points.map((p) => ({
      timestamp: p.timestamp,
      latitude: p.latitude,
      longitude: p.longitude,
      altitudeM: p.height,
    })),
  };
}

export function findDeviceEntry(
  entries: Fh2DeviceEntry[],
  serialNumber: string,
): Fh2DeviceEntry | undefined {
  return entries.find(
    (e) => e.drone?.sn === serialNumber || e.gateway?.sn === serialNumber,
  );
}
