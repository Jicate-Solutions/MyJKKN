/**
 * Entries to keep off the What's New page.
 *
 * The changelog is generated from git history with no human in the loop, which
 * is what keeps it current. This file is the one manual override: a short commit
 * sha listed here never reaches the page, from the next update onward.
 *
 * It exists because until now a wrong or embarrassing line could only be removed
 * by a developer editing the generator's rules and rebuilding. Adding a line here
 * takes seconds and needs no code change.
 *
 * ALWAYS write down WHY next to the sha, and the date. A bare list of hashes
 * becomes unmaintainable within a month — nobody can tell whether an entry is
 * still meant to be hidden, so nobody ever removes one.
 *
 * Find the sha in the page's own data: it is the `h` field on the entry, and it
 * is the first 7 characters of the commit hash.
 *
 * Example of the intended shape:
 *
 *   export const HIDDEN = new Set([
 *     // Named a staff member in a way that read as blame. Hidden 2026-09-06.
 *     'a1b2c3d',
 *   ]);
 */
export const HIDDEN = new Set([
  // (empty — nothing has needed hiding yet)
]);
