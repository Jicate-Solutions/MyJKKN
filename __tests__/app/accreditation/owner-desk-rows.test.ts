import { describe, it, expect } from 'vitest';
import {
  compareMetricCode,
  groupPairsByInstitution,
  isBodyLevelPair,
  pairKey,
  BODY_LEVEL_CODE_LABEL,
  type MetricPair,
} from '@/app/(routes)/accreditation/naac/narratives/owners/_lib/owner-desk-rows';

// ---------------------------------------------------------------------------
// REGRESSION: /accreditation/naac/narratives/owners went down in production on
// 2026-08-14 with
//     TypeError: Cannot read properties of null (reading 'localeCompare')
// The desk sorted on accreditation_metric_owners.metric_code with a bare
//     rows.sort((a, b) => a.metric_code.localeCompare(b.metric_code))
// and that column is NULLABLE in production.
//
// NULL is not bad data. It is the WHOLE-BODY assignment: one row, no metric
// code, and every NAAC metric at that campus inherits its owner. All 14 owner
// rows live on 2026-08-13 are body-level, created 10:52–11:22 — the table was
// empty before that, which is why the page had never hit this. Body-level IS
// the chosen granularity, so on today's data EVERY row takes the null path.
//
// These tests therefore assert three separate things, because a fix that only
// stops the throw would still be wrong:
//   1. it does not throw;
//   2. the whole-body row sorts FIRST — it is the umbrella over the rows below;
//   3. the row is neither dropped nor rewritten to '' — either would hide the
//      only assignment this desk actually has.
// ---------------------------------------------------------------------------

const PHARMACY = 'inst-pharmacy';
const NURSING = 'inst-nursing';

const NAMES: Record<string, string> = {
  [PHARMACY]: 'JKKN College of Pharmacy',
  [NURSING]: 'JKKN College of Nursing',
};

/** A per-metric pair, the kind evidence and drafts produce. */
const metricPair = (
  institution_id: string,
  metric_code: string,
): MetricPair => ({
  institution_id,
  metric_code,
  hasNarrative: false,
  hasEvidence: true,
});

/** A whole-body pair — what an owner row with metric_code NULL becomes. */
const bodyPair = (institution_id: string): MetricPair => ({
  institution_id,
  metric_code: null,
  hasNarrative: false,
  hasEvidence: false,
});

const owned = (pairs: MetricPair[]) =>
  new Map(
    pairs.map((p) => [pairKey(p.institution_id, p.metric_code), 'user-priya']),
  );

// ---------------------------------------------------------------------------
describe('compareMetricCode', () => {
  it('does not throw on a null metric code (the production crash)', () => {
    expect(() => compareMetricCode(null, '3.1.1')).not.toThrow();
    expect(() => compareMetricCode('3.1.1', null)).not.toThrow();
    expect(() => compareMetricCode(null, null)).not.toThrow();
  });

  it('sorts a whole-body assignment before any metric code', () => {
    expect(compareMetricCode(null, '1.1.1')).toBeLessThan(0);
    expect(compareMetricCode('1.1.1', null)).toBeGreaterThan(0);
    // Even before a code that would otherwise sort first alphabetically.
    expect(compareMetricCode(null, '0.0.0')).toBeLessThan(0);
  });

  it('is a total order — two whole-body rows tie, codes compare normally', () => {
    expect(compareMetricCode(null, null)).toBe(0);
    expect(compareMetricCode(undefined, null)).toBe(0);
    expect(compareMetricCode('1.1.1', '1.1.1')).toBe(0);
    expect(compareMetricCode('1.1.1', '3.1.1')).toBeLessThan(0);
    expect(compareMetricCode('3.1.1', '1.1.1')).toBeGreaterThan(0);
  });

  it('is antisymmetric across the null boundary', () => {
    // A comparator that returns -1 both ways gives Array.sort a nondeterministic
    // result. undefined vs null must tie, not both win.
    const pairs: Array<[string | null | undefined, string | null | undefined]> =
      [
        [null, undefined],
        [null, '2.1.1'],
        [undefined, '2.1.1'],
        ['2.1.1', '2.1.2'],
      ];
    // `|| 0` folds -0 into 0; Object.is would otherwise call a legitimate tie
    // a failure.
    const sign = (n: number) => Math.sign(n) || 0;
    for (const [a, b] of pairs) {
      expect(sign(compareMetricCode(a, b))).toBe(
        -sign(compareMetricCode(b, a)) || 0,
      );
    }
  });
});

// ---------------------------------------------------------------------------
describe('isBodyLevelPair', () => {
  it('is true only when there is no metric code', () => {
    expect(isBodyLevelPair(bodyPair(PHARMACY))).toBe(true);
    expect(isBodyLevelPair(metricPair(PHARMACY, '3.1.1'))).toBe(false);
    // '' is a real (if malformed) code, not a whole-body assignment.
    expect(isBodyLevelPair(metricPair(PHARMACY, ''))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('pairKey', () => {
  it('spells a whole-body key the same way the page always has', () => {
    // The owner lookup, the in-flight saving flag and the per-campus assigned
    // count are all keyed on this string. If one caller spelled NULL
    // differently, a body-level row would silently read as unassigned.
    expect(pairKey(PHARMACY, null)).toBe(`${PHARMACY}::null`);
    expect(pairKey(PHARMACY, '3.1.1')).toBe(`${PHARMACY}::3.1.1`);
  });
});

// ---------------------------------------------------------------------------
describe('groupPairsByInstitution', () => {
  it('does not throw on production-shaped data (all rows body-level)', () => {
    // The exact shape that took the page down: every row a whole-body row.
    const pairs = [bodyPair(PHARMACY), bodyPair(NURSING)];
    expect(() =>
      groupPairsByInstitution(pairs, owned(pairs), 'all', NAMES),
    ).not.toThrow();
  });

  it('puts the whole-body row first, then metric codes ascending', () => {
    const pairs = [
      metricPair(PHARMACY, '3.1.1'),
      metricPair(PHARMACY, '1.1.1'),
      bodyPair(PHARMACY),
      metricPair(PHARMACY, '2.1.1'),
    ];

    const [group] = groupPairsByInstitution(pairs, new Map(), 'all', NAMES);

    expect(group.rows.map((r) => r.metric_code)).toEqual([
      null,
      '1.1.1',
      '2.1.1',
      '3.1.1',
    ]);
  });

  it('keeps the whole-body row — never filtered out, never coerced to ""', () => {
    const pairs = [bodyPair(PHARMACY), metricPair(PHARMACY, '3.1.1')];

    const [group] = groupPairsByInstitution(pairs, new Map(), 'all', NAMES);

    expect(group.rows).toHaveLength(2);
    // Still NULL, not '' — the page branches on this to render
    // "Whole body" instead of a blank cell.
    expect(group.rows[0].metric_code).toBeNull();
    expect(group.rows[0].metric_code).not.toBe('');
    expect(BODY_LEVEL_CODE_LABEL).toBeTruthy();
  });

  it('counts a whole-body row as assigned under the "assigned" filter', () => {
    // Guards the null spelling end to end: build the owner map with pairKey,
    // then confirm the filter still matches the row.
    const body = bodyPair(PHARMACY);
    const pairs = [body, metricPair(PHARMACY, '3.1.1')];

    const assigned = groupPairsByInstitution(
      pairs,
      owned([body]),
      'assigned',
      NAMES,
    );
    expect(assigned[0].rows.map((r) => r.metric_code)).toEqual([null]);

    const unassigned = groupPairsByInstitution(
      pairs,
      owned([body]),
      'unassigned',
      NAMES,
    );
    expect(unassigned[0].rows.map((r) => r.metric_code)).toEqual(['3.1.1']);
  });

  it('orders campuses by name and sorts each independently', () => {
    const pairs = [
      metricPair(PHARMACY, '2.1.1'),
      bodyPair(PHARMACY),
      metricPair(NURSING, '1.1.1'),
      bodyPair(NURSING),
    ];

    const groups = groupPairsByInstitution(pairs, new Map(), 'all', NAMES);

    expect(groups.map((g) => g.institutionName)).toEqual([
      'JKKN College of Nursing',
      'JKKN College of Pharmacy',
    ]);
    for (const g of groups) expect(g.rows[0].metric_code).toBeNull();
  });

  it('falls back to "Unknown campus" when names have not loaded', () => {
    // institutionNames is undefined on first paint; the campus sort must still
    // be total rather than comparing against undefined.
    const pairs = [bodyPair(PHARMACY), bodyPair(NURSING)];
    const groups = groupPairsByInstitution(pairs, new Map(), 'all', undefined);
    expect(groups.map((g) => g.institutionName)).toEqual([
      'Unknown campus',
      'Unknown campus',
    ]);
  });
});
