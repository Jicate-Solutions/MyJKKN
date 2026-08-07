// lib/validations/grievance-ticket.ts
// BUG-01 (LC QA, 2026-08-07): reporting an issue with a very short description
// failed with the raw Postgres text
//   "violates check constraint 'grievance_tickets_description_check'"
// and no ticket was created.
//
// The database rule is CORRECT and is NOT changed anywhere:
//   grievance_tickets_description_check  CHECK (char_length(description) >= 10)
// This module mirrors that one rule for inline form validation, and maps a
// check-constraint refusal coming back from the database into plain wording so
// the raw constraint text can never reach a person.

/** Mirrors grievance_tickets_description_check in the database. */
export const GRIEVANCE_DESCRIPTION_MIN_LENGTH = 10;

/** Fields on the report-an-issue form that mirror a database CHECK rule. */
export type GrievanceField = 'description';

/**
 * Structured refusal. The insert path converts this into a thrown Error so the
 * existing React Query mutation contract is untouched, but the shape stays
 * explicit rather than a bare failure (CLAUDE.md rule 27).
 */
export interface GrievanceRefusal {
  success: false;
  field: GrievanceField | null;
  error: string;
}

const DESCRIPTION_TOO_SHORT =
  `Please describe the issue in at least ${GRIEVANCE_DESCRIPTION_MIN_LENGTH} characters so it can be actioned.`;

const GENERIC_CHECK_REFUSAL =
  'Some of what you entered does not fit the rules for this form. Please check your answers and try again.';

/** Postgres SQLSTATE for a check-constraint violation. */
const CHECK_CONSTRAINT_VIOLATION = '23514';

/**
 * Counts characters the way Postgres char_length() does (code points), not the
 * way String.length does (UTF-16 code units) — otherwise an entry made of emoji
 * would pass here and still be refused by the database.
 */
function characterCount(value: string): number {
  return Array.from(value).length;
}

/**
 * Inline validation for the description field. Returns the message to show next
 * to the field, or null when the value satisfies the database rule.
 */
export function validateGrievanceDescription(value: string): string | null {
  return characterCount(value) < GRIEVANCE_DESCRIPTION_MIN_LENGTH ? DESCRIPTION_TOO_SHORT : null;
}

/** Known check constraints on grievance_tickets, with wording a person can act on. */
const CHECK_CONSTRAINT_REFUSALS: { constraint: string; refusal: GrievanceRefusal }[] = [
  {
    constraint: 'grievance_tickets_description_check',
    refusal: { success: false, field: 'description', error: DESCRIPTION_TOO_SHORT },
  },
];

interface DatabaseErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

/**
 * Turns a Postgres check-constraint violation into a structured, friendly
 * refusal. Returns null for anything that is not SQLSTATE 23514, so other
 * failures keep their existing handling. Any check constraint without specific
 * wording still gets a plain message — the raw constraint text is never
 * returned.
 *
 * `submitted` guards against drift. The constraint is not defined by any
 * migration in this repo, so if the database rule ever moves away from the
 * value mirrored here, repeating "at least 10 characters" to someone who
 * already wrote more than that would be a dead end. In that case the general
 * wording is used instead.
 */
export function describeCheckConstraintViolation(
  error: DatabaseErrorLike | null | undefined,
  submitted?: { description?: string }
): GrievanceRefusal | null {
  if (!error || error.code !== CHECK_CONSTRAINT_VIOLATION) return null;

  const generic: GrievanceRefusal = { success: false, field: null, error: GENERIC_CHECK_REFUSAL };

  const haystack = `${error.message ?? ''} ${error.details ?? ''}`;
  const match = CHECK_CONSTRAINT_REFUSALS.find((c) => haystack.includes(c.constraint));
  if (!match) return generic;

  const alreadySatisfiesMirroredRule =
    match.refusal.field === 'description' &&
    typeof submitted?.description === 'string' &&
    validateGrievanceDescription(submitted.description) === null;

  return alreadySatisfiesMirroredRule ? generic : match.refusal;
}
