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
  loadTopNumberConstants,
  T1_MINUTES_PER_AFFECTED_USER,
  T1_MINUTES_PER_REPORTER,
  T2_INSUFFICIENT_GAP,
  TOP_ADOPTION_SHARE_KEY,
  TOP_DEFECT_HOURS_KEY,
  TOP_NUMBER_FALLBACKS,
  TOP_NUMBER_POLICY_KEYS,
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
  async () => ({ groups: groups as never, tokenSource: 'SENTRY_READ_TOKEN' });
const sentryDown =
  (reason: string): SentryReader =>
  async () => ({ error: reason, tokenSource: 'SENTRY_READ_TOKEN' });
/** The already-configured production token, used because no read-only one exists. */
const sentryOnFallback =
  (groups: Array<Record<string, unknown>>): SentryReader =>
  async () => ({ groups: groups as never, tokenSource: 'SENTRY_AUTH_TOKEN (fallback)' });

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
type PersonRow = { user_id: string; role: string | null };
type UsageRow = { user_id: string; feature_key: string };

/**
 * The stand-in also RECORDS the columns each paged read sorts on.
 *
 * Offset paging (`.range()`) only returns every row exactly once when the sort
 * is a total order. Both of T2's paged reads have thousands of rows sharing a
 * user_id, so sorting on user_id alone lets PostgreSQL return a tied row twice
 * and another never — a silent under- or over-count. The sort columns are
 * therefore asserted directly, and the pages below are also made to OVERLAP on
 * a tie so the count is checked to be exact even when a page repeats a row.
 */
function makeT2Admin(opts: {
  features?: Array<{ feature_key: string; title?: string; intended_roles: string[] }>;
  featuresError?: string;
  people?: PersonRow[];
  peoplePages?: PersonRow[][];
  usage?: UsageRow[];
  usagePages?: UsageRow[][];
}) {
  const orderedBy = { people: [] as string[], usage: [] as string[] };
  const pageOf = <T,>(pages: T[][] | undefined, single: T[] | undefined, fromRow: number): T[] => {
    if (pages) return pages[Math.floor(fromRow / 1000)] ?? [];
    return fromRow === 0 ? (single ?? []) : [];
  };

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
      order: (col: string) => {
        orderedBy.usage.push(col);
        return chain;
      },
      range: async (fromRow: number) => ({
        data: pageOf(opts.usagePages, opts.usage, fromRow),
        error: null,
      }),
    });
    return { select: () => chain };
  });

  const rpc = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      order: (col: string) => {
        orderedBy.people.push(col);
        return chain;
      },
      range: async (fromRow: number) => ({
        data: pageOf(opts.peoplePages, opts.people, fromRow),
        error: null,
      }),
    });
    return chain;
  });

  const admin = { from, rpc } as unknown as Parameters<typeof computeAdoptionShare>[0];
  return Object.assign(admin, { __orderedBy: orderedBy }) as typeof admin & {
    __orderedBy: typeof orderedBy;
  };
}

/** A stand-in for the platform_policies read that resolves the five dials. */
function makePolicyAdmin(
  rows: Array<{ policy_key: string; value: unknown }> | { reject: string }
) {
  const from = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      in: self,
      eq: () => ({
        then: (
          ok: (r: { data: unknown }) => unknown,
          fail: (e: unknown) => unknown
        ) =>
          'reject' in rows
            ? Promise.resolve(fail(new Error(rows.reject)))
            : Promise.resolve(ok({ data: rows })),
      }),
    });
    return { select: () => chain };
  });
  return { from } as unknown as Parameters<typeof loadTopNumberConstants>[0];
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

// ── The five dials live in platform_policies, not in this file ──────────────
// House rule: docs/architecture/config-table-pattern.md. The spec says these
// numbers WILL be recalibrated, so a recalibration must not need a deploy —
// and a reading must still carry the values it was actually computed with.
describe('loadTopNumberConstants', () => {
  it('reads all six policy rows', async () => {
    const admin = makePolicyAdmin([
      { policy_key: TOP_NUMBER_POLICY_KEYS.t1MinutesPerAffectedUser, value: 7 },
      { policy_key: TOP_NUMBER_POLICY_KEYS.t1MinutesPerReporter, value: 11 },
      { policy_key: TOP_NUMBER_POLICY_KEYS.t1BugMinAgeDays, value: 3 },
      { policy_key: TOP_NUMBER_POLICY_KEYS.t2UsedSharePct, value: 35 },
      { policy_key: TOP_NUMBER_POLICY_KEYS.t2MinAgeDays, value: 21 },
      { policy_key: TOP_NUMBER_POLICY_KEYS.t2ExcludedFeatureKeys, value: ['app.login', 'x.y'] },
    ]);
    expect(await loadTopNumberConstants(admin)).toEqual({
      t1MinutesPerAffectedUser: 7,
      t1MinutesPerReporter: 11,
      t1BugMinAgeDays: 3,
      t2UsedSharePct: 35,
      t2MinAgeDays: 21,
      t2ExcludedFeatureKeys: ['app.login', 'x.y'],
    });
  });

  it('falls back per key — an absent or malformed row never yields a nonsense number', async () => {
    const admin = makePolicyAdmin([
      { policy_key: TOP_NUMBER_POLICY_KEYS.t1MinutesPerAffectedUser, value: 9 },
      { policy_key: TOP_NUMBER_POLICY_KEYS.t2UsedSharePct, value: 'not a number' },
      { policy_key: TOP_NUMBER_POLICY_KEYS.t2ExcludedFeatureKeys, value: 'app.login' },
    ]);
    const k = await loadTopNumberConstants(admin);
    expect(k.t1MinutesPerAffectedUser).toBe(9);
    expect(k.t2UsedSharePct).toBe(TOP_NUMBER_FALLBACKS.t2UsedSharePct);
    expect(k.t1MinutesPerReporter).toBe(TOP_NUMBER_FALLBACKS.t1MinutesPerReporter);
    expect(k.t2ExcludedFeatureKeys).toEqual(TOP_NUMBER_FALLBACKS.t2ExcludedFeatureKeys);
  });

  it('accepts zero — a bug age of 0 days is a legitimate retune, not a bad row', async () => {
    const admin = makePolicyAdmin([
      { policy_key: TOP_NUMBER_POLICY_KEYS.t1BugMinAgeDays, value: 0 },
    ]);
    expect((await loadTopNumberConstants(admin)).t1BugMinAgeDays).toBe(0);
  });

  it('falls back to every in-code default when the policy table cannot be read', async () => {
    const admin = makePolicyAdmin({ reject: 'permission denied for table platform_policies' });
    expect(await loadTopNumberConstants(admin)).toEqual(TOP_NUMBER_FALLBACKS);
  });
});

describe('the numbers are computed with the RESOLVED constants', () => {
  it('T1 uses the policy minutes and records them, not the in-code defaults', async () => {
    const admin = makeT1Admin({ bugCount: 10 });
    const reading = await computeDefectHours(
      admin,
      sentryOk([{ id: 'a', level: 'error', culprit: 'GET /learners', userCount: 60 }]),
      WEEK,
      { ...TOP_NUMBER_FALLBACKS, t1MinutesPerAffectedUser: 10, t1MinutesPerReporter: 30 }
    );
    // 60 × 10 + 10 × 30 = 900 min = 15 h. On the in-code defaults it would be 2.83 h.
    expect(reading.value).toBe(15);
    const run = JSON.parse(reading.runId);
    expect(run.constants.sentry_minutes_per_affected_user).toBe(10);
    expect(run.constants.bug_minutes_per_reporter).toBe(30);
    expect(reading.gap).toContain('10 min each');
  });

  it('T2 uses the policy bar — 25% clears 20 but misses 30', async () => {
    const setup = {
      features: [{ feature_key: 'academic.mark_attendance', intended_roles: ['faculty'] }],
      people: [
        { user_id: 'f1', role: 'faculty' },
        { user_id: 'f2', role: 'faculty' },
        { user_id: 'f3', role: 'faculty' },
        { user_id: 'f4', role: 'faculty' },
      ],
      usage: [{ user_id: 'f1', feature_key: 'academic.mark_attendance' }],
    };
    const at20 = await computeAdoptionShare(makeT2Admin(setup), WEEK, TOP_NUMBER_FALLBACKS);
    const at30 = await computeAdoptionShare(makeT2Admin(setup), WEEK, {
      ...TOP_NUMBER_FALLBACKS,
      t2UsedSharePct: 30,
    });
    expect(at20.value).toBe(100);
    expect(at30.value).toBe(0);
    expect(JSON.parse(at30.runId).constants.used_share_pct).toBe(30);
  });
});

// ── The exclusion is a policy row, not a silent filter ──────────────────────
describe('T2 excluded feature keys', () => {
  const twoFeatures = {
    features: [
      { feature_key: 'app.login', intended_roles: ['all'] },
      { feature_key: 'academic.mark_attendance', intended_roles: ['faculty'] },
    ],
    people: [
      { user_id: 'f1', role: 'faculty' },
      { user_id: 'f2', role: 'faculty' },
    ],
    // Everybody signs in; nobody marks attendance.
    usage: [
      { user_id: 'f1', feature_key: 'app.login' },
      { user_id: 'f2', feature_key: 'app.login' },
    ],
  };

  it("leaves app.login out by default — it is the sign-in line, not a shipped feature", async () => {
    const reading = await computeAdoptionShare(makeT2Admin(twoFeatures), WEEK);
    // Only mark-attendance is measured, and nobody used it.
    expect(reading.value).toBe(0);
    const run = JSON.parse(reading.runId);
    expect(run.measurable_features).toBe(1);
    // The exclusion travels WITH the measurement — nobody has to read the code.
    expect(run.constants.excluded_feature_keys).toEqual(['app.login']);
  });

  it('counts every key when the Director empties the exclusion list', async () => {
    const reading = await computeAdoptionShare(makeT2Admin(twoFeatures), WEEK, {
      ...TOP_NUMBER_FALLBACKS,
      t2ExcludedFeatureKeys: [],
    });
    // Both features measured; sign-in cleared the bar, attendance did not.
    expect(reading.value).toBe(50);
    expect(JSON.parse(reading.runId).measurable_features).toBe(2);
  });
});

// ── Page boundaries ─────────────────────────────────────────────────────────
describe('T2 paged reads cannot skip or double-count at a page boundary', () => {
  const oneFeature = [
    { feature_key: 'academic.mark_attendance', intended_roles: ['faculty'] },
  ];
  const tenFaculty = Array.from({ length: 10 }, (_, i) => ({
    user_id: `f${String(i).padStart(2, '0')}`,
    role: 'faculty',
  }));

  it('sorts both paged reads on a key that is unique, not on user_id alone', async () => {
    const admin = makeT2Admin({
      features: oneFeature,
      people: tenFaculty,
      usage: [{ user_id: 'f00', feature_key: 'academic.mark_attendance' }],
    });
    await computeAdoptionShare(admin, WEEK);
    // feature_usage's primary key IS (user_id, feature_key, day) — it has no id.
    expect(admin.__orderedBy.usage).toEqual(['user_id', 'feature_key', 'day']);
    // fn_adoption_person_roles UNIONs, so (user_id, role) is unique in its output.
    expect(admin.__orderedBy.people).toEqual(['user_id', 'role']);
  });

  it('counts each person once even when two pages overlap on a tie', async () => {
    const key = 'academic.mark_attendance';
    // A full first page whose tail ties on user_id, then a second page that
    // REPEATS the boundary row — exactly what a non-unique sort produces.
    const page0 = [
      ...Array.from({ length: 999 }, () => ({ user_id: 'f00', feature_key: key })),
      { user_id: 'f01', feature_key: key },
    ];
    const page1 = [
      { user_id: 'f01', feature_key: key }, // the duplicate
      { user_id: 'f02', feature_key: key },
    ];
    const reading = await computeAdoptionShare(
      makeT2Admin({ features: oneFeature, people: tenFaculty, usagePages: [page0, page1] }),
      WEEK
    );
    // Three DISTINCT faculty of ten = 30%. Counting rows would say 40%.
    const run = JSON.parse(reading.runId);
    expect(run.per_feature[0].best_pct).toBe(30);
    expect(reading.value).toBe(100);
  });
});

// ── The Sentry token the reading was actually taken with ───────────────────
describe('T1 records which Sentry secret it ran on', () => {
  it('names the fallback explicitly when SENTRY_READ_TOKEN is unset', async () => {
    const admin = makeT1Admin({ bugCount: 4 });
    const reading = await computeDefectHours(
      admin,
      sentryOnFallback([{ id: 'a', level: 'error', userCount: 5 }]),
      WEEK
    );
    expect(reading.tokenSource).toBe('SENTRY_AUTH_TOKEN (fallback)');
    expect(JSON.parse(reading.runId).constants.token_source).toBe('SENTRY_AUTH_TOKEN (fallback)');
  });

  it('records the token source even on a reading that came back NULL', async () => {
    const admin = makeT1Admin({ bugCount: 4 });
    const reading = await computeDefectHours(admin, sentryDown('HTTP 403 forbidden'), WEEK);
    expect(reading.value).toBeNull();
    expect(JSON.parse(reading.runId).constants.token_source).toBe('SENTRY_READ_TOKEN');
  });
});
