// lib/meta/audience-hash.ts
// SHA-256 hashing helpers for Meta Custom Audiences PII payloads.
//
// Meta requires that ALL user-identifying fields (email, phone, first name,
// last name, gender, date of birth, country, city, state, zip) be SHA-256
// hashed AFTER normalization (lowercase, trim, E.164 for phone) BEFORE being
// sent on the wire to /{audience-id}/users. Sending raw PII is a policy
// violation AND will silently drop matches.
//
// Spec: https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences#hash
//
// All exported functions take RAW input and return the normalized + hashed
// value. Callers should NEVER pass already-hashed values back in (will
// double-hash and zero match rate). Empty / null / undefined input returns
// undefined so callers can omit the field from the per-user array entirely.
//
// Server-only. Uses Node's `crypto.createHash` — safe in route handlers and
// cron jobs. Do NOT import from a client component.

import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Low-level
// ---------------------------------------------------------------------------

/**
 * SHA-256 a normalized string. Returns the lowercase hex digest. Empty or
 * whitespace-only input returns undefined so callers can omit the field.
 */
export function sha256Hex(input: string | null | undefined): string | undefined {
  if (input === null || input === undefined) return undefined;
  const trimmed = input.trim();
  if (trimmed.length === 0) return undefined;
  return createHash('sha256').update(trimmed).digest('hex');
}

// ---------------------------------------------------------------------------
// Per-field normalizers
// ---------------------------------------------------------------------------

/** lowercase + trim, then SHA-256. Returns undefined for empty input. */
export function hashEmail(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) return undefined;
  return sha256Hex(normalized);
}

/**
 * Phone normalization: strip everything that isn't a digit. Meta expects
 * E.164 WITHOUT the leading `+` (e.g. raw `+91 98765 43210` → `919876543210`).
 * If the caller knows the country code, prepend it before calling — this
 * helper does NOT add a default country code (would corrupt international
 * numbers).
 */
export function hashPhone(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return undefined;
  return sha256Hex(digits);
}

/** lowercase + trim + remove non-alpha chars (per Meta spec for fn / ln). */
export function hashName(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (normalized.length === 0) return undefined;
  return sha256Hex(normalized);
}

/** Gender: single lowercase char ('m' | 'f'). */
export function hashGender(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const first = raw.trim().toLowerCase().charAt(0);
  if (first !== 'm' && first !== 'f') return undefined;
  return sha256Hex(first);
}

/** DOB: must be YYYYMMDD (Meta spec). Accepts YYYY-MM-DD and normalizes. */
export function hashDateOfBirth(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 8) return undefined;
  return sha256Hex(digits);
}

/** ISO 3166-1 alpha-2 country code (e.g. 'in', 'us'). Lowercased. */
export function hashCountry(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) return undefined;
  return sha256Hex(normalized);
}

/** City: lowercase + strip spaces/punct. */
export function hashCity(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (normalized.length === 0) return undefined;
  return sha256Hex(normalized);
}

/** State: lowercase 2-char US state OR full state name lowercased. */
export function hashState(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (normalized.length === 0) return undefined;
  return sha256Hex(normalized);
}

/** Zip / postal: digits only, no spaces. */
export function hashZip(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (normalized.length === 0) return undefined;
  return sha256Hex(normalized);
}

// ---------------------------------------------------------------------------
// Whole-user hashing
// ---------------------------------------------------------------------------

/**
 * Plain (un-hashed) per-user payload as it arrives from MyJKKN sources
 * (admission leads, learners, HR staff). Callers pass this; the audience
 * client converts to the Meta wire format via `hashUserPayload`.
 */
export interface RawUserPayload {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

/**
 * Meta's per-user row format. Each entry in the outer `data` array is itself
 * an array whose ORDER matches the `schema` array passed in the request.
 * We always send the full ordered schema and emit `''` for missing fields
 * (Meta accepts empty strings but NOT JSON null in the user rows).
 *
 * Schema order locked here (matches `META_USER_SCHEMA` export below):
 *   EMAIL, PHONE, FN, LN, GEN, DOBY, COUNTRY, CT, ST, ZIP
 */
export const META_USER_SCHEMA = [
  'EMAIL',
  'PHONE',
  'FN',
  'LN',
  'GEN',
  'DOBY',
  'COUNTRY',
  'CT',
  'ST',
  'ZIP',
] as const;

export type MetaUserSchemaField = (typeof META_USER_SCHEMA)[number];

/**
 * Convert one raw user payload into the ordered hashed row Meta expects.
 * Missing fields become `''` in the slot (NOT `null` — Meta rejects null
 * inside user rows). The output position order matches META_USER_SCHEMA.
 */
export function hashUserPayload(raw: RawUserPayload): string[] {
  return [
    hashEmail(raw.email) ?? '',
    hashPhone(raw.phone) ?? '',
    hashName(raw.firstName) ?? '',
    hashName(raw.lastName) ?? '',
    hashGender(raw.gender) ?? '',
    hashDateOfBirth(raw.dateOfBirth) ?? '',
    hashCountry(raw.country) ?? '',
    hashCity(raw.city) ?? '',
    hashState(raw.state) ?? '',
    hashZip(raw.zip) ?? '',
  ];
}

/**
 * Sanity check used by the audience client to refuse any row whose every
 * field is empty. Sending an all-empty row to Meta is wasted quota and
 * triggers Meta's "no match key present" 400.
 */
export function hasAnyMatchKey(hashedRow: string[]): boolean {
  return hashedRow.some((v) => v.length > 0);
}
