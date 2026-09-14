/**
 * Keep a Changelog's categories, for the What's New page.
 *
 * Director, 2026-09-12: the page "seems to be only for developers and not
 * understandable by the actual users", with https://keepachangelog.com/en/1.1.0/
 * given as the reference. That document defines exactly six categories — Added,
 * Changed, Deprecated, Removed, Fixed, Security — and says a changelog is "for
 * humans, not machines".
 *
 * NO AI, AND NOTHING TO HALLUCINATE. The category is a pure function of the
 * conventional-commit type the author already wrote, which
 * scripts/generate-changelog.mjs has been storing as `kind` since the page was
 * built: `feat(` → new, `fix(` → fixed, `perf(` → faster, `security(` →
 * security. Reading a category off that is a rename, not a judgement, so there
 * is no classifier here and no column added to the database — the mapping is
 * derived at render time from a value the row already carries.
 *
 * WHY IT LIVES IN lib/ AND NOT IN THE VIEW. Beside title-rules.mjs, for the same
 * reason that file exists: a rule that decides what a reader sees must be
 * testable without rendering a page. __tests__/lib/changelog/categories.test.ts
 * is the whole point of the file's location.
 *
 * .ts rather than .mjs, unlike its neighbour: title-rules.mjs is imported by a
 * Node script (scripts/generate-changelog.mjs) and has to be plain ESM. This
 * mapping's only consumers are the React view and its tests, so it is typed.
 */

import type { ChangeKind } from './types';

/**
 * Keep a Changelog's own order, which is not alphabetical and is not by
 * frequency — it is the document's order, and it is the order a reader of any
 * other product's release notes has already learnt.
 *
 * Deprecated and Removed are here and will not be produced by the mapping below.
 * That is deliberate on both counts: the order must be stable if either ever
 * starts appearing, and inventing a rule that guesses at removals is exactly the
 * hallucination this file avoids. See categoryForKind.
 */
export const CATEGORY_ORDER = [
  'added',
  'changed',
  'deprecated',
  'removed',
  'fixed',
  'security',
] as const;

export type ChangeCategory = (typeof CATEGORY_ORDER)[number];

/** The heading a reader sees. Keep a Changelog's own words, capitalised as it does. */
export const CATEGORY_LABEL: Record<ChangeCategory, string> = {
  added: 'Added',
  changed: 'Changed',
  deprecated: 'Deprecated',
  removed: 'Removed',
  fixed: 'Fixed',
  security: 'Security',
};

/**
 * One short line under each heading, because "Changed" alone does not tell a
 * Principal what the list beneath it has in common.
 */
export const CATEGORY_BLURB: Record<ChangeCategory, string> = {
  added: 'Things you can now do that you could not before.',
  changed: 'Things that already existed and now work differently.',
  deprecated: 'Still here, but on the way out.',
  removed: 'Gone.',
  fixed: 'Things that were wrong and are not any more.',
  security: 'Changes to who can see or do what.',
};

/**
 * The mapping. Four of the six are reachable.
 *
 *   new      → Added      a `feat(` commit: something that was not there before
 *   fixed    → Fixed      a `fix(` commit
 *   security → Security   a `security(` commit
 *   faster   → Changed    a `perf(` commit: the thing still does what it did
 *
 * WHAT ABOUT Deprecated AND Removed? Nothing produces them, and nothing should
 * until something marks them unambiguously. Conventional commits have no type
 * for either; a keyword sweep over subjects ("remove", "drop", "retire") would
 * mislabel every commit that removes a BUG, a duplicate row or a stray console
 * line, and a wrong category is worse than a broad one — it tells a reader a
 * feature they rely on is going away. Keep a Changelog itself only defines the
 * buckets; it does not claim every changelog fills all six.
 *
 * WHAT ABOUT `refactor(`? The spec that requested this work maps `refactor(` to
 * Changed. It cannot arrive here: SUBJECT_RE in scripts/generate-changelog.mjs
 * matches only feat|fix|perf|security, so a `refactor(` commit is counted as
 * non-user-facing and never becomes an entry at all. Widening that regex would
 * add thousands of rows to a page the Director is asking to make SHORTER, so it
 * is deliberately not done here; noted so the next reader does not go looking
 * for a mapping that is missing.
 *
 * The fallthrough is Changed, not a throw and not a fifth category. `kind` is
 * constrained by a CHECK to exactly these four values, so an unknown one means
 * the constraint changed under us — and the honest thing to do with a change
 * whose nature we cannot read is to call it a change.
 */
export function categoryForKind(kind: ChangeKind | string): ChangeCategory {
  switch (kind) {
    case 'new':
      return 'added';
    case 'fixed':
      return 'fixed';
    case 'security':
      return 'security';
    case 'faster':
      return 'changed';
    default:
      return 'changed';
  }
}

/**
 * Group one day's entries into Keep a Changelog's categories, in its order,
 * dropping the categories that have nothing in them.
 *
 * Order WITHIN a category is the order it was handed, which upstream is git's
 * own — the caller has already sorted newest-first, and this must not reshuffle
 * that. Empty categories are dropped rather than rendered as an empty heading:
 * "Deprecated — nothing" on every single day would be a permanent lie about
 * where a reader should look.
 */
export function groupByCategory<T>(
  items: readonly T[],
  kindOf: (item: T) => ChangeKind | string
): { category: ChangeCategory; label: string; items: T[] }[] {
  const buckets = new Map<ChangeCategory, T[]>();
  for (const item of items) {
    const category = categoryForKind(kindOf(item));
    const bucket = buckets.get(category);
    if (bucket) bucket.push(item);
    else buckets.set(category, [item]);
  }
  return CATEGORY_ORDER.filter((c) => buckets.has(c)).map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    items: buckets.get(category)!,
  }));
}
