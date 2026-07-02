import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { getFh2RequestContext } from "../services/fh2ProjectContext.js";
import type { Fh2Response, IFh2Client } from "./types.js";
import { MockFh2Client } from "./mockAdapter.js";
import { LiveFh2Client } from "./liveAdapter.js";

export function createFh2Client(): IFh2Client {
  if (config.FH2_MODE === "live" && config.fh2LiveReady) {
    return new LiveFh2Client();
  }
  if (config.FH2_MODE === "live" && !config.fh2LiveReady) {
    console.warn(
      "[fh2] FH2_MODE=live but FH2_ORG_TOKEN or FH2_PROJECT_UUID missing — using mock adapter",
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
  const selectedProjectCode = ctx.projectCode || config.FH2_PROJECT_UUID;
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

  const body = (await response.json()) as Fh2Response<T>;
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

  const parsed = (await response.json()) as Fh2Response<T>;
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
