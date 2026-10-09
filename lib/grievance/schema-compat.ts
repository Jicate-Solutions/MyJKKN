/**
 * Deploy-order safety for migration 20271010020000 (grievance escalation and
 * the "about the Joint MD" tick) — deep review of #4079, finding M4.
 *
 * The app can reach production before the migration is applied (the ship
 * wave merges code and applies migrations in separate rounds). Until then the
 * column grievance_tickets.about_joint_md and the function
 * fn_grievance_escalation_tick do not exist, and every read that names them
 * fails: Postgres answers 42703 (undefined_column) / 42883
 * (undefined_function); PostgREST answers PGRST204 / PGRST202 from its schema
 * cache without reaching Postgres.
 *
 * A caller that gets `true` here falls back to what it did before the PR.
 * That is exact, not a loosening: while the column does not exist no
 * complaint can be marked as about the Joint MD, so there is nothing to
 * leave out.
 *
 * The error must NAME the object, so an unrelated missing column or function
 * is still reported as the fault it is.
 */
const MISSING_SCHEMA_CODES = new Set(['42703', '42883', 'PGRST202', 'PGRST204']);

export function isMissingGrievanceSchema(error: unknown, objectName: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  if (typeof e.code !== 'string' || !MISSING_SCHEMA_CODES.has(e.code)) return false;
  const text = [e.message, e.details, e.hint]
    .filter((v): v is string => typeof v === 'string')
    .join(' ');
  return text.includes(objectName);
}

/** The column the about-the-Joint-MD filter reads. */
export const ABOUT_JOINT_MD_COLUMN = 'about_joint_md';
