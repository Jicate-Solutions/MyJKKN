// lib/utils/display-name.ts
//
// Collapse a repeated tail of initials in a person's display name.
//
// Reported twice from the dashboard on 5 Jan 2026 (BUG-002481, BUG-002482):
// the greeting repeated the reporter's initials, once as a single letter
// ("... PRIYA M M") and once as a two-letter pair written two different ways
// ("... KUMAR T.R T. R"). The initials appear twice because the stored name was
// composed by joining a first name that already carried them with the last name
// that repeats them ("KAVI PRIYA M" + "M").
//
// Dozens of screens compose names independently (grep for
// `[first_name, last_name].filter(Boolean).join(' ')`), and the doubled value is
// also already stored in profiles.full_name for 194 live rows, so the honest
// place to repair it is at DISPLAY time: whatever a caller holds, run it through
// here before showing it to a human.
//
// This is deliberately conservative. It only ever shortens a trailing run of
// INITIAL tokens, and only when that run's letters are one segment repeated a
// whole number of times, so a real repeated word ("LEE LEE") and an ordinary
// pair of distinct initials ("A B") are left alone. It never reorders, re-cases
// or otherwise rewrites a name.

/** The letters of a token, uppercased, with dots and other punctuation dropped. */
function lettersOf(token: string): string {
  return token.replace(/[^A-Za-z]/g, '').toUpperCase();
}

/**
 * Does this token read as an initial rather than as a word?
 *
 * A single letter ("M"), or letters carrying a dot ("M.", "T.R", "S.K."). Two
 * or three bare letters are NOT initials — "JO" and "LEE" are names, and
 * treating them as initials would let a genuine "LEE LEE" be collapsed.
 */
function isInitialToken(token: string): boolean {
  if (!/^[A-Za-z.]+$/.test(token)) return false;
  const letters = lettersOf(token);
  if (letters.length < 1 || letters.length > 3) return false;
  return letters.length === 1 || token.includes('.');
}

/**
 * Remove a repeated tail of initials from an already-composed name.
 *
 *   "KAVI PRIYA M M"        -> "KAVI PRIYA M"
 *   "ARUN KUMAR T.R T. R"   -> "ARUN KUMAR T.R"
 *   "KAVI PRIYA S S. S"     -> "KAVI PRIYA S"   (three times, in one call)
 *   "KAVI PRIYA S"          -> unchanged (nothing is repeated)
 *   "KAVI PRIYA A B"        -> unchanged (A and B differ)
 *   "LEE LEE"               -> unchanged (words, not initials)
 *
 * The rule: take the longest run of initials at the end of the name and read
 * its letters as one string, ignoring how the dots and spaces were typed. If
 * that string is a single segment repeated a whole number of times, keep one
 * segment. "M M" reads as MM (M twice), "T.R T. R" as TRTR (TR twice), and
 * "S S. S" as SSS (S three times) — all repetitions, so all collapse. "A B"
 * reads as AB, which is not a repetition, so it stays.
 *
 * Two guards keep this from inventing a name nobody stored: the segment must
 * end exactly on a token boundary, and only whole tokens are ever dropped.
 *
 * Whitespace runs collapse to a single space and the ends are trimmed, because
 * some stored names carry padding ("KAVI  M M"). Null and undefined come back
 * as an empty string so a caller can `|| fallback` on the result.
 */
export function dedupeTrailingInitials(name: string | null | undefined): string {
  if (!name) return '';
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return tokens.join(' ');

  // The longest run of initial tokens at the end of the name.
  let runStart = tokens.length;
  while (runStart > 0 && isInitialToken(tokens[runStart - 1])) runStart -= 1;
  const run = tokens.slice(runStart);
  // One initial cannot be a repetition of anything.
  if (run.length < 2) return tokens.join(' ');

  const perToken = run.map(lettersOf);
  const signature = perToken.join('');
  if (signature.length < 2) return tokens.join(' ');

  // Smallest segment length whose repetition builds the whole signature. The
  // smallest is taken first so "S S S" reduces to one S rather than stopping
  // at a longer segment that also happens to repeat.
  for (let segment = 1; segment <= signature.length / 2; segment += 1) {
    if (signature.length % segment !== 0) continue;
    const head = signature.slice(0, segment);
    let repeats = true;
    for (let at = segment; at < signature.length; at += segment) {
      if (signature.slice(at, at + segment) !== head) {
        repeats = false;
        break;
      }
    }
    if (!repeats) continue;

    // Keep the tokens covering that segment, and only when the segment ends
    // exactly on a token boundary — otherwise the repetition does not line up
    // with whole tokens and cutting would rewrite the name rather than shorten
    // it. A longer segment may still line up, so keep looking.
    const keep: string[] = [];
    let kept = 0;
    for (let i = 0; i < run.length && kept < segment; i += 1) {
      kept += perToken[i].length;
      keep.push(run[i]);
    }
    if (kept !== segment) continue;

    return [...tokens.slice(0, runStart), ...keep].join(' ');
  }

  return tokens.join(' ');
}

/**
 * Compose a display name from a first and last name without repeating the
 * initials the first name already ends with.
 *
 *   ("Kavi S", "S")  -> "Kavi S"
 *   ("Kavi", "S")    -> "Kavi S"
 *   ("Kavi", null)   -> "Kavi"
 */
export function composeDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  return dedupeTrailingInitials([firstName, lastName].filter(Boolean).join(' '));
}
