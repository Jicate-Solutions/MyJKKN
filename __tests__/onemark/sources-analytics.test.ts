/**
 * OneMark — judging a source after the real board paper.
 *
 * Director ruling (a) of 2026-09-06: BOTH halves or nothing. These tests are
 * mostly about what the screen REFUSES to say — a lift below three learners, a
 * hit rate over zero live questions, a verdict on half the evidence. The
 * fixtures walk the learner counts the lane spec names: 0, 1, 5 and 40.
 *
 * Ruling #9 sets the floor at 3 and explicitly overrides the 5 first written in
 * Lane S3 item 6; the fixtures below use 3 and one uses 5 to prove the floor is
 * read from the payload rather than hard-coded.
 */
import { describe, it, expect } from 'vitest';
import {
  ANALYTICS_FOOTNOTES,
  MIN_LEARNERS_FALLBACK,
  analyticsIsEmpty,
  chartData,
  everythingUnrecorded,
  formatAccuracy,
  formatHitRate,
  formatLift,
  liftIsVisible,
  parseSourceAnalytics,
  sortAnalyticsRows,
  sourceVerdict,
  type SourceAnalyticsRow,
} from '@/lib/services/onemark/sources-analytics';

function rpcRow(over: Partial<SourceAnalyticsRow> = {}): Record<string, unknown> {
  return {
    source_key: 'past_board_exam',
    label: 'Past board paper',
    is_recorded: true,
    source_active: true,
    items_total: 12,
    items_active: 12,
    times_served: 400,
    times_correct: 300,
    accuracy: 0.75,
    hits_exact: 2,
    hits_near: 1,
    hit_rate: 0.25,
    lift: 0.08,
    lift_learners: 40,
    lift_reason: null,
    ...over,
  };
}

function payload(rows: Array<Record<string, unknown>>, min = 3): Record<string, unknown> {
  return {
    exam_definition_id: '11111111-1111-1111-1111-111111111111',
    exam_year: 2025,
    min_learners_for_item_stats: min,
    sources: rows,
    notes: { hit_rate: 'hit note', lift: 'lift note' },
  };
}

describe('parseSourceAnalytics', () => {
  it('reads a well-formed payload without changing its numbers', () => {
    const p = parseSourceAnalytics(payload([rpcRow()]));
    expect(p.exam_year).toBe(2025);
    expect(p.min_learners_for_item_stats).toBe(3);
    expect(p.sources[0]).toMatchObject({ source_key: 'past_board_exam', hit_rate: 0.25, lift: 0.08 });
    expect(p.notes.hit_rate).toBe('hit note');
  });

  it('never throws on rubbish — a malformed payload becomes an empty honest one', () => {
    for (const bad of [null, undefined, 7, 'nope', [], { sources: 'x' }]) {
      const p = parseSourceAnalytics(bad);
      expect(p.sources).toEqual([]);
      expect(p.min_learners_for_item_stats).toBe(MIN_LEARNERS_FALLBACK);
    }
  });

  it('falls back to the ruling-#9 floor when the payload omits it', () => {
    const p = parseSourceAnalytics(payload([rpcRow()], 0));
    expect(p.min_learners_for_item_stats).toBe(3);
  });

  it('carries a payload floor of 5 through unchanged, so the number is read not assumed', () => {
    const p = parseSourceAnalytics(payload([rpcRow()], 5));
    expect(p.min_learners_for_item_stats).toBe(5);
  });

  it('labels the no-origin bucket and never drops it', () => {
    const p = parseSourceAnalytics(
      payload([rpcRow(), rpcRow({ source_key: null, label: undefined, is_recorded: undefined })]),
    );
    const bucket = p.sources.find((r) => r.source_key === null);
    expect(bucket).toBeDefined();
    expect(bucket?.label).toBe('source not recorded');
    expect(bucket?.is_recorded).toBe(false);
  });

  it('supplies the standard footnotes when the payload carries none', () => {
    const p = parseSourceAnalytics({ sources: [] });
    expect(p.notes.hit_rate).toBe(ANALYTICS_FOOTNOTES.hit_rate);
    expect(p.notes.lift).toBe(ANALYTICS_FOOTNOTES.lift);
  });
});

describe('sortAnalyticsRows', () => {
  it('puts the no-origin bucket last however big it is — it is a gap, not a source', () => {
    const rows = parseSourceAnalytics(
      payload([
        rpcRow({ source_key: null, label: 'source not recorded', items_active: 900 }),
        rpcRow({ source_key: 'a', label: 'A', items_active: 5 }),
        rpcRow({ source_key: 'b', label: 'B', items_active: 50 }),
      ]),
    ).sources;
    expect(rows.map((r) => r.source_key)).toEqual(['b', 'a', null]);
  });

  it('is stable when called twice', () => {
    const rows = [rpcRow({ source_key: 'a', items_active: 3 }), rpcRow({ source_key: 'b', items_active: 3 })]
      .map((r) => parseSourceAnalytics(payload([r])).sources[0]);
    expect(sortAnalyticsRows(sortAnalyticsRows(rows)).map((r) => r.source_key)).toEqual(
      sortAnalyticsRows(rows).map((r) => r.source_key),
    );
  });
});

describe('the lift floor — ruling #9', () => {
  const cases = [0, 1, 2] as const;

  it.each(cases)('hides a lift computed from %i learners', (n) => {
    const row = parseSourceAnalytics(payload([rpcRow({ lift_learners: n, lift: null, lift_reason: 'too few' })]))
      .sources[0];
    expect(liftIsVisible(row, 3)).toBe(false);
    expect(formatLift(row, 3)).toBe('too few');
  });

  it('hides a lift even when the database HANDED one back, if the learner count is below the floor', () => {
    // Belt and braces: a database whose policy row went missing could compute a
    // two-learner "trend". The screen still refuses it.
    const row = parseSourceAnalytics(payload([rpcRow({ lift_learners: 2, lift: 0.4, lift_reason: null })]))
      .sources[0];
    expect(liftIsVisible(row, 3)).toBe(false);
    expect(formatLift(row, 3)).toMatch(/2 of the 3 learners/);
  });

  it('shows a lift at exactly the floor', () => {
    const row = parseSourceAnalytics(payload([rpcRow({ lift_learners: 3, lift: 0.05 })])).sources[0];
    expect(liftIsVisible(row, 3)).toBe(true);
    expect(formatLift(row, 3)).toBe('+5.0% on the paper');
  });

  it('shows a negative lift with its sign — the screen does not flatter a source', () => {
    const row = parseSourceAnalytics(payload([rpcRow({ lift_learners: 40, lift: -0.031 })])).sources[0];
    expect(formatLift(row, 3)).toBe('-3.1% on the paper');
  });

  it('applies a payload floor of 5 to a five-learner source', () => {
    const row = parseSourceAnalytics(payload([rpcRow({ lift_learners: 5, lift: 0.02 })], 5)).sources[0];
    expect(liftIsVisible(row, 5)).toBe(true);
    const four = parseSourceAnalytics(payload([rpcRow({ lift_learners: 4, lift: 0.02 })], 5)).sources[0];
    expect(liftIsVisible(four, 5)).toBe(false);
  });
});

describe('formatHitRate', () => {
  it('reads as a fraction and a percentage together', () => {
    const row = parseSourceAnalytics(payload([rpcRow({ hits_exact: 2, hits_near: 1, items_active: 12, hit_rate: 0.25 })]))
      .sources[0];
    expect(formatHitRate(row)).toBe('3 of 12 (25%)');
  });

  it('says zero hits plainly rather than hiding the row', () => {
    const row = parseSourceAnalytics(payload([rpcRow({ hits_exact: 0, hits_near: 0, hit_rate: 0 })])).sources[0];
    expect(formatHitRate(row)).toBe('0 of 12 (0%)');
  });

  it('refuses a rate when the source has no live questions, and says which case it is', () => {
    const allDrafts = parseSourceAnalytics(
      payload([rpcRow({ items_active: 0, items_total: 9, hit_rate: null })]),
    ).sources[0];
    expect(formatHitRate(allDrafts)).toMatch(/still a draft/);

    const empty = parseSourceAnalytics(
      payload([rpcRow({ items_active: 0, items_total: 0, hit_rate: null })]),
    ).sources[0];
    expect(formatHitRate(empty)).toMatch(/no questions from this source yet/);
  });

  it('still reports for a RETIRED source — retiring hides it from pickers, not from its own history', () => {
    const retired = parseSourceAnalytics(
      payload([rpcRow({ source_active: false, hits_exact: 4, hits_near: 0, items_active: 8, hit_rate: 0.5 })]),
    ).sources[0];
    expect(retired.source_active).toBe(false);
    expect(formatHitRate(retired)).toBe('4 of 8 (50%)');
  });
});

describe('formatAccuracy', () => {
  it('shows the percentage with the counts behind it', () => {
    const row = parseSourceAnalytics(payload([rpcRow()])).sources[0];
    expect(formatAccuracy(row)).toBe('75% (300 of 400)');
  });

  it('says "never served" rather than showing 0%', () => {
    const row = parseSourceAnalytics(
      payload([rpcRow({ times_served: 0, times_correct: 0, accuracy: null })]),
    ).sources[0];
    expect(formatAccuracy(row)).toBe('never served yet');
  });
});

describe('sourceVerdict — both halves or nothing', () => {
  function v(over: Partial<SourceAnalyticsRow>, min = 3) {
    return sourceVerdict(parseSourceAnalytics(payload([rpcRow(over)])).sources[0], min);
  }

  it('calls a source proven only when hits AND a positive lift are both present', () => {
    expect(v({ hits_exact: 2, lift: 0.1, lift_learners: 40 }).tone).toBe('worked');
  });

  it('refuses to call it proven on board hits alone', () => {
    expect(v({ hits_exact: 5, lift: null, lift_learners: 1 }).tone).toBe('unproven');
  });

  it('refuses to call it proven on a lift alone', () => {
    expect(v({ hits_exact: 0, hits_near: 0, lift: 0.2, lift_learners: 40 }).tone).toBe('mixed');
  });

  it('names the failing half when hits exist but the lift does not favour it', () => {
    expect(v({ hits_exact: 3, lift: -0.05, lift_learners: 40 }).tone).toBe('mixed');
  });

  it('says so when neither half holds', () => {
    expect(v({ hits_exact: 0, hits_near: 0, lift: -0.02, lift_learners: 40 }).tone).toBe('weak');
  });
});

describe('the empty states this lane must render honestly', () => {
  it('reports an empty bank as empty rather than as a measurement of zero', () => {
    const p = parseSourceAnalytics(
      payload([rpcRow({ items_total: 0, items_active: 0 }), rpcRow({ source_key: 'x', items_total: 0, items_active: 0 })]),
    );
    expect(analyticsIsEmpty(p)).toBe(true);
  });

  it('spots the production case: questions exist, but not one records where it came from', () => {
    const p = parseSourceAnalytics(
      payload([
        rpcRow({ source_key: null, label: 'source not recorded', items_total: 126, items_active: 1 }),
        rpcRow({ source_key: 'internal', items_total: 0, items_active: 0 }),
        rpcRow({ source_key: 'model_paper', items_total: 0, items_active: 0 }),
      ]),
    );
    expect(analyticsIsEmpty(p)).toBe(false);
    expect(everythingUnrecorded(p)).toBe(true);
  });

  it('stops calling it "all unrecorded" as soon as one question carries an origin', () => {
    const p = parseSourceAnalytics(
      payload([
        rpcRow({ source_key: null, items_total: 125, items_active: 1 }),
        rpcRow({ source_key: 'internal', items_total: 1, items_active: 1 }),
      ]),
    );
    expect(everythingUnrecorded(p)).toBe(false);
  });
});

describe('chartData', () => {
  it('leaves out sources with no live questions — a bar of nothing reads as a zero', () => {
    const p = parseSourceAnalytics(
      payload([rpcRow({ source_key: 'a', items_active: 4 }), rpcRow({ source_key: 'b', items_active: 0 })]),
    );
    expect(chartData(p).map((d) => d.key)).toEqual(['a']);
  });

  it('converts the two rates to percentages on ONE shared 0-100 scale', () => {
    const p = parseSourceAnalytics(payload([rpcRow({ hit_rate: 0.256, accuracy: 0.751 })]));
    expect(chartData(p)[0]).toMatchObject({ hit_rate_pct: 25.6, accuracy_pct: 75.1 });
  });

  it('passes a missing rate through as null rather than as 0', () => {
    const p = parseSourceAnalytics(payload([rpcRow({ hit_rate: null, accuracy: null, items_active: 3 })]));
    expect(chartData(p)[0]).toMatchObject({ hit_rate_pct: null, accuracy_pct: null });
  });

  it('keeps the no-origin bucket in the chart when it has live questions', () => {
    const p = parseSourceAnalytics(payload([rpcRow({ source_key: null, items_active: 40 })]));
    expect(chartData(p)[0].key).toBe('__unrecorded__');
    expect(chartData(p)[0].is_recorded).toBe(false);
  });
});
