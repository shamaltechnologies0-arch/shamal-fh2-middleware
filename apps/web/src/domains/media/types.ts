export type MediaKind = "image" | "video" | "other";
export type MediaView = "folders" | "images" | "videos";
export type MediaSort = "newest" | "oldest" | "name" | "size";

export interface MediaFile {
  id: string;
  name: string;
  mediaType: MediaKind | string;
  sizeBytes: number;
  previewUrl: string;
  downloadUrl: string;
  capturedAt: string | null;
  folderId?: string;
  folderName?: string;
  fh2FolderId?: number | null;
  deviceSerialNumber?: string;
  droneSerialNumber?: string | null;
  taskId?: string;
  taskName?: string;
  downloadPath?: string;
  urlExpiresNote?: string;
}

export interface MediaFolder {
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

export interface MediaStorageInfo {
  provider: string;
  container: string;
  nestedFoldersSupported: boolean;
  note: string;
}

export interface MediaLibraryCatalog {
  storage: MediaStorageInfo;
  folders: MediaFolder[];
  files: MediaFile[];
  tree: Array<{
    id: string;
    name: string;
    kind: string;
    fh2FolderId: number | null;
    fileCount: number;
    children: unknown[];
  }>;
  mediaApiBlocked: boolean;
  hint?: string;
}
