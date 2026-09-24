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

/**
 * The slug a synthetic email would use, or null when neither input can supply one.
 * Exported so callers can explain a collision in terms of what the operator
 * actually typed (Staff ID / phone) rather than an address they never saw.
 */
export function syntheticSlug(
  staffId: string | null | undefined,
  phone: string | null | undefined
): string | null {
  const cleanStaffId = (staffId ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const phoneDigits = (phone ?? '').replace(/\D/g, '');
  return cleanStaffId || phoneDigits.slice(-10) || null;
}

/** Which unique index a Postgres duplicate-key error names, if either. */
export type StaffEmailConflictKind = 'institution' | 'personal';

export function staffEmailConflictKind(
  errorMessage: string | null | undefined
): StaffEmailConflictKind | null {
  const message = errorMessage ?? '';
  if (message.includes('staff_institution_email_key')) return 'institution';
  if (message.includes('staff_email_key')) return 'personal';
  return null;
}

export interface StaffEmailConflictInput {
  kind: StaffEmailConflictKind;
  /** The address that collided — typed by the operator, or auto-generated. */
  address?: string | null;
  staffId?: string | null;
  phone?: string | null;
  /** Name/ID of the staff member already holding the address, when known. */
  holder?: { name: string; staff_id?: string | null; institution?: string | null } | null;
}

export interface StaffEmailConflictDescription {
  /** Form field to attach the error to. */
  field: 'institution_email' | 'email' | 'staff_id' | 'phone';
  /** Short message for the field. */
  message: string;
  /** Fuller sentence for the toast. */
  toast: string;
}

/**
 * Explain a duplicate-email failure in the operator's terms.
 *
 * The case worth separating: a view-only staff member's emails are generated
 * from Staff ID (or phone), so the collision reports a field the operator left
 * blank. Saying "this institution email is already registered" about an empty
 * box is how the same report keeps coming back — name the Staff ID instead.
 */
export function describeStaffEmailConflict(
  input: StaffEmailConflictInput
): StaffEmailConflictDescription {
  const { kind, address, staffId, phone, holder } = input;
  const generated = isSyntheticEmail(address) || !address?.trim();
  const holderText = holder
    ? `${holder.name}${holder.staff_id ? ` (${holder.staff_id})` : ''}${
        holder.institution ? ` at ${holder.institution}` : ''
      }`
    : null;
  const label = kind === 'institution' ? 'institution email' : 'email';

  if (generated) {
    const slug = syntheticSlug(staffId, phone);
    const usedStaffId = !!(staffId ?? '').trim();
    const field = usedStaffId ? 'staff_id' : 'phone';
    // Copy says "ID": the error sits on that field, and JKKN terminology keeps
    // the word for team members out of user-facing text.
    const source = usedStaffId ? `ID "${staffId}"` : `phone number "${phone}"`;
    const message = usedStaffId
      ? 'Already used by another team member.'
      : 'Already used by another team member — enter a unique ID for this person.';
    return {
      field,
      message,
      toast: holderText
        ? `${source} already belongs to ${holderText}. A view-only record takes its ${label} from the ID (or phone), so both records would share ${
            slug ? generateSyntheticEmail(kind, staffId, phone) : 'the same generated address'
          }. Use a different ID, or enter a real ${label}.`
        : `${source} is already used by another team member. A view-only record takes its ${label} from the ID (or phone), so both records would share the same generated address. Use a different ID, or enter a real ${label}.`
    };
  }

  const field = kind === 'institution' ? 'institution_email' : 'email';
  return {
    field,
    message: holderText
      ? `Already used by ${holderText}.`
      : `This ${label} is already registered.`,
    toast: holderText
      ? `"${address}" is already registered to ${holderText}. Each address can belong to only one team member record.`
      : `"${address}" is already registered to another team member. Each address can belong to only one team member record.`
  };
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
