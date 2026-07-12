export type UserRole = "admin" | "operator" | "viewer";

export interface AssignedProject {
  projectCode: string;
  projectName?: string;
}

export interface ViewerDashboardPermissions {
  fleetOverview?: boolean;
  droneTelemetry?: boolean;
  dockTelemetry?: boolean;
  batteryStatus?: boolean;
  gpsLocation?: boolean;
  onlineOffline?: boolean;
  liveCamera?: boolean;
  droneFpv?: boolean;
  alertsEvents?: boolean;
  missionMediaHistory?: boolean;
  refreshButton?: boolean;
}

export interface ShamalSession {
  apiKey: string;
  role: UserRole;
  displayName: string;
  sessionToken: string;
  username: string;
  viewerDashboardPermissions?: ViewerDashboardPermissions;
  assignedProjects?: AssignedProject[];
  fallbackProjectCode?: string | null;
  selectedProjectCode?: string | null;
}

export const SESSION_STORAGE_KEY = "shamalCcSession";

export function loadSession(): ShamalSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ShamalSession;
  } catch {
    return null;
  }
}

export function saveSession(session: ShamalSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function isAdminPortal(): boolean {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  return path === "/admin";
}

export interface LoginResponse {
  data: ShamalSession;
  message?: string;
  error?: string;
}

export async function loginRequest(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const res = await fetch("/v1/viewer/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const raw = await res.text();
  let body: LoginResponse & { message?: string; error?: string };
  try {
    body = raw ? JSON.parse(raw) : ({} as LoginResponse);
  } catch {
    throw new Error(res.ok ? "Invalid server response" : `Login failed (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(body.message || body.error || "Login failed");
  }
  return body;
}

export async function refreshBrowserSessionCookie(session: ShamalSession): Promise<boolean> {
  const res = await fetch("/v1/auth/session-cookie", {
    method: "POST",
    credentials: "include",
    headers: {
      "X-Api-Key": session.apiKey,
      "X-CC-Session": session.sessionToken,
    },
  });
  return res.ok;
}
