import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Fh2DeviceEntry,
  Fh2HmsItem,
  Fh2LiveStreamInfo,
  Fh2MappingModel,
  Fh2LibraryMediaPage,
  Fh2MediaItem,
  Fh2Project,
  Fh2Task,
  Fh2TrackPoint,
  IFh2Client,
} from "./types.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../assets/fixtures");

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf-8")) as T;
}

export class MockFh2Client implements IFh2Client {
  async listProjects(): Promise<Fh2Project[]> {
    const res = loadFixture<{ data: { list: Fh2Project[] } }>("projects.json");
    return res.data.list;
  }

  async listProjectDevices(): Promise<Fh2DeviceEntry[]> {
    const res = loadFixture<{ data: { list: Fh2DeviceEntry[] } }>("devices.json");
    return res.data.list;
  }

  async getDeviceState(deviceSn: string): Promise<Record<string, unknown>> {
    const res = loadFixture<{ data: Record<string, unknown> }>("device-state.json");
    return { ...res.data, device_sn: deviceSn };
  }

  async getDeviceHms(deviceSnList: string[]): Promise<Fh2HmsItem[]> {
    const res = loadFixture<{
      data: {
        list: Array<{
          device_sn: string;
          device_hms: { list: Fh2HmsItem[] };
        }>;
      };
    }>("hms.json");
    const snSet = new Set(deviceSnList);
    return res.data.list
      .filter((e) => snSet.size === 0 || snSet.has(e.device_sn))
      .flatMap((e) => e.device_hms.list);
  }

  async listTasks(params: {
    sn: string;
    beginAt: number;
    endAt: number;
  }): Promise<Fh2Task[]> {
    void params;
    const res = loadFixture<{ data: { list: Fh2Task[] } }>("tasks.json");
    return res.data.list;
  }

  async getTask(taskUuid: string): Promise<Fh2Task | Record<string, unknown>> {
    const res = loadFixture<{ data: Fh2Task }>("task-detail.json");
    return { ...res.data, uuid: taskUuid };
  }

  async getTaskTrajectory(taskUuid: string): Promise<{
    points: Fh2TrackPoint[];
    flightDistance?: number;
    flightDuration?: number;
    droneSn?: string;
  }> {
    void taskUuid;
    const res = loadFixture<{
      data: {
        track: {
          points: Fh2TrackPoint[];
          flight_distance: number;
          flight_duration: number;
          drone_sn: string;
        };
      };
    }>("task-track.json");
    return {
      points: res.data.track.points,
      flightDistance: res.data.track.flight_distance,
      flightDuration: res.data.track.flight_duration,
      droneSn: res.data.track.drone_sn,
    };
  }

  async getTaskMedia(taskUuid: string): Promise<Fh2MediaItem[]> {
    void taskUuid;
    const res = loadFixture<{ data: { list: Fh2MediaItem[] } }>("task-media.json");
    return res.data.list;
  }

  async listProjectMediaFiles(params: {
    projectUuid: string;
    parentId?: number;
    page?: number;
    size?: number;
  }): Promise<Fh2LibraryMediaPage> {
    const page = params.page ?? 1;
    if (page > 1) {
      return { list: [], pagination: { page, page_size: params.size ?? 100, total: 0 } };
    }
    if (params.parentId != null && params.parentId !== 0) {
      return {
        list: [
          {
            id: params.parentId * 10 + 1,
            uuid: `${params.projectUuid}-photo`,
            name: "DJI_existing_0001_V",
            file_type: 2,
            suffix: ".jpeg",
            size: 1163264,
            preview_url: "https://example.invalid/preview.jpg",
            original_url: "https://example.invalid/original.jpg",
            create_at: "2026-06-22T09:51:58Z",
            p_infos: {
              pid: params.parentId,
              p_name: "DJI Dock 3-FLY-TO-2026-06-22 09:51:58 (UTC)",
              p_uuid: `${params.projectUuid}-folder`,
            },
          },
          {
            id: params.parentId * 10 + 2,
            uuid: `${params.projectUuid}-video`,
            name: "DJI_existing_0002_V",
            file_type: 3,
            suffix: ".mp4",
            size: 24576000,
            preview_url: "",
            original_url: "https://example.invalid/original.mp4",
            create_at: "2026-07-26T11:03:35Z",
            p_infos: {
              pid: params.parentId,
              p_name: "DJI Dock 3-FLY-TO-2026-07-26 11:03:35 (UTC)",
              p_uuid: `${params.projectUuid}-folder`,
            },
          },
        ],
        pagination: { page: 1, page_size: params.size ?? 100, total: 2 },
      };
    }
    return {
      list: [
        {
          id: 501,
          uuid: `${params.projectUuid}-folder`,
          name: "DJI Dock 3-FLY-TO-2026-07-26 11:03:35 (UTC)",
          file_type: 1,
          size: 0,
          create_at: "2026-07-26T11:03:35Z",
        },
      ],
      pagination: { page: 1, page_size: params.size ?? 100, total: 1 },
    };
  }

  async getDeviceLiveStreamInfo(
    deviceSn: string,
    _opts?: import("./types.js").LiveStreamOptions,
  ): Promise<Fh2LiveStreamInfo> {
    const state = await this.getDeviceState(deviceSn);
    const deviceState =
      (state.device_state as Record<string, unknown> | undefined) ?? state;
    const liveCapacity =
      (deviceState.live_capacity as Record<string, unknown> | undefined) ?? null;

    const { buildLiveStreamInfo } = await import("../../modules/streams/application/live-stream-info.service.js");
    return buildLiveStreamInfo(
      deviceSn,
      true,
      liveCapacity,
      "Mock live capacity for Command Center and CAFM video widget integration testing.",
    );
  }

  async listMappingModels(): Promise<Fh2MappingModel[]> {
    const res = loadFixture<{
      data: { list: Array<Record<string, unknown>> };
    }>("mapping-models.json");
    return res.data.list.map((row) => ({
      id: String(row.uuid),
      name: String(row.name),
      status: String(row.status),
      modelType: (row.model_type as string) ?? null,
      createdAt: (row.created_at as string) ?? null,
      updatedAt: (row.updated_at as string) ?? null,
      downloadUrl: (row.download_url as string) ?? null,
      raw: row,
    }));
  }

  async getMappingModel(modelId: string): Promise<Fh2MappingModel | null> {
    const models = await this.listMappingModels();
    return models.find((m) => m.id === modelId) ?? null;
  }
}
