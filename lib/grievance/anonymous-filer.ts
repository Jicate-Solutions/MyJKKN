// lib/grievance/anonymous-filer.ts
// ============================================================================
// An anonymous complaint never shows who filed it (Director ruling, 30 Sep 2026).
//
// The database is the first line: since migration
// 20270624093700_grievance_complaint_privacy.sql an anonymous ticket is stored
// with no raised_by_id / _name / _email / _phone at all, for every writer, and
// the old rows were scrubbed. This helper is the second line, for every read a
// handler or an external API makes: whatever a query happened to select, an
// anonymous row leaves the server with those four columns empty.
//
// Server-safe and dependency-free on purpose: the b2a routes run with the
// service-role client and must not import a module that builds a browser
// client when it loads.
// ============================================================================

/** The columns that identify the person who filed a complaint. */
export const FILER_IDENTITY_COLUMNS = [
  'raised_by_id',
  'raised_by_name',
  'raised_by_email',
  'raised_by_phone',
] as const;

/**
 * Returns the row with the filer's identity blanked when it is anonymous, and
 * unchanged otherwise. Only columns the row already carries are set, so a
 * narrow select does not grow new keys. Never mutates its argument.
 */
export function redactAnonymousFiler<T>(row: T): T {
  if (!row || typeof row !== 'object') return row;
  const r = row as Record<string, unknown>;
  if (r.is_anonymous !== true) return row;
  const copy: Record<string, unknown> = { ...r };
  for (const col of FILER_IDENTITY_COLUMNS) {
    if (col in copy) copy[col] = null;
  }
  return copy as T;
}

/** {@link redactAnonymousFiler} over a list. */
export function redactAnonymousFilers<T>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).map((row) => redactAnonymousFiler(row));
}
