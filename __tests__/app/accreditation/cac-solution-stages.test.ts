import { describe, it, expect } from 'vitest';
import {
  summariseFunnel,
  solutionStages,
  finishLines,
  type CacFunnelRow,
} from '@/hooks/accreditation/use-cac-cluster';

// ---------------------------------------------------------------------------
// Two settled decisions are enforced here, and both fail SILENTLY in a
// component — nothing throws, the panel just starts saying something the
// Director did not agree to.
//
//   #2  The three stages are counted SEPARATELY: started, built, used by a real
//       user. A single status column walked forward loses its own history and
//       would let one stage overwrite another.
//   #3  There are TWO PARALLEL FINISH LINES — 'used by someone' and 'published'
//       — and NEITHER is ranked above the other. #13 adds that publications are
//       recorded because NAAC and NIRF ask for them, and never outrank a real
//       user. The last block in this file is a negative control for exactly
//       that: it fails if the two are ever ordered or compared.
//
// Shapes mirror production on 2026-08-14, which is the honest baseline: 8
// assessed colleges, 2 solutions, both `status = 'active'`, NEITHER carrying a
// completion_date, 0 phases and 0 publications. So the estate reads 2 started
// and nothing recorded at any later stage — and every one of those absences
// must reach the screen as UNRECORDED, never as a measured zero.
// ---------------------------------------------------------------------------

const row = (
  name: string,
  over: Partial<CacFunnelRow> = {},
): CacFunnelRow => ({
  institution_id: `i-${name}`,
  institution_name: name,
  iqac_code: name.slice(0, 4).toUpperCase(),
  departments_activated: 0,
  departments_producing: 0,
  solutions: 0,
  phases: 0,
  publications: 0,
  solutions_built: 0,
  solutions_used: 0,
  ...over,
});

/** Production 2026-08-14: 44 activated, 1 producing, 2 solutions, nothing after. */
const PRODUCTION_TODAY: CacFunnelRow[] = [
  row('Dental', { departments_activated: 12 }),
  row('Pharmacy', { departments_activated: 10 }),
  row('Allied Health', { departments_activated: 8 }),
  row('Arts and Science (Self)', {
    departments_activated: 9,
    departments_producing: 1,
    solutions: 2,
  }),
  row('Nursing', { departments_activated: 5 }),
  row('Engineering'),
  row('Arts and Science (Aided)'),
  row('Education'),
];

describe('the three stages are counted separately', () => {
  it('reads the production estate as 2 started and nothing recorded after it', () => {
    const totals = summariseFunnel(PRODUCTION_TODAY);
    expect(totals.solutions).toBe(2);
    expect(totals.solutionsBuilt).toBe(0);
    expect(totals.solutionsUsed).toBe(0);
    expect(totals.publications).toBe(0);
  });

  it('gives exactly three stages, in the order started, built, used', () => {
    const stages = solutionStages(summariseFunnel(PRODUCTION_TODAY));
    expect(stages.map((s) => s.key)).toEqual(['started', 'built', 'used']);
  });

  it('moves the three stages independently of one another', () => {
    // The point of counting them separately: a solution can be used without
    // being marked built, and a built one need not have been used. One number
    // must never be derivable from another.
    const totals = summariseFunnel([
      row('A', { solutions: 3, solutions_built: 1, solutions_used: 2 }),
    ]);
    const byKey = Object.fromEntries(
      solutionStages(totals).map((s) => [s.key, s.value]),
    );
    expect(byKey.started).toBe(3);
    expect(byKey.built).toBe(1);
    expect(byKey.used).toBe(2);
  });

  it('never reports an empty stage as a measured zero', () => {
    // Every stage with no records carries a reason instead of a figure, and the
    // reason has to READ as "unrecorded" — nine accreditation registers on this
    // platform sit at 0 rows because nobody fills them.
    const stages = solutionStages(summariseFunnel(PRODUCTION_TODAY));
    stages.forEach((s) => {
      expect(s.empty.trim()).not.toBe('');
      expect(s.empty).not.toMatch(/^0\b/);
      expect(s.empty.toLowerCase()).toMatch(/recorded|activated/);
    });
  });

  it('says where "built" comes from, because nothing else distinguishes it', () => {
    // completion_date is the only candidate signal in the estate and it is null
    // on every solution, so a reader who is not told that will read 0 as
    // "nothing was ever finished".
    const built = solutionStages(summariseFunnel(PRODUCTION_TODAY)).find(
      (s) => s.key === 'built',
    );
    expect(built?.derivedFrom).toMatch(/completion date/i);
  });

  it('survives a client older than the view columns without printing NaN', () => {
    // A browser holding a cached bundle can receive rows lacking the two new
    // columns. `undefined + n` is NaN, which renders as a broken figure rather
    // than an empty one.
    const legacy = { ...row('Old') } as Partial<CacFunnelRow>;
    delete legacy.solutions_built;
    delete legacy.solutions_used;
    const totals = summariseFunnel([legacy as CacFunnelRow]);
    expect(Number.isNaN(totals.solutionsBuilt)).toBe(false);
    expect(Number.isNaN(totals.solutionsUsed)).toBe(false);
    expect(totals.solutionsBuilt).toBe(0);
    expect(totals.solutionsUsed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// NEGATIVE CONTROL — the two finish lines must never be ordered or ranked
// against each other.
//
// This block is written to FAIL if someone later sorts the finish lines by
// value, marks one primary, adds a share or a percentage, or introduces a
// derived figure implying one leads to the other. Every one of those changes
// looks like an improvement in a diff and every one of them contradicts a
// settled decision.
// ---------------------------------------------------------------------------
describe('the two finish lines are parallel, never ranked (negative control)', () => {
  const withValues = (used: number, published: number) =>
    finishLines(summariseFunnel([row('A', { solutions_used: used, publications: published })]));

  it('returns exactly two, and they are used and published', () => {
    expect(withValues(0, 0).map((f) => f.key)).toEqual(['used', 'published']);
  });

  it('keeps the same order whichever figure is larger', () => {
    // The order is declarative. If it ever starts following the values, the
    // bigger number floats to the front and the panel begins ranking them.
    expect(withValues(9, 1).map((f) => f.key)).toEqual(['used', 'published']);
    expect(withValues(1, 9).map((f) => f.key)).toEqual(['used', 'published']);
    expect(withValues(0, 40).map((f) => f.key)).toEqual(['used', 'published']);
  });

  it('carries no field a caller could rank or compare them by', () => {
    const forbidden = [
      'rank',
      'order',
      'position',
      'primary',
      'isPrimary',
      'leading',
      'isLeading',
      'weight',
      'share',
      'sharePct',
      'percent',
      'percentage',
      'score',
      'ratio',
      'conversion',
    ];
    withValues(9, 1).forEach((f) => {
      forbidden.forEach((key) => {
        expect(Object.prototype.hasOwnProperty.call(f, key)).toBe(false);
      });
    });
  });

  it('publishes no third figure derived from the two', () => {
    // A conversion or a ratio between them would imply one leads to the other.
    // Two finish lines, two entries — nothing else.
    expect(withValues(9, 1)).toHaveLength(2);
  });

  it('states neither line as a bare zero when it is unrecorded', () => {
    withValues(0, 0).forEach((f) => {
      expect(f.value).toBe(0);
      expect(f.empty).not.toMatch(/^0\b/);
      expect(f.empty.toLowerCase()).toContain('recorded');
    });
  });

  it('describes both in the same terms, so neither reads as the real one', () => {
    // Equal weight is a wording question as much as a layout one: a "goal" next
    // to an "also" ranks them in prose even when the boxes are the same size.
    withValues(3, 3).forEach((f) => {
      expect(f.meaning.trim().length).toBeGreaterThan(0);
      expect(f.meaning.toLowerCase()).not.toMatch(
        /instead|merely|only|lesser|better|best|ultimate/,
      );
    });
  });
});
