import {
  clearSession,
  loadSession,
  type ShamalSession,
} from "@/domains/auth/services/auth.service";

export class ApiError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function currentSession(): ShamalSession | null {
  return window.shamalLegacy?.state?.session ?? loadSession();
}

function withProjectCode(path: string, session: ShamalSession): string {
  if (session.role !== "viewer") return path;
  const projectCode =
    session.selectedProjectCode || session.assignedProjects?.[0]?.projectCode || null;
  if (!projectCode) return path;
  const url = new URL(path, window.location.origin);
  if (!url.searchParams.has("projectCode")) {
    url.searchParams.set("projectCode", projectCode);
  }
  return `${url.pathname}${url.search}`;
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
  error?: string;
  message?: string;
  fh2Code?: number;
}

export async function apiGetEnvelope<T>(path: string): Promise<ApiEnvelope<T>> {
  const session = currentSession();
  if (!session?.apiKey) {
    throw new ApiError("Not signed in", 401);
  }

  const res = await fetch(withProjectCode(path, session), {
    credentials: "include",
    headers: {
      "X-Api-Key": session.apiKey,
      "X-CC-Session": session.sessionToken,
    },
  });

  const raw = await res.text();
  let body: ApiEnvelope<T> = { data: undefined as T };
  try {
    body = raw ? (JSON.parse(raw) as ApiEnvelope<T>) : body;
  } catch {
    body = { data: undefined as T };
  }

  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new CustomEvent("shamal-session-cleared"));
    throw new ApiError(body.message || "Session expired", 401, body.error ?? null);
  }

  if (!res.ok) {
    throw new ApiError(
      body.message || body.error || `Request failed (${res.status})`,
      res.status,
      body.error ?? (body.fh2Code != null ? String(body.fh2Code) : null),
    );
  }

  return body;
}

export async function apiGet<T>(path: string): Promise<T> {
  const body = await apiGetEnvelope<T>(path);
  return body.data;
}

export async function apiDownload(path: string): Promise<{ blob: Blob; fileName: string }> {
  const session = currentSession();
  if (!session?.apiKey) {
    throw new ApiError("Not signed in", 401);
  }

  const res = await fetch(withProjectCode(path, session), {
    credentials: "include",
    headers: {
      "X-Api-Key": session.apiKey,
      "X-CC-Session": session.sessionToken,
    },
  });

  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new CustomEvent("shamal-session-cleared"));
    throw new ApiError("Session expired", 401);
  }

  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      message = body.message || body.error || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }

  const disposition = res.headers.get("Content-Disposition") || "";
  const matched = /filename="([^"]+)"/i.exec(disposition);
  const fileName = matched?.[1] || "download";
  return { blob: await res.blob(), fileName };
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
