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
//   Parsing is deliberately strict — only leading lines, only the exact
//   markers — so a learner who happens to type "hosted by" inside their notes is
//   never mistaken for structured data.
//
// D11 — RESERVE / BENCH LEARNERS COUNT, BUT ARE MARKED AS SUCH
//   A learner who travelled with the squad but never took the field is recorded
//   as having PARTICIPATED — achievement_type stays 'participation' — carrying a
//   second structured marker line, "Squad role: Reserve".
//
//   Deliberately NOT a new achievement_type value. Two reasons, both about
//   honesty rather than tidiness:
//     * The headcount has to stay true. Every existing consumer counts
//       participation rows; a brand-new type would silently drop reserves out of
//       "20 learners went" for anyone who did not know to add it back. Reusing
//       'participation' makes the count right BY CONSTRUCTION, not by everyone
//       remembering.
//     * Nobody may later be represented as having competed. The marker travels
//       with the row and is rendered on the medal wall AND in the IQAC queue, so
//       the distinction survives into the evidence a reviewer actually reads.
//   A new type would also have needed DDL (achievement_type carries a CHECK
//   constraint), and migrations here are Director-gated files that merge and
//   deploy never apply — so it would have shipped dark.
// ============================================================================

/** Exact markers that open the structured header lines, in write order. */
const HOST_MARKER = 'Hosted by:';
const SQUAD_ROLE_MARKER = 'Squad role:';
const RESERVE_VALUE = 'Reserve';

/**
 * Fold the external host/organiser and the D11 reserve flag into the description
 * column as structured leading lines. Returns undefined when there is nothing at
 * all to store, so the caller keeps sending `undefined` (not an empty string)
 * for an empty field.
 */
export function composeDescription(
  host: string,
  notes: string,
  isReserve = false,
): string | undefined {
  const h = host.trim();
  const n = notes.trim();
  if (!h && !n && !isReserve) return undefined;

  const header: string[] = [];
  if (h) header.push(`${HOST_MARKER} ${h}`);
  if (isReserve) header.push(`${SQUAD_ROLE_MARKER} ${RESERVE_VALUE}`);

  if (header.length === 0) return n;
  return n ? `${header.join('\n')}\n${n}` : header.join('\n');
}

/**
 * Split a stored description back into the host/organiser, the D11 reserve flag
 * and the free notes. Rows written before this feature (and rows written by the
 * tournament finalize RPC) simply come back with host === null,
 * isReserve === false and the whole text as notes.
 */
export function parseDescription(description: string | null | undefined): {
  host: string | null;
  isReserve: boolean;
  notes: string;
} {
  const text = (description ?? '').trim();
  if (!text) return { host: null, isReserve: false, notes: '' };

  const lines = text.split('\n');
  let host: string | null = null;
  let isReserve = false;
  let seenHost = false;
  let seenSquadRole = false;
  let i = 0;

  // Consume ONLY leading lines that open with a known marker, and each marker at
  // most once. The first line that does not is where the learner's own notes
  // begin, and everything from there on is left exactly as typed.
  while (i < lines.length) {
    const line = lines[i];
    if (!seenHost && line.startsWith(HOST_MARKER)) {
      host = line.slice(HOST_MARKER.length).trim() || null;
      seenHost = true;
      i += 1;
      continue;
    }
    if (!seenSquadRole && line.startsWith(SQUAD_ROLE_MARKER)) {
      isReserve =
        line.slice(SQUAD_ROLE_MARKER.length).trim().toLowerCase() ===
        RESERVE_VALUE.toLowerCase();
      seenSquadRole = true;
      i += 1;
      continue;
    }
    break;
  }

  return { host, isReserve, notes: lines.slice(i).join('\n').trim() };
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
