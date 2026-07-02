import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { getCcUsers } from "./commandCenterAuth.js";
import { getPlatformSessionSecret } from "./platformSecret.js";
import {
  getViewerDashboardPermissions,
  type ViewerDashboardPermissions,
} from "./viewerDashboardPermissions.js";
import {
  deriveViewerScopes,
  enabledDataAccessLabels,
  type ViewerApiScope,
} from "./viewerScopes.js";

const TOKEN_PREFIX = "shm_live_";
const storePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../data/viewer-integrations.json",
);

export type IntegrationStatus = "active" | "revoked" | "expired" | "none";

export interface ViewerIntegrationRecord {
  viewerId: string;
  enabled: boolean;
  tokenHash: string | null;
  tokenPrefix: string | null;
  tokenCiphertext: string | null;
  status: IntegrationStatus;
  generatedAt: string | null;
  revokedAt: string | null;
}

type IntegrationStore = Record<string, Omit<ViewerIntegrationRecord, "viewerId">>;

function ensureStoreDir(): void {
  const dir = dirname(storePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readStore(): IntegrationStore {
  ensureStoreDir();
  if (!existsSync(storePath)) return {};
  try {
    const raw = readFileSync(storePath, "utf8");
    const parsed = JSON.parse(raw) as IntegrationStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: IntegrationStore): void {
  ensureStoreDir();
  writeFileSync(storePath, JSON.stringify(store, null, 2) + "\n", "utf8");
}

function encryptionKey(): Buffer {
  return createHash("sha256")
    .update(`viewer-integration:${getPlatformSessionSecret()}`)
    .digest();
}

function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

function decryptToken(ciphertext: string): string | null {
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

function hashToken(token: string): string {
  return createHmac("sha256", getPlatformSessionSecret())
    .update(`viewer-token:${token}`)
    .digest("hex");
}

function generateRawToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
}

function maskToken(prefix: string | null): string {
  if (!prefix) return "••••••••••••••••••••••••••••••••";
  return `${prefix}${"•".repeat(24)}`;
}

function defaultRecord(): Omit<ViewerIntegrationRecord, "viewerId"> {
  return {
    enabled: false,
    tokenHash: null,
    tokenPrefix: null,
    tokenCiphertext: null,
    status: "none",
    generatedAt: null,
    revokedAt: null,
  };
}

function assertViewerExists(viewerId: string): void {
  const exists = getCcUsers().some(
    (u) => u.username === viewerId && u.role === "viewer",
  );
  if (!exists) {
    throw new Error(`Unknown viewer account: ${viewerId}`);
  }
}

export function getViewerIntegration(viewerId: string): ViewerIntegrationRecord {
  const store = readStore();
  const row = store[viewerId] ?? defaultRecord();
  return { viewerId, ...row };
}

export function getEffectiveScopes(viewerId: string): ViewerApiScope[] {
  const perms = getViewerDashboardPermissions(viewerId);
  return deriveViewerScopes(perms);
}

export function resolveApiBaseUrl(requestHost?: string): string {
  const configured = process.env.PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (requestHost) {
    const proto = requestHost.includes("localhost") || requestHost.startsWith("127.")
      ? "http"
      : "https";
    return `${proto}://${requestHost}`.replace(/\/$/, "");
  }
  return `http://127.0.0.1:${config.PORT}`;
}

export function buildViewerWebhookUrl(apiBaseUrl: string, viewerId: string): string {
  return `${apiBaseUrl}/v1/marafiq/webhooks/viewer/${encodeURIComponent(viewerId)}`;
}

export function getViewerIntegrationPublic(
  viewerId: string,
  apiBaseUrl: string,
): {
  enabled: boolean;
  apiBaseUrl: string;
  accountId: string;
  tokenMasked: string;
  webhookUrl: string;
  accessNote: string;
  generatedAt: string | null;
  status: IntegrationStatus;
  hasToken: boolean;
} {
  const record = getViewerIntegration(viewerId);
  return {
    enabled: record.enabled,
    apiBaseUrl,
    accountId: viewerId,
    tokenMasked: maskToken(record.tokenPrefix),
    webhookUrl: buildViewerWebhookUrl(apiBaseUrl, viewerId),
    accessNote:
      "Your integration access follows the data access configured for your account.",
    generatedAt: record.generatedAt,
    status: record.status,
    hasToken: Boolean(record.tokenHash && record.status === "active"),
  };
}

export function revealViewerToken(viewerId: string): string | null {
  const record = getViewerIntegration(viewerId);
  if (!record.enabled || record.status !== "active" || !record.tokenCiphertext) {
    return null;
  }
  return decryptToken(record.tokenCiphertext);
}

function persistToken(
  viewerId: string,
  token: string,
  enabled = true,
): ViewerIntegrationRecord {
  const store = readStore();
  const prefix = token.slice(0, TOKEN_PREFIX.length + 8);
  const now = new Date().toISOString();
  store[viewerId] = {
    enabled,
    tokenHash: hashToken(token),
    tokenPrefix: prefix,
    tokenCiphertext: encryptToken(token),
    status: "active",
    generatedAt: now,
    revokedAt: null,
  };
  writeStore(store);
  return getViewerIntegration(viewerId);
}

export function setViewerIntegrationEnabled(
  viewerId: string,
  enabled: boolean,
): ViewerIntegrationRecord {
  assertViewerExists(viewerId);
  const store = readStore();
  const current = store[viewerId] ?? defaultRecord();
  store[viewerId] = {
    ...current,
    enabled,
    status: enabled
      ? current.tokenHash
        ? "active"
        : "none"
      : current.status === "active"
        ? "active"
        : current.status,
  };
  writeStore(store);
  return getViewerIntegration(viewerId);
}

export function generateViewerIntegrationToken(viewerId: string): {
  record: ViewerIntegrationRecord;
  token: string;
} {
  assertViewerExists(viewerId);
  const token = generateRawToken();
  const record = persistToken(viewerId, token, true);
  return { record, token };
}

export function regenerateViewerIntegrationToken(viewerId: string): {
  record: ViewerIntegrationRecord;
  token: string;
} {
  return generateViewerIntegrationToken(viewerId);
}

export function revokeViewerIntegrationToken(viewerId: string): ViewerIntegrationRecord {
  assertViewerExists(viewerId);
  const store = readStore();
  const current = store[viewerId] ?? defaultRecord();
  store[viewerId] = {
    ...current,
    enabled: current.enabled,
    tokenHash: null,
    tokenPrefix: null,
    tokenCiphertext: null,
    status: "revoked",
    revokedAt: new Date().toISOString(),
  };
  writeStore(store);
  return getViewerIntegration(viewerId);
}

export function deleteViewerIntegration(viewerId: string): void {
  const store = readStore();
  delete store[viewerId];
  writeStore(store);
}

export function isViewerIntegrationToken(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX);
}

export function verifyViewerIntegrationToken(token: string): {
  viewerId: string;
  scopes: ViewerApiScope[];
} | null {
  if (!isViewerIntegrationToken(token)) return null;

  const store = readStore();
  const digest = hashToken(token);

  for (const [viewerId, row] of Object.entries(store)) {
    if (!row.enabled || row.status !== "active" || !row.tokenHash) continue;
    const a = Buffer.from(digest);
    const b = Buffer.from(row.tokenHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) continue;

    return {
      viewerId,
      scopes: getEffectiveScopes(viewerId),
    };
  }

  return null;
}

export function getAdminIntegrationView(
  viewerId: string,
  apiBaseUrl: string,
): ReturnType<typeof getViewerIntegrationPublic> & {
  enabledDataAccess: string[];
} {
  const permissions = getViewerDashboardPermissions(viewerId);
  return {
    ...getViewerIntegrationPublic(viewerId, apiBaseUrl),
    enabledDataAccess: enabledDataAccessLabels(permissions),
  };
}
