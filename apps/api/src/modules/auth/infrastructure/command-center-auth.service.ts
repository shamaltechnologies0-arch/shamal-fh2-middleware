import { createHmac, timingSafeEqual } from "node:crypto";
import { config, readCcCredentialEnv } from "../../../config/env.js";
import { getPlatformSessionSecret } from "./platform-secret.service.js";
import {
  getPrimaryApiKeyForUser,
  verifyRestApiKey,
} from "../../api-keys/application/rest-api-keys.service.js";
import { getManagedViewerUsers } from "../../users/application/viewer-users.service.js";

export type CcRole = "viewer" | "operator" | "admin";

export interface CcUser {
  username: string;
  password: string;
  role: CcRole;
  apiKey: string;
  displayName: string;
}

const ROLE_RANK: Record<CcRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
};

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function parseApiKeyRoles(raw: string): Map<string, CcRole> {
  const map = new Map<string, CcRole>();
  for (const part of raw.split(",").map((p) => p.trim()).filter(Boolean)) {
    const [apiKey, role] = part.split(":");
    if (!apiKey || !role) continue;
    const normalizedRole = role.toLowerCase() as CcRole;
    if (["viewer", "operator", "admin"].includes(normalizedRole)) {
      map.set(apiKey, normalizedRole);
    }
  }
  return map;
}

function resolveAdminApiKey(apiKeys: string[]): string {
  const rolesRaw = config.VIEWER_API_KEY_ROLES?.trim();
  if (rolesRaw) {
    for (const [key, role] of parseApiKeyRoles(rolesRaw)) {
      if (role === "admin") return key;
    }
  }
  return apiKeys[0] ?? "demo-viewer-key";
}

function buildPlatformUsersFromEnv(creds: ReturnType<typeof readCcCredentialEnv>): CcUser[] {
  if (creds.ccUsers) {
    console.warn(
      "[auth] CC_USERS is ignored. Set admin_id + admin_password in .env only. Create viewer accounts in Admin Settings.",
    );
  }

  const apiKeys = creds.viewerApiKeys;
  const users: CcUser[] = [];

  if (creds.ccAdminId && creds.ccAdminPassword) {
    users.push({
      username: creds.ccAdminId,
      password: creds.ccAdminPassword,
      role: "admin",
      apiKey: resolveAdminApiKey(apiKeys),
      displayName: creds.ccAdminDisplayName || creds.ccAdminId,
    });
  }

  if (creds.ccOperatorId && creds.ccOperatorPassword) {
    users.push({
      username: creds.ccOperatorId,
      password: creds.ccOperatorPassword,
      role: "operator",
      apiKey: resolveAdminApiKey(apiKeys),
      displayName: creds.ccOperatorDisplayName || creds.ccOperatorId,
    });
  }

  return users;
}

/** Loads platform users: Shamal admin from .env; viewers from Admin Settings (data/viewer-users.json). */
export function getCcUsers(): CcUser[] {
  const creds = readCcCredentialEnv();
  const users = buildPlatformUsersFromEnv(creds);

  const existing = new Set(users.map((u) => u.username));
  for (const viewer of getManagedViewerUsers()) {
    if (!existing.has(viewer.username)) {
      const primaryApiKey = getPrimaryApiKeyForUser(viewer.username);
      users.push({
        ...viewer,
        apiKey: primaryApiKey ?? "",
      });
      existing.add(viewer.username);
    }
  }

  return users;
}

/** Viewer usernames defined in .env — always empty; viewers are admin-managed only. */
export function getEnvViewerUsernames(): Set<string> {
  return new Set();
}

export const ccUsers: CcUser[] = getCcUsers();

/** Default role for headless API clients (no X-CC-Session). */
export const apiKeyRoleMap: Map<string, CcRole> = config.VIEWER_API_KEY_ROLES
  ? parseApiKeyRoles(config.VIEWER_API_KEY_ROLES)
  : new Map(config.viewerApiKeys.map((key) => [key, "operator" as CcRole]));

export function createSessionToken(user: CcUser): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${user.username}|${user.role}|${user.apiKey}|${exp}`;
  const sig = createHmac("sha256", getPlatformSessionSecret())
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

export function verifySessionTokenStandalone(
  token: string,
): { role: CcRole; username: string; apiKey: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split("|");
    if (parts.length !== 5) return null;
    const [username, role, tokenApiKey, expStr, sig] = parts;
    if (!username || !role || !tokenApiKey || !expStr || !sig) return null;
    if (Date.now() > Number(expStr)) return null;

    const payload = `${username}|${role}|${tokenApiKey}|${expStr}`;
    const expected = createHmac("sha256", getPlatformSessionSecret())
      .update(payload)
      .digest("hex");
    if (!safeEqual(sig, expected)) return null;

    const normalizedRole = role.toLowerCase() as CcRole;
    if (!["viewer", "operator", "admin"].includes(normalizedRole)) return null;

    return { role: normalizedRole, username, apiKey: tokenApiKey };
  } catch {
    return null;
  }
}

export function verifySessionToken(
  token: string,
  apiKey: string,
): { role: CcRole; username: string } | null {
  const verified = verifySessionTokenStandalone(token);
  if (!verified || verified.apiKey !== apiKey) return null;
  return { role: verified.role, username: verified.username };
}

function isAllowedUserApiKey(user: CcUser, envApiKeys: string[]): boolean {
  if (envApiKeys.includes(user.apiKey)) return true;
  const verified = verifyRestApiKey(user.apiKey);
  return verified?.userId === user.username;
}

function resolveViewerSessionApiKey(username: string): string | null {
  return getPrimaryApiKeyForUser(username);
}

export function login(username: string, password: string): {
  apiKey: string;
  role: CcRole;
  displayName: string;
  sessionToken: string;
} | null {
  const normalizedUsername = username.trim();
  const users = getCcUsers();
  const user = users.find(
    (u) => u.username === normalizedUsername && safeEqual(u.password, password),
  );
  if (!user) return null;

  const envApiKeys = readCcCredentialEnv().viewerApiKeys;
  const sessionApiKey =
    user.role === "viewer"
      ? resolveViewerSessionApiKey(user.username)
      : user.apiKey;
  if (!sessionApiKey) {
    throw new Error(
      `No active REST API key configured for "${user.username}". Contact Shamal administrator.`,
    );
  }
  const loginUser = { ...user, apiKey: sessionApiKey };

  if (!isAllowedUserApiKey(loginUser, envApiKeys)) {
    throw new Error(
      `User api key "${sessionApiKey}" is not configured. Contact Shamal administrator.`,
    );
  }

  return {
    apiKey: sessionApiKey,
    role: user.role,
    displayName: user.displayName,
    sessionToken: createSessionToken(loginUser),
  };
}

export function roleFromApiKey(apiKey: string): CcRole {
  return apiKeyRoleMap.get(apiKey) ?? "viewer";
}

export function resolveRequestRole(
  apiKey: string,
  sessionToken?: string,
): CcRole | null {
  if (sessionToken) {
    const verified = verifySessionToken(sessionToken, apiKey);
    if (verified) return verified.role;
    return null;
  }
  return roleFromApiKey(apiKey);
}

export function hasMinRole(actual: CcRole, required: CcRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
