import type { IFh2Client } from "../../../infrastructure/fh2/types.js";
import type { Fh2LibraryMediaItem, Fh2Task } from "../../../infrastructure/fh2/types.js";
import {
  getPlatformData,
  PLATFORM_STORE_KEYS,
  putPlatformData,
  refreshPlatformDataFromDb,
} from "../../../infrastructure/persistence/platform-data-store.js";
import { getFh2RequestContext, setFh2RequestContext } from "../../projects/application/fh2-project-context.js";
import { flattenDevices, normalizeMedia, normalizeTask } from "../../../shared/normalize/normalize.service.js";
import { classifyMediaKind, type MediaLibraryCatalog } from "./media-library.service.js";
import type { MediaProjectRef } from "./media-access.js";
import { z } from "zod";

const PAGE_SIZE_DEFAULT = 100;
const MAX_PAGES = 30;
const MAX_FOLDERS = 80;
const MAX_FOLDER_DEPTH = 2;
const FRESH_MS = 90_000;
const TASK_LOOKBACK_SEC = 365 * 24 * 60 * 60;
const MAX_FALLBACK_TASKS = 80;

const fileSchema = z.object({
  id: z.string().min(1),
  fh2FileId: z.number().nullable().optional(),
  projectId: z.string().min(1),
  projectCode: z.string().default(""),
  projectName: z.string().default(""),
  name: z.string().default("media"),
  mediaType: z.enum(["image", "video", "other"]),
  sizeBytes: z.number().optional().default(0),
  previewUrl: z.string().optional().default(""),
  downloadUrl: z.string().optional().default(""),
  capturedAt: z.string().nullable().optional(),
  missionFolderName: z.string().nullable().optional(),
  fh2FolderId: z.number().nullable().optional(),
  suffix: z.string().nullable().optional(),
  deviceSerialNumber: z.string().nullable().optional(),
  syncedAt: z.string(),
});

const syncStateSchema = z.object({
  lastSyncAt: z.string().optional(),
  lastSuccessAt: z.string().optional(),
  lastError: z.string().optional(),
  complete: z.boolean().optional(),
});

const storeSchema = z.object({
  files: z.array(fileSchema).default([]),
  sync: z.record(syncStateSchema).default({}),
});

export type StoredProjectMedia = z.infer<typeof fileSchema>;
export type ProjectMediaSyncState = z.infer<typeof syncStateSchema>;

export interface ProjectMediaStoreData {
  files: StoredProjectMedia[];
  sync: Record<string, ProjectMediaSyncState>;
}

export interface MediaStorePort {
  read(): Promise<ProjectMediaStoreData>;
  write(data: ProjectMediaStoreData): Promise<void>;
}

export interface ProjectMediaSyncOptions {
  force?: boolean;
  pageSize?: number;
  retryDelayMs?: number;
  store?: MediaStorePort;
  now?: () => Date;
}

interface MediaDraft {
  id: string;
  fh2FileId: number | null;
  name: string;
  mediaType: "image" | "video";
  sizeBytes: number;
  previewUrl: string;
  downloadUrl: string;
  capturedAt: string | null;
  missionFolderName: string | null;
  fh2FolderId: number | null;
  suffix: string | null;
  deviceSerialNumber: string | null;
}

function emptyStore(): ProjectMediaStoreData {
  return { files: [], sync: {} };
}

function normalizeStore(data: ProjectMediaStoreData): ProjectMediaStoreData {
  const parsed = storeSchema.safeParse(data);
  if (!parsed.success) return emptyStore();
  return {
    files: parsed.data.files.filter((file) => file.mediaType === "image" || file.mediaType === "video"),
    sync: parsed.data.sync,
  };
}

async function platformMediaStore(): Promise<MediaStorePort> {
  return {
    async read() {
      await refreshPlatformDataFromDb(PLATFORM_STORE_KEYS.FH2_MEDIA);
      return normalizeStore(
        getPlatformData<ProjectMediaStoreData>(PLATFORM_STORE_KEYS.FH2_MEDIA, emptyStore()),
      );
    },
    async write(data) {
      await putPlatformData(PLATFORM_STORE_KEYS.FH2_MEDIA, normalizeStore(data));
    },
  };
}

export function createMemoryMediaStore(initial?: ProjectMediaStoreData): MediaStorePort {
  let data = normalizeStore(initial ?? emptyStore());
  return {
    async read() {
      return structuredClone(data);
    },
    async write(next) {
      data = normalizeStore(structuredClone(next));
    },
  };
}

function captureMillis(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function dedupeStoredMedia(files: StoredProjectMedia[]): StoredProjectMedia[] {
  const map = new Map<string, StoredProjectMedia>();
  for (const file of files) {
    const key = `${file.projectId}:${file.id}`;
    const previous = map.get(key);
    if (!previous) {
      map.set(key, file);
      continue;
    }
    map.set(key, {
      ...previous,
      ...file,
      capturedAt: file.capturedAt || previous.capturedAt,
      previewUrl: file.previewUrl || previous.previewUrl,
      downloadUrl: file.downloadUrl || previous.downloadUrl,
      sizeBytes: file.sizeBytes || previous.sizeBytes,
      missionFolderName: file.missionFolderName || previous.missionFolderName,
      deviceSerialNumber: file.deviceSerialNumber || previous.deviceSerialNumber,
    });
  }
  return [...map.values()];
}

export function applyProjectMediaSync(
  store: ProjectMediaStoreData,
  project: MediaProjectRef,
  incoming: MediaDraft[],
  mode: "replace" | "merge",
  syncedAt: string,
  status: ProjectMediaSyncState,
): ProjectMediaStoreData {
  const stamped: StoredProjectMedia[] = incoming
    .filter((file) => file.mediaType === "image" || file.mediaType === "video")
    .map((file) => ({
      ...file,
      projectId: project.projectId,
      projectCode: project.projectCode,
      projectName: project.projectName,
      syncedAt,
    }));
  const others = store.files.filter((file) => file.projectId !== project.projectId);
  const previous = store.files.filter((file) => file.projectId === project.projectId);
  const nextForProject = dedupeStoredMedia(
    mode === "replace" ? stamped : [...previous, ...stamped],
  );
  return {
    files: dedupeStoredMedia([...others, ...nextForProject]),
    sync: {
      ...store.sync,
      [project.projectId]: status,
    },
  };
}

function isTransientFh2Error(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /FH2 HTTP (429|500|502|503|504)/.test(message) || /network|fetch failed|ECONN|ETIMEDOUT/i.test(message);
}

async function withRetry<T>(fn: () => Promise<T>, delayMs: number): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isTransientFh2Error(err) || attempt === 2) break;
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }
  throw last;
}

function libraryKind(item: Fh2LibraryMediaItem): "image" | "video" | "folder" | "other" {
  const raw = item.file_type;
  if (raw === 1 || raw === "1" || raw === "folder") return "folder";
  if (raw === 2 || raw === "2" || raw === "image") return "image";
  if (raw === 3 || raw === "3" || raw === "video") return "video";
  const classified = classifyMediaKind({
    mediaType: typeof raw === "string" ? raw : "",
    name: `${item.name ?? ""}${item.suffix ?? ""}`,
  });
  if (classified === "image" || classified === "video") return classified;
  return "other";
}

function displayName(item: Fh2LibraryMediaItem): string {
  const name = item.name?.trim() || item.uuid || "media";
  const suffix = item.suffix?.trim() || "";
  if (!suffix) return name;
  const normalized = suffix.startsWith(".") ? suffix : `.${suffix}`;
  if (name.toLowerCase().endsWith(normalized.toLowerCase())) return name;
  return `${name}${normalized}`;
}

function draftFromLibraryItem(item: Fh2LibraryMediaItem, kind: "image" | "video"): MediaDraft | null {
  const id = item.uuid?.trim() || (item.id != null ? String(item.id) : "");
  if (!id) return null;
  return {
    id,
    fh2FileId: typeof item.id === "number" ? item.id : null,
    name: displayName(item),
    mediaType: kind,
    sizeBytes: typeof item.size === "number" ? item.size : 0,
    previewUrl: item.preview_url ?? "",
    downloadUrl: item.original_url ?? "",
    capturedAt: item.create_at || item.update_at || null,
    missionFolderName: item.p_infos?.p_name ?? null,
    fh2FolderId: item.p_infos?.pid ?? null,
    suffix: item.suffix ?? null,
    deviceSerialNumber: null,
  };
}

function dedupeDrafts(files: MediaDraft[]): MediaDraft[] {
  const map = new Map<string, MediaDraft>();
  for (const file of files) {
    const previous = map.get(file.id);
    if (!previous) {
      map.set(file.id, file);
      continue;
    }
    map.set(file.id, {
      ...previous,
      ...file,
      capturedAt: file.capturedAt || previous.capturedAt,
      previewUrl: file.previewUrl || previous.previewUrl,
      downloadUrl: file.downloadUrl || previous.downloadUrl,
      missionFolderName: file.missionFolderName || previous.missionFolderName,
    });
  }
  return [...map.values()];
}

async function listMediaPage(
  fh2: IFh2Client,
  projectUuid: string,
  parentId: number | undefined,
  page: number,
  pageSize: number,
  delayMs: number,
): Promise<{ list: Fh2LibraryMediaItem[]; total: number | null }> {
  const result = await withRetry(
    () => fh2.listProjectMediaFiles({ projectUuid, parentId, page, size: pageSize }),
    delayMs,
  );
  return {
    list: result.list ?? [],
    total: typeof result.pagination?.total === "number" ? result.pagination.total : null,
  };
}

async function collectLibraryMedia(
  fh2: IFh2Client,
  projectUuid: string,
  pageSize: number,
  delayMs: number,
): Promise<{ files: MediaDraft[]; complete: boolean }> {
  const files: MediaDraft[] = [];
  let truncated = false;
  let foldersSeen = 0;

  async function paginate(parentId: number | undefined, depth: number): Promise<void> {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const batch = await listMediaPage(fh2, projectUuid, parentId, page, pageSize, delayMs);
      if (batch.list.length === 0) break;
      for (const item of batch.list) {
        const kind = libraryKind(item);
        if (kind === "image" || kind === "video") {
          const draft = draftFromLibraryItem(item, kind);
          if (draft) files.push(draft);
          continue;
        }
        if (kind !== "folder" || depth >= MAX_FOLDER_DEPTH) continue;
        if (typeof item.id !== "number") continue;
        foldersSeen += 1;
        if (foldersSeen > MAX_FOLDERS) {
          truncated = true;
          continue;
        }
        await paginate(item.id, depth + 1);
      }
      const covered = page * pageSize;
      if (batch.list.length < pageSize) break;
      if (batch.total != null && covered >= batch.total) break;
      if (page === MAX_PAGES) truncated = true;
    }
  }

  let listedWithoutParent = false;
  try {
    await paginate(undefined, 0);
    listedWithoutParent = true;
  } catch (err) {
    if (files.length > 0 || foldersSeen > 0) throw err;
  }
  if (files.length === 0 && foldersSeen === 0) {
    try {
      await paginate(0, 0);
    } catch (err) {
      if (!listedWithoutParent) throw err;
    }
  }

  return { files: dedupeDrafts(files), complete: !truncated };
}

async function withProjectUuid<T>(projectUuid: string, fn: () => Promise<T>): Promise<T> {
  const previous = getFh2RequestContext();
  setFh2RequestContext({ ...previous, projectCode: projectUuid });
  try {
    return await fn();
  } finally {
    setFh2RequestContext(previous);
  }
}

async function collectTaskMedia(
  fh2: IFh2Client,
  projectUuid: string,
): Promise<MediaDraft[]> {
  return withProjectUuid(projectUuid, async () => {
    const devices = flattenDevices(await fh2.listProjectDevices());
    const serials = [
      ...devices.filter((device) => device.role === "gateway").map((device) => device.serialNumber),
      ...devices.filter((device) => device.role !== "gateway").map((device) => device.serialNumber),
    ].filter((serial, index, all) => serial && all.indexOf(serial) === index);
    if (serials.length === 0) {
      throw new Error("No device SN provided and none found in project");
    }

    const endAt = Math.floor(Date.now() / 1000);
    const beginAt = endAt - TASK_LOOKBACK_SEC;
    const drafts: MediaDraft[] = [];
    const errors: string[] = [];
    let tasksSeen = 0;

    for (const serial of serials.slice(0, 8)) {
      const tasks = await fh2.listTasks({ sn: serial, beginAt, endAt });
      const sorted = [...tasks].sort((a: Fh2Task, b: Fh2Task) => {
        return captureMillis(b.completed_at ?? b.begin_at) - captureMillis(a.completed_at ?? a.begin_at);
      });
      for (const raw of sorted) {
        if (tasksSeen >= MAX_FALLBACK_TASKS) break;
        tasksSeen += 1;
        const task = normalizeTask(raw);
        let media;
        try {
          media = normalizeMedia(await fh2.getTaskMedia(task.id));
        } catch (err) {
          errors.push(errorText(err));
          continue;
        }
        for (const item of media) {
          const kind = classifyMediaKind(item);
          if (kind !== "image" && kind !== "video") continue;
          if (!item.id) continue;
          drafts.push({
            id: item.id,
            fh2FileId: null,
            name: item.name,
            mediaType: kind,
            sizeBytes: item.sizeBytes,
            previewUrl: item.previewUrl,
            downloadUrl: item.downloadUrl,
            capturedAt: item.capturedAt,
            missionFolderName: task.folderLabel || task.name || null,
            fh2FolderId: task.folderId,
            suffix: null,
            deviceSerialNumber: task.deviceSerialNumber || serial,
          });
        }
      }
    }

    if (drafts.length === 0 && errors.length > 0) {
      const blocked = errors.some((message) => message.includes("219021"));
      throw new Error(
        blocked
          ? "FlightHub returned 219021 for task media. Fly-to and other manual flights are not returned by the v0.1 task media API, and the project media file API is not available on this FlightHub host."
          : errors[0]!,
      );
    }

    return dedupeDrafts(drafts);
  });
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

let writeQueue: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function syncOneProject(
  fh2: IFh2Client,
  store: MediaStorePort,
  project: MediaProjectRef,
  options: Required<Pick<ProjectMediaSyncOptions, "force" | "pageSize" | "retryDelayMs" | "now">>,
): Promise<string | null> {
  const current = await store.read();
  const previous = current.sync[project.projectId];
  const lastSuccess = previous?.lastSuccessAt ? new Date(previous.lastSuccessAt).getTime() : 0;
  const fresh =
    !previous?.lastError &&
    previous?.complete !== false &&
    lastSuccess > 0 &&
    options.now().getTime() - lastSuccess < FRESH_MS;
  if (!options.force && fresh) return null;

  const syncedAt = options.now().toISOString();
  try {
    let collected: { files: MediaDraft[]; complete: boolean };
    try {
      collected = await collectLibraryMedia(fh2, project.projectCode || project.projectId, options.pageSize, options.retryDelayMs);
      if (collected.files.length === 0 && collected.complete) {
        try {
          const fallback = await collectTaskMedia(fh2, project.projectCode || project.projectId);
          if (fallback.length > 0) collected = { files: fallback, complete: true };
        } catch {
          /* An empty library response is still a successful sync. */
        }
      }
    } catch (libraryError) {
      try {
        const fallback = await collectTaskMedia(fh2, project.projectCode || project.projectId);
        collected = { files: fallback, complete: true };
      } catch (taskError) {
        const message = `FlightHub project media could not be synchronized (${errorText(libraryError)}). Task media fallback: ${errorText(taskError)}`;
        const latest = await store.read();
        await store.write(
          applyProjectMediaSync(latest, project, [], "merge", syncedAt, {
            lastSyncAt: syncedAt,
            lastSuccessAt: latest.sync[project.projectId]?.lastSuccessAt,
            lastError: message,
            complete: false,
          }),
        );
        return message;
      }
    }

    const latest = await store.read();
    const replace = collected.complete && collected.files.length > 0;
    await store.write(
      applyProjectMediaSync(latest, project, collected.files, replace ? "replace" : "merge", syncedAt, {
        lastSyncAt: syncedAt,
        lastSuccessAt: syncedAt,
        complete: collected.complete,
      }),
    );
    return collected.complete
      ? null
      : `Media synchronization for ${project.projectName} reached the page limit. Refresh to continue.`;
  } catch (err) {
    const message = errorText(err);
    const latest = await store.read();
    await store.write(
      applyProjectMediaSync(latest, project, [], "merge", syncedAt, {
        lastSyncAt: syncedAt,
        lastSuccessAt: latest.sync[project.projectId]?.lastSuccessAt,
        lastError: message,
        complete: false,
      }),
    );
    return message;
  }
}

export function filesForProjects(
  files: StoredProjectMedia[],
  projects: MediaProjectRef[],
): StoredProjectMedia[] {
  const names = new Map(projects.map((project) => [project.projectId, project.projectName]));
  const ids = new Set(names.keys());
  return files
    .filter((file) => ids.has(file.projectId))
    .map((file) => ({
      ...file,
      projectName: names.get(file.projectId) || file.projectName,
    }));
}

export function buildProjectMediaCatalog(
  projects: MediaProjectRef[],
  files: StoredProjectMedia[],
  hints: string[],
): MediaLibraryCatalog {
  const visible = filesForProjects(files, projects);
  const orderedProjects = [...projects].sort((a, b) => a.projectName.localeCompare(b.projectName));
  const folders = orderedProjects.map((project) => {
    const projectFiles = visible.filter((file) => file.projectId === project.projectId);
    const photos = projectFiles.filter((file) => file.mediaType === "image").length;
    const videos = projectFiles.filter((file) => file.mediaType === "video").length;
    const newest = [...projectFiles].sort(
      (a, b) => captureMillis(b.capturedAt) - captureMillis(a.capturedAt),
    )[0];
    return {
      id: project.projectId,
      name: project.projectName,
      parentId: null,
      fh2FolderId: null,
      deviceSerialNumber: "",
      capturedAt: newest?.capturedAt ?? null,
      mediaUploadStatus: null,
      taskStatus: "synced",
      fileCount: projectFiles.length,
      photoCount: photos,
      videoCount: videos,
      totalBytes: projectFiles.reduce((sum, file) => sum + (file.sizeBytes || 0), 0),
    };
  });

  const catalogFiles = [...visible]
    .sort((a, b) => captureMillis(b.capturedAt) - captureMillis(a.capturedAt))
    .map((file) => ({
      id: file.id,
      name: file.name,
      mediaType: file.mediaType,
      sizeBytes: file.sizeBytes,
      previewUrl: file.previewUrl,
      downloadUrl: file.downloadUrl,
      capturedAt: file.capturedAt ?? null,
      folderId: file.projectId,
      folderName: file.projectName,
      projectId: file.projectId,
      projectName: file.projectName,
      fh2FolderId: file.fh2FolderId ?? null,
      deviceSerialNumber: file.deviceSerialNumber ?? "",
      droneSerialNumber: null,
      taskId: "",
      taskName: file.missionFolderName ?? "",
      downloadPath: `/v1/media/files/${encodeURIComponent(file.id)}/download?projectId=${encodeURIComponent(file.projectId)}`,
    }));

  const uniqueHints = [...new Set(hints.filter(Boolean))];
  return {
    storage: {
      provider: "flighthub2",
      container: "DJI FlightHub 2 project media",
      nestedFoldersSupported: false,
      note: "Each folder is a FlightHub project assigned to you. Photos and videos are synchronized from that project's media library and listed with the newest capture first. File bytes stay in FlightHub; preview and download use FlightHub URLs.",
    },
    folders,
    files: catalogFiles,
    tree: [
      {
        id: "root",
        name: "Projects",
        kind: "root",
        fh2FolderId: null,
        fileCount: catalogFiles.length,
        children: folders.map((folder) => ({
          id: folder.id,
          name: folder.name,
          kind: "mission" as const,
          fh2FolderId: null,
          fileCount: folder.fileCount,
          children: [],
        })),
      },
    ],
    mediaApiBlocked: uniqueHints.length > 0,
    hint: uniqueHints.length > 0 ? uniqueHints.join(" ") : undefined,
  };
}

export async function loadSyncedProjectCatalog(
  fh2: IFh2Client,
  projects: MediaProjectRef[],
  options: ProjectMediaSyncOptions = {},
): Promise<MediaLibraryCatalog> {
  const store = options.store ?? (await platformMediaStore());
  const settings = {
    force: options.force === true,
    pageSize: options.pageSize ?? PAGE_SIZE_DEFAULT,
    retryDelayMs: options.retryDelayMs ?? 200,
    now: options.now ?? (() => new Date()),
  };

  const hints: string[] = [];
  await enqueueWrite(async () => {
    for (const project of projects) {
      const hint = await syncOneProject(fh2, store, project, settings);
      if (hint) hints.push(`${project.projectName}: ${hint}`);
    }
  });

  const stored = await store.read();
  return buildProjectMediaCatalog(projects, stored.files, hints);
}
