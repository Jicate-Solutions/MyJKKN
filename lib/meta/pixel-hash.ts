// lib/meta/pixel-hash.ts
// SHA-256 PII normalization for Meta CAPI user_data.
//
// Server-only — uses Node's `crypto` module. NEVER import from a client
// component; the whole point is that plaintext PII does not leave the server.
//
// Reference (Meta normalization rules):
//   https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
//
// Rules summary (what this module enforces):
//   email      → lowercase + trim, then SHA-256
//   phone      → E.164 digits only (no `+`, no spaces, no dashes), SHA-256.
//                Indian local numbers (10-digit starting 6-9) auto-prefixed
//                with `91`. Numbers already prefixed with `+` keep their CC.
//   first name → lowercase + trim, then SHA-256
//   last name  → lowercase + trim, then SHA-256
//   country    → ISO-3166-1 alpha-2 lowercased (`india` → `in`), SHA-256
//   zip / pin  → lowercase + trim, then SHA-256
//   externalId → trim only (preserve case for ids like `lead-A7BX`), SHA-256

import { createHash } from 'node:crypto';
import type { CapiUserData } from '@/lib/meta/pixel-types';

// ---------------------------------------------------------------------------
// Primitive hash
// ---------------------------------------------------------------------------

/**
 * Lowercased SHA-256 hex of an already-normalized input. Returns undefined
 * for null / empty inputs so callers don't accidentally hash the empty
 * string (which would produce a deterministic hash that matches every
 * other empty-input event and break Meta's attribution graph).
 */
export function sha256Hex(input: string | null | undefined): string | undefined {
  if (input === null || input === undefined) return undefined;
  const trimmed = String(input).trim();
  if (trimmed.length === 0) return undefined;
  return createHash('sha256').update(trimmed).digest('hex');
}

// ---------------------------------------------------------------------------
// Field-level normalizers (each returns the value about to be SHA-256ed)
// ---------------------------------------------------------------------------

/** Lowercased + trimmed email. Empty / invalid → undefined. */
export function normalizeEmail(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const v = String(raw).trim().toLowerCase();
  if (v.length === 0) return undefined;
  // Conservative — don't strict-validate, but require the `@`. Meta will
  // hash anything but won't attribute anything that isn't an email shape.
  if (!v.includes('@')) return undefined;
  return v;
}

/**
 * Normalize a phone number to E.164 digits-only (no `+`).
 *
 * Heuristics (in order):
 *   1. Strip everything except digits and a leading `+`.
 *   2. If the input started with `+`, keep all remaining digits as-is.
 *   3. If the result is exactly 10 digits and starts with 6-9, assume Indian
 *      mobile and prefix `91`. (JKKN admission default — most leads.)
 *   4. If the result is 11 digits and starts with `0`, drop the leading 0
 *      and prefix `91`. (Indian STD-prefixed mobile.)
 *   5. Otherwise return digits as-is.
 *
 * Returns undefined if no digits survive normalization.
 */
export function normalizePhone(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim();
  if (s.length === 0) return undefined;

  const hasPlus = s.startsWith('+');
  const digits = s.replace(/[^\d]/g, '');
  if (digits.length === 0) return undefined;

  if (hasPlus) return digits;

  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0') && /^0[6-9]/.test(digits)) {
    return `91${digits.slice(1)}`;
  }
  return digits;
}

/** Lowercased + trimmed name component. */
export function normalizeName(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const v = String(raw).trim().toLowerCase();
  return v.length === 0 ? undefined : v;
}

/**
 * Map common country-name variants → ISO-3166-1 alpha-2 lowercased.
 * Anything that's already 2 chars is passed through (lowercased).
 */
export function normalizeCountry(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const v = String(raw).trim().toLowerCase();
  if (v.length === 0) return undefined;
  if (v.length === 2) return v;
  const map: Record<string, string> = {
    india: 'in',
    bharat: 'in',
    'united states': 'us',
    'united states of america': 'us',
    usa: 'us',
    'united kingdom': 'gb',
    uk: 'gb',
    'great britain': 'gb',
    canada: 'ca',
    australia: 'au',
    singapore: 'sg',
    'united arab emirates': 'ae',
    uae: 'ae',
  };
  return map[v] ?? v.slice(0, 2);
}

/** Lowercased + trimmed PIN / zip. */
export function normalizeZip(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const v = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  return v.length === 0 ? undefined : v;
}

/** Preserve-case trim — external ids may be case-sensitive. */
export function normalizeExternalId(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const v = String(raw).trim();
  return v.length === 0 ? undefined : v;
}

// ---------------------------------------------------------------------------
// Aggregate hasher
// ---------------------------------------------------------------------------

export interface PlaintextUserData {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null;
  zip?: string | null;
  externalId?: string | null;
}

/**
 * Convert plaintext PII into a `CapiUserData` block with each field
 * normalized + SHA-256 hashed per Meta's spec.
 *
 * Unset / empty input fields are omitted from the output object — DO NOT
 * include them as empty strings (Meta would treat them as the hash of "").
 */
export function hashUserData(plain: PlaintextUserData): CapiUserData {
  const out: CapiUserData = {};

  const em = normalizeEmail(plain.email);
  if (em) out.em = sha256Hex(em);

  const ph = normalizePhone(plain.phone);
  if (ph) out.ph = sha256Hex(ph);

  const fn = normalizeName(plain.firstName);
  if (fn) out.fn = sha256Hex(fn);

  const ln = normalizeName(plain.lastName);
  if (ln) out.ln = sha256Hex(ln);

  const country = normalizeCountry(plain.country);
  if (country) out.country = sha256Hex(country);

  const zp = normalizeZip(plain.zip);
  if (zp) out.zp = sha256Hex(zp);

  const ext = normalizeExternalId(plain.externalId);
  if (ext) out.external_id = sha256Hex(ext);

  return out;
}

/**
 * Merge an already-hashed `CapiUserData` block over a freshly-hashed one.
 * Used when callers want to pass IP / user-agent / fbc / fbp alongside
 * plaintext name+email — those fields are NOT hashed and must be merged in
 * separately.
 *
 * The override block wins on conflict.
 */
export function mergeUserData(
  base: CapiUserData,
  override: Partial<CapiUserData> | undefined
): CapiUserData {
  if (!override) return base;
  return { ...base, ...override };
}
