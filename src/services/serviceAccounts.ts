import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  type CredentialExpirationPreset,
  computeExpiresAt,
  credentialExpirationPresetSchema,
  isCredentialExpired,
} from "./credentialExpiration.js";
import {
  hashClientSecret,
  signServiceAccountJwt,
  verifyClientSecret,
  verifyServiceAccountJwt,
  isServiceAccountJwt,
} from "./serviceAccountCrypto.js";
import { getEffectiveScopes } from "./viewerIntegration.js";
import type { ViewerApiScope } from "./viewerScopes.js";

const CLIENT_ID_PREFIX = "sa_srv_";
const CLIENT_SECRET_PREFIX = "sec_";
const STORE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../data/service-accounts.json",
);
export const SERVICE_ACCOUNTS_MAX_PER_USER = 10;
const ACCESS_TOKEN_TTL_SECONDS = 3600;
const SECRET_PREFIX_DISPLAY_LENGTH = 12;
const JWT_AUDIENCE = "shamal-fh2-api";

export type ServiceAccountStatus = "active" | "revoked";

export interface ServiceAccountRecord {
  id: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  clientId: string;
  clientSecretHash: string;
  clientSecretPrefix: string;
  scopes: ViewerApiScope[];
  expirationPreset: CredentialExpirationPreset;
  expiresAt: string;
  status: ServiceAccountStatus;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdBy: string;
}

export interface ServiceAccountPublic {
  id: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  clientId: string;
  clientSecretMasked: string;
  scopes: ViewerApiScope[];
  expirationPreset: CredentialExpirationPreset;
  expiresAt: string;
  status: ServiceAccountStatus | "expired";
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdBy: string;
}

const viewerScopeSchema = z.enum([
  "fleet:read",
  "drone:read",
  "dock:read",
  "battery:read",
  "gps:read",
  "status:read",
  "camera:read",
  "fpv:read",
  "events:read",
  "media:read",
]);

const recordSchema = z.object({
  id: z.string().min(1),
  ownerUserId: z.string().min(1),
  name: z.string().min(1).max(128),
  description: z.string().max(512).nullable(),
  clientId: z.string().min(1),
  clientSecretHash: z.string().min(1),
  clientSecretPrefix: z.string().min(1),
  scopes: z.array(viewerScopeSchema).min(1),
  expirationPreset: credentialExpirationPresetSchema,
  expiresAt: z.string(),
  status: z.enum(["active", "revoked"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdBy: z.string().min(1),
});

export const createServiceAccountSchema = z.object({
  name: z.string().trim().min(1).max(128),
  description: z.string().trim().max(512).optional(),
  scopes: z.array(viewerScopeSchema).min(1),
  expiration: credentialExpirationPresetSchema,
  ownerUserId: z.string().trim().min(1).optional(),
});

export const updateServiceAccountSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  description: z.string().trim().max(512).nullable().optional(),
  scopes: z.array(viewerScopeSchema).min(1).optional(),
});

function ensureStoreDir(): void {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readStore(): ServiceAccountRecord[] {
  ensureStoreDir();
  if (!existsSync(STORE_PATH)) return [];
  try {
    const raw = readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as ServiceAccountRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => recordSchema.safeParse(row).success);
  } catch {
    return [];
  }
}

function writeStore(records: ServiceAccountRecord[]): void {
  ensureStoreDir();
  writeFileSync(STORE_PATH, JSON.stringify(records, null, 2) + "\n", "utf8");
}

function nowIso(): string {
  return new Date().toISOString();
}

function maskSecret(prefix: string): string {
  return `${prefix}${"•".repeat(12)}`;
}

function generateClientId(): string {
  return `${CLIENT_ID_PREFIX}${randomBytes(10).toString("hex")}`;
}

function generateClientSecret(): string {
  return `${CLIENT_SECRET_PREFIX}${randomBytes(24).toString("hex")}`;
}

function secretPrefixFromPlaintext(plaintext: string): string {
  return plaintext.slice(0, SECRET_PREFIX_DISPLAY_LENGTH);
}

function effectiveStatus(record: ServiceAccountRecord): ServiceAccountPublic["status"] {
  if (record.status === "revoked") return "revoked";
  if (isCredentialExpired(record.expiresAt)) return "expired";
  return "active";
}

function toPublic(record: ServiceAccountRecord): ServiceAccountPublic {
  return {
    id: record.id,
    ownerUserId: record.ownerUserId,
    name: record.name,
    description: record.description,
    clientId: record.clientId,
    clientSecretMasked: maskSecret(record.clientSecretPrefix),
    scopes: record.scopes,
    expirationPreset: record.expirationPreset,
    expiresAt: record.expiresAt,
    status: effectiveStatus(record),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
    createdBy: record.createdBy,
  };
}

function accountsForOwner(records: ServiceAccountRecord[], ownerUserId: string): ServiceAccountRecord[] {
  return records.filter((row) => row.ownerUserId === ownerUserId);
}

function findByClientId(clientId: string): ServiceAccountRecord | null {
  return readStore().find((row) => row.clientId === clientId) ?? null;
}

function touchLastUsed(accountId: string): void {
  const records = readStore();
  const record = records.find((row) => row.id === accountId);
  if (!record) return;
  record.lastUsedAt = nowIso();
  record.updatedAt = record.lastUsedAt;
  writeStore(records);
}

function isAccountUsable(record: ServiceAccountRecord): boolean {
  if (record.status !== "active") return false;
  if (isCredentialExpired(record.expiresAt)) return false;
  return true;
}

function assertScopesAllowed(ownerUserId: string, scopes: ViewerApiScope[]): void {
  const allowed = new Set(getEffectiveScopes(ownerUserId));
  const invalid = scopes.filter((scope) => !allowed.has(scope));
  if (invalid.length > 0) {
    throw new Error(
      `Scopes not permitted for this user account: ${invalid.join(", ")}`,
    );
  }
}

export function listAvailableScopes(ownerUserId: string): ViewerApiScope[] {
  return getEffectiveScopes(ownerUserId);
}

export function listServiceAccounts(ownerUserId: string): ServiceAccountPublic[] {
  return accountsForOwner(readStore(), ownerUserId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPublic);
}

export function listAllServiceAccounts(ownerUserId?: string): ServiceAccountPublic[] {
  const records = readStore();
  const filtered = ownerUserId ? accountsForOwner(records, ownerUserId) : records;
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toPublic);
}

export function getServiceAccount(
  ownerUserId: string,
  accountId: string,
): ServiceAccountPublic | null {
  const record = accountsForOwner(readStore(), ownerUserId).find((row) => row.id === accountId);
  return record ? toPublic(record) : null;
}

export function getServiceAccountById(accountId: string): ServiceAccountPublic | null {
  const record = readStore().find((row) => row.id === accountId);
  return record ? toPublic(record) : null;
}

export function createServiceAccount(
  ownerUserId: string,
  input: z.infer<typeof createServiceAccountSchema>,
  createdBy: string,
): { record: ServiceAccountPublic; clientSecret: string } {
  const parsed = createServiceAccountSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid service account payload");
  }

  assertScopesAllowed(ownerUserId, parsed.data.scopes);

  const records = readStore();
  if (accountsForOwner(records, ownerUserId).length >= SERVICE_ACCOUNTS_MAX_PER_USER) {
    throw new Error(`Maximum of ${SERVICE_ACCOUNTS_MAX_PER_USER} service accounts per user reached`);
  }

  const timestamp = nowIso();
  const clientSecret = generateClientSecret();
  const record: ServiceAccountRecord = {
    id: randomUUID(),
    ownerUserId,
    name: parsed.data.name,
    description: parsed.data.description?.trim() || null,
    clientId: generateClientId(),
    clientSecretHash: hashClientSecret(clientSecret),
    clientSecretPrefix: secretPrefixFromPlaintext(clientSecret),
    scopes: parsed.data.scopes,
    expirationPreset: parsed.data.expiration,
    expiresAt: computeExpiresAt(parsed.data.expiration, new Date(timestamp)),
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: null,
    revokedAt: null,
    createdBy,
  };

  records.push(record);
  writeStore(records);
  return { record: toPublic(record), clientSecret };
}

export function updateServiceAccount(
  ownerUserId: string,
  accountId: string,
  patch: z.infer<typeof updateServiceAccountSchema>,
): ServiceAccountPublic {
  const parsed = updateServiceAccountSchema.safeParse(patch);
  if (!parsed.success) {
    throw new Error("Invalid service account update payload");
  }

  const records = readStore();
  const record = accountsForOwner(records, ownerUserId).find((row) => row.id === accountId);
  if (!record) throw new Error("Service account not found");
  if (record.status === "revoked" || isCredentialExpired(record.expiresAt)) {
    throw new Error("Revoked or expired service accounts cannot be updated");
  }

  if (parsed.data.name) record.name = parsed.data.name.trim();
  if (parsed.data.description !== undefined) {
    record.description = parsed.data.description?.trim() || null;
  }
  if (parsed.data.scopes) {
    assertScopesAllowed(ownerUserId, parsed.data.scopes);
    record.scopes = parsed.data.scopes;
  }
  record.updatedAt = nowIso();
  writeStore(records);
  return toPublic(record);
}

export function revokeServiceAccount(ownerUserId: string, accountId: string): ServiceAccountPublic {
  const records = readStore();
  const record = accountsForOwner(records, ownerUserId).find((row) => row.id === accountId);
  if (!record) throw new Error("Service account not found");
  record.status = "revoked";
  record.revokedAt = nowIso();
  record.updatedAt = record.revokedAt;
  writeStore(records);
  return toPublic(record);
}

export function reactivateServiceAccount(ownerUserId: string, accountId: string): ServiceAccountPublic {
  const records = readStore();
  const record = accountsForOwner(records, ownerUserId).find((row) => row.id === accountId);
  if (!record) throw new Error("Service account not found");
  if (isCredentialExpired(record.expiresAt)) {
    throw new Error("Expired service accounts cannot be reactivated. Create a new service account.");
  }
  record.status = "active";
  record.revokedAt = null;
  record.updatedAt = nowIso();
  writeStore(records);
  return toPublic(record);
}

export function deleteServiceAccount(ownerUserId: string, accountId: string): void {
  const records = readStore();
  const record = accountsForOwner(records, ownerUserId).find((row) => row.id === accountId);
  if (!record) throw new Error("Service account not found");
  writeStore(records.filter((row) => row.id !== accountId));
}

export function rotateServiceAccountSecret(
  ownerUserId: string,
  accountId: string,
): { record: ServiceAccountPublic; clientSecret: string } {
  const records = readStore();
  const record = accountsForOwner(records, ownerUserId).find((row) => row.id === accountId);
  if (!record) throw new Error("Service account not found");
  if (!isAccountUsable(record)) {
    throw new Error("Only active, non-expired service accounts can rotate secrets");
  }

  const clientSecret = generateClientSecret();
  record.clientSecretHash = hashClientSecret(clientSecret);
  record.clientSecretPrefix = secretPrefixFromPlaintext(clientSecret);
  record.updatedAt = nowIso();
  writeStore(records);
  return { record: toPublic(record), clientSecret };
}

function createAccessToken(record: ServiceAccountRecord): { token: string; expiresIn: number } {
  const now = Math.floor(Date.now() / 1000);
  const maxExp = Math.floor(Date.parse(record.expiresAt) / 1000);
  const exp = Math.min(now + ACCESS_TOKEN_TTL_SECONDS, maxExp);
  const token = signServiceAccountJwt({
    sub: record.id,
    cid: record.clientId,
    oid: record.ownerUserId,
    scp: record.scopes,
    aud: JWT_AUDIENCE,
    exp,
  });
  return { token, expiresIn: Math.max(1, exp - now) };
}

export function authenticateServiceAccountCredentials(
  clientId: string,
  clientSecret: string,
): ServiceAccountRecord | null {
  const record = findByClientId(clientId);
  if (!record || !isAccountUsable(record)) return null;
  if (!verifyClientSecret(clientSecret, record.clientSecretHash)) return null;
  touchLastUsed(record.id);
  return record;
}

export function issueClientCredentialsToken(
  clientId: string,
  clientSecret: string,
): {
  accessToken: string;
  expiresIn: number;
  tokenType: "Bearer";
} | null {
  const record = authenticateServiceAccountCredentials(clientId, clientSecret);
  if (!record) return null;
  const { token, expiresIn } = createAccessToken(record);
  return { accessToken: token, expiresIn, tokenType: "Bearer" };
}

export function verifyAccessToken(token: string): {
  accountId: string;
  ownerUserId: string;
  clientId: string;
  scopes: ViewerApiScope[];
} | null {
  const claims = verifyServiceAccountJwt(token);
  if (!claims) return null;

  const record = readStore().find((row) => row.id === claims.sub);
  if (!record || !isAccountUsable(record)) return null;
  if (record.clientId !== claims.cid || record.ownerUserId !== claims.oid) return null;

  const scopes = claims.scp.filter((scope): scope is ViewerApiScope =>
    viewerScopeSchema.safeParse(scope).success,
  );
  if (scopes.length === 0) return null;

  touchLastUsed(record.id);
  return {
    accountId: record.id,
    ownerUserId: record.ownerUserId,
    clientId: record.clientId,
    scopes,
  };
}

export function resolveServiceAccountContext(accountId: string): {
  accountId: string;
  ownerUserId: string;
  clientId: string;
  scopes: ViewerApiScope[];
} | null {
  const record = readStore().find((row) => row.id === accountId);
  if (!record || !isAccountUsable(record)) return null;
  return {
    accountId: record.id,
    ownerUserId: record.ownerUserId,
    clientId: record.clientId,
    scopes: record.scopes,
  };
}

export function isServiceAccountAccessToken(token: string): boolean {
  return isServiceAccountJwt(token);
}

export { CREDENTIAL_EXPIRATION_OPTIONS } from "./credentialExpiration.js";
export type { ViewerApiScope } from "./viewerScopes.js";
