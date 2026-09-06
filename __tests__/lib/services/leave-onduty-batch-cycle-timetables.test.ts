/**
 * Regression tests for LeaveOndutyService.getPeriodsForDate across ALL timetable
 * formats.
 *
 * BUG (reported 2026-08-06 by a JKKN Dental CRRI intern): getPeriodsForDate only
 * understood weekday-keyed timetable_data ({ MONDAY: {...} }), slot arrays, and
 * { slots: [] }. Anything else fell into the BUG-003207 guard and produced an
 * empty dayPeriods, i.e. "No classes scheduled for THURSDAY" — which
 * createApplication turns into a hard throw.
 *
 * Two whole formats were therefore unreachable:
 *   - 'batch'  (CRRI clinical postings) keys by ISO date "2026-08-06" and by
 *              posting block "RANGE:2026-07-22:2026-09-04".
 *   - 'cycle'  keys by "cycle-N"; which N is live on a date is resolved by the
 *              canonical get_cycle_for_date() RPC (skips Sundays/holidays).
 *
 * Second defect, same report: a CRRI clinical period runs 09:00–15:30 and so
 * straddles the FN/AN boundary. Matching on start_time alone put it in forenoon
 * only, so an *afternoon* application saved with selected_periods = [] — valid,
 * approved, and recording nothing. Half-day matching is overlap-based now.
 *
 * Fixtures mirror production row timetables.8979ba2e-4ee2-4ee2-81e4-64952fcec477
 * (section "NEW CRRI ZENFORIANZ SECTION - G", semester CRRI).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const CRRI_P1 = '45b6c763-6cc5-4dc9-9fa1-c1146304f2ba';
const REG_P1 = 'd0f0d519-43ef-467b-8385-fcc961185b93';
const REG_P6 = 'ad3cf3cb-06af-4c74-8b36-9fc28e34a8c3';
const COURSE_ID = '55dec4cf-11ff-46ef-b88c-9ee918d834da';

const PERIOD_ROWS = [
  // The real CRRI clinical period: one all-day slot spanning FN and AN.
  { id: CRRI_P1, period_name: 'DCH CRRI Clinical P1', start_time: '09:00:00', end_time: '15:30:00', is_break: false },
  { id: REG_P1, period_name: 'CET P1', start_time: '09:15:00', end_time: '10:00:00', is_break: false },
  { id: REG_P6, period_name: 'CET P6', start_time: '14:00:00', end_time: '14:45:00', is_break: false },
];

// 2026-08-06 is a Thursday; 2026-08-07 a Friday. Both sit inside the posting
// block RANGE:2026-07-22:2026-09-04, but only 2026-08-06 has its own date key.
const THURSDAY = '2026-08-06';
const FRIDAY_RANGE_ONLY = '2026-08-07';

function crriSlot(slotDate: string) {
  return {
    slot_id: '441927b0-e2eb-47b5-99c6-ac6802ab51c2',
    course_id: COURSE_ID,
    slot_date: slotDate,
    staff_ids: ['27da8ddf-4dd7-4bf9-8a59-005e95928a2d'],
    sub_slots: [],
    is_break_slot: false,
    section_ids: ['40bd4954-75c5-4297-bb42-dae009adcf8b'],
  };
}

const BATCH_TIMETABLE = {
  id: '8979ba2e-4ee2-4ee2-81e4-64952fcec477',
  section_id: '40bd4954-75c5-4297-bb42-dae009adcf8b',
  semester_id: 'sem-crri',
  is_active: true,
  timetable_format: 'batch',
  selected_dates: ['RANGE:2026-07-22:2026-09-04'],
  timetable_data: {
    [THURSDAY]: { [CRRI_P1]: crriSlot(THURSDAY) },
    'RANGE:2026-07-22:2026-09-04': { [CRRI_P1]: crriSlot('RANGE:2026-07-22:2026-09-04') },
  },
};

const CYCLE_TIMETABLE = {
  id: '80347adc-4e38-4b2e-bb8e-fdbf0b682e19',
  section_id: 'sec-cycle',
  semester_id: 'sem-cycle',
  is_active: true,
  timetable_format: 'cycle',
  selected_dates: null,
  timetable_data: {
    'cycle-1': { [REG_P1]: { slot_id: 's1', course_id: COURSE_ID, is_break_slot: false } },
    'cycle-3': { [REG_P6]: { slot_id: 's3', course_id: COURSE_ID, is_break_slot: false } },
  },
};

const REGULAR_TIMETABLE = {
  id: '288dae4a-e4d7-457e-a276-659b4a4d4448',
  section_id: 'sec-reg',
  semester_id: 'sem-reg',
  is_active: true,
  timetable_format: 'regular',
  selected_dates: null,
  timetable_data: {
    THURSDAY: {
      [REG_P1]: { slot_id: 's1', course_id: COURSE_ID, is_break_slot: false },
      [REG_P6]: { slot_id: 's6', course_id: COURSE_ID, is_break_slot: false },
    },
  },
};

/** Swapped per test. */
let activeTimetable: any = BATCH_TIMETABLE;
/** What get_cycle_for_date() returns: a cycle number, or null on Sunday/holiday. */
let cycleRpcResult: { data: number | null; error: any } = { data: 3, error: null };
/** Records the args the service passed to the RPC. */
let cycleRpcCalls: any[] = [];

function makeClient() {
  return {
    rpc(fn: string, args: any) {
      if (fn === 'get_cycle_for_date') {
        cycleRpcCalls.push(args);
        return Promise.resolve(cycleRpcResult);
      }
      throw new Error(`Unexpected rpc in test: ${fn}`);
    },
    from(table: string) {
      if (table === 'timetables') {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          is: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: () => Promise.resolve({ data: activeTimetable, error: null }),
        };
        return builder;
      }

      if (table === 'periods') {
        return {
          select: () => ({
            in: (_col: string, ids: string[]) =>
              Promise.resolve({ data: PERIOD_ROWS.filter((r) => ids.includes(r.id)), error: null }),
          }),
        };
      }

      if (table === 'courses') {
        return {
          select: () => ({
            in: (_col: string, ids: string[]) =>
              Promise.resolve({
                data: ids.includes(COURSE_ID)
                  ? [{ id: COURSE_ID, course_name: 'Clinical Posting', course_code: 'DCH-CRRI' }]
                  : [],
                error: null,
              }),
          }),
        };
      }

      throw new Error(`Unexpected table in test: ${table}`);
    },
  };
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => makeClient(),
}));

vi.mock('@/lib/utils/activity-logger-client', () => ({
  logActivityClient: vi.fn(),
  AcademicActivityTemplates: {},
}));

import { LeaveOndutyService } from '@/lib/services/academic/leave-onduty-service';

beforeEach(() => {
  activeTimetable = BATCH_TIMETABLE;
  cycleRpcResult = { data: 3, error: null };
  cycleRpcCalls = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getPeriodsForDate — batch (CRRI) timetables', () => {
  it('reads the exact ISO date key instead of reporting "No classes scheduled"', async () => {
    const result = await LeaveOndutyService.getPeriodsForDate(
      BATCH_TIMETABLE.section_id, BATCH_TIMETABLE.semester_id, THURSDAY, 'fullday'
    );

    expect(result.error).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(result.periods).toEqual([CRRI_P1]);
    expect((result.timetable as Record<string, any>)[CRRI_P1].period_name).toBe('DCH CRRI Clinical P1');
  });

  it('falls back to the posting-block RANGE key for a date with no own key', async () => {
    const result = await LeaveOndutyService.getPeriodsForDate(
      BATCH_TIMETABLE.section_id, BATCH_TIMETABLE.semester_id, FRIDAY_RANGE_ONLY, 'fullday'
    );

    expect(result.valid).toBe(true);
    expect(result.periods).toEqual([CRRI_P1]);
  });

  it('reports no classes for a date outside every posting block', async () => {
    const result = await LeaveOndutyService.getPeriodsForDate(
      BATCH_TIMETABLE.section_id, BATCH_TIMETABLE.semester_id, '2026-12-25', 'fullday'
    );

    expect(result.valid).toBe(false);
    expect(result.periods).toEqual([]);
  });

  it('never calls the cycle RPC for a batch timetable', async () => {
    await LeaveOndutyService.getPeriodsForDate(
      BATCH_TIMETABLE.section_id, BATCH_TIMETABLE.semester_id, THURSDAY, 'fullday'
    );

    expect(cycleRpcCalls).toHaveLength(0);
  });
});

describe('getPeriodsForDate — half-day matching is overlap-based', () => {
  it('counts the 09:00–15:30 clinical period as forenoon', async () => {
    const result = await LeaveOndutyService.getPeriodsForDate(
      BATCH_TIMETABLE.section_id, BATCH_TIMETABLE.semester_id, THURSDAY, 'forenoon'
    );

    expect(result.valid).toBe(true);
    expect(result.periods).toEqual([CRRI_P1]);
  });

  it('counts the 09:00–15:30 clinical period as afternoon too', async () => {
    // Pre-fix this returned [] with valid:true — the application saved with no
    // periods, so attendance was never adjusted for the afternoon.
    const result = await LeaveOndutyService.getPeriodsForDate(
      BATCH_TIMETABLE.section_id, BATCH_TIMETABLE.semester_id, THURSDAY, 'afternoon'
    );

    expect(result.valid).toBe(true);
    expect(result.periods).toEqual([CRRI_P1]);
  });

  it('still keeps a purely-morning period out of the afternoon set', async () => {
    activeTimetable = REGULAR_TIMETABLE;

    const result = await LeaveOndutyService.getPeriodsForDate(
      REGULAR_TIMETABLE.section_id, REGULAR_TIMETABLE.semester_id, THURSDAY, 'afternoon'
    );

    expect(result.valid).toBe(true);
    expect(result.periods).toEqual([REG_P6]); // 14:00–14:45 only; CET P1 excluded
  });
});

describe('getPeriodsForDate — cycle timetables', () => {
  beforeEach(() => {
    activeTimetable = CYCLE_TIMETABLE;
  });

  it('resolves the live cycle through get_cycle_for_date and reads cycle-N', async () => {
    cycleRpcResult = { data: 3, error: null };

    const result = await LeaveOndutyService.getPeriodsForDate(
      CYCLE_TIMETABLE.section_id, CYCLE_TIMETABLE.semester_id, THURSDAY, 'fullday'
    );

    expect(result.valid).toBe(true);
    expect(result.periods).toEqual([REG_P6]); // cycle-3 holds CET P6
    expect(cycleRpcCalls).toEqual([{ p_timetable_id: CYCLE_TIMETABLE.id, p_date: THURSDAY }]);
  });

  it('reports no classes when the date is a Sunday or holiday (RPC returns null)', async () => {
    cycleRpcResult = { data: null, error: null };

    const result = await LeaveOndutyService.getPeriodsForDate(
      CYCLE_TIMETABLE.section_id, CYCLE_TIMETABLE.semester_id, THURSDAY, 'fullday'
    );

    expect(result.valid).toBe(false);
    expect(result.periods).toEqual([]);
  });

  it('surfaces an RPC failure instead of a false "No classes scheduled"', async () => {
    // Same contract as faculty-attendance-service: a statement timeout must not
    // masquerade as an empty timetable.
    cycleRpcResult = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };

    const result = await LeaveOndutyService.getPeriodsForDate(
      CYCLE_TIMETABLE.section_id, CYCLE_TIMETABLE.semester_id, THURSDAY, 'fullday'
    );

    expect(result.valid).toBe(false);
    expect(result.periods).toEqual([]);
    expect(result.error).toMatch(/cycle/i);
    expect(result.error).not.toMatch(/no classes scheduled/i);
  });
});

describe('getPeriodsForDate — existing behaviour preserved', () => {
  it('still reads weekday-keyed regular timetables', async () => {
    activeTimetable = REGULAR_TIMETABLE;

    const result = await LeaveOndutyService.getPeriodsForDate(
      REGULAR_TIMETABLE.section_id, REGULAR_TIMETABLE.semester_id, THURSDAY, 'fullday'
    );

    expect(result.valid).toBe(true);
    expect([...result.periods].sort()).toEqual([REG_P1, REG_P6].sort());
  });

  it('keeps the BUG-003207 guard: an unrecognised shape yields no periods, not mangled keys', async () => {
    activeTimetable = {
      ...REGULAR_TIMETABLE,
      timetable_format: 'regular',
      timetable_data: { SOMETHING_ELSE: { foo: 'bar' } },
    };

    const result = await LeaveOndutyService.getPeriodsForDate(
      'sec-reg', 'sem-reg', THURSDAY, 'fullday'
    );

    expect(result.valid).toBe(false);
    expect(result.periods).toEqual([]);
  });
});
