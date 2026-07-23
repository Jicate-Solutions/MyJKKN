/**
 * Synthetic emails for "view-only" / no-login staff (drivers, security, labour, etc.)
 *
 * Why synthetic emails:
 *   public.staff requires email + institution_email both NOT NULL and globally UNIQUE.
 *   For staff who have no real email, we generate deterministic placeholder values
 *   at @nolog.jkkn.local so the DB constraints stay intact and the row is unreachable
 *   from Google OAuth login (which is restricted to @jkkn.ac.in).
 *
 * Determinism: re-running a bulk upload of the same row hits the UNIQUE constraint
 * cleanly because the generator produces the same email for the same (staff_id, phone, kind).
 *
 * Spec: docs/superpowers/specs/2026-05-15-staff-bulk-upload-labour-employees-design.md
 */

export const NOLOG_DOMAIN = 'nolog.jkkn.local';

/**
 * Generate a deterministic synthetic email for a view-only staff row.
 * Returns `staff.<slug>.<kind>@nolog.jkkn.local`.
 *
 * Slug rule:
 *   - if `staffId` is non-empty, use lowercased alphanumeric of it
 *   - otherwise fall back to the last 10 digits of the phone
 *   - if both are blank/unusable, throw — the caller must provide at least one
 */
export function generateSyntheticEmail(
  kind: 'personal' | 'institution',
  staffId: string | null | undefined,
  phone: string | null | undefined
): string {
  const cleanStaffId = (staffId ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const phoneDigits = (phone ?? '').replace(/\D/g, '');
  const slug = cleanStaffId || phoneDigits.slice(-10);
  if (!slug) {
    throw new Error(
      'Cannot generate synthetic email — provide either staff_id or phone (10+ digits) for view-only staff'
    );
  }
  return `staff.${slug}.${kind}@${NOLOG_DOMAIN}`;
}

/** Pattern-match an email against the synthetic domain. */
export function isSyntheticEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${NOLOG_DOMAIN}`);
}

/**
 * Convert a possibly-synthetic email into a user-friendly display string.
 * Returns the literal email for real addresses, "—" for synthetic ones.
 * Use this in tables, exports, and read-only UIs where the synthetic value would confuse a viewer.
 */
export function displayEmail(email: string | null | undefined): string {
  if (!email) return '';
  return isSyntheticEmail(email) ? '—' : email;
}
