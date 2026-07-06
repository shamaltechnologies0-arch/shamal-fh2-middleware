import dotenv from "dotenv";
import { z } from "zod";
import { getPlatformSessionSecret } from "./services/platformSecret.js";

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
  VIEWER_API_KEYS: z.string().default(""),
  VIEWER_IP_ALLOWLIST: z.string().default(""),
  VIEWER_EVENT_CALLBACK_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().optional(),
  ),
  VIEWER_EVENT_CALLBACK_SECRET: optionalString,
  VIEWER_API_KEY_ROLES: optionalString,
  WEBHOOK_SECRET: z.string().default("change-me-webhook-secret"),
  MONGODB_URI: z.string().default("mongodb://localhost:27017"),
  MONGODB_DB_NAME: z.string().default("shamal_middleware"),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  TELEMETRY_SSE_INTERVAL_MS: z.coerce.number().min(3000).default(10_000),
  CC_USERS: optionalString,
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

const viewerApiKeys = (parsed.data.VIEWER_API_KEYS ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);
const viewerIpAllowlist = (parsed.data.VIEWER_IP_ALLOWLIST ?? "")
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);

export const config = {
  ...parsed.data,
  viewerApiKeys,
  viewerIpAllowlist,
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
  const raw = process.env.VIEWER_API_KEYS?.trim() || "";
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
  };
}
