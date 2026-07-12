import { z } from "zod";

export const CREDENTIAL_EXPIRATION_PRESETS = [
  "1h",
  "1d",
  "1mo",
  "3mo",
  "6mo",
  "1y",
] as const;

export type CredentialExpirationPreset = (typeof CREDENTIAL_EXPIRATION_PRESETS)[number];

export const CREDENTIAL_EXPIRATION_LABELS: Record<CredentialExpirationPreset, string> = {
  "1h": "1 hour",
  "1d": "1 day",
  "1mo": "1 month",
  "3mo": "3 months",
  "6mo": "6 months",
  "1y": "1 year",
};

export const credentialExpirationPresetSchema = z.enum(CREDENTIAL_EXPIRATION_PRESETS);

export const CREDENTIAL_EXPIRATION_OPTIONS = CREDENTIAL_EXPIRATION_PRESETS.map((value) => ({
  value,
  label: CREDENTIAL_EXPIRATION_LABELS[value],
}));

const MS_HOUR = 3_600_000;
const MS_DAY = 24 * MS_HOUR;

export function expirationMsForPreset(preset: CredentialExpirationPreset): number {
  switch (preset) {
    case "1h":
      return MS_HOUR;
    case "1d":
      return MS_DAY;
    case "1mo":
      return 30 * MS_DAY;
    case "3mo":
      return 90 * MS_DAY;
    case "6mo":
      return 180 * MS_DAY;
    case "1y":
      return 365 * MS_DAY;
  }
}

export function computeExpiresAt(
  preset: CredentialExpirationPreset,
  from: Date = new Date(),
): string {
  return new Date(from.getTime() + expirationMsForPreset(preset)).toISOString();
}

export function isCredentialExpired(
  expiresAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!expiresAt) return false;
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) return false;
  return parsed <= now;
}

export function parseCredentialExpiration(input: unknown): CredentialExpirationPreset {
  const parsed = credentialExpirationPresetSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      "expiration is required and must be one of: 1h, 1d, 1mo, 3mo, 6mo, 1y",
    );
  }
  return parsed.data;
}
