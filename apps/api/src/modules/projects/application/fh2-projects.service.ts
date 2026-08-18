import { z } from "zod";
import { createFh2Client } from "../../../infrastructure/fh2/client.js";
import { config } from "../../../config/env.js";
import { usernamesMatch } from "../../users/application/viewer-users.service.js";
import {
  getPlatformData,
  getPlatformStoreFilePath,
  PLATFORM_STORE_KEYS,
  putPlatformData,
  refreshPlatformDataFromDb,
} from "../../../infrastructure/persistence/platform-data-store.js";

const projectSchema = z.object({
  fh2ProjectId: z.string().min(1),
  fh2ProjectCode: z.string().min(1),
  projectName: z.string().min(1),
  fh2Status: z.string().default("unknown"),
  localStatus: z.enum(["active", "inactive"]).default("active"),
  source: z.literal("FH2"),
  lastSyncedAt: z.string(),
  raw: z.record(z.unknown()).optional(),
});

const storeSchema = z.object({
  projects: z.array(projectSchema),
  assignments: z.record(z.array(z.string())),
  lastSyncAt: z.string().nullish(),
  // Mongo may persist omitted fields as null; accept and normalize.
  lastSyncError: z.string().nullish(),
});

export type SyncedFh2Project = z.infer<typeof projectSchema>;

type ProjectStore = {
  projects: SyncedFh2Project[];
  assignments: Record<string, string[]>;
  lastSyncAt?: string;
  lastSyncError?: string;
};

function defaultStore(): ProjectStore {
  return { projects: [], assignments: {} };
}

function normalizeStore(store: ProjectStore): ProjectStore {
  const next: ProjectStore = {
    projects: store.projects,
    assignments: store.assignments,
  };
  if (store.lastSyncAt) next.lastSyncAt = store.lastSyncAt;
  if (store.lastSyncError) next.lastSyncError = store.lastSyncError;
  return next;
}

function readStore(): ProjectStore {
  const parsed = getPlatformData<ProjectStore>(
    PLATFORM_STORE_KEYS.FH2_PROJECTS,
    defaultStore(),
  );
  const validated = storeSchema.safeParse(parsed);
  if (!validated.success) return defaultStore();
  return normalizeStore({
    projects: validated.data.projects,
    assignments: validated.data.assignments,
    lastSyncAt: validated.data.lastSyncAt ?? undefined,
    lastSyncError: validated.data.lastSyncError ?? undefined,
  });
}

async function writeStore(store: ProjectStore): Promise<void> {
  await putPlatformData(PLATFORM_STORE_KEYS.FH2_PROJECTS, normalizeStore(store));
}

/** Ensure this instance has the latest FH2 project store from MongoDB. */
export async function refreshFh2ProjectsStore(): Promise<void> {
  await refreshPlatformDataFromDb(PLATFORM_STORE_KEYS.FH2_PROJECTS);
}

async function loadStore(): Promise<ProjectStore> {
  await refreshFh2ProjectsStore();
  return readStore();
}

function normalizeCode(value: string): string {
  return value.trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

export function listFh2Projects(): SyncedFh2Project[] {
  return readStore().projects.sort((a, b) => a.projectName.localeCompare(b.projectName));
}

export function getFh2ProjectSyncStatus(): { lastSyncAt?: string; lastSyncError?: string } {
  const store = readStore();
  return {
    lastSyncAt: store.lastSyncAt,
    lastSyncError: store.lastSyncError,
  };
}

export async function syncFh2ProjectsFromSource(): Promise<{
  syncedCount: number;
  projects: SyncedFh2Project[];
}> {
  const store = await loadStore();
  const now = nowIso();
  try {
    const fh2 = createFh2Client();
    const list = await fh2.listProjects();
    const existingById = new Map(store.projects.map((p) => [p.fh2ProjectId, p]));
    const upserted: SyncedFh2Project[] = [];

    for (const row of list) {
      const fh2ProjectId = String(row.uuid ?? "").trim();
      if (!fh2ProjectId) continue;
      const fh2ProjectCode = normalizeCode(String(row.uuid ?? row.name ?? fh2ProjectId));
      const previous = existingById.get(fh2ProjectId);
      const rowRecord = row as unknown as Record<string, unknown>;
      const statusGuess = String(rowRecord.status ?? "active").toLowerCase();

      upserted.push({
        fh2ProjectId,
        fh2ProjectCode,
        projectName: String(row.name ?? "Unnamed FH2 Project"),
        fh2Status: statusGuess,
        localStatus: previous?.localStatus ?? "active",
        source: "FH2",
        lastSyncedAt: now,
        raw: rowRecord,
      });
    }

    // Preserve previously synced projects not returned in this fetch to avoid data loss.
    for (const prev of store.projects) {
      if (!upserted.some((p) => p.fh2ProjectId === prev.fh2ProjectId)) {
        upserted.push(prev);
      }
    }

    // De-duplicate by FH2 project id.
    const dedupById = new Map<string, SyncedFh2Project>();
    for (const p of upserted) {
      dedupById.set(p.fh2ProjectId, p);
    }

    store.projects = [...dedupById.values()];
    if (store.projects.length === 0 && existingById.size > 0) {
      store.projects = [...existingById.values()];
      store.lastSyncError = "FlightHub 2 returned no projects; kept the last synced list.";
    } else {
      delete store.lastSyncError;
    }
    store.lastSyncAt = now;
    await writeStore(store);
    return {
      syncedCount: list.length,
      projects: listFh2Projects(),
    };
  } catch (err) {
    store.lastSyncError = (err as Error).message;
    store.lastSyncAt = now;
    await writeStore(store);
    throw err;
  }
}

export async function setFh2ProjectLocalStatus(
  fh2ProjectId: string,
  active: boolean,
): Promise<SyncedFh2Project> {
  const store = await loadStore();
  const index = store.projects.findIndex((p) => p.fh2ProjectId === fh2ProjectId);
  if (index < 0) throw new Error(`Project "${fh2ProjectId}" not found`);
  const current = store.projects[index]!;
  const next: SyncedFh2Project = {
    ...current,
    localStatus: active ? "active" : "inactive",
    lastSyncedAt: current.lastSyncedAt || nowIso(),
  };
  store.projects[index] = next;
  await writeStore(store);
  return next;
}

export async function assignViewerToProject(
  fh2ProjectId: string,
  viewerId: string,
): Promise<void> {
  const store = await loadStore();
  const project = store.projects.find((p) => p.fh2ProjectId === fh2ProjectId);
  if (!project) throw new Error(`Project "${fh2ProjectId}" not found`);
  const list = new Set(store.assignments[viewerId] ?? []);
  list.add(fh2ProjectId);
  store.assignments[viewerId] = [...list];
  await writeStore(store);
}

export async function removeViewerFromProject(
  fh2ProjectId: string,
  viewerId: string,
): Promise<void> {
  const store = await loadStore();
  const current = store.assignments[viewerId] ?? [];
  store.assignments[viewerId] = current.filter((id) => id !== fh2ProjectId);
  if (store.assignments[viewerId].length === 0) {
    delete store.assignments[viewerId];
  }
  await writeStore(store);
}

export async function removeViewerFromAllProjects(viewerId: string): Promise<void> {
  const store = await loadStore();
  let changed = false;
  for (const key of Object.keys(store.assignments)) {
    if (usernamesMatch(key, viewerId)) {
      delete store.assignments[key];
      changed = true;
    }
  }
  if (changed) await writeStore(store);
}

export function listAssignedViewerIds(fh2ProjectId: string): string[] {
  const store = readStore();
  return Object.entries(store.assignments)
    .filter(([, ids]) => ids.includes(fh2ProjectId))
    .map(([viewerId]) => viewerId);
}

export function listViewerAssignedProjectIds(viewerId: string): string[] {
  const store = readStore();
  const projectIds = Object.entries(store.assignments)
    .filter(([id]) => usernamesMatch(id, viewerId))
    .flatMap(([, ids]) => ids);
  const activeProjectIds = new Set(
    store.projects
      .filter((p) => p.localStatus === "active")
      .map((p) => p.fh2ProjectId),
  );
  return projectIds.filter((id) => activeProjectIds.has(id));
}

export function listViewerAssignedProjectCodes(viewerId: string): string[] {
  const store = readStore();
  const ids = new Set(listViewerAssignedProjectIds(viewerId));
  return store.projects
    .filter((p) => ids.has(p.fh2ProjectId))
    .map((p) => p.fh2ProjectCode);
}

export function listViewerProjectOptions(viewerId: string): Array<{
  projectId: string;
  projectName: string;
  projectCode: string;
}> {
  const store = readStore();
  const ids = new Set(listViewerAssignedProjectIds(viewerId));
  return store.projects
    .filter((p) => ids.has(p.fh2ProjectId))
    .map((p) => ({
      projectId: p.fh2ProjectId,
      projectName: p.projectName,
      projectCode: p.fh2ProjectCode,
    }));
}

export function hasConfiguredFh2Projects(): boolean {
  return readStore().projects.length > 0;
}

export function resolveFallbackProjectCode(): string | undefined {
  return config.FH2_PROJECT_UUID || undefined;
}

export function getFh2ProjectsStorePath(): string {
  return getPlatformStoreFilePath(PLATFORM_STORE_KEYS.FH2_PROJECTS);
}
