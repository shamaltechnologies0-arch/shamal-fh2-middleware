import { z } from "zod";
import type { CcUser } from "./commandCenterAuth.js";
import {
  getPlatformData,
  getPlatformStoreFilePath,
  PLATFORM_STORE_KEYS,
  putPlatformData,
} from "./platformDataStore.js";
import { createRestApiKey, deleteRestApiKeysForUser } from "./restApiKeys.js";

const viewerRecordSchema = z.object({
  username: z.string().min(2).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(4).max(128),
  displayName: z.string().min(1).max(128),
  /**
   * @deprecated Migration-only field from single-key era.
   * Do not write on new accounts. Physical removal planned after 2026-Q3.
   */
  apiKey: z.string().min(1).max(256).optional(),
});

export type StoredViewerUser = z.infer<typeof viewerRecordSchema>;

export const createViewerSchema = z.object({
  username: viewerRecordSchema.shape.username,
  password: viewerRecordSchema.shape.password,
  displayName: viewerRecordSchema.shape.displayName,
});

export type CreateManagedViewerResult = {
  record: StoredViewerUser;
  initialApiKey: string;
  primaryRestApiKeyMasked: string;
};

function readStore(): StoredViewerUser[] {
  const raw = getPlatformData<StoredViewerUser[]>(
    PLATFORM_STORE_KEYS.VIEWER_USERS,
    [],
  );
  return raw.filter((row) => {
    const base = viewerRecordSchema.omit({ apiKey: true }).safeParse(row);
    return base.success;
  });
}

async function writeStore(users: StoredViewerUser[]): Promise<void> {
  await putPlatformData(PLATFORM_STORE_KEYS.VIEWER_USERS, users);
}

/** Legacy apiKey from viewer-users.json — migration reads only. */
export function getLegacyViewerApiKey(username: string): string | null {
  const record = readStore().find((u) => u.username === username);
  const legacy = record?.apiKey?.trim();
  return legacy || null;
}

export function getManagedViewerUsers(): CcUser[] {
  return readStore().map((record) => ({
    username: record.username,
    password: record.password,
    role: "viewer" as const,
    apiKey: "",
    displayName: record.displayName,
  }));
}

export function listManagedViewerRecords(): StoredViewerUser[] {
  return readStore();
}

export function isManagedViewer(username: string): boolean {
  return readStore().some((u) => u.username === username);
}

export async function createManagedViewer(
  input: z.infer<typeof createViewerSchema>,
): Promise<CreateManagedViewerResult> {
  const parsed = createViewerSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid viewer account payload");
  }

  const store = readStore();
  if (store.some((u) => u.username === parsed.data.username)) {
    throw new Error(`Viewer account "${parsed.data.username}" already exists`);
  }

  const record: StoredViewerUser = {
    username: parsed.data.username,
    password: parsed.data.password,
    displayName: parsed.data.displayName.trim(),
  };

  store.push(record);
  await writeStore(store);

  const { record: keyRecord, plaintext } = await createRestApiKey(
    record.username,
    "Default",
    "system",
    "1y",
    { isPrimary: true },
  );

  return {
    record,
    initialApiKey: plaintext,
    primaryRestApiKeyMasked: keyRecord.keyMasked,
  };
}

export async function deleteManagedViewer(username: string): Promise<void> {
  const store = readStore();
  const next = store.filter((u) => u.username !== username);
  if (next.length === store.length) {
    throw new Error(`Managed viewer account "${username}" was not found`);
  }
  await writeStore(next);
  await deleteRestApiKeysForUser(username);
}

export function getViewerUsersStorePath(): string {
  return getPlatformStoreFilePath(PLATFORM_STORE_KEYS.VIEWER_USERS);
}
