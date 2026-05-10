// lib/utils/hash.ts
// Server-only deterministic identity hashing for the form-abandon recovery
// pipeline. Phone/email leaving the public form are SHA-256 hashed at the
// server boundary so we can match abandoners back to admission_leads without
// ever persisting raw PII to admission_form_events.metadata.
//
// Matching contract: hashes are computed AFTER lower+trim normalization
// (and E.164 normalization for phone). Postgres-side match in
// admission_form_abandon_log uses the same recipe via pgcrypto:
//   encode(digest(lower(trim(phone_e164)), 'sha256'), 'hex')
//
// Added: 2026-05-03 — Path A B7 form-abandon recovery (Hour-2 nudge).
import { createHash } from 'crypto';
import { normalizePhone } from './phone';

/** Lowercase + trim + sha256 → hex. Empty input yields empty string. */
export function hashIdentity(value: string | null | undefined): string {
  if (!value) return '';
  const normalized = value.toLowerCase().trim();
  if (!normalized) return '';
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Hash a phone number using the canonical recipe used by both this module
 * and the Postgres matcher: normalize to E.164 first, then hash.
 *
 * If E.164 normalization fails (returns empty/short), falls back to the
 * raw lower+trim hash so we never silently drop the abandon signal.
 */
export function hashPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const e164 = normalizePhone(phone);
  if (e164 && e164.length >= 10) {
    return hashIdentity(e164);
  }
  return hashIdentity(phone);
}

/** Lowercase + trim + sha256 → hex. Identical to hashIdentity, exported for clarity. */
export function hashEmail(email: string | null | undefined): string {
  return hashIdentity(email);
}
