/**
 * What's New — highlight selection is DETERMINISTIC and EXPLAINABLE.
 *
 * The Director's ruling was "highlights written well, rest left plain", with
 * the writing done by a person because "AI rewrites everything, nobody checks"
 * was rejected on accuracy grounds. That leaves the machine doing exactly one
 * job — picking which changes get offered — and these tests pin the two
 * properties that make that job trustworthy: the same input always produces the
 * same list, and every pick carries a sentence saying why.
 */
import { describe, it, expect } from 'vitest';
import { selectHighlights, weekStart, WEEKLY_CAP } from '@/lib/changelog/highlights';
import type { ChangelogEntry, ChangelogModule } from '@/lib/changelog/types';

const MODULES: Record<string, ChangelogModule> = {
  billing: { label: 'Billing', perm: ['billing'], href: '/billing' },
  platform: { label: 'Platform', perm: null, href: null },
  // Reachable by nobody: gated by a namespace, but with nowhere to send a reader.
  ghost: { label: 'Ghost', perm: ['ghost'], href: null },
};

const MONDAY = '2026-09-07';

function entry(over: Partial<ChangelogEntry> & { h: string }): ChangelogEntry {
  return {
    d: '2026-09-09',
    t: 'new',
    m: 'billing',
    s: 'a change',
    a: 'Someone',
    ...over,
  } as ChangelogEntry;
}

describe('weekStart', () => {
  it('returns the Monday of the week a date falls in', () => {
    expect(weekStart('2026-09-07')).toBe('2026-09-07'); // Monday itself
    expect(weekStart('2026-09-09')).toBe('2026-09-07'); // Wednesday
    expect(weekStart('2026-09-13')).toBe('2026-09-07'); // Sunday — same week
    expect(weekStart('2026-09-14')).toBe('2026-09-14'); // next Monday
  });

  it('does not slide by a day across a month or year boundary', () => {
    expect(weekStart('2026-01-01')).toBe('2025-12-29');
    expect(weekStart('2026-03-01')).toBe('2026-02-23');
  });
});

describe('selectHighlights', () => {
  it('is deterministic — the same input gives the same list, twice', () => {
    const entries = [
      entry({ h: 'a1', t: 'fixed' }),
      entry({ h: 'a2', t: 'security' }),
      entry({ h: 'a3', t: 'new', p: 12 }),
    ];
    const first = selectHighlights(entries, MODULES, { from: MONDAY });
    const second = selectHighlights(entries, MODULES, { from: MONDAY });
    expect(first.map((c) => c.entry.h)).toEqual(second.map((c) => c.entry.h));
  });

  it('never offers a performance change — it answers the wrong question', () => {
    const picked = selectHighlights([entry({ h: 'p1', t: 'faster' })], MODULES, { from: MONDAY });
    expect(picked).toHaveLength(0);
  });

  it('never offers a module with no screen a reader can open', () => {
    const picked = selectHighlights([entry({ h: 'g1', m: 'ghost' })], MODULES, { from: MONDAY });
    expect(picked).toHaveLength(0);
  });

  it('offers a platform-wide change, which has no href and needs none', () => {
    const picked = selectHighlights([entry({ h: 'x1', m: 'platform' })], MODULES, { from: MONDAY });
    expect(picked).toHaveLength(1);
    expect(picked[0].suggestedAffects).toBe('Everyone signed in.');
  });

  it('ranks security over new over fixed, and lifts a breaking change', () => {
    const picked = selectHighlights(
      [
        entry({ h: 'f1', t: 'fixed' }),
        entry({ h: 'n1', t: 'new' }),
        entry({ h: 's1', t: 'security' }),
        entry({ h: 'f2', t: 'fixed', b: 1 }),
      ],
      MODULES,
      { from: MONDAY }
    );
    // fixed+breaking (50+40+5) outranks new (80+5) — a change that breaks what
    // someone already does is the one they most need told about.
    expect(picked.map((c) => c.entry.h)).toEqual(['s1', 'f2', 'n1', 'f1']);
  });

  it('gives every pick a reason a person can read', () => {
    const picked = selectHighlights([entry({ h: 'r1', t: 'security', p: 3652 })], MODULES, {
      from: MONDAY,
    });
    expect(picked[0].reason).toContain('security change');
    expect(picked[0].reason).toContain('Billing');
    expect(picked[0].reason).toContain('#3652');
  });

  it('drops entries outside the week in both directions', () => {
    const picked = selectHighlights(
      [
        entry({ h: 'before', d: '2026-09-06' }),
        entry({ h: 'inside', d: '2026-09-09' }),
        entry({ h: 'after', d: '2026-09-14' }),
      ],
      MODULES,
      { from: MONDAY, until: '2026-09-14' }
    );
    expect(picked.map((c) => c.entry.h)).toEqual(['inside']);
  });

  it('never re-offers something a person already answered on', () => {
    const picked = selectHighlights([entry({ h: 'done' }), entry({ h: 'open' })], MODULES, {
      from: MONDAY,
      alreadyDecided: new Set(['done']),
    });
    expect(picked.map((c) => c.entry.h)).toEqual(['open']);
  });

  it('caps the week — nobody is hand-writing thirty of these', () => {
    const many = Array.from({ length: 40 }, (_, i) => entry({ h: `m${i}` }));
    expect(selectHighlights(many, MODULES, { from: MONDAY })).toHaveLength(WEEKLY_CAP);
  });

  it('keeps the newest-first order it was given when scores tie', () => {
    // Same kind, same module, no bonuses: nothing separates these but arrival
    // order, which is the route's total order (entry_date desc, ordinal asc, …).
    const picked = selectHighlights(
      [entry({ h: 'newest' }), entry({ h: 'middle' }), entry({ h: 'oldest' })],
      MODULES,
      { from: MONDAY }
    );
    expect(picked.map((c) => c.entry.h)).toEqual(['newest', 'middle', 'oldest']);
  });
});
