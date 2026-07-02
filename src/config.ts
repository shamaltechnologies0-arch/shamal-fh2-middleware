import dotenv from "dotenv";
import { z } from "zod";
import { getPlatformSessionSecret } from "./services/platformSecret.js";

// Prefer .env over stale shell exports (e.g. FH2_PROJECT_UUID=marafiq1122)
const envFile = dotenv.config();
if (envFile.parsed) {
  for (const key of Object.keys(envFile.parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = envFile.parsed[key] ?? "";
    }
  }
}

const optionalString = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.string().optional(),
);

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  HTTPS_REQUIRED: z
    .union([z.boolean(), z.string()])
    .transform((v) => String(v).toLowerCase() === "true")
    .default(false),
  HTTPS_KEY_PATH: optionalString,
  HTTPS_CERT_PATH: optionalString,
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  FH2_MODE: z.enum(["mock", "live"]).default("mock"),
  FH2_BASE_URL: z.string().url().default("https://es-flight-api-us.djigate.com"),
  FH2_ORG_TOKEN: optionalString,
  FH2_PROJECT_UUID: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().uuid().optional(),
  ),
  FH2_LANGUAGE: z.enum(["en", "zh"]).default("en"),
  VIEWER_API_KEYS: optionalString,
  VIEWER_IP_ALLOWLIST: optionalString,
  VIEWER_EVENT_CALLBACK_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().optional(),
  ),
  VIEWER_EVENT_CALLBACK_SECRET: optionalString,
  VIEWER_API_KEY_ROLES: optionalString,
  MARAFIQ_API_KEYS: z.string().default("demo-marafiq-key"),
  MARAFIQ_IP_ALLOWLIST: z.string().default(""),
  WEBHOOK_SECRET: z.string().default("change-me-webhook-secret"),
  MONGODB_URI: z.string().default("mongodb://localhost:27017"),
  MONGODB_DB_NAME: z.string().default("shamal_middleware"),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  MARAFIQ_EVENT_CALLBACK_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().optional(),
  ),
  MARAFIQ_EVENT_CALLBACK_SECRET: optionalString,
  TELEMETRY_SSE_INTERVAL_MS: z.coerce.number().min(3000).default(10_000),
  CC_USERS: optionalString,
  MARAFIQ_API_KEY_ROLES: optionalString,
  CC_SESSION_SECRET: optionalString,
  PLATFORM_SESSION_SECRET: optionalString,
  CC_ADMIN_ID: optionalString,
  CC_ADMIN_PASSWORD: optionalString,
  admin_id: optionalString,
  admin_password: optionalString,
  CC_OPERATOR_ID: optionalString,
  CC_OPERATOR_PASSWORD: optionalString,
  CC_VIEWER_ID: optionalString,
  CC_VIEWER_PASSWORD: optionalString,
  CC_VIEWER_DISPLAY_NAME: optionalString,
  CC_OPERATOR_DISPLAY_NAME: optionalString,
  CC_ADMIN_DISPLAY_NAME: optionalString,
  PUBLIC_API_BASE_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().optional(),
  ),
  FH2_LIVE_SHARE_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().optional(),
  ),
  FH2_COCKPIT_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().optional(),
  ),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

function coalesceViewerEnv(viewer: string | undefined, legacy: string): string {
  const v = viewer?.trim();
  if (v) return v;
  return legacy;
}

function coalesceViewerOptional(
  viewer: string | undefined,
  legacy: string | undefined,
): string | undefined {
  const v = viewer?.trim();
  if (v) return v;
  const l = legacy?.trim();
  return l || undefined;
}

const VIEWER_LEGACY_PAIRS = [
  ["VIEWER_API_KEYS", "MARAFIQ_API_KEYS"],
  ["VIEWER_API_KEY_ROLES", "MARAFIQ_API_KEY_ROLES"],
  ["VIEWER_IP_ALLOWLIST", "MARAFIQ_IP_ALLOWLIST"],
  ["VIEWER_EVENT_CALLBACK_URL", "MARAFIQ_EVENT_CALLBACK_URL"],
  ["VIEWER_EVENT_CALLBACK_SECRET", "MARAFIQ_EVENT_CALLBACK_SECRET"],
] as const;

if (
  VIEWER_LEGACY_PAIRS.some(
    ([viewer, legacy]) =>
      !process.env[viewer]?.trim() && Boolean(process.env[legacy]?.trim()),
  )
) {
  console.warn(
    "[config] Using legacy MARAFIQ_* environment variables. Prefer VIEWER_* (MARAFIQ_* fallback remains supported during migration).",
  );
}

const resolvedApiKeys = coalesceViewerEnv(
  parsed.data.VIEWER_API_KEYS,
  parsed.data.MARAFIQ_API_KEYS,
);
const resolvedIpAllowlist = coalesceViewerEnv(
  parsed.data.VIEWER_IP_ALLOWLIST,
  parsed.data.MARAFIQ_IP_ALLOWLIST,
);
const resolvedApiKeyRoles = coalesceViewerOptional(
  parsed.data.VIEWER_API_KEY_ROLES,
  parsed.data.MARAFIQ_API_KEY_ROLES,
);
const resolvedEventCallbackUrl = coalesceViewerOptional(
  parsed.data.VIEWER_EVENT_CALLBACK_URL,
  parsed.data.MARAFIQ_EVENT_CALLBACK_URL,
);
const resolvedEventCallbackSecret = coalesceViewerOptional(
  parsed.data.VIEWER_EVENT_CALLBACK_SECRET,
  parsed.data.MARAFIQ_EVENT_CALLBACK_SECRET,
);

const viewerApiKeys = resolvedApiKeys
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);
const viewerIpAllowlist = resolvedIpAllowlist
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);

export const config = {
  ...parsed.data,
  VIEWER_API_KEYS: resolvedApiKeys,
  VIEWER_IP_ALLOWLIST: resolvedIpAllowlist,
  VIEWER_API_KEY_ROLES: resolvedApiKeyRoles,
  VIEWER_EVENT_CALLBACK_URL: resolvedEventCallbackUrl,
  VIEWER_EVENT_CALLBACK_SECRET: resolvedEventCallbackSecret,
  MARAFIQ_API_KEYS: resolvedApiKeys,
  MARAFIQ_IP_ALLOWLIST: resolvedIpAllowlist,
  MARAFIQ_API_KEY_ROLES: resolvedApiKeyRoles,
  MARAFIQ_EVENT_CALLBACK_URL: resolvedEventCallbackUrl,
  MARAFIQ_EVENT_CALLBACK_SECRET: resolvedEventCallbackSecret,
  viewerApiKeys,
  marafiqApiKeys: viewerApiKeys,
  viewerIpAllowlist,
  marafiqIpAllowlist: viewerIpAllowlist,
  fh2LiveReady:
    parsed.data.FH2_MODE === "live" &&
    Boolean(parsed.data.FH2_ORG_TOKEN) &&
    Boolean(parsed.data.FH2_PROJECT_UUID),
  ccAdminId: (parsed.data.CC_ADMIN_ID ?? parsed.data.admin_id)?.trim(),
  ccAdminPassword: (parsed.data.CC_ADMIN_PASSWORD ?? parsed.data.admin_password)?.trim(),
  ccOperatorId: parsed.data.CC_OPERATOR_ID?.trim(),
  ccOperatorPassword: parsed.data.CC_OPERATOR_PASSWORD?.trim(),
  ccViewerId: parsed.data.CC_VIEWER_ID?.trim(),
  ccViewerPassword: parsed.data.CC_VIEWER_PASSWORD?.trim(),
  ccViewerDisplayName: parsed.data.CC_VIEWER_DISPLAY_NAME?.trim(),
  ccOperatorDisplayName: parsed.data.CC_OPERATOR_DISPLAY_NAME?.trim(),
  ccAdminDisplayName: parsed.data.CC_ADMIN_DISPLAY_NAME?.trim(),
  platformSessionSecret: getPlatformSessionSecret(),
  CC_SESSION_SECRET: getPlatformSessionSecret(),
};

/** Re-read .env so login picks up credential changes without restarting the server. */
export function reloadEnvFromDotenv(): void {
  const envFile = dotenv.config({ override: true });
  if (envFile.parsed) {
    for (const key of Object.keys(envFile.parsed)) {
      process.env[key] = envFile.parsed[key] ?? "";
    }
  }
}

function readViewerApiKeysFromEnv(): string[] {
  const raw =
    process.env.VIEWER_API_KEYS?.trim() ||
    process.env.MARAFIQ_API_KEYS?.trim() ||
    "";
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export function readCcCredentialEnv() {
  reloadEnvFromDotenv();
  return {
    ccUsers: process.env.CC_USERS?.trim(),
    ccAdminId: (process.env.CC_ADMIN_ID ?? process.env.admin_id)?.trim(),
    ccAdminPassword: (process.env.CC_ADMIN_PASSWORD ?? process.env.admin_password)?.trim(),
    ccOperatorId: process.env.CC_OPERATOR_ID?.trim(),
    ccOperatorPassword: process.env.CC_OPERATOR_PASSWORD?.trim(),
    ccViewerId: process.env.CC_VIEWER_ID?.trim(),
    ccViewerPassword: process.env.CC_VIEWER_PASSWORD?.trim(),
    ccViewerDisplayName: process.env.CC_VIEWER_DISPLAY_NAME?.trim(),
    ccOperatorDisplayName: process.env.CC_OPERATOR_DISPLAY_NAME?.trim(),
    ccAdminDisplayName: process.env.CC_ADMIN_DISPLAY_NAME?.trim(),
    viewerApiKeys: readViewerApiKeysFromEnv(),
    marafiqApiKeys: readViewerApiKeysFromEnv(),
  };
}
