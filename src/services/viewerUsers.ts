import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { CcUser } from "./commandCenterAuth.js";

const storePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../data/viewer-users.json",
);

const viewerRecordSchema = z.object({
  username: z.string().min(2).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(4).max(128),
  displayName: z.string().min(1).max(128),
  apiKey: z.string().min(1).max(256),
});

export type StoredViewerUser = z.infer<typeof viewerRecordSchema>;

export const createViewerSchema = z.object({
  username: viewerRecordSchema.shape.username,
  password: viewerRecordSchema.shape.password,
  displayName: viewerRecordSchema.shape.displayName,
  apiKey: viewerRecordSchema.shape.apiKey.optional(),
});

function ensureStoreDir(): void {
  const dir = dirname(storePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readStore(): StoredViewerUser[] {
  ensureStoreDir();
  if (!existsSync(storePath)) return [];
  try {
    const raw = readFileSync(storePath, "utf8");
    const parsed = JSON.parse(raw) as StoredViewerUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(users: StoredViewerUser[]): void {
  ensureStoreDir();
  writeFileSync(storePath, JSON.stringify(users, null, 2) + "\n", "utf8");
}

export function getManagedViewerUsers(): CcUser[] {
  return readStore().map((record) => ({
    username: record.username,
    password: record.password,
    role: "viewer" as const,
    apiKey: record.apiKey,
    displayName: record.displayName,
  }));
}

export function listManagedViewerRecords(): StoredViewerUser[] {
  return readStore();
}

export function isManagedViewer(username: string): boolean {
  return readStore().some((u) => u.username === username);
}

export function createManagedViewer(input: z.infer<typeof createViewerSchema>): StoredViewerUser {
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
    apiKey: parsed.data.apiKey?.trim() || "",
  };

  if (!record.apiKey) {
    record.apiKey = `vwr_${randomBytes(12).toString("hex")}`;
  }

  store.push(record);
  writeStore(store);
  return record;
}

export function deleteManagedViewer(username: string): void {
  const store = readStore();
  const next = store.filter((u) => u.username !== username);
  if (next.length === store.length) {
    throw new Error(`Managed viewer account "${username}" was not found`);
  }
  writeStore(next);
}

export function getViewerUsersStorePath(): string {
  return storePath;
}
