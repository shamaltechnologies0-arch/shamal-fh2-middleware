export const SESSION_COOKIE_NAME = "shamal_cc_session";

const SESSION_MAX_AGE_SEC = 24 * 60 * 60;

export function parseCookieHeader(
  header: string | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }

  return out;
}

export function buildSessionCookieHeader(
  sessionToken: string,
  options: { secure?: boolean } = {},
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SEC}`,
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearSessionCookieHeader(
  options: { secure?: boolean } = {},
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function isSecureCookieEnvironment(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    String(process.env.HTTPS_REQUIRED).toLowerCase() === "true"
  );
}
