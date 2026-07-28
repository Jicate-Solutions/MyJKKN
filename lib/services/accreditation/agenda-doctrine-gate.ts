// lib/services/accreditation/agenda-doctrine-gate.ts
// ============================================================================
// THE FORBIDDEN-AGENDA GATE — the Director's doctrine as a deterministic check.
//
// Doctrine: "a number readable from the platform is FORBIDDEN on a meeting
// agenda." An agenda carries ONLY blockers, decisions needing a resolution, and
// carried items. The data belongs in the pre-meeting brief, not the agenda —
// a sitting that spends its first twenty minutes hearing figures read aloud has
// already wasted the room, because anyone could have read them beforehand.
//
// The drafting prompt states the rule, but a prompt is a request, not a
// guarantee. This module is the guarantee: a PURE function (no DB, no model, no
// network) that scans a drafted agenda and returns every platform-readable
// figure it finds. Any hit blocks the convener's okay
// (fn_accreditation_meeting_draft_transition refuses, and the server action
// re-runs this on the human-edited text before calling it).
//
// What counts as a forbidden figure:
//   * a bare count or score          — "12 loops", "3.8 average"
//   * a percentage or ratio          — "84%", "18 of 24"
//   * a metric / criterion code      — "7.3.e", "Metric 6.5"
// What does NOT count (these are agenda furniture, not readouts):
//   * the agenda's own item numbering — "1.", "2)", "iii."
//   * a DATE                         — a due date or a sitting date is an
//                                      instruction, not a status readout
//   * a resolution's strike count phrased as a carried-item label
//                                    — "carried twice" is a blocker, and the
//                                      word form is deliberately allowed while
//                                      the digit form is not
//   * a bare CALENDAR YEAR            — "the 2026-27 review cycle" names a
//                                      period, it does not report a measurement
//   * a SITTING REFERENCE             — "meeting #4", "the 4th sitting". The
//                                      number labels the sitting rather than
//                                      asserting a figure, exactly as the
//                                      narrative validator tolerates
//                                      "Criterion 7.3" for the metric under
//                                      review. Phrase-scoped, so a free-standing
//                                      "4 departments" is still a hit.
// ============================================================================

export interface DoctrineHit {
  /** The offending fragment, verbatim. */
  token: string;
  /** The whole line it sits on, so the UI can point at it. */
  line: string;
  /** 1-based line number within the agenda body. */
  lineNo: number;
  /** Why it is forbidden, in one plain phrase. */
  reason: 'figure' | 'percentage' | 'metric_code';
}

export interface DoctrineResult {
  ok: boolean;
  hits: DoctrineHit[];
}

/** A leading agenda item marker: "1.", "12)", "iv.", "a)" — stripped first. */
const ITEM_MARKER_RE = /^\s*(?:[0-9]{1,2}|[ivxlIVXL]{1,5}|[a-zA-Z])\s*[.)\]]\s*/;

/** ISO dates and dd/mm/yyyy-ish dates: allowed, so removed before scanning. */
const DATE_RE =
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/gi;

/** A dotted metric/criterion code — "7.3.e", "6.5", "3.2.1". */
const METRIC_CODE_RE = /\b\d+\.\d+(?:\.\d+|\.[a-z])*\b/gi;

/** A percentage or an explicit ratio. */
const PERCENT_RE = /\b\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?\s*(?:per\s?cent|percent)\b/gi;
const RATIO_RE = /\b\d+\s*(?:of|\/|out of)\s*\d+\b/gi;

/** Any surviving bare number (integer or decimal, optional thousands commas). */
const BARE_NUMBER_RE = /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?\b/g;

/**
 * A sitting REFERENCE — "meeting #4", "sitting 12", "the 4th sitting". Removed
 * whole, before the bare-number pass, because the digit names the sitting rather
 * than reporting a measurement. Deliberately phrase-scoped: the digit is only
 * dropped when it sits next to the word, so "4 departments are blocked" on its
 * own is still flagged.
 */
const SITTING_REF_RE =
  /\b(?:meeting|sitting|session)s?\s*#?\s*\d+\b|\b\d+(?:st|nd|rd|th)\s+(?:meeting|sitting|session)\b/gi;

/**
 * A bare calendar year (1900-2099) or an academic-year range ("2026-27",
 * "2026-2027"). A year names the period an item belongs to; it is not a figure
 * read off a dashboard. Bounded to a plausible year range so an arbitrary
 * 4-digit count ("4200 learners") is NOT excused.
 */
const YEAR_RE = /\b(?:19|20)\d{2}(?:\s*-\s*(?:\d{2}|\d{4}))?\b/g;

/**
 * Scan a drafted agenda for platform-readable figures.
 *
 * Strip order matters and is deliberate: item markers → dates → metric codes →
 * percentages → ratios → sitting references → years → bare numbers. Dates are
 * removed BEFORE the metric-code pass so "2026-07-26" is never read as a dotted
 * code; metric codes are removed before the bare-number pass so "7.3.e" is
 * reported once as a code rather than three times as digits; and the allowed
 * phrases (sitting references, years) are removed LAST, so a figure that merely
 * sits on the same line as one is still caught.
 */
export function checkAgendaDoctrine(agendaMd: string): DoctrineResult {
  const hits: DoctrineHit[] = [];
  const lines = (agendaMd ?? '').split('\n');

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    let rest = rawLine.replace(ITEM_MARKER_RE, ' ');
    rest = rest.replace(DATE_RE, ' ');

    const push = (token: string, reason: DoctrineHit['reason']) => {
      hits.push({ token: token.trim(), line: rawLine.trim(), lineNo, reason });
    };

    for (const m of rest.match(METRIC_CODE_RE) ?? []) push(m, 'metric_code');
    rest = rest.replace(METRIC_CODE_RE, ' ');

    for (const m of rest.match(PERCENT_RE) ?? []) push(m, 'percentage');
    rest = rest.replace(PERCENT_RE, ' ');

    for (const m of rest.match(RATIO_RE) ?? []) push(m, 'percentage');
    rest = rest.replace(RATIO_RE, ' ');

    // Allowed phrases last: a sitting label and a calendar year are not readouts.
    rest = rest.replace(SITTING_REF_RE, ' ').replace(YEAR_RE, ' ');

    for (const m of rest.match(BARE_NUMBER_RE) ?? []) push(m, 'figure');
  });

  return { ok: hits.length === 0, hits };
}

/** One-line human summary for a toast / refusal message. */
export function describeDoctrineHits(hits: DoctrineHit[]): string {
  if (hits.length === 0) return '';
  const shown = hits.slice(0, 4).map((h) => `"${h.token}" (line ${h.lineNo})`);
  const more = hits.length > shown.length ? ` and ${hits.length - shown.length} more` : '';
  return `An agenda may not carry figures readable from the platform: ${shown.join(', ')}${more}. Move them to the brief.`;
}
