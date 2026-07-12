import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import {
  type CredentialExpirationPreset,
  computeExpiresAt,
  credentialExpirationPresetSchema,
  isCredentialExpired,
  parseCredentialExpiration,
} from "./credential-expiration.service.js";
import { getPlatformSessionSecret } from "../../auth/infrastructure/platform-secret.service.js";
import {
  getPlatformData,
  getPlatformStoreFilePath,
  persistPlatformDataDeferred,
  PLATFORM_STORE_KEYS,
  putPlatformData,
  setPlatformDataCache,
} from "../../../infrastructure/persistence/platform-data-store.js";
import { isManagedViewer, listManagedViewerRecords } from "../../users/application/viewer-users.service.js";

const KEY_PREFIX = "vwr_";
const ID_PREFIX = "key_";
const MAX_KEYS_PER_USER = 10;
export const REST_API_KEYS_MAX_PER_USER = MAX_KEYS_PER_USER;
const PREFIX_DISPLAY_LENGTH = 12;
const LAST_USED_DEBOUNCE_MS = 5 * 60 * 1000;
const REVEAL_MAX_PER_HOUR = 5;
const REVEAL_WINDOW_MS = 60 * 60 * 1000;

export type RestApiKeyStatus = "active" | "disabled" | "revoked" | "expired";

export interface RestApiKeyRecord {
  id: string;
  userId: string;
  label: string;
  keyPrefix: string;
  keyHash: string;
  keyCiphertext: string | null;
  status: RestApiKeyStatus;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdBy: string;
  /** Omitted on legacy keys migrated before expiration support. */
  expirationPreset?: CredentialExpirationPreset;
  /** ISO-8601 expiry; null on legacy keys without a preset. */
  expiresAt: string | null;
}

export interface RestApiKeyPublic {
  id: string;
  userId: string;
  label: string;
  keyMasked: string;
  status: RestApiKeyStatus;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdBy: string;
  expirationPreset?: CredentialExpirationPreset;
  expiresAt: string | null;
}

const recordSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  label: z.string().min(1).max(128),
  keyPrefix: z.string().min(1),
  keyHash: z.string().length(64),
  keyCiphertext: z.string().nullable(),
  status: z.enum(["active", "disabled", "revoked", "expired"]),
  isPrimary: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdBy: z.string().min(1),
  expirationPreset: credentialExpirationPresetSchema.optional(),
  expiresAt: z.string().nullable().optional(),
});

export const createRestApiKeySchema = z.object({
  label: z.string().trim().min(1).max(128),
  expiration: credentialExpirationPresetSchema,
});

export const updateRestApiKeySchema = z.object({
  label: z.string().trim().min(1).max(128).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

let migrationDone = false;
const lastUsedTouch = new Map<string, number>();
const revealAttempts = new Map<string, number[]>();

// TODO(2026-Q3): Remove legacy viewer-users.json apiKey migration after one release cycle.

function readStore(): RestApiKeyRecord[] {
  const raw = getPlatformData<RestApiKeyRecord[]>(
    PLATFORM_STORE_KEYS.VIEWER_REST_API_KEYS,
    [],
  );
  if (!Array.isArray(raw)) return [];
  return raw.filter((row) => recordSchema.safeParse(row).success);
}

async function writeStore(records: RestApiKeyRecord[]): Promise<void> {
  await putPlatformData(PLATFORM_STORE_KEYS.VIEWER_REST_API_KEYS, records);
}

function writeStoreDeferred(records: RestApiKeyRecord[]): void {
  setPlatformDataCache(PLATFORM_STORE_KEYS.VIEWER_REST_API_KEYS, records);
  persistPlatformDataDeferred(PLATFORM_STORE_KEYS.VIEWER_REST_API_KEYS);
}

function encryptionKey(): Buffer {
  return createHash("sha256")
    .update(`rest-api-key:${getPlatformSessionSecret()}`)
    .digest();
}

function encryptKey(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

function decryptKey(ciphertext: string): string | null {
  try {
    const buf = Buffer.from(ciphertext, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function hashKey(plaintext: string): string {
  return createHmac("sha256", getPlatformSessionSecret())
    .update(`rest-api-key:${plaintext}`)
    .digest("hex");
}

function keyPrefixFromPlaintext(plaintext: string): string {
  return plaintext.slice(0, PREFIX_DISPLAY_LENGTH);
}

function maskKey(prefix: string): string {
  return `${prefix}${"•".repeat(12)}`;
}

function generateRawKey(): string {
  return `${KEY_PREFIX}${randomBytes(12).toString("hex")}`;
}

function generateKeyId(): string {
  return `${ID_PREFIX}${randomBytes(8).toString("hex")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function assertViewerExists(userId: string): void {
  if (!isManagedViewer(userId)) {
    throw new Error(`Unknown viewer account: ${userId}`);
  }
}

function toPublic(record: RestApiKeyRecord): RestApiKeyPublic {
  const effectiveStatus =
    record.status === "active" && isCredentialExpired(record.expiresAt)
      ? "expired"
      : record.status;
  return {
    id: record.id,
    userId: record.userId,
    label: record.label,
    keyMasked: maskKey(record.keyPrefix),
    status: effectiveStatus,
    isPrimary: record.isPrimary,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
    createdBy: record.createdBy,
    expirationPreset: record.expirationPreset,
    expiresAt: record.expiresAt ?? null,
  };
}

function keysForUser(records: RestApiKeyRecord[], userId: string): RestApiKeyRecord[] {
  return records.filter((row) => row.userId === userId);
}

function clearPrimaryFlags(records: RestApiKeyRecord[], userId: string): void {
  for (const row of records) {
    if (row.userId === userId) row.isPrimary = false;
  }
}

function promoteNextPrimary(records: RestApiKeyRecord[], userId: string): void {
  const candidate = keysForUser(records, userId)
    .filter((row) => row.status === "active")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (candidate) candidate.isPrimary = true;
}

function assertLabelAvailable(
  records: RestApiKeyRecord[],
  userId: string,
  label: string,
  excludeId?: string,
): void {
  const normalized = label.trim().toLowerCase();
  const taken = keysForUser(records, userId).some(
    (row) => row.id !== excludeId && row.label.trim().toLowerCase() === normalized,
  );
  if (taken) {
    throw new Error(`API key label "${label}" is already in use for this account`);
  }
}

async function persistRecord(
  records: RestApiKeyRecord[],
  record: RestApiKeyRecord,
  options?: { makePrimary?: boolean },
): Promise<RestApiKeyRecord> {
  persistRecordDeferred(records, record, options);
  await writeStore(records);
  return record;
}

function persistRecordDeferred(
  records: RestApiKeyRecord[],
  record: RestApiKeyRecord,
  options?: { makePrimary?: boolean },
): RestApiKeyRecord {
  if (options?.makePrimary) {
    clearPrimaryFlags(records, record.userId);
    record.isPrimary = true;
  } else if (record.isPrimary) {
    clearPrimaryFlags(records, record.userId);
    record.isPrimary = true;
  }

  const index = records.findIndex((row) => row.id === record.id);
  if (index >= 0) {
    records[index] = record;
  } else {
    records.push(record);
  }
  writeStoreDeferred(records);
  return record;
}

function buildRecordFromPlaintext(input: {
  userId: string;
  label: string;
  plaintext: string;
  createdBy: string;
  expiration: CredentialExpirationPreset;
  isPrimary?: boolean;
  status?: RestApiKeyStatus;
  createdAt?: string;
  lastUsedAt?: string | null;
}): RestApiKeyRecord {
  const timestamp = input.createdAt ?? nowIso();
  const expiresAt = computeExpiresAt(input.expiration, new Date(timestamp));
  return {
    id: generateKeyId(),
    userId: input.userId,
    label: input.label.trim(),
    keyPrefix: keyPrefixFromPlaintext(input.plaintext),
    keyHash: hashKey(input.plaintext),
    keyCiphertext: encryptKey(input.plaintext),
    status: input.status ?? "active",
    isPrimary: input.isPrimary ?? false,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: input.lastUsedAt ?? null,
    revokedAt: null,
    createdBy: input.createdBy,
    expirationPreset: input.expiration,
    expiresAt,
  };
}

function legacyKeyHashExists(
  records: RestApiKeyRecord[],
  userId: string,
  plaintext: string,
): boolean {
  const digest = hashKey(plaintext);
  const digestBuf = Buffer.from(digest);
  return keysForUser(records, userId).some((row) => {
    const rowBuf = Buffer.from(row.keyHash);
    return rowBuf.length === digestBuf.length && timingSafeEqual(rowBuf, digestBuf);
  });
}

export function userHasRestApiKeys(userId: string): boolean {
  return keysForUser(readStore(), userId).length > 0;
}

export function getPrimaryRestApiKeyMasked(userId: string): string | null {
  return getPrimaryApiKeyRecord(userId)?.keyMasked ?? null;
}

export function importLegacyViewerApiKey(
  userId: string,
  plaintext: string,
): boolean {
  if (!isManagedViewer(userId) || !plaintext.startsWith(KEY_PREFIX)) return false;

  const records = readStore();
  if (legacyKeyHashExists(records, userId, plaintext)) return true;
  if (keysForUser(records, userId).length > 0) return false;

  const record = buildRecordFromPlaintext({
    userId,
    label: "Default",
    plaintext,
    createdBy: "migration",
    isPrimary: true,
    expiration: "1y",
  });
  persistRecordDeferred(records, record, { makePrimary: true });
  return true;
}

/** @internal Test-only reset for migration idempotency checks. */
export function __resetRestApiKeysMigrationForTests(): void {
  migrationDone = false;
}

export async function ensureRestApiKeysMigrated(): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;

  const records = readStore();
  let changed = false;

  for (const viewer of listManagedViewerRecords()) {
    const legacy = viewer.apiKey?.trim();
    if (!legacy) continue;
    if (legacyKeyHashExists(records, viewer.username, legacy)) continue;
    if (keysForUser(records, viewer.username).length > 0) continue;

    const record = buildRecordFromPlaintext({
      userId: viewer.username,
      label: "Default",
      plaintext: legacy,
      createdBy: "migration",
      isPrimary: true,
      expiration: "1y",
    });
    records.push(record);
    changed = true;
  }

  if (changed) await writeStore(records);
}

export function listRestApiKeys(userId: string): RestApiKeyPublic[] {
  return keysForUser(readStore(), userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPublic);
}

export function getRestApiKey(userId: string, keyId: string): RestApiKeyPublic | null {
  const record = keysForUser(readStore(), userId).find((row) => row.id === keyId);
  return record ? toPublic(record) : null;
}

export async function createRestApiKey(
  userId: string,
  label: string,
  createdBy: string,
  expiration: CredentialExpirationPreset,
  options?: { plaintext?: string; isPrimary?: boolean },
): Promise<{ record: RestApiKeyPublic; plaintext: string }> {
  await ensureRestApiKeysMigrated();
  assertViewerExists(userId);

  const parsed = createRestApiKeySchema.safeParse({ label, expiration });
  if (!parsed.success) {
    throw new Error(
      parsed.error.flatten().fieldErrors.expiration?.[0] ??
        parsed.error.flatten().fieldErrors.label?.[0] ??
        "Invalid API key payload",
    );
  }

  const records = readStore();
  const userKeys = keysForUser(records, userId);
  if (userKeys.length >= MAX_KEYS_PER_USER) {
    throw new Error(`Maximum of ${MAX_KEYS_PER_USER} API keys per account reached`);
  }

  assertLabelAvailable(records, userId, parsed.data.label);

  const plaintext = options?.plaintext?.trim() || generateRawKey();
  if (!plaintext.startsWith(KEY_PREFIX)) {
    throw new Error(`API keys must start with "${KEY_PREFIX}"`);
  }

  const duplicateHash = hashKey(plaintext);
  if (records.some((row) => row.keyHash === duplicateHash)) {
    throw new Error("API key already exists");
  }

  const makePrimary = options?.isPrimary ?? userKeys.length === 0;
  const record = buildRecordFromPlaintext({
    userId,
    label: parsed.data.label,
    plaintext,
    createdBy,
    expiration: parsed.data.expiration,
    isPrimary: makePrimary,
  });

  await persistRecord(records, record, { makePrimary });
  return { record: toPublic(record), plaintext };
}

export async function registerRestApiKeyFromPlaintext(
  userId: string,
  plaintext: string,
  label: string,
  createdBy: string,
  expiration: CredentialExpirationPreset,
  options?: { isPrimary?: boolean },
): Promise<RestApiKeyPublic> {
  return (
    await createRestApiKey(userId, label, createdBy, expiration, {
      plaintext,
      isPrimary: options?.isPrimary,
    })
  ).record;
}

export async function updateRestApiKey(
  userId: string,
  keyId: string,
  patch: z.infer<typeof updateRestApiKeySchema>,
): Promise<RestApiKeyPublic> {
  await ensureRestApiKeysMigrated();
  const parsed = updateRestApiKeySchema.safeParse(patch);
  if (!parsed.success) {
    throw new Error("Invalid API key update payload");
  }

  const records = readStore();
  const record = keysForUser(records, userId).find((row) => row.id === keyId);
  if (!record) {
    throw new Error("API key not found");
  }
  if (record.status === "revoked") {
    throw new Error("Revoked API keys cannot be updated");
  }

  if (parsed.data.label) {
    assertLabelAvailable(records, userId, parsed.data.label, keyId);
    record.label = parsed.data.label.trim();
  }

  if (parsed.data.status) {
    if (parsed.data.status === "disabled" && record.isPrimary) {
      const activeOthers = keysForUser(records, userId).filter(
        (row) => row.id !== keyId && row.status === "active",
      );
      if (activeOthers.length === 0) {
        throw new Error("Cannot disable the only active API key for this account");
      }
      record.isPrimary = false;
      promoteNextPrimary(records, userId);
    }
    record.status = parsed.data.status;
  }

  record.updatedAt = nowIso();
  await persistRecord(records, record);
  return toPublic(record);
}

export async function deleteRestApiKey(userId: string, keyId: string): Promise<void> {
  await ensureRestApiKeysMigrated();
  const records = readStore();
  const userKeys = keysForUser(records, userId);
  const record = userKeys.find((row) => row.id === keyId);
  if (!record) {
    throw new Error("API key not found");
  }
  if (userKeys.length <= 1) {
    throw new Error("Cannot delete the only API key for this account");
  }

  const next = records.filter((row) => row.id !== keyId);
  if (record.isPrimary) {
    promoteNextPrimary(next, userId);
  }
  await writeStore(next);
}

export async function setPrimaryRestApiKey(
  userId: string,
  keyId: string,
): Promise<RestApiKeyPublic> {
  await ensureRestApiKeysMigrated();
  const records = readStore();
  const record = keysForUser(records, userId).find((row) => row.id === keyId);
  if (!record) {
    throw new Error("API key not found");
  }
  if (record.status !== "active") {
    throw new Error("Only active API keys can be set as primary");
  }

  record.isPrimary = true;
  record.updatedAt = nowIso();
  await persistRecord(records, record, { makePrimary: true });
  return toPublic(record);
}

export function revealRestApiKey(userId: string, keyId: string): string | null {
  const record = keysForUser(readStore(), userId).find((row) => row.id === keyId);
  if (!record || record.status !== "active" || !record.keyCiphertext) {
    return null;
  }
  return decryptKey(record.keyCiphertext);
}

export function checkRevealRateLimit(
  userId: string,
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const now = Date.now();
  const attempts = (revealAttempts.get(userId) ?? []).filter(
    (timestamp) => now - timestamp < REVEAL_WINDOW_MS,
  );
  if (attempts.length >= REVEAL_MAX_PER_HOUR) {
    const oldest = attempts[0]!;
    return {
      allowed: false,
      retryAfterSec: Math.ceil((REVEAL_WINDOW_MS - (now - oldest)) / 1000),
    };
  }
  attempts.push(now);
  revealAttempts.set(userId, attempts);
  return { allowed: true };
}

export function getPrimaryApiKeyForUser(userId: string): string | null {
  const userKeys = keysForUser(readStore(), userId);
  const primary = userKeys.find(
    (row) => row.isPrimary && row.status === "active" && !isCredentialExpired(row.expiresAt),
  );
  const candidate =
    primary ??
    userKeys.find(
      (row) => row.status === "active" && !isCredentialExpired(row.expiresAt),
    );
  if (!candidate?.keyCiphertext) return null;
  return decryptKey(candidate.keyCiphertext);
}

export function getPrimaryApiKeyRecord(userId: string): RestApiKeyPublic | null {
  const userKeys = keysForUser(readStore(), userId);
  const primary = userKeys.find((row) => row.isPrimary && row.status === "active");
  const candidate = primary ?? userKeys.find((row) => row.status === "active");
  return candidate ? toPublic(candidate) : null;
}

export { CREDENTIAL_EXPIRATION_OPTIONS } from "./credential-expiration.service.js";
export type { CredentialExpirationPreset } from "./credential-expiration.service.js";
export { parseCredentialExpiration } from "./credential-expiration.service.js";

function markRestApiKeyExpired(keyId: string): void {
  const records = readStore();
  const record = records.find((row) => row.id === keyId);
  if (!record || record.status !== "active") return;
  record.status = "expired";
  record.updatedAt = nowIso();
  writeStoreDeferred(records);
}

export function verifyRestApiKey(
  plaintext: string,
): { userId: string; keyId: string } | null {
  if (!plaintext.startsWith(KEY_PREFIX)) return null;

  const digest = hashKey(plaintext);
  const digestBuf = Buffer.from(digest);

  for (const row of readStore()) {
    if (row.status !== "active") continue;
    const rowBuf = Buffer.from(row.keyHash);
    if (rowBuf.length !== digestBuf.length || !timingSafeEqual(rowBuf, digestBuf)) {
      continue;
    }
    if (isCredentialExpired(row.expiresAt)) {
      markRestApiKeyExpired(row.id);
      return null;
    }
    return { userId: row.userId, keyId: row.id };
  }

  return null;
}

export function touchRestApiKeyLastUsed(keyId: string): void {
  const now = Date.now();
  const last = lastUsedTouch.get(keyId) ?? 0;
  if (now - last < LAST_USED_DEBOUNCE_MS) return;
  lastUsedTouch.set(keyId, now);

  const records = readStore();
  const record = records.find((row) => row.id === keyId);
  if (!record || record.status !== "active") return;

  record.lastUsedAt = new Date(now).toISOString();
  record.updatedAt = record.lastUsedAt;
  writeStoreDeferred(records);
}

export async function deleteRestApiKeysForUser(userId: string): Promise<void> {
  await writeStore(readStore().filter((row) => row.userId !== userId));
}

export function getRestApiKeysStorePath(): string {
  return getPlatformStoreFilePath(PLATFORM_STORE_KEYS.VIEWER_REST_API_KEYS);
}
