import type { IFh2Client } from "../../../infrastructure/fh2/types.js";
import {
  loadRecentTaskMedia,
  recentMediaMeta,
  type RecentMediaResult,
  type TaskMediaBundle,
} from "./recent-media.service.js";

export type MediaKind = "image" | "video" | "other";

export interface MediaCenterFile {
  id: string;
  name: string;
  mediaType: MediaKind;
  sizeBytes: number;
  previewUrl: string;
  downloadUrl: string;
  capturedAt: string | null;
  folderId: string;
  folderName: string;
  fh2FolderId: number | null;
  deviceSerialNumber: string;
  droneSerialNumber: string | null;
  taskId: string;
  taskName: string;
  downloadPath: string;
}

export interface MediaCenterFolder {
  id: string;
  name: string;
  parentId: string | null;
  fh2FolderId: number | null;
  deviceSerialNumber: string;
  capturedAt: string | null;
  mediaUploadStatus: string | null;
  taskStatus: string;
  fileCount: number;
  photoCount: number;
  videoCount: number;
  totalBytes: number;
}

export interface MediaFolderNode {
  id: string;
  name: string;
  kind: "root" | "mission";
  fh2FolderId: number | null;
  fileCount: number;
  children: MediaFolderNode[];
}

export interface MediaLibraryCatalog {
  storage: {
    provider: "flighthub2";
    container: "DJI FlightHub 2 media library";
    nestedFoldersSupported: boolean;
    note: string;
  };
  folders: MediaCenterFolder[];
  files: MediaCenterFile[];
  tree: MediaFolderNode[];
  mediaApiBlocked: boolean;
  hint?: string;
}

const STORAGE_NOTE =
  "Drone photos and videos are stored in DJI FlightHub 2. Shamal does not keep a separate media archive; the Media Center lists FlightHub folders and issues time-limited download URLs (or a proxied/zipped download) for authorized users.";

export function classifyMediaKind(file: {
  mediaType?: string;
  name?: string;
}): MediaKind {
  const type = (file.mediaType ?? "").toLowerCase();
  const name = (file.name ?? "").toLowerCase();
  if (type.includes("video") || /\.(mp4|mov|m4v|avi|mkv|webm)$/i.test(name)) {
    return "video";
  }
  if (
    type.includes("image") ||
    type.includes("photo") ||
    type.includes("jpeg") ||
    type.includes("jpg") ||
    type.includes("png") ||
    /\.(jpe?g|png|webp|heic|dng|tiff?)$/i.test(name)
  ) {
    return "image";
  }
  return "other";
}

function folderName(bundle: TaskMediaBundle): string {
  return bundle.task.folderLabel || bundle.task.name || bundle.task.id;
}

export function catalogFromRecent(
  result: RecentMediaResult,
): MediaLibraryCatalog {
  const folders: MediaCenterFolder[] = [];
  const files: MediaCenterFile[] = [];

  for (const bundle of result.tasks) {
    const name = folderName(bundle);
    let photos = 0;
    let videos = 0;
    let totalBytes = 0;

    for (const item of bundle.media) {
      const kind = classifyMediaKind(item);
      if (kind === "video") videos += 1;
      else if (kind === "image") photos += 1;
      totalBytes += item.sizeBytes || 0;
      files.push({
        id: item.id,
        name: item.name,
        mediaType: kind,
        sizeBytes: item.sizeBytes,
        previewUrl: item.previewUrl,
        downloadUrl: item.downloadUrl,
        capturedAt: item.capturedAt,
        folderId: bundle.task.id,
        folderName: name,
        fh2FolderId: bundle.task.folderId,
        deviceSerialNumber: bundle.task.deviceSerialNumber,
        droneSerialNumber: bundle.task.deviceSerialNumber,
        taskId: bundle.task.id,
        taskName: bundle.task.name,
        downloadPath: `/v1/media/files/${encodeURIComponent(item.id)}/download?taskId=${encodeURIComponent(bundle.task.id)}`,
      });
    }

    folders.push({
      id: bundle.task.id,
      name,
      parentId: null,
      fh2FolderId: bundle.task.folderId,
      deviceSerialNumber: bundle.task.deviceSerialNumber,
      capturedAt: bundle.task.completedAt || bundle.task.startedAt || bundle.task.scheduledBeginAt,
      mediaUploadStatus: bundle.task.mediaUploadStatus,
      taskStatus: bundle.task.status,
      fileCount: bundle.media.length,
      photoCount: photos,
      videoCount: videos,
      totalBytes,
    });
  }

  const tree: MediaFolderNode[] = [
    {
      id: "root",
      name: "FlightHub Media",
      kind: "root",
      fh2FolderId: null,
      fileCount: files.length,
      children: folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        kind: "mission" as const,
        fh2FolderId: folder.fh2FolderId,
        fileCount: folder.fileCount,
        children: [],
      })),
    },
  ];

  return {
    storage: {
      provider: "flighthub2",
      container: "DJI FlightHub 2 media library",
      nestedFoldersSupported: false,
      note: STORAGE_NOTE,
    },
    folders,
    files,
    tree,
    mediaApiBlocked: result.mediaApiBlocked,
    hint: recentMediaMeta(result).hint as string | undefined,
  };
}

export async function loadMediaLibrary(
  fh2: IFh2Client,
  options: {
    deviceSn: string;
    beginAt: number;
    endAt: number;
    taskLimit?: number;
    mediaPerTask?: number;
    dockLabel?: string;
  },
): Promise<MediaLibraryCatalog> {
  const result = await loadRecentTaskMedia(fh2, {
    ...options,
    taskLimit: options.taskLimit ?? 20,
    mediaPerTask: options.mediaPerTask ?? 50,
  });
  return catalogFromRecent(result);
}

export function filterCatalogFiles(
  catalog: MediaLibraryCatalog,
  query: {
    q?: string;
    kind?: "all" | "image" | "video";
    folderId?: string;
    sort?: "newest" | "oldest" | "name" | "size";
  },
): MediaCenterFile[] {
  const needle = query.q?.trim().toLowerCase() ?? "";
  let rows = catalog.files.filter((file) => {
    if (query.folderId && file.folderId !== query.folderId) return false;
    if (query.kind === "image" && file.mediaType !== "image") return false;
    if (query.kind === "video" && file.mediaType !== "video") return false;
    if (!needle) return true;
    return [file.name, file.folderName, file.taskName, file.deviceSerialNumber]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  const sort = query.sort ?? "newest";
  rows = [...rows].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "size") return (b.sizeBytes || 0) - (a.sizeBytes || 0);
    const ta = a.capturedAt ? new Date(a.capturedAt).getTime() : 0;
    const tb = b.capturedAt ? new Date(b.capturedAt).getTime() : 0;
    return sort === "oldest" ? ta - tb : tb - ta;
  });
  return rows;
}

export function findCatalogFile(
  catalog: MediaLibraryCatalog,
  fileId: string,
): MediaCenterFile | undefined {
  return catalog.files.find((file) => file.id === fileId);
}
