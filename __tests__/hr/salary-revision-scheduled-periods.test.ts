/**
 * Raise targets: the schedule record (8 Oct 2026, migration 20271008093015).
 *
 * The nightly job asks the app's OWN resolver (My Classes:
 * FacultyAttendanceService.getFacultyTodayPeriods) which periods a team member
 * was scheduled to teach on a day, and hands them to the database. These tests
 * run the REAL resolver against a stand-in service-role client, so they prove
 * the app's way of reading timetables is what gets recorded:
 *   finding 2  cycle timetables (get_cycle_for_date), batch RANGEs
 *   finding 3  a department holiday (approved-leave-scope.ts) leaves a class out
 *   default tt a period where they are only a co-teacher is recorded as not theirs
 *   default uu timetables switched off since are read (no is_active filter)
 * and the job's own rules (the deadline, a failed day, the order in the route).
 * The SQL side (what the measure does with the record) is rehearsed by
 * supabase/tests/hr-salary-revision/run-targets.sh (probe-schedule.sql).
 *
 * Run: npx vitest run __tests__/hr/salary-revision-scheduled-periods.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({}) }));

const MEMBER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DAY = '2026-11-04'; // a Wednesday

type Entry = { table?: string; fn?: string; ops: string[]; args?: Record<string, unknown> };

/** A PostgREST-shaped stand-in: every builder call is logged; each table answers fixed rows. */
function makeClient(opts: {
  tables: Record<string, unknown[]>;
  rpc: (fn: string, args?: Record<string, unknown>) => { data: unknown; error: unknown };
}) {
  const log: Entry[] = [];
  const from = (table: string) => {
    const entry: Entry = { table, ops: [] };
    log.push(entry);
    const result = () => ({ data: opts.tables[table] ?? [], error: null });
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'or', 'lte', 'gte', 'order', 'abortSignal']) {
      b[m] = (...a: unknown[]) => { entry.ops.push(`${m}:${typeof a[0] === 'string' ? a[0] : ''}`); return b; };
    }
    b.single = async () => ({ data: (opts.tables[table] ?? [])[0] ?? null, error: null });
    b.maybeSingle = b.single;
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
    return b;
  };
  const rpc = async (fn: string, args?: Record<string, unknown>) => {
    log.push({ fn, ops: [], args });
    return opts.rpc(fn, args);
  };
  return { from, rpc, log };
}

const timetable = (over: Record<string, unknown>) => ({
  institution_id: 'inst', academic_year_id: 'ay', timetable_format: 'regular',
  start_date: '2026-11-01', end_date: '2026-11-30', selected_dates: null,
  section_id: 'sec', section_ids: null, semester_id: 'sem', department_id: 'dept-a', attendance_mode: 'period_wise',
  sections: { id: 'sec', section_name: 'A' }, semesters: null, departments: null, programs: null, degrees: null,
  ...over,
});

const TABLES = {
  'staff': [{ id: MEMBER, first_name: 'Team', last_name: 'Member', email: 'x@jkkn.ac.in', institution_id: 'inst', department_id: 'dept-a' }],
  timetables: [
    // Regular, switched off since (default uu): their own class, and one where they only co-teach.
    timetable({
      id: 'tt-reg', is_active: false,
      timetable_data: { WEDNESDAY: {
        p1: { course_id: 'c1', primary_staff_id: MEMBER },
        p2: { course_id: 'c2', primary_staff_id: OTHER, staff_ids: [MEMBER] },
      } },
      periods: [
        { id: 'p1', period_name: 'Period 1', start_time: '09:00:00', end_time: '10:00:00' },
        { id: 'p2', period_name: 'Period 2', start_time: '10:00', end_time: '11:00' },
      ],
    }),
    // Cycle: keyed cycle-N, resolved through get_cycle_for_date (finding 2).
    timetable({
      id: 'tt-cyc', timetable_format: 'cycle',
      timetable_data: { 'cycle-3': { p3: { course_id: 'c3', primary_staff_id: MEMBER } } },
      periods: [{ id: 'p3', period_name: 'Cycle P3', start_time: '14:00', end_time: '15:00' }],
    }),
    // Batch: keyed by dates, valid inside its RANGE (finding 2).
    timetable({
      id: 'tt-bat', timetable_format: 'batch', selected_dates: ['RANGE:2026-11-01:2026-11-10'],
      timetable_data: { '2026-11-02': { p4: { course_id: 'c4', primary_staff_id: MEMBER, slot_date: 'RANGE:2026-11-01:2026-11-10' } } },
      periods: [{ id: 'p4', period_name: 'Clinic', start_time: '11:00', end_time: '13:00' }],
    }),
    // Department B is on an approved holiday that day (finding 3).
    timetable({
      id: 'tt-hol', department_id: 'dept-b',
      timetable_data: { WEDNESDAY: { p5: { course_id: 'c5', primary_staff_id: MEMBER } } },
      periods: [{ id: 'p5', period_name: 'Period 5', start_time: '15:00', end_time: '16:00' }],
    }),
  ],
  institution_leaves: [{ institution_id: 'inst', start_date: DAY, end_date: DAY, department_ids: ['dept-b'], semester_ids: [], section_ids: [] }],
  periods: [],
  courses: [],
  sections: [],
};

let records: Array<Record<string, any>>;
let needs: unknown[];
let recordError: Record<string, unknown> | null;

const client = () => makeClient({
  tables: TABLES,
  rpc: (fn, args) => {
    if (fn === 'get_cycle_for_date') return { data: 3, error: null };
    if (fn === 'fn_hr_target_schedule_needs') return { data: needs, error: null };
    if (fn === 'fn_hr_target_schedule_record') {
      records.push(args as Record<string, any>);
      return { data: (args?.p_periods as unknown[]).length, error: recordError };
    }
    return { data: null, error: { code: '42501', message: 'Not authorized' } };
  },
});

import { FacultyAttendanceService } from '@/lib/services/academic/faculty-attendance-service';
import {
  recordScheduledPeriods, toRecordedPeriods, toTime24, SCHEDULE_RESOLVER,
} from '@/lib/services/hr/salary-revision/scheduled-periods-recorder';

beforeEach(() => {
  records = [];
  needs = [{ staff_id: MEMBER, day: DAY, institution_ids: ['inst'], reason: 'live' }];
  recordError = null;
});

describe('toTime24', () => {
  it('reads the resolver\'s 12-hour times and the master\'s 24-hour ones', () => {
    expect(toTime24('9:30 AM')).toBe('09:30');
    expect(toTime24('12:05 PM')).toBe('12:05');
    expect(toTime24('12:00 AM')).toBe('00:00');
    expect(toTime24('4:15 PM')).toBe('16:15');
    expect(toTime24('09:30:00')).toBe('09:30');
    expect(toTime24('')).toBeNull();
    expect(toTime24('13:00 PM')).toBeNull();
    expect(toTime24(undefined)).toBeNull();
  });
});

describe('the app\'s resolver, read by the nightly job', () => {
  it('records what the team member\'s own period list would show: cycle and batch read the app\'s way, a department holiday left out, a co-teacher\'s period not theirs', async () => {
    const db = client();
    const result = await recordScheduledPeriods(db, { deadline: Date.now() + 10_000 });
    expect(result).toEqual({ needed: 1, recorded: 1, failed: 0 });
    expect(records).toHaveLength(1);
    const { p_staff_id, p_day, p_periods, p_resolver } = records[0];
    expect([p_staff_id, p_day, p_resolver]).toEqual([MEMBER, DAY, SCHEDULE_RESOLVER]);
    const byTimetable = Object.fromEntries((p_periods as any[]).map((p) => [`${p.timetable_id}:${p.period_name}`, p]));
    expect(Object.keys(byTimetable).sort()).toEqual(['tt-bat:Clinic', 'tt-cyc:Cycle P3', 'tt-reg:Period 1', 'tt-reg:Period 2']);
    expect(byTimetable['tt-reg:Period 1']).toMatchObject({ is_primary: true, kind: 'slot', course_id: 'c1', start_time: '09:00', end_time: '10:00', institution_id: 'inst' });
    expect(byTimetable['tt-reg:Period 2']).toMatchObject({ is_primary: false, course_id: 'c2' });
    expect(byTimetable['tt-cyc:Cycle P3']).toMatchObject({ is_primary: true, start_time: '14:00', end_time: '15:00' });
    expect(byTimetable['tt-bat:Clinic']).toMatchObject({ is_primary: true, start_time: '11:00', end_time: '13:00' });
    // The cycle is resolved by the database's own function, with this client.
    expect(db.log.filter((e) => e.fn === 'get_cycle_for_date').map((e) => e.args)).toEqual([{ p_timetable_id: 'tt-cyc', p_date: DAY }]);
  });

  it('reads with the job\'s client, timetables switched off since included, the colleges the database gave', async () => {
    const db = client();
    await recordScheduledPeriods(db, { deadline: Date.now() + 10_000 });
    const tt = db.log.find((e) => e.table === 'timetables')!;
    expect(tt.ops).toContain('in:institution_id');
    expect(tt.ops.some((o) => o.startsWith('eq:is_active'))).toBe(false);
    // fn_staff_teaching_institutions refuses a caller with no signed-in user: not asked.
    expect(db.log.some((e) => e.fn === 'fn_staff_teaching_institutions')).toBe(false);
  });

  it('the team member\'s own period list is unchanged: active timetables only, its own client', async () => {
    const db = client();
    const { periods } = await FacultyAttendanceService.getFacultyTodayPeriods(MEMBER, DAY, { client: db });
    const tt = db.log.find((e) => e.table === 'timetables')!;
    expect(tt.ops).toContain('eq:is_active');
    expect(db.log.some((e) => e.fn === 'fn_staff_teaching_institutions')).toBe(true);
    expect((periods as any[]).every((p) => typeof p.staff_is_primary === 'boolean')).toBe(true);
  });
});

describe('the nightly job', () => {
  it('a day that fails is not recorded and the rest still are', async () => {
    needs = [
      { staff_id: MEMBER, day: DAY, institution_ids: ['inst'], reason: 'live' },
      { staff_id: MEMBER, day: '2026-11-03', institution_ids: ['inst'], reason: 'missing' },
    ];
    let n = 0;
    const db = makeClient({
      tables: TABLES,
      rpc: (fn, args) => {
        if (fn === 'fn_hr_target_schedule_needs') return { data: needs, error: null };
        if (fn === 'fn_hr_target_schedule_record') {
          n += 1;
          records.push(args as Record<string, any>);
          return n === 1 ? { data: null, error: { code: '22P02', message: 'bad id' } } : { data: 0, error: null };
        }
        return { data: 3, error: null };
      },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const result = await recordScheduledPeriods(db, { deadline: Date.now() + 10_000, concurrency: 1 });
      expect(result).toEqual({ needed: 2, recorded: 1, failed: 1 });
    } finally {
      warn.mockRestore();
    }
  });

  it('starts nothing once its time is up; the rest wait for the next night', async () => {
    needs = Array.from({ length: 5 }, (_, i) => ({ staff_id: MEMBER, day: `2026-11-0${i + 1}`, institution_ids: ['inst'], reason: 'missing' }));
    const t0 = 1_000_000;
    const result = await recordScheduledPeriods(client(), { deadline: t0, now: () => t0 + 1 });
    expect(result).toEqual({ needed: 5, recorded: 0, failed: 0 });
    expect(records).toHaveLength(0);
  });

  it('reports a database refusal of the list and records nothing', async () => {
    const db = makeClient({ tables: TABLES, rpc: () => ({ data: null, error: { code: '42501', message: 'Only the scheduled job can record the schedule.' } }) });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await recordScheduledPeriods(db, { deadline: Date.now() + 10_000 }))
        .toEqual({ needed: 0, recorded: 0, failed: 0, error: 'Only the scheduled job can record the schedule.' });
    } finally {
      err.mockRestore();
    }
  });

  it('keeps the card\'s own name (what the mark page saves) and drops a card with no timetable', () => {
    expect(toRecordedPeriods([
      { timetable_id: 'tt', timetable_slot_id: 's1', period_name: ' P1 - Group A ', is_subdivided: true, staff_is_primary: true,
        start_time: '9:00 AM', end_time: '10:00 AM', section_ids: ['x', '', 3], course: { id: 'c' } },
      { period_name: 'orphan' },
      { timetable_id: 'tt', id: 's2', period_mode: 'practical', start_time: '', end_time: 'later' },
    ])).toEqual([
      { timetable_id: 'tt', institution_id: null, slot_id: 's1', period_name: 'P1 - Group A', course_id: 'c', section_ids: ['x'],
        start_time: '09:00', end_time: '10:00', is_primary: true, kind: 'sub_slot' },
      { timetable_id: 'tt', institution_id: null, slot_id: 's2', period_name: null, course_id: null, section_ids: [],
        start_time: null, end_time: null, is_primary: false, kind: 'practical' },
    ]);
  });
});

describe('the cron route (mode=targets)', () => {
  it('records the schedule FIRST, then measures, all as the service role', async () => {
    const db = client();
    const calls: string[] = [];
    const admin = {
      from: db.from,
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        calls.push(fn);
        if (fn === 'fn_hr_salary_revision_targets_due') return { data: [], error: null };
        return db.rpc(fn, args);
      },
    };
    vi.resetModules();
    vi.doMock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => admin }));
    process.env.CRON_SECRET = 'cron-secret';
    const route = await import('@/app/api/cron/hr-salary-revisions/route');
    const res = await route.GET(new NextRequest('http://localhost/api/cron/hr-salary-revisions?mode=targets',
      { headers: { authorization: 'Bearer cron-secret' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, mode: 'targets', schedule: { needed: 1, recorded: 1, failed: 0 } });
    expect(calls.indexOf('fn_hr_target_schedule_needs')).toBe(0);
    expect(calls.indexOf('fn_hr_target_schedule_record')).toBeLessThan(calls.indexOf('fn_hr_salary_revision_targets_due'));
    expect(route.SCHEDULE_BUDGET_MS + route.MIN_REMAINING_MS).toBeLessThan(route.MAX_DURATION_MS);
    vi.doUnmock('@/lib/supabase/server');
  });
});
