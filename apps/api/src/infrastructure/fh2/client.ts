import { randomUUID } from "node:crypto";
import { config } from "../../config/env.js";
import { getFh2RequestContext } from "../../modules/projects/application/fh2-project-context.js";
import type { Fh2Response, IFh2Client } from "./types.js";
import { MockFh2Client } from "./mock-adapter.js";
import { LiveFh2Client } from "./live-adapter.js";

async function readFh2Body<T>(response: Response): Promise<Fh2Response<T>> {
  const raw = await response.text();
  if (!raw) {
    return { code: response.ok ? 0 : response.status, message: response.statusText, data: undefined as T };
  }
  try {
    return JSON.parse(raw) as Fh2Response<T>;
  } catch {
    throw new Error(
      `FH2 HTTP ${response.status}: ${raw.replace(/\s+/g, " ").slice(0, 180)}`,
    );
  }
}

export function createFh2Client(): IFh2Client {
  if (config.FH2_MODE === "live" && config.fh2LiveReady) {
    return new LiveFh2Client();
  }
  if (config.FH2_MODE === "live" && !config.fh2LiveReady) {
    console.warn(
      "[fh2] FH2_MODE=live but FH2_ORG_TOKEN is missing — using mock adapter",
    );
  }
  return new MockFh2Client();
}

export async function fh2Fetch<T>(
  path: string,
  options: {
    method?: string;
    query?: Record<string, string | number | undefined>;
    projectScoped?: boolean;
    projectUuid?: string;
  } = {},
): Promise<Fh2Response<T>> {
  const url = new URL(path, config.FH2_BASE_URL);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const ctx = getFh2RequestContext();
  const selectedProjectCode =
    options.projectUuid || ctx.projectCode || config.FH2_PROJECT_UUID;
  const headers: Record<string, string> = {
    "X-User-Token": config.FH2_ORG_TOKEN ?? "",
    "X-Request-Id": randomUUID(),
    "X-Language": config.FH2_LANGUAGE,
    Accept: "application/json",
  };

  if (options.projectScoped !== false && selectedProjectCode) {
    headers["X-Project-Uuid"] = selectedProjectCode;
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
  });

  const body = await readFh2Body<T>(response);
  if (!response.ok) {
    throw new Error(
      `FH2 HTTP ${response.status}: ${body.message ?? response.statusText}`,
    );
  }
  if (body.code !== 0) {
    throw new Error(`FH2 API error ${body.code}: ${body.message}`);
  }
  return body;
}

export async function fh2Post<T>(
  path: string,
  body: Record<string, unknown>,
  options: { projectScoped?: boolean } = {},
): Promise<Fh2Response<T>> {
  const url = new URL(path, config.FH2_BASE_URL);
  const ctx = getFh2RequestContext();
  const selectedProjectCode = ctx.projectCode || config.FH2_PROJECT_UUID;
  const headers: Record<string, string> = {
    "X-User-Token": config.FH2_ORG_TOKEN ?? "",
    "X-Request-Id": randomUUID(),
    "X-Language": config.FH2_LANGUAGE,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (options.projectScoped !== false && selectedProjectCode) {
    headers["X-Project-Uuid"] = selectedProjectCode;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const parsed = await readFh2Body<T>(response);
  if (!response.ok) {
    throw new Error(
      `FH2 HTTP ${response.status}: ${parsed.message ?? response.statusText}`,
    );
  }
  if (parsed.code !== 0) {
    throw new Error(`FH2 API error ${parsed.code}: ${parsed.message}`);
  }
  return parsed;
}
