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
// also already stored in profiles.full_name for 193 live rows, so the honest
// place to repair it is at DISPLAY time: whatever a caller holds, run it through
// here before showing it to a human.
//
// This is deliberately conservative. It only ever removes a trailing run of
// INITIAL tokens whose letters are an exact doubling, so a real repeated word
// ("LEE LEE") and an ordinary pair of distinct initials ("A B") are left alone.
// It never reorders, re-cases or otherwise rewrites a name.

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
 * Remove a duplicated tail of initials from an already-composed name.
 *
 *   "KAVI PRIYA M M"        -> "KAVI PRIYA M"
 *   "ARUN KUMAR T.R T. R"   -> "ARUN KUMAR T.R"
 *   "KAVI PRIYA S"          -> unchanged (nothing is doubled)
 *   "KAVI PRIYA A B"        -> unchanged (A and B differ)
 *
 * Whitespace runs collapse to a single space and the ends are trimmed, because
 * some stored names carry padding ("KAVI  M M"). Null and undefined come back as
 * an empty string so a caller can `|| fallback` on the result.
 */
export function dedupeTrailingInitials(name: string | null | undefined): string {
  if (!name) return '';
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return tokens.join(' ');

  // The longest run of initial tokens at the end of the name.
  let runStart = tokens.length;
  while (runStart > 0 && isInitialToken(tokens[runStart - 1])) runStart -= 1;
  const run = tokens.slice(runStart);
  // One initial cannot be a doubling of anything.
  if (run.length < 2) return tokens.join(' ');

  // "T.R T. R" and "M M" both reduce to a signature that is one half repeated.
  const signature = run.map(lettersOf).join('');
  if (signature.length < 2 || signature.length % 2 !== 0) return tokens.join(' ');
  const half = signature.length / 2;
  if (signature.slice(0, half) !== signature.slice(half)) return tokens.join(' ');

  // Keep the tokens covering the first half, and only when that half ends
  // exactly on a token boundary — otherwise the halves do not correspond to
  // whole tokens and cutting would invent a name nobody stored.
  const keep: string[] = [];
  let kept = 0;
  for (const token of run) {
    if (kept >= half) break;
    kept += lettersOf(token).length;
    keep.push(token);
  }
  if (kept !== half) return tokens.join(' ');

  return [...tokens.slice(0, runStart), ...keep].join(' ');
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
