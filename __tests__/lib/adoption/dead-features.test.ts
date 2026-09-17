/**
 * Adoption loop — the three headline numbers.
 *
 * fn_adoption_metrics answers ONE ROW PER FEATURE × INTENDED ROLE, so every
 * number on the adoption pages is a fold over that shape. These tests pin the
 * folding rules, because each one is a judgement that changes what the Director
 * is shown:
 *
 *   - "dead" needs BOTH age and a low weekly share. Without the age test a
 *     feature shipped on Monday reads as dead on Tuesday, and the loop starts
 *     proposing retirement for things that were never rolled out.
 *   - ONE role above the bar keeps a feature alive. It is working for somebody;
 *     the answer there is targeting, not retirement.
 *   - the bar is the WEEKLY share. All-time usage would let a feature everyone
 *     opened once in March look healthy forever.
 */
import { describe, it, expect } from 'vitest';
import {
  APP_WIDE_FEATURE_KEY,
  ASK_WHY_MIN_AGE_DAYS,
  DEAD_AFTER_DAYS,
  DEAD_WEEKLY_PCT,
  canAskWhy,
  daysSinceShipped,
  groupByFeature,
  isDeadFeature,
  isMeasured,
  shippedAgo,
  summariseAdoption,
  toNumber,
  type AdoptionMetricRow,
} from '@/lib/adoption/summarise';

/** A fixed "now" so an age never depends on the day the suite runs. */
const NOW = new Date('2026-09-16T06:30:00.000Z');

/** An ISO ship date exactly `days` before NOW. */
function shippedDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function row(overrides: Partial<AdoptionMetricRow> = {}): AdoptionMetricRow {
  return {
    feature_key: 'gate.pass_issue',
    title: 'Gate pass',
    module: 'gate',
    core_action: 'issue a gate pass',
    shipped_at: shippedDaysAgo(40),
    status: 'live',
    source_pr: 3842,
    role: 'hod',
    intended_count: 20,
    weekly_active: 0,
    ever_active: 0,
    pct_weekly: 0,
    pct_ever: 0,
    asked_count: 0,
    answers: {},
    week_start: '2026-09-14',
    usage_wired: true,
    ...overrides,
  };
}

describe('toNumber', () => {
  it('reads a Postgres numeric whether it arrives as a number or as text', () => {
    expect(toNumber(4.5)).toBe(4.5);
    expect(toNumber('4.5')).toBe(4.5);
    expect(toNumber('0')).toBe(0);
  });

  it('turns anything unreadable into 0 so no headline renders as NaN', () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber('not a number')).toBe(0);
    expect(toNumber(Number.NaN)).toBe(0);
    expect(toNumber(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('daysSinceShipped', () => {
  it('counts whole days', () => {
    expect(daysSinceShipped(shippedDaysAgo(0), NOW)).toBe(0);
    expect(daysSinceShipped(shippedDaysAgo(1), NOW)).toBe(1);
    expect(daysSinceShipped(shippedDaysAgo(28), NOW)).toBe(28);
  });

  it('clamps a future ship date to 0 rather than a negative age', () => {
    // A mis-typed date must never make a feature look old enough to judge.
    expect(daysSinceShipped(shippedDaysAgo(-10), NOW)).toBe(0);
  });

  it('treats an unreadable date as age 0', () => {
    expect(daysSinceShipped('whenever', NOW)).toBe(0);
  });

  it('renders the age in words', () => {
    expect(shippedAgo(shippedDaysAgo(0), NOW)).toBe('today');
    expect(shippedAgo(shippedDaysAgo(1), NOW)).toBe('1 day ago');
    expect(shippedAgo(shippedDaysAgo(12), NOW)).toBe('12 days ago');
  });
});

describe('groupByFeature', () => {
  it('collapses the per-role rows into one entry per feature', () => {
    const groups = groupByFeature([
      row({ role: 'hod' }),
      row({ role: 'principal' }),
      row({ feature_key: 'billing.receipt', title: 'Receipt', role: 'all' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].feature_key).toBe('gate.pass_issue');
    expect(groups[0].rows.map((r) => r.role)).toEqual(['hod', 'principal']);
    expect(groups[1].feature_key).toBe('billing.receipt');
  });

  it('keeps the order the database returned (newest shipped first)', () => {
    const groups = groupByFeature([
      row({ feature_key: 'b.new', shipped_at: shippedDaysAgo(2) }),
      row({ feature_key: 'a.old', shipped_at: shippedDaysAgo(90) }),
    ]);
    expect(groups.map((g) => g.feature_key)).toEqual(['b.new', 'a.old']);
  });

  it('excludes the app-wide sign-in line defensively', () => {
    // fn_adoption_metrics already filters it out. Repeating the exclusion here
    // means the arithmetic is right on ANY row set — including one built by
    // hand, or one from a future RPC that forgets the filter. Sign-ins are the
    // separate daily line, not a feature anyone adopts.
    const groups = groupByFeature([
      row({ feature_key: APP_WIDE_FEATURE_KEY, title: 'MyJKKN sign-in' }),
      row({ feature_key: 'gate.pass_issue' }),
    ]);
    expect(groups.map((g) => g.feature_key)).toEqual(['gate.pass_issue']);
  });

  it('drops a row with no feature key instead of grouping under an empty one', () => {
    const groups = groupByFeature([row({ feature_key: '' }), row()]);
    expect(groups).toHaveLength(1);
  });

  it('carries the per-feature ask count and answers, coercing text counts', () => {
    const groups = groupByFeature([
      row({ asked_count: '11', answers: { 'Did not know it exists': '7', 'Do not need it': 4 } }),
      row({ role: 'principal', asked_count: '11' }),
    ]);
    expect(groups[0].asked_count).toBe(11);
    expect(groups[0].answers).toEqual({ 'Did not know it exists': 7, 'Do not need it': 4 });
  });

  it('survives a null answers payload', () => {
    const groups = groupByFeature([row({ answers: null })]);
    expect(groups[0].answers).toEqual({});
  });
});

describe('isDeadFeature', () => {
  it('is dead when it is old enough and every role is under the bar', () => {
    const [group] = groupByFeature([
      row({ role: 'hod', pct_weekly: 0 }),
      row({ role: 'principal', pct_weekly: 4.9 }),
    ]);
    expect(isDeadFeature(group, NOW)).toBe(true);
  });

  it('is NOT dead at 10 days old with nobody using it — that is newness', () => {
    const [group] = groupByFeature([
      row({ shipped_at: shippedDaysAgo(10), pct_weekly: 0, weekly_active: 0, ever_active: 0 }),
    ]);
    expect(isDeadFeature(group, NOW)).toBe(false);
  });

  it('turns dead exactly on the 28th day, not the 27th', () => {
    const young = groupByFeature([
      row({ shipped_at: shippedDaysAgo(DEAD_AFTER_DAYS - 1), pct_weekly: 0 }),
    ])[0];
    const old = groupByFeature([
      row({ shipped_at: shippedDaysAgo(DEAD_AFTER_DAYS), pct_weekly: 0 }),
    ])[0];
    expect(isDeadFeature(young, NOW)).toBe(false);
    expect(isDeadFeature(old, NOW)).toBe(true);
  });

  it('keeps a feature alive when ONE role is at or above the bar', () => {
    // It is working for somebody. The answer is targeting, not retirement.
    const [group] = groupByFeature([
      row({ role: 'hod', pct_weekly: 0 }),
      row({ role: 'principal', pct_weekly: DEAD_WEEKLY_PCT }),
    ]);
    expect(isDeadFeature(group, NOW)).toBe(false);
  });

  it('judges the WEEKLY share, never the all-time one', () => {
    // Everyone opened it once in March and nobody has since. Alive by pct_ever,
    // dead by the only number that matters.
    const [group] = groupByFeature([row({ pct_weekly: 0, pct_ever: 100, ever_active: 20 })]);
    expect(isDeadFeature(group, NOW)).toBe(true);
  });

  it('reads a share that arrives as text', () => {
    const [group] = groupByFeature([row({ pct_weekly: '40.0' })]);
    expect(isDeadFeature(group, NOW)).toBe(false);
  });

  it('is not dead when it has no role rows at all', () => {
    expect(
      isDeadFeature(
        {
          feature_key: 'x.y',
          title: 'X',
          module: null,
          core_action: 'do it',
          shipped_at: shippedDaysAgo(90),
          status: 'live',
          source_pr: null,
          asked_count: 0,
          answers: {},
          usage_wired: true,
          rows: [],
        },
        NOW
      )
    ).toBe(false);
  });

  it('does NOT count a feature with nobody intended as dead — it is unmeasured, a labelling gap', () => {
    const [group] = groupByFeature([row({ intended_count: 0, pct_weekly: 0 })]);
    expect(isMeasured(group)).toBe(false);
    expect(isDeadFeature(group, NOW)).toBe(false);
  });

  it('does NOT count an unrecorded (unwired) feature as dead — zero use of an unrecorded key is not evidence', () => {
    const [group] = groupByFeature([row({ usage_wired: false, intended_count: 40, pct_weekly: 0 })]);
    expect(isMeasured(group)).toBe(false);
    expect(isDeadFeature(group, NOW)).toBe(false);
  });

  it('does NOT count an already-retired feature as dead — the Director decided', () => {
    const [group] = groupByFeature([row({ status: 'retired', intended_count: 40, pct_weekly: 0 })]);
    expect(isDeadFeature(group, NOW)).toBe(false);
  });

  it('judges only the roles that have intended people', () => {
    // One role nobody holds (0 intended) must not drag a working feature down
    // nor rescue a dead one.
    const [alive] = groupByFeature([
      row({ role: 'hod', intended_count: 20, pct_weekly: 40 }),
      row({ role: 'ghost', intended_count: 0, pct_weekly: 0 }),
    ]);
    expect(isDeadFeature(alive, NOW)).toBe(false);
    const [dead] = groupByFeature([
      row({ role: 'hod', intended_count: 20, pct_weekly: 1 }),
      row({ role: 'ghost', intended_count: 0, pct_weekly: 0 }),
    ]);
    expect(isDeadFeature(dead, NOW)).toBe(true);
  });
});

describe('isMeasured', () => {
  it('is measured when any role has intended people', () => {
    const [group] = groupByFeature([
      row({ role: 'hod', intended_count: 0 }),
      row({ role: 'principal', intended_count: 3 }),
    ]);
    expect(isMeasured(group)).toBe(true);
  });

  it('is not measured when every role is empty', () => {
    const [group] = groupByFeature([row({ intended_count: 0 })]);
    expect(isMeasured(group)).toBe(false);
  });
});

describe('canAskWhy', () => {
  it('mirrors the database’s own 14-day refusal', () => {
    const young = groupByFeature([
      row({ shipped_at: shippedDaysAgo(ASK_WHY_MIN_AGE_DAYS - 1) }),
    ])[0];
    const ready = groupByFeature([row({ shipped_at: shippedDaysAgo(ASK_WHY_MIN_AGE_DAYS) })])[0];
    expect(canAskWhy(young, NOW)).toBe(false);
    expect(canAskWhy(ready, NOW)).toBe(true);
  });
});

describe('summariseAdoption', () => {
  it('counts labelled, measured and dead over a mixed set', () => {
    const summary = summariseAdoption(
      [
        // Old and unused, two roles → dead.
        row({ feature_key: 'gate.pass_issue', role: 'hod', pct_weekly: 0 }),
        row({ feature_key: 'gate.pass_issue', role: 'principal', pct_weekly: 0 }),
        // Old and healthy → alive.
        row({ feature_key: 'billing.receipt', pct_weekly: 61, intended_count: 12 }),
        // Shipped this week, nobody yet → too young to judge.
        row({ feature_key: 'cdc.willingness', shipped_at: shippedDaysAgo(3), pct_weekly: 0 }),
        // Labelled, but nobody is intended to use it → not measured, so NOT
        // dead either: a labelling gap, not a retirement question.
        row({ feature_key: 'hr.norms', intended_count: 0, pct_weekly: 0 }),
        // The app-wide line is never a feature.
        row({ feature_key: APP_WIDE_FEATURE_KEY }),
      ],
      NOW
    );

    expect(summary.labelled).toBe(4);
    expect(summary.measured).toBe(3);
    expect(summary.dead).toBe(1);
    expect(summary.groups.map((g) => g.feature_key)).toEqual([
      'gate.pass_issue',
      'billing.receipt',
      'cdc.willingness',
      'hr.norms',
    ]);
  });

  it('answers zeroes for an empty read rather than throwing', () => {
    expect(summariseAdoption([], NOW)).toEqual({
      labelled: 0,
      measured: 0,
      dead: 0,
      groups: [],
    });
  });

  it('survives a null row set', () => {
    expect(summariseAdoption(null as unknown as AdoptionMetricRow[], NOW).labelled).toBe(0);
  });
});
