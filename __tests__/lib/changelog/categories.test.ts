/**
 * What's New — Keep a Changelog's categories.
 *
 * The Director asked for the page to follow keepachangelog.com/en/1.1.0, whose
 * six categories are Added, Changed, Deprecated, Removed, Fixed, Security. The
 * mapping onto them is a rename of the conventional-commit type the entry
 * already carries, so there is nothing here that could hallucinate — but there
 * is plenty here that could silently stop firing, which is why this file exists
 * beside title-rules.test.ts rather than inside the view.
 */
import { describe, it, expect } from 'vitest';
import {
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  CATEGORY_BLURB,
  categoryForKind,
  groupByCategory,
} from '@/lib/changelog/categories';
import { KIND_LABEL, type ChangeKind } from '@/lib/changelog/types';

/** Exactly the four values changelog_entries.kind is CHECK-constrained to. */
const KINDS = Object.keys(KIND_LABEL) as ChangeKind[];

describe('the six categories are Keep a Changelog’s six, in its order', () => {
  it('names all six and nothing else', () => {
    // Counted, not eyeballed: a sixth-and-a-half category would read fine in a
    // diff and put a heading on the page that the document does not define.
    expect([...CATEGORY_ORDER]).toEqual([
      'added',
      'changed',
      'deprecated',
      'removed',
      'fixed',
      'security',
    ]);
    expect(CATEGORY_ORDER).toHaveLength(6);
  });

  it('every category has a heading and a one-line explanation', () => {
    const missing = CATEGORY_ORDER.filter((c) => !CATEGORY_LABEL[c] || !CATEGORY_BLURB[c]);
    expect(missing).toEqual([]);
  });

  it('the headings are the document’s own words', () => {
    expect(CATEGORY_ORDER.map((c) => CATEGORY_LABEL[c])).toEqual([
      'Added',
      'Changed',
      'Deprecated',
      'Removed',
      'Fixed',
      'Security',
    ]);
  });
});

describe('the mapping from a stored kind', () => {
  it('maps each of the four kinds the database can hold', () => {
    expect(categoryForKind('new')).toBe('added');
    expect(categoryForKind('fixed')).toBe('fixed');
    expect(categoryForKind('security')).toBe('security');
    // perf( -> faster -> Changed: the thing still does what it did, differently.
    expect(categoryForKind('faster')).toBe('changed');
  });

  it('every kind the schema allows lands in a real category', () => {
    // The guard against the two lists drifting apart. Add a fifth kind to the
    // CHECK constraint and KIND_LABEL without mapping it, and this fails here
    // rather than rendering an entry under no heading at all.
    for (const kind of KINDS) {
      expect(CATEGORY_ORDER).toContain(categoryForKind(kind));
    }
  });

  it('an unrecognised kind falls to Changed rather than throwing or vanishing', () => {
    // `kind` is CHECK-constrained, so this can only happen if the constraint
    // changed under us. An entry whose nature we cannot read is still a change,
    // and dropping it would remove news from the page with nothing said.
    expect(categoryForKind('something-new-in-the-check-constraint')).toBe('changed');
    expect(categoryForKind('')).toBe('changed');
  });

  it('never produces Deprecated or Removed, because nothing marks them', () => {
    // Stated as a test, not as a comment, because the tempting fix is a keyword
    // sweep over subjects — and "remove the duplicate row", "drop the stray
    // console line", "retire the old query" would all be mislabelled as a
    // feature going away, which is the one wrong answer that actively misleads.
    const produced = new Set(KINDS.map(categoryForKind));
    expect(produced.has('deprecated')).toBe(false);
    expect(produced.has('removed')).toBe(false);
  });
});

describe('grouping a day’s entries', () => {
  const entry = (h: string, t: ChangeKind) => ({ h, t });

  it('puts each entry under its category, in Keep a Changelog’s order', () => {
    const items = [
      entry('a', 'fixed'),
      entry('b', 'new'),
      entry('c', 'security'),
      entry('d', 'faster'),
    ];
    const groups = groupByCategory(items, (e) => e.t);

    // Added, Changed, Fixed, Security — the document's order, NOT the order the
    // entries arrived in (which was Fixed first).
    expect(groups.map((g) => g.category)).toEqual(['added', 'changed', 'fixed', 'security']);
    expect(groups.map((g) => g.label)).toEqual(['Added', 'Changed', 'Fixed', 'Security']);
  });

  it('keeps git’s order inside a group', () => {
    // The list arrives newest-first and the grouping must not re-sort it: an
    // entry that moves up the page because of its category would be a lie about
    // when it shipped.
    const items = [entry('newest', 'fixed'), entry('middle', 'fixed'), entry('oldest', 'fixed')];
    const [group] = groupByCategory(items, (e) => e.t);
    expect(group.items.map((e) => e.h)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('drops the categories with nothing in them', () => {
    // "Deprecated — nothing" under every single date would be a permanent,
    // load-bearing lie about where a reader should look.
    const groups = groupByCategory([entry('a', 'new')], (e) => e.t);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe('added');
  });

  it('returns nothing at all for an empty day', () => {
    expect(groupByCategory([], () => 'new')).toEqual([]);
  });

  it('loses no entry', () => {
    // The arithmetic half: grouping must be a partition, not a filter. A bucket
    // keyed on something that returned undefined would quietly delete rows.
    const items = KINDS.flatMap((t, i) => [entry(`${t}-${i}-1`, t), entry(`${t}-${i}-2`, t)]);
    const groups = groupByCategory(items, (e) => e.t);
    const seen = groups.flatMap((g) => g.items.map((e) => e.h));
    expect(seen).toHaveLength(items.length);
    expect(new Set(seen).size).toBe(items.length);
  });
});
