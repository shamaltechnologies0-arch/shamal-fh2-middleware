import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const secretPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../data/.platform-session-secret",
);

let cached: string | undefined;

/** Browser session signing secret — stored in data/, not required in .env */
export function getPlatformSessionSecret(): string {
  if (cached) return cached;

  const fromEnv = process.env.CC_SESSION_SECRET?.trim();
  if (fromEnv) {
    console.warn(
      "[config] CC_SESSION_SECRET in .env is deprecated. Remove it; the platform uses data/.platform-session-secret automatically.",
    );
    cached = fromEnv;
    return fromEnv;
  }

  const dir = dirname(secretPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  if (existsSync(secretPath)) {
    cached = readFileSync(secretPath, "utf8").trim();
    if (cached) return cached;
  }

  cached = randomBytes(32).toString("hex");
  writeFileSync(secretPath, `${cached}\n`, { mode: 0o600 });
  return cached;
}
