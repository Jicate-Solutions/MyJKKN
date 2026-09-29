// =====================================================================
// HR appraisal — the checks on the appraisal itself: the arithmetic
// =====================================================================
// Agreement between two heads, the spread of ratings per area, the
// "what did the college not provide" answers, and the statements under
// each band. Pure functions, so every threshold edge is pinned here.
// =====================================================================

import { describe, it, expect } from 'vitest';
import {
  computeAgreement,
  computeSaturation,
  conditionsMissing,
  outcomeRatings,
  parseConditions,
  parseTickedStatements,
  resolveBandStatements,
  tallyConditions,
  hasAnyStatements,
  type RatingPair,
} from '@/lib/hr/appraisal-harness';
import type { AppraisalRatingMap } from '@/lib/hr/appraisal-ratings';

const ALL_MEETS: AppraisalRatingMap = {
  teaching: 'meets',
  research: 'meets',
  service: 'meets',
  collegiality: 'meets',
};

function pairs(n: number, first: AppraisalRatingMap, second: AppraisalRatingMap): RatingPair[] {
  return Array.from({ length: n }, () => ({ first, second }));
}

// ---------------------------------------------------------------------------
// Agreement
// ---------------------------------------------------------------------------

describe('agreement between two heads', () => {
  it('counts exact agreement per area as a share', () => {
    const agreeing = pairs(7, ALL_MEETS, ALL_MEETS);
    const differing = pairs(3, ALL_MEETS, { ...ALL_MEETS, teaching: 'exceeds' });
    const r = computeAgreement([...agreeing, ...differing], null);
    const teaching = r.perArea.find((a) => a.area === 'teaching')!;
    expect(teaching.pairs).toBe(10);
    expect(teaching.agree).toBe(7);
    expect(teaching.agreePct).toBe(70);
    expect(r.perArea.find((a) => a.area === 'research')!.agreePct).toBe(100);
  });

  it('counts only Exceeds-against-Below as a two-band split, in either direction', () => {
    const r = computeAgreement(
      [
        { first: { teaching: 'exceeds' }, second: { teaching: 'below' } },
        { first: { teaching: 'below' }, second: { teaching: 'exceeds' } },
        { first: { teaching: 'exceeds' }, second: { teaching: 'meets' } },
        { first: { teaching: 'meets' }, second: { teaching: 'below' } },
      ],
      null,
    );
    const t = r.perArea.find((a) => a.area === 'teaching')!;
    expect(t.twoBandSplits).toBe(2);
    expect(t.agree).toBe(0);
  });

  it('skips an area either head left unrated rather than counting it as a disagreement', () => {
    const r = computeAgreement(
      [{ first: { teaching: 'meets' }, second: { research: 'meets' } }],
      null,
    );
    expect(r.perArea.every((a) => a.pairs === 0 && a.agreePct === null)).toBe(true);
  });

  it('gives no verdict under the default minimum of five pairs', () => {
    const r = computeAgreement(pairs(4, ALL_MEETS, ALL_MEETS), null);
    expect(r.verdict).toEqual({ kind: 'not_enough', pairs: 4, needed: 5 });
  });

  it('passes at exactly the default 70% floor and fails just under it', () => {
    const at = computeAgreement(
      [...pairs(7, ALL_MEETS, ALL_MEETS), ...pairs(3, ALL_MEETS, { ...ALL_MEETS, service: 'below' })],
      null,
    );
    expect(at.verdict.kind).toBe('consistent');

    const under = computeAgreement(
      [...pairs(6, ALL_MEETS, ALL_MEETS), ...pairs(4, ALL_MEETS, { ...ALL_MEETS, service: 'below' })],
      null,
    );
    expect(under.verdict).toEqual({ kind: 'inconsistent', weakAreas: ['service'], minPct: 70 });
  });

  it('fails when ANY one area is under the floor, naming only that area', () => {
    const r = computeAgreement(
      [
        ...pairs(5, ALL_MEETS, ALL_MEETS),
        ...pairs(5, ALL_MEETS, { ...ALL_MEETS, collegiality: 'exceeds' }),
      ],
      null,
    );
    expect(r.verdict.kind).toBe('inconsistent');
    if (r.verdict.kind === 'inconsistent') expect(r.verdict.weakAreas).toEqual(['collegiality']);
  });

  it('follows a college threshold and minimum when set', () => {
    const r = computeAgreement(
      [...pairs(2, ALL_MEETS, ALL_MEETS), ...pairs(1, ALL_MEETS, { ...ALL_MEETS, teaching: 'below' })],
      { rater_agreement_min_pct: 60, rater_agreement_min_pairs: 3 },
    );
    expect(r.verdict).toEqual({ kind: 'consistent', minPct: 60 });
  });

  it('ignores a damaged threshold and uses the default', () => {
    const r = computeAgreement(pairs(5, ALL_MEETS, ALL_MEETS), {
      rater_agreement_min_pct: 150,
      rater_agreement_min_pairs: 0,
    });
    expect(r.verdict).toEqual({ kind: 'consistent', minPct: 70 });
  });
});

// ---------------------------------------------------------------------------
// Saturation
// ---------------------------------------------------------------------------

describe('spread of ratings per area', () => {
  it('counts each band per area', () => {
    const s = computeSaturation(
      [ALL_MEETS, { ...ALL_MEETS, teaching: 'exceeds' }, { ...ALL_MEETS, teaching: 'below' }],
      null,
    );
    const t = s.find((x) => x.area === 'teaching')!;
    expect(t.counts).toEqual({ exceeds: 1, meets: 1, below: 1 });
    expect(t.total).toBe(3);
  });

  it('warns at exactly 80% with exactly 10 rated (the defaults)', () => {
    const sets = [
      ...Array.from({ length: 8 }, () => ALL_MEETS),
      { ...ALL_MEETS, research: 'exceeds' as const },
      { ...ALL_MEETS, research: 'below' as const },
    ];
    const research = computeSaturation(sets, null).find((x) => x.area === 'research')!;
    expect(research.topBand).toBe('meets');
    expect(research.topPct).toBe(80);
    expect(research.warn).toBe(true);
  });

  it('does not warn below the minimum count, however lopsided', () => {
    const sets = Array.from({ length: 9 }, () => ALL_MEETS);
    expect(computeSaturation(sets, null).some((x) => x.warn)).toBe(false);
  });

  it('does not warn just under the share', () => {
    const sets = [
      ...Array.from({ length: 7 }, () => ALL_MEETS),
      ...Array.from({ length: 3 }, () => ({ ...ALL_MEETS, service: 'exceeds' as const })),
    ];
    expect(computeSaturation(sets, null).find((x) => x.area === 'service')!.warn).toBe(false);
  });

  it('follows a college threshold', () => {
    const sets = [ALL_MEETS, ALL_MEETS, { ...ALL_MEETS, teaching: 'below' as const }];
    const t = computeSaturation(sets, { saturation_warn_pct: 60, saturation_min_count: 3 }).find(
      (x) => x.area === 'teaching',
    )!;
    expect(t.warn).toBe(true);
  });

  it('reports nothing for an area nobody has rated', () => {
    const t = computeSaturation([], null)[0];
    expect(t).toMatchObject({ total: 0, topBand: null, topPct: null, warn: false });
  });

  it('counts the committee rating when complete, else the head, never the self-rating', () => {
    const sedcDone = outcomeRatings({
      supervisor_review_jsonb: { ratings: ALL_MEETS },
      sedc_review_jsonb: { ratings: { ...ALL_MEETS, teaching: 'exceeds' } },
    });
    expect(sedcDone.teaching).toBe('exceeds');

    const sedcPartial = outcomeRatings({
      supervisor_review_jsonb: { ratings: ALL_MEETS },
      sedc_review_jsonb: { ratings: { teaching: 'below' } },
    });
    expect(sedcPartial.teaching).toBe('meets');
  });
});

// ---------------------------------------------------------------------------
// Conditions first
// ---------------------------------------------------------------------------

describe('what the college did not provide', () => {
  const below: AppraisalRatingMap = { ...ALL_MEETS, teaching: 'below' };

  it('is owed for every Below, and only for a Below', () => {
    expect(conditionsMissing(below, {}, null)).toEqual(['teaching']);
    expect(conditionsMissing(ALL_MEETS, {}, null)).toEqual([]);
  });

  it('needs at least one reason AND a note of ten characters', () => {
    expect(
      conditionsMissing(below, { teaching: { missing: [], note: 'plenty of words here' } }, null),
    ).toEqual(['teaching']);
    expect(conditionsMissing(below, { teaching: { missing: ['time'], note: 'too short' } }, null))
      .toEqual(['teaching']);
    expect(
      conditionsMissing(below, { teaching: { missing: ['time'], note: 'No free period all term' } }, null),
    ).toEqual([]);
  });

  it('is switched off only by an explicit false', () => {
    expect(conditionsMissing(below, {}, { conditions_first_on_below: false })).toEqual([]);
    expect(conditionsMissing(below, {}, {})).toEqual(['teaching']);
  });

  it('drops unknown reasons when reading a payload back', () => {
    const c = parseConditions({
      conditions: { teaching: { missing: ['time', 'bribes', 7], note: 'x' }, bogus: {} },
    });
    expect(c.teaching?.missing).toEqual(['time']);
    expect(Object.keys(c)).toEqual(['teaching']);
  });

  it('tallies reasons across payloads, most named first, counting only real Belows', () => {
    const t = tallyConditions([
      {
        ratings: below,
        conditions: { teaching: { missing: ['time', 'training'], note: 'long enough note' } },
      },
      {
        ratings: { ...ALL_MEETS, service: 'below', research: 'below' },
        conditions: {
          service: { missing: ['time'], note: 'long enough note' },
          research: { missing: ['time'], note: 'long enough note' },
        },
      },
      // A stale answer on an area later re-rated Meets is not a finding.
      { ratings: ALL_MEETS, conditions: { teaching: { missing: ['workload'], note: 'x' } } },
      null,
    ]);
    expect(t).toEqual([
      { reason: 'time', count: 3 },
      { reason: 'training', count: 1 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Statements under each band
// ---------------------------------------------------------------------------

describe('statements under each band', () => {
  it('are empty when the college has written none', () => {
    expect(resolveBandStatements(null, 'teaching', 'exceeds')).toEqual([]);
    expect(resolveBandStatements({}, 'teaching', 'exceeds')).toEqual([]);
    expect(hasAnyStatements({})).toBe(false);
  });

  it('keep real text only, trimmed and without repeats', () => {
    const policy = {
      band_statements: {
        service: { exceeds: ['  Took a session for a colleague  ', '', 3, 'Took a session for a colleague'] },
      },
    } as never;
    expect(resolveBandStatements(policy, 'service', 'exceeds')).toEqual([
      'Took a session for a colleague',
    ]);
    expect(hasAnyStatements(policy)).toBe(true);
  });

  it('read ticks back as text, dropping junk', () => {
    expect(
      parseTickedStatements({ statements: { teaching: ['A', 5, ''], bogus: ['B'] } }),
    ).toEqual({ teaching: ['A'] });
    expect(parseTickedStatements({ statements: ['A'] })).toEqual({});
    expect(parseTickedStatements(null)).toEqual({});
  });
});
