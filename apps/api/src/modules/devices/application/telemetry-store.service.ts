import { listWebhookEvents } from "../../../infrastructure/database/index.js";
import type { NormalizedTelemetry } from "../../../shared/normalize/normalize.service.js";
import { normalizeTelemetry } from "../../../shared/normalize/normalize.service.js";

export type TelemetryFreshness = "live" | "cached" | "unavailable";

const cache = new Map<string, NormalizedTelemetry>();

export function cacheTelemetry(sn: string, payload: Record<string, unknown>): NormalizedTelemetry {
  const row = normalizeTelemetry(sn, payload);
  cache.set(sn, row);
  return row;
}

export function getCachedTelemetry(sn: string): NormalizedTelemetry | null {
  return cache.get(sn) ?? null;
}

function telemetryFromUnknown(sn: string, raw: unknown): NormalizedTelemetry | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.device_state || obj.latitude !== undefined || obj.battery) {
    return normalizeTelemetry(sn, obj);
  }
  if (obj.telemetry && typeof obj.telemetry === "object") {
    const t = obj.telemetry as Record<string, unknown>;
    if (t.rawState) return normalizeTelemetry(sn, { device_state: t.rawState });
    return normalizeTelemetry(sn, { device_state: t });
  }
  if (obj.host && typeof obj.host === "object") {
    return normalizeTelemetry(sn, { device_state: obj.host as Record<string, unknown> });
  }
  return null;
}

export function ingestEventPayload(payload: Record<string, unknown>): void {
  const sn =
    (payload.deviceSn as string | undefined) ??
    (payload.device_sn as string | undefined) ??
    (payload.sn as string | undefined);
  if (!sn) return;
  const telem = telemetryFromUnknown(sn, payload);
  if (telem && (telem.latitude != null || telem.batteryPercent != null)) {
    cache.set(sn, telem);
  }
}

export async function seedTelemetryFromEvents(limit = 200): Promise<number> {
  const rows = await listWebhookEvents(undefined, limit);
  let count = 0;
  for (const row of rows) {
    const before = cache.size;
    ingestEventPayload(row.payload);
    if (cache.size > before) count++;
  }
  return count;
}

export async function resolveTelemetry(
  sn: string,
  fetchLive: () => Promise<Record<string, unknown>>,
): Promise<{ data: NormalizedTelemetry; freshness: TelemetryFreshness; note?: string }> {
  try {
    const state = await fetchLive();
    const data = cacheTelemetry(sn, state);
    return { data, freshness: "live" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cached = getCachedTelemetry(sn);
    if (cached) {
      return {
        data: cached,
        freshness: "cached",
        note: `Live FH2 device state unavailable (${message}). Showing last known snapshot.`,
      };
    }
    return {
      data: {
        serialNumber: sn,
        capturedAt: new Date().toISOString(),
        latitude: null,
        longitude: null,
        altitudeM: null,
        horizontalSpeedMs: null,
        headingDeg: null,
        batteryPercent: null,
        flightModeCode: null,
        gpsSatellites: null,
        rtkFixed: null,
        rawState: {},
      },
      freshness: "unavailable",
      note: permissionHint(message),
    };
  }
}

function permissionHint(message: string): string {
  if (message.includes("403") || message.includes("Forbidden")) {
    return (
      "FlightHub returned 403 for device state / live stream. In FlightHub 2 → Organization Settings → " +
      "FlightHub Sync, ensure the Organization Key has Device Management (device state & livestream) permissions enabled."
    );
  }
  return message;
}
