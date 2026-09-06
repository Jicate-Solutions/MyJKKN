/**
 * Weekly intake-readiness alarm — the three behaviours the Director's rule
 * hangs on: (1) the Monday-in-IST weekday gate, (2) per-college number
 * assembly from mocked reads, (3) the two-CONSECUTIVE-weeks escalation rule.
 *
 * The REAL functions are imported, never re-modelled — a test that
 * re-implements the rule proves only that it agrees with itself (this repo
 * has been bitten by exactly that; see
 * feedback_test_that_models_sql_proves_nothing). The SQL inside
 * fn_intake_readiness_weekly_alarm is deliberately NOT re-implemented here:
 * these tests cover everything TypeScript decides AROUND the RPC.
 *
 * NOT wired into any CI workflow — this repo runs only test files a workflow
 * names explicitly (see .github/workflows/*). Run locally with:
 *   npx vitest run __tests__/lib/services/academic/intake-readiness-alarm.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import {
  istWeekInfo,
  assembleCollegeAlarms,
  anyMetricAboveZero,
  computeEscalations,
  buildPrincipalNotification,
  runIntakeReadinessAlarm,
  type CollegeAlarmNumbers,
  type WeeklyAlarmState,
} from '@/lib/services/academic/intake-readiness-alarm';

// ---------------------------------------------------------------------------
// 1) Weekday gating — IST wall-clock, not the server's UTC clock
// ---------------------------------------------------------------------------

describe('istWeekInfo — the Monday-in-IST gate', () => {
  it('a plain IST Monday is a run day', () => {
    // 2026-08-10 was a Monday. 06:00 UTC = 11:30 IST, same calendar day.
    const info = istWeekInfo(new Date('2026-08-10T06:00:00.000Z'));
    expect(info.isMonday).toBe(true);
    expect(info.weekStart).toBe('2026-08-10');
    expect(info.prevWeekStart).toBe('2026-08-03');
  });

  it('Sunday 19:30 UTC is ALREADY Monday 01:00 IST — the gate must open', () => {
    // This is the case a naive getUTCDay() gets wrong: the dispatcher fires on
    // IST schedules, so an early-Monday IST slot lands on Sunday in UTC.
    const info = istWeekInfo(new Date('2026-08-09T19:30:00.000Z'));
    expect(info.isMonday).toBe(true);
    expect(info.weekStart).toBe('2026-08-10');
  });

  it('Monday 19:30 UTC is already Tuesday IST — the gate must close', () => {
    const info = istWeekInfo(new Date('2026-08-10T19:30:00.000Z'));
    expect(info.isMonday).toBe(false);
  });

  it('mid-week days are not run days but still resolve THIS week Monday', () => {
    const info = istWeekInfo(new Date('2026-08-13T06:00:00.000Z')); // Thursday
    expect(info.isMonday).toBe(false);
    expect(info.weekStart).toBe('2026-08-10');
    expect(info.prevWeekStart).toBe('2026-08-03');
  });

  it('Sunday (IST) belongs to the PREVIOUS Monday week', () => {
    const info = istWeekInfo(new Date('2026-08-09T06:00:00.000Z')); // Sunday IST
    expect(info.isMonday).toBe(false);
    expect(info.weekStart).toBe('2026-08-03');
  });
});

// ---------------------------------------------------------------------------
// 2) Per-college number assembly
// ---------------------------------------------------------------------------

function college(over: Partial<CollegeAlarmNumbers> = {}): CollegeAlarmNumbers {
  return {
    institution_id: 'inst-eng',
    institution_name: 'JKKN College of Engineering',
    paid_not_activated: 0,
    unplaced_learners: 0,
    programmes_without_timetable: 0,
    admitted_no_bill: 0,
    current_year_total: 100,
    ...over,
  };
}

describe('assembleCollegeAlarms — RPC rows to per-college numbers', () => {
  it('coerces bigint-as-string (PostgREST serialisation) into numbers', () => {
    const rows = [
      {
        alarm_institution_id: 'inst-eng',
        alarm_institution_name: 'JKKN College of Engineering',
        paid_not_activated: '208',
        unplaced_learners: 94,
        programmes_without_timetable: '1',
        admitted_no_bill: '12',
        current_year_total: '587',
      },
    ];
    expect(assembleCollegeAlarms(rows)).toEqual([
      {
        institution_id: 'inst-eng',
        institution_name: 'JKKN College of Engineering',
        paid_not_activated: 208,
        unplaced_learners: 94,
        programmes_without_timetable: 1,
        admitted_no_bill: 12,
        current_year_total: 587,
      },
    ]);
  });

  it('missing or malformed counts become 0, never NaN', () => {
    const [c] = assembleCollegeAlarms([
      {
        alarm_institution_id: 'inst-x',
        alarm_institution_name: 'X',
        paid_not_activated: null,
        unplaced_learners: 'not-a-number',
      },
    ]);
    expect(c.paid_not_activated).toBe(0);
    expect(c.unplaced_learners).toBe(0);
    expect(c.admitted_no_bill).toBe(0);
    expect(anyMetricAboveZero(c)).toBe(false);
  });

  it('drops rows without an institution id (nothing to notify)', () => {
    expect(
      assembleCollegeAlarms([{ alarm_institution_name: 'orphan' }, null]),
    ).toEqual([]);
  });
});

describe('buildPrincipalNotification — an empty cohort is not an all-clear', () => {
  it('all four zeros with learners on the books reads as all clear', () => {
    const { title } = buildPrincipalNotification(college(), '2026-08-10');
    expect(title).toContain('all clear');
  });

  it('zero current-year learners must NOT read as all clear', () => {
    const { title, body } = buildPrincipalNotification(
      college({ current_year_total: 0 }),
      '2026-08-10',
    );
    expect(title).not.toContain('all clear');
    expect(body).toContain('no learners are on the books');
  });
});

// ---------------------------------------------------------------------------
// 3) The two-consecutive-weeks escalation rule
// ---------------------------------------------------------------------------

const WEEK = '2026-08-10';
const PREV_WEEK = '2026-08-03';

function priorState(over: Partial<CollegeAlarmNumbers> = {}): WeeklyAlarmState {
  return { week_start: PREV_WEEK, colleges: [college(over)] };
}

describe('computeEscalations — 2 CONSECUTIVE weeks above zero', () => {
  it('same metric above zero both weeks escalates that metric', () => {
    const esc = computeEscalations(
      [college({ unplaced_learners: 94 })],
      priorState({ unplaced_learners: 120 }),
      PREV_WEEK,
    );
    expect(esc).toHaveLength(1);
    expect(esc[0].metrics).toEqual([
      { metric: 'unplaced_learners', prior: 120, current: 94 },
    ]);
  });

  it('above zero this week only (first bad week) does NOT escalate', () => {
    const esc = computeEscalations(
      [college({ unplaced_learners: 94 })],
      priorState({ unplaced_learners: 0 }),
      PREV_WEEK,
    );
    expect(esc).toEqual([]);
  });

  it('recovered this week (bad last week, zero now) does NOT escalate', () => {
    const esc = computeEscalations(
      [college({ unplaced_learners: 0 })],
      priorState({ unplaced_learners: 120 }),
      PREV_WEEK,
    );
    expect(esc).toEqual([]);
  });

  it('DIFFERENT metrics across the two weeks do NOT chain into an escalation', () => {
    const esc = computeEscalations(
      [college({ admitted_no_bill: 12 })],
      priorState({ unplaced_learners: 120 }),
      PREV_WEEK,
    );
    expect(esc).toEqual([]);
  });

  it('no prior run at all (first ever week) escalates nothing', () => {
    const esc = computeEscalations([college({ unplaced_learners: 94 })], null, PREV_WEEK);
    expect(esc).toEqual([]);
  });

  it('a STALE prior run (missed week) resets the streak instead of comparing', () => {
    const stale: WeeklyAlarmState = {
      week_start: '2026-07-27', // two weeks back, not last week
      colleges: [college({ unplaced_learners: 120 })],
    };
    const esc = computeEscalations([college({ unplaced_learners: 94 })], stale, PREV_WEEK);
    expect(esc).toEqual([]);
  });

  it('several metrics escalate together and keep both weeks numbers', () => {
    const esc = computeEscalations(
      [college({ paid_not_activated: 208, admitted_no_bill: 12 })],
      priorState({ paid_not_activated: 300, admitted_no_bill: 5 }),
      PREV_WEEK,
    );
    expect(esc[0].metrics.map((m) => m.metric)).toEqual([
      'paid_not_activated',
      'admitted_no_bill',
    ]);
  });
});

// ---------------------------------------------------------------------------
// runIntakeReadinessAlarm — orchestration against an in-memory client. The
// filters the code sends are APPLIED by the fake, not just recorded.
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

function makeFakeAdmin(seed: {
  rpcRows?: Row[];
  rpcError?: { message: string } | null;
  aiJobs?: Row[];
  superAdmins?: Row[];
}) {
  const inserted: Row[] = [];
  const admin: any = {
    rpc: vi.fn(async () =>
      seed.rpcError
        ? { data: null, error: seed.rpcError }
        : { data: seed.rpcRows ?? [], error: null },
    ),
    from: vi.fn((table: string) => {
      const filters: Array<(r: Row) => boolean> = [];
      let limitN: number | null = null;
      const rowsFor = () => {
        const all =
          table === 'ai_jobs'
            ? seed.aiJobs ?? []
            : table === 'profiles'
              ? seed.superAdmins ?? []
              : [];
        let rows = all.filter((r) => filters.every((f) => f(r)));
        if (limitN !== null) rows = rows.slice(0, limitN);
        return rows;
      };
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          filters.push((r) => r[c] === v);
          return q;
        },
        in: (c: string, vals: unknown[]) => {
          filters.push((r) => (vals as any[]).includes(r[c]));
          return q;
        },
        order: () => q,
        limit: (n: number) => {
          limitN = n;
          return q;
        },
        maybeSingle: async () => ({ data: rowsFor()[0] ?? null, error: null }),
        insert: async (row: Row) => {
          inserted.push({ table, row });
          return { error: null };
        },
        then: (resolve: any) => resolve({ data: rowsFor(), error: null }),
      };
      return q;
    }),
  };
  return { admin, inserted };
}

const RPC_ROW = {
  alarm_institution_id: 'inst-eng',
  alarm_institution_name: 'JKKN College of Engineering',
  paid_not_activated: '208',
  unplaced_learners: '94',
  programmes_without_timetable: '1',
  admitted_no_bill: '12',
  current_year_total: '587',
};

describe('runIntakeReadinessAlarm — orchestration with mocked reads', () => {
  it('notifies each Principal with the assembled numbers and records state', async () => {
    const { admin, inserted } = makeFakeAdmin({
      rpcRows: [RPC_ROW],
      aiJobs: [],
      superAdmins: [{ id: 'sa-1', is_super_admin: true }],
    });
    const deliver = vi.fn(async () => 'delivered' as const);
    const result = await runIntakeReadinessAlarm(admin, {
      now: new Date('2026-08-10T06:00:00.000Z'),
      deps: {
        deliver,
        resolveDirectorIds: vi.fn(async () => ({ ids: ['dir-1'], source: 'director' })),
        resolvePrincipals: vi.fn(async () => new Map([['inst-eng', ['prin-1']]])),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.examined).toBe(1);
    expect(result.flagged).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.escalations).toBe(0); // first ever week — no prior state
    expect(result.state_recorded).toBe(true);

    // The Principal card carries the four numbers assembled from the RPC row.
    const call = deliver.mock.calls[0][1] as any;
    expect(call.recipientId).toBe('prin-1');
    expect(call.idempotencyKey).toBe('intake-readiness:2026-08-10:inst-eng:prin-1');
    expect(call.body).toContain('208');
    expect(call.body).toContain('94');
    expect(call.body).toContain('12');

    // State row keyed to this week, ready for next Monday's comparison.
    const stateRow = inserted.find((i) => i.table === 'ai_jobs');
    expect(stateRow?.row.result.week_start).toBe('2026-08-10');
    expect(stateRow?.row.result.colleges[0].paid_not_activated).toBe(208);
  });

  it('escalates to the Director when last week (from ai_jobs) was also above zero', async () => {
    const priorResult: WeeklyAlarmState = {
      week_start: '2026-08-03',
      colleges: [
        {
          institution_id: 'inst-eng',
          institution_name: 'JKKN College of Engineering',
          paid_not_activated: 300,
          unplaced_learners: 0,
          programmes_without_timetable: 0,
          admitted_no_bill: 0,
          current_year_total: 500,
        },
      ],
    };
    const { admin } = makeFakeAdmin({
      rpcRows: [RPC_ROW],
      aiJobs: [
        { job_type: 'intake_readiness.weekly_alarm', status: 'done', result: priorResult },
      ],
      superAdmins: [{ id: 'sa-1', is_super_admin: true }],
    });
    const deliver = vi.fn(async () => 'delivered' as const);
    const result = await runIntakeReadinessAlarm(admin, {
      now: new Date('2026-08-10T06:00:00.000Z'),
      deps: {
        deliver,
        resolveDirectorIds: vi.fn(async () => ({ ids: ['dir-1'], source: 'director' })),
        resolvePrincipals: vi.fn(async () => new Map([['inst-eng', ['prin-1']]])),
      },
    });

    expect(result.escalations).toBe(1);
    // Principal card + Director escalation card.
    expect(result.sent).toBe(2);
    const directorCall = deliver.mock.calls
      .map((c) => c[1] as any)
      .find((c) => c.recipientId === 'dir-1');
    expect(directorCall.idempotencyKey).toBe(
      'intake-readiness:2026-08-10:director-escalation:dir-1',
    );
    // Only the metric that was above zero BOTH weeks appears.
    expect(directorCall.body).toContain('not yet activated');
    expect(directorCall.body).not.toContain('no class group');
  });

  it('a flagged college with no Principal counts as unreachable, and a re-run of a recorded week does not double-write state', async () => {
    const thisWeek: WeeklyAlarmState = { week_start: '2026-08-10', colleges: [] };
    const { admin, inserted } = makeFakeAdmin({
      rpcRows: [RPC_ROW],
      aiJobs: [
        { job_type: 'intake_readiness.weekly_alarm', status: 'done', result: thisWeek },
      ],
      superAdmins: [{ id: 'sa-1', is_super_admin: true }],
    });
    const deliver = vi.fn(async () => 'delivered' as const);
    const result = await runIntakeReadinessAlarm(admin, {
      now: new Date('2026-08-10T06:00:00.000Z'),
      deps: {
        deliver,
        resolveDirectorIds: vi.fn(async () => ({ ids: [], source: 'none' })),
        resolvePrincipals: vi.fn(async () => new Map()),
      },
    });

    expect(result.unreachable).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.state_recorded).toBe(false); // already recorded this week
    expect(inserted.filter((i) => i.table === 'ai_jobs')).toEqual([]);
  });

  it('a missing RPC (migration not applied) fails loudly, not as an empty success', async () => {
    const { admin } = makeFakeAdmin({
      rpcError: { message: 'function fn_intake_readiness_weekly_alarm() does not exist' },
    });
    const result = await runIntakeReadinessAlarm(admin, {
      now: new Date('2026-08-10T06:00:00.000Z'),
      deps: {
        deliver: vi.fn(async () => 'delivered' as const),
        resolveDirectorIds: vi.fn(async () => ({ ids: [], source: 'none' })),
        resolvePrincipals: vi.fn(async () => new Map()),
      },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('does not exist');
  });

  it('dry run counts everything and writes nothing', async () => {
    const { admin, inserted } = makeFakeAdmin({
      rpcRows: [RPC_ROW],
      aiJobs: [],
      superAdmins: [{ id: 'sa-1', is_super_admin: true }],
    });
    const deliver = vi.fn(async () => 'delivered' as const);
    const result = await runIntakeReadinessAlarm(admin, {
      now: new Date('2026-08-10T06:00:00.000Z'),
      dryRun: true,
      deps: {
        deliver,
        resolveDirectorIds: vi.fn(async () => ({ ids: ['dir-1'], source: 'director' })),
        resolvePrincipals: vi.fn(async () => new Map([['inst-eng', ['prin-1']]])),
      },
    });
    expect(result.flagged).toBe(1);
    expect(result.sent).toBe(0);
    expect(deliver).not.toHaveBeenCalled();
    expect(inserted).toEqual([]);
    expect(result.state_recorded).toBe(false);
  });
});
