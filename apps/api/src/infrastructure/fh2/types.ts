import type { StreamPlayback } from "../../modules/streams/application/live-stream.service.js";

export interface Fh2Response<T> {
  code: number;
  message: string;
  data: T;
}

export interface Fh2Project {
  name: string;
  uuid: string;
  introduction?: string;
  org_uuid?: string;
  created_at?: number;
  updated_at?: number;
}

export interface Fh2DeviceEntry {
  gateway?: {
    sn?: string;
    callsign?: string;
    device_model?: { name?: string };
    device_online_status?: boolean;
  };
  drone?: {
    sn?: string;
    callsign?: string;
    device_model?: { name?: string; key?: string };
    device_online_status?: boolean;
    camera_list?: unknown[];
  };
}

export interface Fh2Task {
  name: string;
  uuid: string;
  task_type?: string;
  status: string;
  sn: string;
  begin_at?: string;
  end_at?: string;
  run_at?: string;
  completed_at?: string;
  wayline_uuid?: string;
  media_upload_status?: string;
  current_waypoint_index?: number;
  total_waypoints?: number;
  folder_id?: number;
}

export interface Fh2MediaItem {
  uuid: string;
  name: string;
  file_type: string;
  suffix: string;
  size: number;
  preview_url: string;
  original_url: string;
  create_at: string;
  update_at: string;
}

export interface Fh2TrackPoint {
  timestamp: number;
  latitude: number;
  longitude: number;
  height: number;
}

export interface Fh2HmsItem {
  level: string;
  module: string;
  code?: string;
  message?: string;
}

export interface Fh2MappingModel {
  id: string;
  name: string;
  status: string;
  modelType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  downloadUrl: string | null;
  raw: Record<string, unknown>;
}

export interface Fh2LiveStreamInfo {
  deviceSerialNumber: string;
  online: boolean | null;
  streamingSupported: boolean;
  liveCapacity: Record<string, unknown> | null;
  playback: StreamPlayback;
  note: string;
  cameraIndex?: string | null;
  expireTs?: number | null;
}

export interface Fh2LiveStreamStartResult {
  url: string;
  urlType: string;
  expireTs: number;
  cameraIndex: string;
}

export interface LiveStreamOptions {
  camera?: "drone" | "dock" | "auto";
  shareUrl?: string;
}

export interface IFh2Client {
  listProjects(): Promise<Fh2Project[]>;
  listProjectDevices(): Promise<Fh2DeviceEntry[]>;
  getDeviceState(deviceSn: string): Promise<Record<string, unknown>>;
  getDeviceHms(deviceSnList: string[]): Promise<Fh2HmsItem[]>;
  listTasks(params: {
    sn: string;
    beginAt: number;
    endAt: number;
  }): Promise<Fh2Task[]>;
  getTask(taskUuid: string): Promise<Fh2Task | Record<string, unknown>>;
  getTaskTrajectory(taskUuid: string): Promise<{
    points: Fh2TrackPoint[];
    flightDistance?: number;
    flightDuration?: number;
    droneSn?: string;
  }>;
  getTaskMedia(taskUuid: string): Promise<Fh2MediaItem[]>;
  getDeviceLiveStreamInfo(
    deviceSn: string,
    opts?: LiveStreamOptions,
  ): Promise<Fh2LiveStreamInfo>;
  startLiveStream?(
    deviceSn: string,
    cameraIndex: string,
  ): Promise<Fh2LiveStreamStartResult>;
  listOrgDevices?(): Promise<Fh2DeviceEntry[]>;
  listMappingModels(): Promise<Fh2MappingModel[]>;
  getMappingModel(modelId: string): Promise<Fh2MappingModel | null>;
}
