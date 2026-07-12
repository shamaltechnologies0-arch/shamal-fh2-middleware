import { createFh2Client } from "../../../infrastructure/fh2/client.js";
import { listWebhookEvents } from "../../../infrastructure/database/index.js";
import {
  findDeviceEntry,
  flattenDevices,
  normalizeHms,
} from "../../../shared/normalize/normalize.service.js";
import { resolveTelemetry } from "../../devices/application/telemetry-store.service.js";
import { buildLiveStreamInfo } from "../../streams/application/live-stream-info.service.js";
import {
  loadRecentTaskMedia,
  recentMediaMeta,
} from "../../media/application/recent-media.service.js";

function fh2() {
  return createFh2Client();
}

function primaryDevices(devices: ReturnType<typeof flattenDevices>) {
  const drone = devices.find((d) => d.role === "drone");
  const dock = devices.find((d) => d.role === "gateway");
  return { drone, dock, devices };
}

export async function fetchViewerFleet() {
  const devices = flattenDevices(await fh2().listProjectDevices());
  const drones = devices.filter((d) => d.role === "drone");
  const docks = devices.filter((d) => d.role === "gateway");
  const online = devices.filter((d) => d.online === true).length;
  const offline = devices.filter((d) => d.online === false).length;

  const positions = await Promise.all(
    devices.map(async (device) => {
      const result = await resolveTelemetry(device.serialNumber, () =>
        fh2().getDeviceState(device.serialNumber),
      );
      return {
        serialNumber: device.serialNumber,
        role: device.role,
        callsign: device.callsign,
        modelName: device.modelName,
        online: device.online,
        latitude: result.data.latitude,
        longitude: result.data.longitude,
        altitudeM: result.data.altitudeM,
        batteryPercent: result.data.batteryPercent,
        headingDeg: result.data.headingDeg,
        freshness: result.freshness,
        capturedAt: result.data.capturedAt,
      };
    }),
  );

  return {
    summary: {
      totalDevices: devices.length,
      drones: drones.length,
      docks: docks.length,
      online,
      offline,
      unknown: devices.length - online - offline,
      devices,
    },
    positions,
  };
}

export async function fetchViewerDroneTelemetry() {
  const devices = flattenDevices(await fh2().listProjectDevices());
  const { drone } = primaryDevices(devices);
  if (!drone) {
    return { data: null, meta: { message: "No drone in fleet" } };
  }
  const result = await resolveTelemetry(drone.serialNumber, () =>
    fh2().getDeviceState(drone.serialNumber),
  );
  return {
    data: {
      serialNumber: drone.serialNumber,
      modelName: drone.modelName,
      online: drone.online,
      telemetry: result.data,
    },
    meta: { freshness: result.freshness, source: "flighthub2" },
  };
}

export async function fetchViewerDockTelemetry() {
  const devices = flattenDevices(await fh2().listProjectDevices());
  const { dock } = primaryDevices(devices);
  if (!dock) {
    return { data: null, meta: { message: "No dock in fleet" } };
  }
  const sn = dock.serialNumber;
  const [state, hms] = await Promise.all([
    fh2().getDeviceState(sn),
    fh2().getDeviceHms([sn]),
  ]);
  const entries = await fh2().listProjectDevices();
  const entry = findDeviceEntry(entries, sn);
  const linkedDrone = entry?.drone?.sn ?? null;

  return {
    data: {
      serialNumber: sn,
      modelName: dock.modelName,
      online: dock.online,
      linkedDroneSerialNumber: linkedDrone,
      health: normalizeHms(hms),
      stateSummary: state,
    },
    meta: { source: "flighthub2" },
  };
}

export async function fetchViewerBatteryStatus() {
  const fleet = await fetchViewerFleet();
  const dronePos = fleet.positions.find((p) => p.role === "drone");
  return {
    data: {
      serialNumber: dronePos?.serialNumber ?? null,
      batteryPercent: dronePos?.batteryPercent ?? null,
      online: dronePos?.online ?? null,
      capturedAt: dronePos?.capturedAt ?? null,
    },
    meta: { source: "flighthub2" },
  };
}

export async function fetchViewerGpsLocation() {
  const fleet = await fetchViewerFleet();
  return {
    data: fleet.positions.map((p) => ({
      serialNumber: p.serialNumber,
      role: p.role,
      latitude: p.latitude,
      longitude: p.longitude,
      altitudeM: p.altitudeM,
      freshness: p.freshness,
      capturedAt: p.capturedAt,
    })),
    meta: { count: fleet.positions.length, source: "flighthub2" },
  };
}

export async function fetchViewerOnlineStatus() {
  const devices = flattenDevices(await fh2().listProjectDevices());
  return {
    data: devices.map((d) => ({
      serialNumber: d.serialNumber,
      role: d.role,
      modelName: d.modelName,
      online: d.online,
    })),
    meta: { count: devices.length, source: "flighthub2" },
  };
}

export async function fetchViewerCameraStream(camera: "dock" | "drone") {
  const devices = flattenDevices(await fh2().listProjectDevices());
  const { drone, dock } = primaryDevices(devices);
  const sn =
    camera === "dock"
      ? dock?.serialNumber ?? devices[0]?.serialNumber
      : drone?.serialNumber ?? dock?.serialNumber ?? devices[0]?.serialNumber;
  if (!sn) {
    return { data: null, meta: { message: "No device available" } };
  }

  const device = devices.find((d) => d.serialNumber === sn);
  try {
    const info = await fh2().getDeviceLiveStreamInfo(sn, { camera });
    return {
      data: info,
      meta: { camera, source: "flighthub2" },
    };
  } catch (err) {
    return {
      data: buildLiveStreamInfo(
        sn,
        device?.online ?? null,
        null,
        (err as Error).message,
      ),
      meta: { camera, source: "flighthub2", error: true },
    };
  }
}

export async function fetchViewerAlertsEvents(limit = 25) {
  const rows = await listWebhookEvents(undefined, limit);
  return {
    data: rows.map((row) => ({
      id: row.id,
      type: row.event_type,
      source: row.source,
      payload: row.payload,
      receivedAt: row.received_at.toISOString(),
    })),
    meta: { count: rows.length },
  };
}

export async function fetchViewerMediaHistory() {
  const devices = flattenDevices(await fh2().listProjectDevices());
  const { dock } = primaryDevices(devices);
  const deviceSn = dock?.serialNumber ?? devices[0]?.serialNumber;
  if (!deviceSn) {
    return { data: [], meta: { message: "No device in fleet" } };
  }

  const endAt = Math.floor(Date.now() / 1000);
  const beginAt = endAt - 14 * 24 * 60 * 60;
  const result = await loadRecentTaskMedia(fh2(), {
    deviceSn,
    beginAt,
    endAt,
    taskLimit: 4,
    mediaPerTask: 6,
    dockLabel: dock?.modelName ?? "Dock",
  });

  return {
    data: result.tasks,
    meta: recentMediaMeta(result),
  };
}
