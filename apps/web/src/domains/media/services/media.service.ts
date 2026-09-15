import { apiDownload, apiGet, saveBlob } from "@/lib/api";
import type { MediaFile, MediaLibraryCatalog } from "@/domains/media/types";

export async function fetchMediaLibrary(): Promise<MediaLibraryCatalog> {
  const catalog = await apiGet<MediaLibraryCatalog>("/v1/media/library?task_limit=20&media_per_task=50");
  return {
    storage: catalog.storage,
    folders: Array.isArray(catalog.folders) ? catalog.folders : [],
    files: Array.isArray(catalog.files) ? catalog.files : [],
    tree: Array.isArray(catalog.tree) ? catalog.tree : [],
    mediaApiBlocked: Boolean(catalog.mediaApiBlocked),
    hint: catalog.hint,
  };
}

export async function fetchTaskMedia(taskId: string): Promise<MediaFile[]> {
  const media = await apiGet<MediaFile[]>(`/v1/tasks/${encodeURIComponent(taskId)}/media`);
  return Array.isArray(media) ? media : [];
}

export async function downloadMediaFile(file: MediaFile): Promise<void> {
  const path =
    file.downloadPath ||
    `/v1/media/files/${encodeURIComponent(file.id)}/download${
      file.taskId ? `?taskId=${encodeURIComponent(file.taskId)}` : ""
    }`;
  const { blob, fileName } = await apiDownload(path);
  saveBlob(blob, fileName || file.name || "media");
}

export async function downloadMediaArchive(options: {
  fileIds?: string[];
  folderId?: string;
}): Promise<void> {
  const params = new URLSearchParams();
  if (options.folderId) params.set("folderId", options.folderId);
  if (options.fileIds?.length) params.set("ids", options.fileIds.join(","));
  const { blob, fileName } = await apiDownload(`/v1/media/archive?${params.toString()}`);
  saveBlob(blob, fileName || "shamal-media.zip");
}
