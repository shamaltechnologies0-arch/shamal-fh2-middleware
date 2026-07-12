import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const secretPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../data/.platform-session-secret",
);

const MIN_SECRET_LENGTH = 32;

let cached: string | undefined;

function isServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined ||
    process.env.LAMBDA_TASK_ROOT !== undefined
  );
}

function isProductionRuntime(): boolean {
  return String(process.env.NODE_ENV).toLowerCase() === "production";
}

function readEnvSecret(): string | undefined {
  return (
    process.env.PLATFORM_SESSION_SECRET?.trim() ||
    process.env.CC_SESSION_SECRET?.trim() ||
    undefined
  );
}

function missingEnvSecretError(): Error {
  return new Error(
    "PLATFORM_SESSION_SECRET or CC_SESSION_SECRET is required in production. Configure a shared secret across all app instances.",
  );
}

function validateSecretLength(secret: string): void {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `Session secret must be at least ${MIN_SECRET_LENGTH} characters (PLATFORM_SESSION_SECRET or CC_SESSION_SECRET).`,
    );
  }
}

/** Browser session signing secret — env on serverless; auto-file on local dev only */
export function getPlatformSessionSecret(): string {
  if (cached) return cached;

  const fromEnv = readEnvSecret();
  if (fromEnv) {
    validateSecretLength(fromEnv);
    cached = fromEnv;
    return fromEnv;
  }

  if (isServerlessRuntime() || isProductionRuntime()) {
    throw missingEnvSecretError();
  }

  try {
    const dir = dirname(secretPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    if (existsSync(secretPath)) {
      const fromFile = readFileSync(secretPath, "utf8").trim();
      if (fromFile) {
        cached = fromFile;
        return fromFile;
      }
    }

    cached = randomBytes(32).toString("hex");
    writeFileSync(secretPath, `${cached}\n`, { mode: 0o600 });
    return cached;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EROFS" || code === "EACCES" || code === "EPERM") {
      throw new Error(
        "Cannot write session secret to disk (read-only filesystem). Set PLATFORM_SESSION_SECRET or CC_SESSION_SECRET to a random string of at least 32 characters.",
      );
    }
    throw err;
  }
}
