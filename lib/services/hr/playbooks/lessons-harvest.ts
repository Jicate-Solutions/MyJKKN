/**
 * The reason matcher, in TypeScript, for unit tests.
 *
 * MIRRORS public.fn_hr_duty_reason_match in
 * supabase/migrations/20271007161139_hr_duty_playbooks_and_lessons.sql:
 *   - only active codes of the duty, never 'other' itself;
 *   - tried in match_order, then code;
 *   - a keyword matches at the START of a word in the lowercased text
 *     (Postgres `~ ('\m' || term)`), so 'document' matches 'documents' but
 *     'late' does not match 'related';
 *   - no match, or no text, gives 'other'.
 *
 * The harvest itself runs in the database; this file never writes anything.
 * The reason's words are only sorted here: the lessons log keeps the code,
 * never the text.
 */

export interface ReasonCode {
  duty_code: string;
  code: string;
  match_terms: string[];
  match_order: number;
  is_active?: boolean;
}

/** Keywords are letters, digits, spaces, apostrophes and hyphens (a CHECK on the table). */
const PLAIN_TERM = /^[a-z0-9][a-z0-9 '-]*[a-z0-9]$/;

function startsAWord(text: string, term: string): boolean {
  let from = 0;
  for (;;) {
    const at = text.indexOf(term, from);
    if (at < 0) return false;
    const before = at === 0 ? '' : text[at - 1];
    // Postgres \m: the character before is not a word character (letter, digit, underscore).
    if (!/[a-z0-9_]/i.test(before)) return true;
    from = at + 1;
  }
}

export function matchReasonCode(
  codes: readonly ReasonCode[],
  dutyCode: string,
  text: string | null | undefined,
): string {
  const haystack = (text ?? '').toLowerCase();
  const candidates = codes
    .filter((c) => c.duty_code === dutyCode && c.is_active !== false && c.code !== 'other')
    .slice()
    .sort((a, b) => a.match_order - b.match_order || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  for (const c of candidates) {
    if (c.match_terms.some((t) => PLAIN_TERM.test(t) && startsAWord(haystack, t))) return c.code;
  }
  return 'other';
}
