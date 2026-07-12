import type { Fh2DeviceEntry } from "../../../infrastructure/fh2/types.js";

function cameraIndexFromList(list: unknown[] | undefined): string | null {
  if (!list?.length) return null;
  const first = list[0] as { camera_index?: string };
  return first.camera_index ?? null;
}

export function findLinkedDroneSn(
  entries: Fh2DeviceEntry[],
  deviceSn: string,
): string | null {
  for (const entry of entries) {
    if (entry.gateway?.sn === deviceSn) return entry.drone?.sn ?? null;
    if (entry.drone?.sn === deviceSn) return entry.drone.sn;
  }
  return null;
}

export function findLinkedGatewaySn(
  entries: Fh2DeviceEntry[],
  deviceSn: string,
): string | null {
  for (const entry of entries) {
    if (entry.drone?.sn === deviceSn) return entry.gateway?.sn ?? null;
    if (entry.gateway?.sn === deviceSn) return entry.gateway.sn;
  }
  return null;
}

/** Resolve which SN + camera to use for live-stream/start. */
export function resolveStreamTarget(
  entries: Fh2DeviceEntry[],
  deviceSn: string,
  cameraPref: "drone" | "dock" | "auto" = "auto",
): {
  streamSn: string;
  cameraIndex: string | null;
  label: string;
  role: "drone" | "dock";
} {
  const droneSn = findLinkedDroneSn(entries, deviceSn) ?? deviceSn;
  const dockSn = findLinkedGatewaySn(entries, deviceSn) ?? deviceSn;

  if (cameraPref === "dock") {
    return {
      streamSn: dockSn,
      cameraIndex: findCameraIndex(entries, dockSn),
      label: "dock camera",
      role: "dock",
    };
  }

  if (cameraPref === "drone") {
    return {
      streamSn: droneSn,
      cameraIndex: findCameraIndex(entries, droneSn),
      label: "drone FPV",
      role: "drone",
    };
  }

  const droneCamera = findCameraIndex(entries, droneSn);
  if (droneCamera) {
    return {
      streamSn: droneSn,
      cameraIndex: droneCamera,
      label: "drone camera",
      role: "drone",
    };
  }

  return {
    streamSn: dockSn,
    cameraIndex: findCameraIndex(entries, dockSn),
    label: "dock camera",
    role: "dock",
  };
}

/** Pick primary live camera for drone (wide) or dock (indoor). */
export function findCameraIndex(entries: Fh2DeviceEntry[], deviceSn: string): string | null {
  for (const entry of entries) {
    if (entry.drone?.sn === deviceSn) {
      const list = entry.drone.camera_list as Array<{ camera_index?: string }> | undefined;
      const wide = list?.find((c) => c.camera_index?.startsWith("99-"));
      return wide?.camera_index ?? cameraIndexFromList(list);
    }
    if (entry.gateway?.sn === deviceSn) {
      const list = (entry.gateway as { camera_list?: unknown[] }).camera_list;
      return cameraIndexFromList(list);
    }
  }
  return null;
}
