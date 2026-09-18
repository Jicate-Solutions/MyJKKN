/**
 * The two top numbers — T1 (defect hours) and T2 (adoption share).
 *
 * Director rulings 2026-09-18 (06:24, 06:27). What these tests actually guard
 * is the honesty of the two numbers, not their arithmetic:
 *
 *  * A number that cannot be computed must come back NULL with a reason. A
 *    zero would read on /admin/loops as "a week with no defects" or "nothing
 *    is used" — the fabricated-metric bug class, which no type or build gate
 *    can catch.
 *  * T1 must never be half a number. When Sentry cannot be read, the bug half
 *    is still computable — and reporting it alone would look like a real fall.
 *  * A feature nobody records usage for must NOT sit in T2's denominator:
 *    "shipped and unmeasured" is not "shipped and unused".
 */
import { describe, it, expect, vi } from 'vitest';
import {
  computeAdoptionShare,
  computeDefectHours,
  isCronGroup,
  isUserFacingLevel,
  lastCompleteIsoWeek,
  T1_MINUTES_PER_AFFECTED_USER,
  T1_MINUTES_PER_REPORTER,
  T2_INSUFFICIENT_GAP,
  TOP_ADOPTION_SHARE_KEY,
  TOP_DEFECT_HOURS_KEY,
  type IsoWeek,
  type SentryReader,
} from '@/lib/services/loops/top-numbers';

type Admin = Parameters<typeof computeDefectHours>[0];

const WEEK: IsoWeek = lastCompleteIsoWeek(new Date('2026-09-14T09:11:00+05:30'));

// ── T1 stand-in: bug_reports is read as a HEAD count, never a page of rows ───
function makeT1Admin(opts: { bugCount?: number | null; bugError?: string }) {
  const head = vi.fn(async () => ({
    count: opts.bugError ? null : (opts.bugCount ?? 0),
    error: opts.bugError ? { message: opts.bugError } : null,
  }));
  const chain = {
    not: () => chain,
    is: () => chain,
    lte: () => head(),
  };
  const from = vi.fn(() => ({ select: () => chain }));
  return { from } as unknown as Admin;
}

const sentryOk =
  (groups: Array<Record<string, unknown>>): SentryReader =>
  async () => ({ groups: groups as never });
const sentryDown =
  (reason: string): SentryReader =>
  async () => ({ error: reason });

describe('lastCompleteIsoWeek', () => {
  it('returns the Monday-to-Sunday week that has already ENDED, in IST', () => {
    // Monday 14 Sep 2026, 09:11 IST — the completed week is 7-13 Sep.
    expect(WEEK.startDay).toBe('2026-09-07');
    expect(WEEK.endDay).toBe('2026-09-13');
    expect(WEEK.label).toBe('2026-W37');
  });

  it('does not slide into the current week midweek', () => {
    const w = lastCompleteIsoWeek(new Date('2026-09-17T23:30:00+05:30'));
    expect(w.startDay).toBe('2026-09-07');
    expect(w.endDay).toBe('2026-09-13');
  });

  it('reads a late-evening IST instant as the IST day, not the UTC one', () => {
    // 23:30 IST Sunday is still 18:00 UTC Sunday — both land in the same week.
    const w = lastCompleteIsoWeek(new Date('2026-09-13T23:30:00+05:30'));
    expect(w.startDay).toBe('2026-08-31');
    expect(w.endDay).toBe('2026-09-06');
  });
});

describe('T1 group filters', () => {
  it('counts only error and fatal — a warning is not lost time', () => {
    expect(isUserFacingLevel({ id: '1', level: 'error' })).toBe(true);
    expect(isUserFacingLevel({ id: '2', level: 'fatal' })).toBe(true);
    expect(isUserFacingLevel({ id: '3', level: 'warning' })).toBe(false);
    expect(isUserFacingLevel({ id: '4', level: null })).toBe(false);
  });

  it("excludes a cron route's own errors — no user was sitting there", () => {
    expect(isCronGroup({ id: '1', culprit: 'GET /api/cron/loops-regress' })).toBe(true);
    expect(isCronGroup({ id: '2', culprit: 'GET /api/learners/attendance' })).toBe(false);
  });
});

describe('computeDefectHours (T1)', () => {
  it('computes hours from affected users and open reporters', async () => {
    const admin = makeT1Admin({ bugCount: 12 });
    const reading = await computeDefectHours(
      admin,
      sentryOk([
        { id: 'a', level: 'error', culprit: 'GET /learners', userCount: 30 },
        { id: 'b', level: 'fatal', culprit: 'POST /billing', userCount: 9 },
        { id: 'c', level: 'warning', culprit: 'GET /learners', userCount: 500 }, // not counted
        { id: 'd', level: 'error', culprit: 'GET /api/cron/sentry-lane-2', userCount: 400 }, // not counted
      ]),
      WEEK
    );

    const expectedMinutes = 39 * T1_MINUTES_PER_AFFECTED_USER + 12 * T1_MINUTES_PER_REPORTER;
    expect(reading.loopKey).toBe(TOP_DEFECT_HOURS_KEY);
    expect(reading.value).toBeCloseTo(expectedMinutes / 60, 2);

    const run = JSON.parse(reading.runId);
    expect(run.week).toBe('2026-W37');
    expect(run.sentry.affected_users).toBe(39);
    expect(run.sentry.groups_counted).toBe(2);
    expect(run.bugs.reporters).toBe(12);
    // The constants MUST travel with the measurement so a later recalibration
    // never rewrites this reading.
    expect(run.constants.sentry_minutes_per_affected_user).toBe(T1_MINUTES_PER_AFFECTED_USER);
    expect(run.constants.bug_minutes_per_reporter).toBe(T1_MINUTES_PER_REPORTER);
  });

  it('records NULL with the spec sentence when the Sentry token is unset', async () => {
    const admin = makeT1Admin({ bugCount: 40 });
    const reading = await computeDefectHours(
      admin,
      sentryDown('SENTRY_READ_TOKEN not set'),
      WEEK
    );
    expect(reading.value).toBeNull();
    expect(reading.gap).toBe('insufficient — SENTRY_READ_TOKEN not set');
    // Half a number is not the number — but the half it DID compute is kept.
    const run = JSON.parse(reading.runId);
    expect(run.sentry.read).toBe(false);
    expect(run.bugs.reporters).toBe(40);
  });

  it('records NULL carrying the HTTP error when the Sentry call fails', async () => {
    const admin = makeT1Admin({ bugCount: 3 });
    const reading = await computeDefectHours(
      admin,
      sentryDown('Sentry read failed: HTTP 403 forbidden'),
      WEEK
    );
    expect(reading.value).toBeNull();
    expect(reading.gap).toContain('HTTP 403');
  });

  it('records NULL — never a Sentry-only number — when bug_reports cannot be read', async () => {
    const admin = makeT1Admin({ bugError: 'permission denied for table bug_reports' });
    const reading = await computeDefectHours(
      admin,
      sentryOk([{ id: 'a', level: 'error', userCount: 100 }]),
      WEEK
    );
    expect(reading.value).toBeNull();
    expect(reading.gap).toContain('bug_reports could not be read');
  });
});

// ── T2 stand-in ─────────────────────────────────────────────────────────────
function makeT2Admin(opts: {
  features?: Array<{ feature_key: string; title?: string; intended_roles: string[] }>;
  featuresError?: string;
  people?: Array<{ user_id: string; role: string | null }>;
  usage?: Array<{ user_id: string; feature_key: string }>;
}) {
  const from = vi.fn((table: string) => {
    if (table === 'feature_registry') {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        eq: self,
        neq: self,
        lte: async () => ({
          data: opts.featuresError ? null : (opts.features ?? []),
          error: opts.featuresError ? { message: opts.featuresError } : null,
        }),
      });
      return { select: () => chain };
    }
    // feature_usage — paged with .range()
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      in: self,
      gte: self,
      lte: self,
      order: self,
      range: async (fromRow: number) => ({
        data: fromRow === 0 ? (opts.usage ?? []) : [],
        error: null,
      }),
    });
    return { select: () => chain };
  });

  const rpc = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      order: () => chain,
      range: async (fromRow: number) => ({
        data: fromRow === 0 ? (opts.people ?? []) : [],
        error: null,
      }),
    });
    return chain;
  });

  return { from, rpc } as unknown as Parameters<typeof computeAdoptionShare>[0];
}

describe('computeAdoptionShare (T2)', () => {
  it('says "insufficient — usage record not live" when no feature is wired yet', async () => {
    const reading = await computeAdoptionShare(makeT2Admin({ features: [] }), WEEK);
    expect(reading.loopKey).toBe(TOP_ADOPTION_SHARE_KEY);
    expect(reading.value).toBeNull();
    expect(reading.gap).toBe(T2_INSUFFICIENT_GAP);
    expect(JSON.parse(reading.runId).measured).toBe(false);
  });

  it('stays insufficient — never 0% — when the registry cannot be read', async () => {
    const reading = await computeAdoptionShare(
      makeT2Admin({ featuresError: 'relation "feature_registry" does not exist' }),
      WEEK
    );
    expect(reading.value).toBeNull();
    expect(reading.gap).toContain(T2_INSUFFICIENT_GAP);
  });

  it('computes the share of features clearing 20% of an intended role', async () => {
    const people = [
      { user_id: 'f1', role: 'faculty' },
      { user_id: 'f2', role: 'faculty' },
      { user_id: 'f3', role: 'faculty' },
      { user_id: 'f4', role: 'faculty' },
      { user_id: 'l1', role: 'learner' },
      { user_id: 'l2', role: 'learner' },
    ];
    const reading = await computeAdoptionShare(
      makeT2Admin({
        features: [
          { feature_key: 'academic.mark_attendance', intended_roles: ['faculty'] },
          { feature_key: 'learners.view_timetable', intended_roles: ['learner'] },
        ],
        people,
        usage: [
          // 2 of 4 faculty = 50% → clears the bar
          { user_id: 'f1', feature_key: 'academic.mark_attendance' },
          { user_id: 'f2', feature_key: 'academic.mark_attendance' },
          // 0 of 2 learners = 0% → misses it
        ],
      }),
      WEEK
    );

    expect(reading.value).toBe(50);
    const run = JSON.parse(reading.runId);
    expect(run.measurable_features).toBe(2);
    expect(run.used_features).toBe(1);
    expect(run.constants.used_share_pct).toBe(20);
    const attendance = run.per_feature.find(
      (f: { feature_key: string }) => f.feature_key === 'academic.mark_attendance'
    );
    expect(attendance.best_pct).toBe(50);
  });

  it('drops a feature whose intended role matches nobody instead of calling it unused', async () => {
    const reading = await computeAdoptionShare(
      makeT2Admin({
        features: [
          { feature_key: 'academic.mark_attendance', intended_roles: ['faculty'] },
          { feature_key: 'ghost.feature', intended_roles: ['role_nobody_holds'] },
        ],
        people: [
          { user_id: 'f1', role: 'faculty' },
          { user_id: 'f2', role: 'faculty' },
        ],
        usage: [{ user_id: 'f1', feature_key: 'academic.mark_attendance' }],
      }),
      WEEK
    );
    // 1 of 1 MEASURABLE feature cleared the bar — the ghost is not a zero.
    expect(reading.value).toBe(100);
    expect(JSON.parse(reading.runId).measurable_features).toBe(1);
  });

  it("treats an empty intended_roles list as 'all'", async () => {
    const reading = await computeAdoptionShare(
      makeT2Admin({
        features: [{ feature_key: 'platform.thing', intended_roles: [] }],
        people: [
          { user_id: 'a', role: 'faculty' },
          { user_id: 'b', role: 'learner' },
          { user_id: 'c', role: 'learner' },
          { user_id: 'd', role: 'learner' },
        ],
        usage: [{ user_id: 'a', feature_key: 'platform.thing' }],
      }),
      WEEK
    );
    // 1 of 4 people = 25% ≥ 20% → the one feature counts as used.
    expect(reading.value).toBe(100);
  });
});
