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
 *   - EXCEPT for a seasonal feature. A timetable is made at a term boundary, so
 *     a weekly bar calls it dead 50 weeks a year. A 'term' feature is judged on
 *     the LAST COMPLETED term — never the one running, which may not have
 *     reached its season yet — and only if it shipped before that term began.
 */
import { describe, it, expect } from 'vitest';
import {
  APP_WIDE_FEATURE_KEY,
  ASK_WHY_MIN_AGE_DAYS,
  DEAD_AFTER_DAYS,
  DEAD_WEEKLY_PCT,
  TERM_ASK_WINDOW_DAYS,
  activeShareLabel,
  canAskWhy,
  daysSinceShipped,
  groupByFeature,
  isDeadFeature,
  isMeasured,
  isSkipped,
  isTermFeature,
  shippedAgo,
  skippedGroups,
  summariseAdoption,
  toNumber,
  type AdoptionMetricRow,
  rollingWeekStart,
} from '@/lib/adoption/summarise';

/** A fixed "now" so an age never depends on the day the suite runs. */
const NOW = new Date('2026-09-16T06:30:00.000Z');

/** An ISO ship date exactly `days` before NOW. */
function shippedDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

/** A term boundary as a Postgres `date` ('YYYY-MM-DD'), `days` from NOW.
 *  Negative is in the past, positive is in the future. */
function termDay(days: number): string {
  return new Date(NOW.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** A seasonal feature: 'term' cadence, the running term around NOW, and the
 *  last completed term before it. Shipped well before that last term began, so
 *  by default it HAS had a full term to be used in and can be judged. */
function termRow(overrides: Partial<AdoptionMetricRow> = {}): AdoptionMetricRow {
  return row({
    feature_key: 'academic.timetable_publish',
    title: 'Publish a timetable',
    core_action: 'publish a timetable for a section',
    cadence: 'term',
    shipped_at: shippedDaysAgo(300),
    term_start: termDay(-60),
    term_end: termDay(30),
    prev_term_start: termDay(-240),
    prev_term_end: termDay(-61),
    ...overrides,
  });
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
    usage_bridged: false,
    usage_synced_at: null,
    // Weekly is the default cadence, and a weekly feature carries no term
    // numbers — exactly what an older row or a plain label sends.
    cadence: 'weekly',
    term_active: 0,
    pct_term: 0,
    term_start: null,
    term_end: null,
    prev_term_active: 0,
    pct_prev_term: 0,
    prev_term_start: null,
    prev_term_end: null,
    // No reason to skip: this one is measured like everything else.
    skip_reason: null,
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
          usage_bridged: false,
          usage_synced_at: null,
          cadence: 'weekly',
          term_start: null,
          term_end: null,
          prev_term_start: null,
          prev_term_end: null,
          skip_reason: null,
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

  it('does NOT count a bridged feature as dead while its log pull is stale (>7 days) or missing', () => {
    const never = groupByFeature([row({ usage_bridged: true, usage_synced_at: null, pct_weekly: 0 })])[0];
    expect(isDeadFeature(never, NOW)).toBe(false);
    const old = groupByFeature([
      row({ usage_bridged: true, usage_synced_at: shippedDaysAgo(9), pct_weekly: 0 }),
    ])[0];
    expect(isDeadFeature(old, NOW)).toBe(false);
    const fresh = groupByFeature([
      row({ usage_bridged: true, usage_synced_at: shippedDaysAgo(1), pct_weekly: 0 }),
    ])[0];
    expect(isDeadFeature(fresh, NOW)).toBe(true);
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

describe('term cadence', () => {
  it('carries the cadence and BOTH term windows onto the feature', () => {
    const [seasonal] = groupByFeature([termRow()]);
    expect(seasonal.cadence).toBe('term');
    expect(seasonal.term_start).toBe(termDay(-60));
    expect(seasonal.term_end).toBe(termDay(30));
    expect(seasonal.prev_term_start).toBe(termDay(-240));
    expect(seasonal.prev_term_end).toBe(termDay(-61));
    expect(isTermFeature(seasonal)).toBe(true);
    expect(activeShareLabel(seasonal)).toBe('This term');
  });

  it('defaults to weekly when the cadence is missing or unreadable', () => {
    // An older row, or anything that is not the word 'term', must read as the
    // old default. Reading it as seasonal would silently suspend the dead rule.
    const [absent] = groupByFeature([row({ cadence: undefined })]);
    const [nulled] = groupByFeature([row({ cadence: null })]);
    const [nonsense] = groupByFeature([
      row({ cadence: 'yearly' as unknown as 'weekly' }),
    ]);
    expect([absent.cadence, nulled.cadence, nonsense.cadence]).toEqual([
      'weekly',
      'weekly',
      'weekly',
    ]);
    expect(activeShareLabel(absent)).toBe('Last 7 days');
  });

  it('is NOT judged on the running term, however low it reads', () => {
    // The whole point of the ruling. A timetable is made at a term boundary;
    // week three of the running term says nothing about whether it is used.
    const [group] = groupByFeature([
      termRow({ role: 'hod', pct_term: 0, term_active: 0, pct_prev_term: 60 }),
      termRow({ role: 'principal', pct_term: 0, term_active: 0, pct_prev_term: 45 }),
    ]);
    expect(isDeadFeature(group, NOW)).toBe(false);
  });

  it('IS dead when it had a full last term and nobody used it', () => {
    const [group] = groupByFeature([
      termRow({ role: 'hod', pct_prev_term: 0 }),
      termRow({ role: 'principal', pct_prev_term: 4.9 }),
    ]);
    expect(isDeadFeature(group, NOW)).toBe(true);
  });

  it('is NOT dead when it shipped part-way through the last term', () => {
    // It never had a full term to be used in, so a zero there is newness —
    // the same judgement the 28-day rule makes for a weekly feature.
    const [group] = groupByFeature([
      termRow({ shipped_at: shippedDaysAgo(120), pct_prev_term: 0 }),
    ]);
    expect(isDeadFeature(group, NOW)).toBe(false);
  });

  it('turns dead only if it shipped BEFORE the last term began', () => {
    const during = groupByFeature([
      termRow({ shipped_at: shippedDaysAgo(239), pct_prev_term: 0 }),
    ])[0];
    const before = groupByFeature([
      termRow({ shipped_at: shippedDaysAgo(241), pct_prev_term: 0 }),
    ])[0];
    expect(isDeadFeature(during, NOW)).toBe(false);
    expect(isDeadFeature(before, NOW)).toBe(true);
  });

  it('keeps it alive when ONE role used it last term', () => {
    const [group] = groupByFeature([
      termRow({ role: 'hod', pct_prev_term: 0 }),
      termRow({ role: 'principal', pct_prev_term: 20, prev_term_active: 4 }),
    ]);
    expect(isDeadFeature(group, NOW)).toBe(false);
  });

  it('judges the last term, never the running one and never the week', () => {
    // Nothing yet this term, but it was used last term: alive.
    const [usedLastTerm] = groupByFeature([
      termRow({ pct_weekly: 0, pct_term: 0, pct_prev_term: 85, prev_term_active: 17 }),
    ]);
    expect(isDeadFeature(usedLastTerm, NOW)).toBe(false);
    // Busy this week and this term, but it went unused for the whole of last
    // term: dead. The running term cannot rescue it either.
    const [busyNowUnusedThen] = groupByFeature([
      termRow({ pct_weekly: 100, pct_term: 100, term_active: 20, pct_prev_term: 0 }),
    ]);
    expect(isDeadFeature(busyNowUnusedThen, NOW)).toBe(true);
  });

  it('is never dead when no last term is known', () => {
    // Better a feature nobody judges than a retirement proposal built on a
    // missing date.
    const [group] = groupByFeature([
      termRow({ prev_term_start: null, prev_term_end: null, pct_prev_term: 0 }),
    ]);
    expect(isDeadFeature(group, NOW)).toBe(false);
  });

  it('still obeys the retired, unwired and stale rules', () => {
    const retired = groupByFeature([termRow({ status: 'retired', pct_prev_term: 0 })])[0];
    const unwired = groupByFeature([termRow({ usage_wired: false, pct_prev_term: 0 })])[0];
    const stale = groupByFeature([
      termRow({
        usage_bridged: true,
        usage_synced_at: shippedDaysAgo(9),
        pct_prev_term: 0,
      }),
    ])[0];
    expect(isDeadFeature(retired, NOW)).toBe(false);
    expect(isDeadFeature(unwired, NOW)).toBe(false);
    expect(isDeadFeature(stale, NOW)).toBe(false);
  });

  it('leaves a weekly feature judged by the week, whatever the term columns say', () => {
    const [group] = groupByFeature([
      row({ pct_weekly: 0, pct_term: 90, term_active: 18, pct_prev_term: 90 }),
    ]);
    expect(isDeadFeature(group, NOW)).toBe(true);
  });
});

describe('skipped on purpose', () => {
  it('carries the reason onto the feature and recognises it', () => {
    const [group] = groupByFeature([
      row({ feature_key: 'ops.nightly_rollup', skip_reason: 'a cron job, nobody opens it' }),
    ]);
    expect(group.skip_reason).toBe('a cron job, nobody opens it');
    expect(isSkipped(group)).toBe(true);
  });

  it('treats no reason, and a blank one, as not skipped', () => {
    // The database stores NULLIF(btrim(...), ''), so a blank only arrives from
    // a hand-built row — and it must not hide a real feature with no reason
    // shown anywhere.
    expect(isSkipped(groupByFeature([row({ skip_reason: null })])[0])).toBe(false);
    expect(isSkipped(groupByFeature([row({ skip_reason: undefined })])[0])).toBe(false);
    expect(isSkipped(groupByFeature([row({ skip_reason: '   ' })])[0])).toBe(false);
  });

  it('is never dead and never asked about, however old and unused', () => {
    // Both mirror the database: fn_adoption_ask_why refuses a skipped feature
    // outright, and a thing nobody was meant to open cannot be abandoned.
    const [group] = groupByFeature([
      row({ shipped_at: shippedDaysAgo(400), pct_weekly: 0, skip_reason: 'a public form' }),
    ]);
    expect(isDeadFeature(group, NOW)).toBe(false);
    expect(canAskWhy(group, NOW)).toBe(false);
  });

  it('is never dead when seasonal either, however the last term went', () => {
    const [group] = groupByFeature([
      termRow({ pct_prev_term: 0, skip_reason: 'run by one person' }),
    ]);
    expect(isDeadFeature(group, NOW)).toBe(false);
  });

  it('is kept out of all three headline numbers', () => {
    const summary = summariseAdoption(
      [
        row({ feature_key: 'gate.pass_issue', pct_weekly: 0 }), // dead
        row({ feature_key: 'billing.receipt', pct_weekly: 61 }), // alive
        row({ feature_key: 'ops.nightly_rollup', pct_weekly: 0, skip_reason: 'a cron job' }),
        row({ feature_key: 'public.enquiry', pct_weekly: 0, skip_reason: 'a public form' }),
      ],
      NOW
    );
    // Two judged features, not four: a skipped one is neither an unmeasured
    // gap nor a retirement question.
    expect(summary.labelled).toBe(2);
    expect(summary.measured).toBe(2);
    expect(summary.dead).toBe(1);
  });

  it('still returns every group, so the page can list what was skipped', () => {
    const summary = summariseAdoption(
      [
        row({ feature_key: 'gate.pass_issue' }),
        row({ feature_key: 'ops.nightly_rollup', skip_reason: 'a cron job' }),
      ],
      NOW
    );
    expect(summary.groups).toHaveLength(2);
    expect(skippedGroups(summary.groups).map((g) => g.feature_key)).toEqual([
      'ops.nightly_rollup',
    ]);
  });

  it('answers an empty list when nothing is skipped, and survives a null one', () => {
    expect(skippedGroups(groupByFeature([row()]))).toEqual([]);
    expect(skippedGroups(null as unknown as ReturnType<typeof groupByFeature>)).toEqual([]);
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

  it('holds a term feature’s question until the last two weeks of term', () => {
    // "Why have you not made next term's timetable?" has no honest answer in
    // week three. The database only sends it near the boundary; the button is
    // disabled on the same rule so the refusal is visible before the tap.
    const earlyTerm = groupByFeature([termRow({ term_end: termDay(30) })])[0];
    const nearEnd = groupByFeature([termRow({ term_end: termDay(10) })])[0];
    expect(canAskWhy(earlyTerm, NOW)).toBe(false);
    expect(canAskWhy(nearEnd, NOW)).toBe(true);
  });

  it('opens the term window on the day the database opens it, not a day later', () => {
    // fn_adoption_ask_why refuses while `today < term_end - 14`, so the day
    // exactly 14 out is ALLOWED. Mirroring it a day tighter would grey out a
    // button the database would have accepted — a refusal with no refusal.
    const open = groupByFeature([termRow({ term_end: termDay(TERM_ASK_WINDOW_DAYS) })])[0];
    const shut = groupByFeature([termRow({ term_end: termDay(TERM_ASK_WINDOW_DAYS + 1) })])[0];
    expect(canAskWhy(open, NOW)).toBe(true);
    expect(canAskWhy(shut, NOW)).toBe(false);
  });

  it('keeps asking after the term has ended', () => {
    const finished = groupByFeature([termRow({ term_end: termDay(-1) })])[0];
    expect(canAskWhy(finished, NOW)).toBe(true);
  });

  it('never asks a term feature with no term window, and never one too new', () => {
    const noWindow = groupByFeature([termRow({ term_start: null, term_end: null })])[0];
    const tooNew = groupByFeature([
      termRow({ shipped_at: shippedDaysAgo(ASK_WHY_MIN_AGE_DAYS - 1), term_end: termDay(1) }),
    ])[0];
    expect(canAskWhy(noWindow, NOW)).toBe(false);
    expect(canAskWhy(tooNew, NOW)).toBe(false);
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

describe('rollingWeekStart', () => {
  it('names the day six days before today in India, so the window always covers seven days', () => {
    // 2026-09-22 05:09 IST is 2026-09-21 23:39 UTC — the IST day is the 22nd.
    expect(rollingWeekStart(new Date('2026-09-21T23:39:00Z'))).toBe('2026-09-16');
  });

  it('uses the Indian day, not the UTC one, late in the evening', () => {
    // 2026-09-22 23:30 IST is still 2026-09-22 in India (18:00 UTC).
    expect(rollingWeekStart(new Date('2026-09-22T18:00:00Z'))).toBe('2026-09-16');
  });

  it('moves with the clock rather than jumping on Mondays', () => {
    const mon = rollingWeekStart(new Date('2026-09-21T06:00:00Z'));
    const tue = rollingWeekStart(new Date('2026-09-22T06:00:00Z'));
    expect(mon).toBe('2026-09-15');
    expect(tue).toBe('2026-09-16');
  });
});
