// app/(routes)/health/achievements/_lib/outbound.ts
// ============================================================================
// Outbound (travelled-to) tournament capture helpers.
//
// WHY A DESCRIPTION CONVENTION AND NOT A COLUMN
//   The real driver for this work is a paper letter: learners of one JKKN
//   college travelling to an EXTERNAL institution's tournament (e.g. a STATE
//   level paramedical meet hosted by another university). Recording that
//   honestly needs the host/organiser name — and health_sports_achievements has
//   no host column (id, learner_id, achievement_date, sport, event_name,
//   event_level, achievement_type, description, certificate_url, verified,
//   verified_by, created_at, category).
//
//   Adding one means DDL, and migrations in this repo are Director-gated files
//   that are NOT applied by merge or deploy — so a host_institution column would
//   leave this capture dark for an unknown number of days. Instead the organiser
//   is stored as a structured FIRST LINE of the existing free-text description
//   ("Hosted by: <name>") and parsed back out for display. No schema change, the
//   value stays machine-recoverable for accreditation, and it works the moment
//   this deploys.
//
//   Parsing is deliberately strict — only the very first line, only the exact
//   marker — so a learner who happens to type "hosted by" inside their notes is
//   never mistaken for structured data.
// ============================================================================

/** Exact marker that opens the structured host line. */
const HOST_MARKER = 'Hosted by:';

/**
 * Fold the external host/organiser into the description column as a structured
 * first line. Returns undefined when there is nothing at all to store, so the
 * caller keeps sending `undefined` (not an empty string) for an empty field.
 */
export function composeDescription(
  host: string,
  notes: string,
): string | undefined {
  const h = host.trim();
  const n = notes.trim();
  if (!h && !n) return undefined;
  if (!h) return n;
  return n ? `${HOST_MARKER} ${h}\n${n}` : `${HOST_MARKER} ${h}`;
}

/**
 * Split a stored description back into the host/organiser and the free notes.
 * Rows written before this feature (and rows written by the tournament finalize
 * RPC) simply come back with host === null and the whole text as notes.
 */
export function parseDescription(description: string | null | undefined): {
  host: string | null;
  notes: string;
} {
  const text = (description ?? '').trim();
  if (!text) return { host: null, notes: '' };

  const newline = text.indexOf('\n');
  const firstLine = newline === -1 ? text : text.slice(0, newline);
  if (!firstLine.startsWith(HOST_MARKER)) return { host: null, notes: text };

  const host = firstLine.slice(HOST_MARKER.length).trim();
  const notes = newline === -1 ? '' : text.slice(newline + 1).trim();
  return { host: host || null, notes };
}

/** Today in the yyyy-mm-dd shape a date input uses, in the browser's timezone. */
export function todayIsoDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().split('T')[0];
}

/**
 * D5: ANY past date is allowed so historic tournaments can be backfilled for
 * accreditation — there is deliberately NO lower bound. Only impossible future
 * achievement dates are refused.
 */
export function isFutureDate(iso: string): boolean {
  if (!iso) return false;
  return iso > todayIsoDate();
}
