import { fh2Fetch, fh2Post } from "./client.js";
import { config } from "../config.js";
import type {
  Fh2DeviceEntry,
  Fh2HmsItem,
  Fh2LiveStreamInfo,
  Fh2LiveStreamStartResult,
  Fh2MappingModel,
  Fh2MediaItem,
  Fh2Project,
  Fh2Task,
  Fh2TrackPoint,
  IFh2Client,
} from "./types.js";
import { resolveStreamTarget } from "../services/deviceCameras.js";
import { parseVolcStreamUrl } from "../services/liveStream.js";
import type { LiveStreamOptions } from "./types.js";

function normalizeMappingRow(row: Record<string, unknown>): Fh2MappingModel {
  return {
    id: String(row.uuid ?? row.id ?? row.model_uuid ?? ""),
    name: String(row.name ?? row.model_name ?? "Unnamed model"),
    status: String(row.status ?? row.task_status ?? "unknown"),
    modelType: (row.model_type as string | undefined) ?? (row.type as string | undefined) ?? null,
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    downloadUrl:
      (row.download_url as string | undefined) ??
      (row.output_url as string | undefined) ??
      null,
    raw: row,
  };
}

export class LiveFh2Client implements IFh2Client {
  async listProjects(): Promise<Fh2Project[]> {
    const res = await fh2Fetch<{ list: Fh2Project[] }>("/openapi/v0.1/project", {
      projectScoped: false,
    });
    return res.data.list ?? [];
  }

  async listProjectDevices(): Promise<Fh2DeviceEntry[]> {
    const res = await fh2Fetch<{ list: Fh2DeviceEntry[] }>(
      "/openapi/v0.1/project/device",
    );
    return res.data.list ?? [];
  }

  async getDeviceState(deviceSn: string): Promise<Record<string, unknown>> {
    const res = await fh2Fetch<Record<string, unknown>>(
      `/openapi/v0.1/device/${encodeURIComponent(deviceSn)}/state`,
    );
    return res.data;
  }

  async getDeviceHms(deviceSnList: string[]): Promise<Fh2HmsItem[]> {
    const res = await fh2Fetch<{
      list: Array<{
        device_sn: string;
        device_hms: { list: Fh2HmsItem[] };
      }>;
    }>("/openapi/v0.1/device/hms", {
      query: { device_sn_list: deviceSnList.join(",") },
    });
    return (res.data.list ?? []).flatMap((e) => e.device_hms?.list ?? []);
  }

  async listTasks(params: {
    sn: string;
    beginAt: number;
    endAt: number;
  }): Promise<Fh2Task[]> {
    const res = await fh2Fetch<{ list: Fh2Task[] }>(
      "/openapi/v0.1/flight-task/list",
      {
        query: {
          sn: params.sn,
          begin_at: params.beginAt,
          end_at: params.endAt,
        },
      },
    );
    return res.data.list ?? [];
  }

  async getTask(taskUuid: string): Promise<Fh2Task | Record<string, unknown>> {
    const res = await fh2Fetch<Fh2Task | Record<string, unknown>>(
      `/openapi/v0.1/flight-task/${encodeURIComponent(taskUuid)}`,
    );
    return res.data;
  }

  async getTaskTrajectory(taskUuid: string): Promise<{
    points: Fh2TrackPoint[];
    flightDistance?: number;
    flightDuration?: number;
    droneSn?: string;
  }> {
    const res = await fh2Fetch<{
      track?: {
        points?: Fh2TrackPoint[];
        flight_distance?: number;
        flight_duration?: number;
        drone_sn?: string;
      };
    }>(`/openapi/v0.1/flight-task/${encodeURIComponent(taskUuid)}/track`);
    const track = res.data.track ?? {};
    return {
      points: track.points ?? [],
      flightDistance: track.flight_distance,
      flightDuration: track.flight_duration,
      droneSn: track.drone_sn,
    };
  }

  async getTaskMedia(taskUuid: string): Promise<Fh2MediaItem[]> {
    const res = await fh2Fetch<{ list: Fh2MediaItem[] }>(
      `/openapi/v0.1/flight-task/${encodeURIComponent(taskUuid)}/media`,
    );
    return res.data.list ?? [];
  }

  async listOrgDevices(): Promise<Fh2DeviceEntry[]> {
    const res = await fh2Fetch<{ list: Fh2DeviceEntry[] }>("/openapi/v0.1/device", {
      projectScoped: false,
    });
    return res.data.list ?? [];
  }

  async startLiveStream(
    deviceSn: string,
    cameraIndex: string,
  ): Promise<Fh2LiveStreamStartResult> {
    const res = await fh2Post<{
      url: string;
      url_type?: string;
      expire_ts?: number;
    }>("/openapi/v0.1/live-stream/start", {
      sn: deviceSn,
      camera_index: cameraIndex,
      video_expire: 7200,
      video_quality: "adaptive",
      quality_type: "adaptive",
    });
    return {
      url: res.data.url,
      urlType: res.data.url_type ?? "unknown",
      expireTs: res.data.expire_ts ?? 0,
      cameraIndex,
    };
  }

  async getDeviceLiveStreamInfo(
    deviceSn: string,
    opts?: LiveStreamOptions,
  ): Promise<Fh2LiveStreamInfo> {
    const entries = await this.listOrgDevices();
    const cameraPref = opts?.camera ?? "auto";
    const { streamSn, cameraIndex, label } = resolveStreamTarget(
      entries,
      deviceSn,
      cameraPref,
    );
    const online = this.isOnline(entries, streamSn);

    const shareFallback = (reason: string): Fh2LiveStreamInfo | null => {
      const url = opts?.shareUrl || config.FH2_LIVE_SHARE_URL;
      if (!url) return null;
      return {
        deviceSerialNumber: deviceSn,
        online,
        streamingSupported: true,
        liveCapacity: null,
        cameraIndex,
        playback: {
          type: "http",
          url,
          rtmpUrl: null,
          webrtcUrl: null,
          hlsUrl: null,
          volc: null,
          embeddable: true,
          viewerNote:
            "FlightHub Livestream Sharing link. If the player is blank, open the link in FlightHub (some share pages block iframe embed).",
        },
        note: `${reason} Using configured FH2 share URL.`,
      };
    };

    if (cameraIndex && online) {
      try {
        const started = await this.startLiveStream(streamSn, cameraIndex);
        const urlType = started.urlType.toLowerCase();
        const isWhep =
          started.url.includes("whep") || urlType === "srs";
        const volc =
          urlType === "volc" ? parseVolcStreamUrl(started.url) : null;
        return {
          deviceSerialNumber: deviceSn,
          online,
          streamingSupported: true,
          liveCapacity: { camera_index: cameraIndex, url: started.url, stream_sn: streamSn },
          cameraIndex,
          expireTs: started.expireTs,
          playback: volc
            ? {
                type: "volc",
                url: started.url,
                rtmpUrl: null,
                webrtcUrl: null,
                hlsUrl: null,
                volc,
                embeddable: true,
                viewerNote: "Live camera via FlightHub RTC — connecting…",
              }
            : {
                type: isWhep ? "webrtc" : started.url.includes(".m3u8") ? "hls" : "http",
                url: started.url,
                rtmpUrl: null,
                webrtcUrl: isWhep ? started.url : null,
                hlsUrl: started.url.includes(".m3u8") ? started.url : null,
                volc: null,
                embeddable: true,
                viewerNote: isWhep
                  ? "FlightHub WHEP live stream — WebRTC player in Shamal Platform."
                  : "FlightHub live stream URL from /live-stream/start.",
              },
          note: `Live stream via OpenAPI (${label}, SN ${streamSn}).`,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("403") && !msg.includes("Forbidden")) {
          throw err;
        }
        const fallback = shareFallback("OpenAPI live-stream/start returned 403.");
        if (fallback) return fallback;
      }
    }

    const offlineShare = shareFallback("Device offline or no camera for OpenAPI stream.");
    if (offlineShare) return offlineShare;

    try {
      const state = await this.getDeviceState(streamSn);
      const deviceState =
        (state.device_state as Record<string, unknown> | undefined) ?? state;
      const liveCapacity =
        (deviceState.live_capacity as Record<string, unknown> | undefined) ??
        (state.live_capacity as Record<string, unknown> | undefined) ??
        null;

      const { buildLiveStreamInfo } = await import("../services/liveStreamInfo.js");
      const info = buildLiveStreamInfo(
        deviceSn,
        online,
        liveCapacity,
        "REST snapshot of live capacity from FlightHub 2.",
      );
      return { ...info, cameraIndex, note: `${info.note} Stream target: ${streamSn} (${label}).` };
    } catch {
      const fallback = shareFallback("FlightHub device state unavailable (403).");
      if (fallback) return fallback;

      return {
        deviceSerialNumber: deviceSn,
        online,
        streamingSupported: false,
        liveCapacity: null,
        cameraIndex,
        playback: {
          type: "none",
          url: null,
          rtmpUrl: null,
          webrtcUrl: null,
          hlsUrl: null,
          volc: null,
          embeddable: false,
          viewerNote:
            "Could not start FlightHub live stream (403). Enable Device Management + Livestream on the Organization Key in FlightHub Sync, or paste a FH2 Livestream Sharing URL below.",
        },
        note: cameraIndex
          ? `Camera ${cameraIndex} on ${streamSn} (${label}) but live-stream/start returned Forbidden.`
          : "No camera_index found for device.",
      };
    }
  }

  private isOnline(entries: Fh2DeviceEntry[], deviceSn: string): boolean | null {
    for (const entry of entries) {
      if (entry.gateway?.sn === deviceSn) {
        return entry.gateway.device_online_status ?? null;
      }
      if (entry.drone?.sn === deviceSn) {
        return entry.drone.device_online_status ?? null;
      }
    }
    return null;
  }

  async listMappingModels(): Promise<Fh2MappingModel[]> {
    const candidates = [
      "/openapi/v0.1/model",
      "/openapi/v0.1/model/list",
      "/openapi/v0.1/project/model",
    ];

    for (const path of candidates) {
      try {
        const res = await fh2Fetch<{ list?: Record<string, unknown>[] }>(path);
        const list = res.data.list ?? (Array.isArray(res.data) ? res.data : []);
        if (Array.isArray(list) && list.length >= 0) {
          return (list as Record<string, unknown>[]).map(normalizeMappingRow);
        }
      } catch {
        continue;
      }
    }

    return [];
  }

  async getMappingModel(modelId: string): Promise<Fh2MappingModel | null> {
    const candidates = [
      `/openapi/v0.1/model/${encodeURIComponent(modelId)}`,
      `/openapi/v0.1/project/model/${encodeURIComponent(modelId)}`,
    ];

    for (const path of candidates) {
      try {
        const res = await fh2Fetch<Record<string, unknown>>(path);
        return normalizeMappingRow(res.data);
      } catch {
        continue;
      }
    }

    return null;
  }
}
