import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getPlatformStoreDocument,
  isDatabaseReady,
  setPlatformStoreDocument,
} from "../db/index.js";

export const PLATFORM_STORE_KEYS = {
  VIEWER_USERS: "viewer_users",
  VIEWER_REST_API_KEYS: "viewer_rest_api_keys",
  VIEWER_INTEGRATIONS: "viewer_integrations",
  VIEWER_DASHBOARD_PERMISSIONS: "viewer_dashboard_permissions",
  FH2_PROJECTS: "fh2_projects",
  SERVICE_ACCOUNTS: "service_accounts",
} as const;

export type PlatformStoreKey =
  (typeof PLATFORM_STORE_KEYS)[keyof typeof PLATFORM_STORE_KEYS];

const dataRoot = join(dirname(fileURLToPath(import.meta.url)), "../../data");

const FILE_PATHS: Record<PlatformStoreKey, string> = {
  [PLATFORM_STORE_KEYS.VIEWER_USERS]: join(dataRoot, "viewer-users.json"),
  [PLATFORM_STORE_KEYS.VIEWER_REST_API_KEYS]: join(
    dataRoot,
    "viewer-rest-api-keys.json",
  ),
  [PLATFORM_STORE_KEYS.VIEWER_INTEGRATIONS]: join(
    dataRoot,
    "viewer-integrations.json",
  ),
  [PLATFORM_STORE_KEYS.VIEWER_DASHBOARD_PERMISSIONS]: join(
    dataRoot,
    "viewer-dashboard-permissions.json",
  ),
  [PLATFORM_STORE_KEYS.FH2_PROJECTS]: join(dataRoot, "fh2-projects.json"),
  [PLATFORM_STORE_KEYS.SERVICE_ACCOUNTS]: join(dataRoot, "service-accounts.json"),
};

const cache = new Map<PlatformStoreKey, unknown>();

function isServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined ||
    process.env.LAMBDA_TASK_ROOT !== undefined
  );
}

function ensureJsonDir(): void {
  if (!existsSync(dataRoot)) mkdirSync(dataRoot, { recursive: true });
}

function readJsonFile<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function writeJsonFile(path: string, data: unknown): void {
  ensureJsonDir();
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function requireWritableBackend(): void {
  if (isServerlessRuntime() && !isDatabaseReady()) {
    throw new Error(
      "MONGODB_URI is required on Vercel for Admin Settings persistence.",
    );
  }
}

export function getPlatformData<T>(key: PlatformStoreKey, defaultValue: T): T {
  // Keep JSON-backed deployments coherent across multiple Node workers/processes:
  // always re-read the latest file snapshot before serving cached values.
  if (!isDatabaseReady()) {
    const fromFile = readJsonFile<T>(FILE_PATHS[key]);
    if (fromFile !== undefined) {
      cache.set(key, fromFile);
      return fromFile;
    }
  }
  if (cache.has(key)) return cache.get(key) as T;
  return defaultValue;
}

export function setPlatformDataCache<T>(key: PlatformStoreKey, data: T): void {
  cache.set(key, data);
}

export async function putPlatformData<T>(
  key: PlatformStoreKey,
  data: T,
): Promise<void> {
  requireWritableBackend();
  cache.set(key, data);

  if (isDatabaseReady()) {
    await setPlatformStoreDocument(key, data);
    return;
  }

  writeJsonFile(FILE_PATHS[key], data);
}

export function persistPlatformDataDeferred(key: PlatformStoreKey): void {
  const data = cache.get(key);
  if (data === undefined) return;
  void putPlatformData(key, data).catch((err) => {
    console.error(`[store] Failed to persist ${key}:`, (err as Error).message);
  });
}

export async function initPlatformDataStore(): Promise<void> {
  for (const key of Object.values(PLATFORM_STORE_KEYS)) {
    let data: unknown;

    if (isDatabaseReady()) {
      data = await getPlatformStoreDocument(key);
      if (data === undefined) {
        const fromFile = readJsonFile(FILE_PATHS[key]);
        if (fromFile !== undefined) {
          data = fromFile;
          await setPlatformStoreDocument(key, data);
          console.info(`[store] Migrated ${key} from JSON to MongoDB`);
        }
      }
    } else {
      data = readJsonFile(FILE_PATHS[key]);
    }

    if (data !== undefined) {
      cache.set(key, data);
    }
  }
}

export function getPlatformStoreFilePath(key: PlatformStoreKey): string {
  return FILE_PATHS[key];
}
