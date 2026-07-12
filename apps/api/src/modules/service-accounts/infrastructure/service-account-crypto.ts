import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getPlatformSessionSecret } from "../../auth/infrastructure/platform-secret.service.js";

const SCRYPT_PREFIX = "$scrypt$";
const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const SCRYPT_KEYLEN = 64;

export function hashClientSecret(plaintext: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plaintext, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
  });
  return `${SCRYPT_PREFIX}${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyClientSecret(plaintext: string, stored: string): boolean {
  if (stored.startsWith(SCRYPT_PREFIX)) {
    const body = stored.slice(SCRYPT_PREFIX.length);
    const sep = body.indexOf("$");
    if (sep <= 0) return false;
    const salt = Buffer.from(body.slice(0, sep), "base64url");
    const expected = Buffer.from(body.slice(sep + 1), "base64url");
    const actual = scryptSync(plaintext, salt, expected.length, {
      N: SCRYPT_N,
      r: SCRYPT_r,
      p: SCRYPT_p,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  // Legacy HMAC-SHA256 hex hashes (migration window)
  if (/^[a-f0-9]{64}$/i.test(stored)) {
    const digest = createHmac("sha256", getPlatformSessionSecret())
      .update(`service-account-secret:${plaintext}`)
      .digest("hex");
    const a = Buffer.from(digest);
    const b = Buffer.from(stored);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  return false;
}

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeBase64urlJson<T>(segment: string): T | null {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export interface ServiceAccountJwtClaims {
  sub: string;
  cid: string;
  oid: string;
  scp: string[];
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

export function signServiceAccountJwt(
  claims: Omit<ServiceAccountJwtClaims, "iat" | "jti"> & { iat?: number; jti?: string },
): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload: ServiceAccountJwtClaims = {
    ...claims,
    iat: claims.iat ?? now,
    jti: claims.jti ?? randomBytes(12).toString("hex"),
  };
  const encodedHeader = base64urlJson(header);
  const encodedPayload = base64urlJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", getPlatformSessionSecret())
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

export function verifyServiceAccountJwt(token: string): ServiceAccountJwtClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) return null;

  const header = decodeBase64urlJson<{ alg?: string; typ?: string }>(encodedHeader);
  if (!header || header.alg !== "HS256") return null;

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSig = createHmac("sha256", getPlatformSessionSecret())
    .update(signingInput)
    .digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const payload = decodeBase64urlJson<ServiceAccountJwtClaims>(encodedPayload);
  if (!payload || payload.aud !== "shamal-fh2-api") return null;
  if (!payload.sub || !payload.cid || !payload.oid || !Array.isArray(payload.scp)) return null;
  if (Math.floor(Date.now() / 1000) >= payload.exp) return null;

  return payload;
}

export function isServiceAccountJwt(token: string): boolean {
  return token.split(".").length === 3 && token.startsWith("eyJ");
}
