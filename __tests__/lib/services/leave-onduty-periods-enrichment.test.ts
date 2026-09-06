/**
 * Regression tests for LeaveOndutyService.getPeriodsForDate period enrichment.
 *
 * BUG: the enrichment select requested `period_mode` and `practical_config`
 * from the `periods` table, but neither column exists there (they live on the
 * timetable slot). Postgres rejects the whole statement with 42703, so
 * `periodsData` came back null, `periodMap` was empty, and EVERY period fell
 * through to the `|| 'Period'` / `|| ''` fallbacks.
 *
 * Consequence: forenoon/afternoon filter on `start_time`, which was always '',
 * so both modes silently resolved to zero periods — applications were created
 * with no periods attached and attendance was never adjusted.
 *
 * The fake client below mirrors the REAL `periods` schema and fails unknown
 * columns with 42703, exactly as Postgres does.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Actual public.periods columns (verified against prod schema).
const PERIODS_COLUMNS = new Set([
  'id',
  'period_name',
  'start_time',
  'end_time',
  'is_break',
  'created_at',
  'updated_at',
  'institution_id',
  'session',
]);

const P = {
  p1: 'd0f0d519-43ef-467b-8385-fcc961185b93',
  p2: '6495998d-b28e-4961-abd9-c39492cbe8e5',
  p3: '92312f57-2d4d-40a8-a1b3-f62f327e4a3b',
  p4: 'ed44d85f-26f5-4fab-87c4-67477751fcd6',
  p5: '78ee1566-fa3f-49c7-b5ac-acd0558f6029',
  p6: 'ad3cf3cb-06af-4c74-8b36-9fc28e34a8c3',
  p7: '599d74fc-c56e-4444-9573-96032328c235',
  p8: '3188f7e0-4a64-49fb-b490-d97907df1688',
};

const COURSE_ID = 'd596ec85-59b0-430c-80f6-0f94e857d345';

const PERIOD_ROWS = [
  { id: P.p1, period_name: 'CET P1', start_time: '09:15:00', end_time: '10:00:00', is_break: false },
  { id: P.p2, period_name: 'CET P2', start_time: '10:00:00', end_time: '10:45:00', is_break: false },
  { id: P.p3, period_name: 'CET P3', start_time: '11:00:00', end_time: '11:45:00', is_break: false },
  { id: P.p4, period_name: 'CET P4', start_time: '11:45:00', end_time: '12:30:00', is_break: false },
  { id: P.p5, period_name: 'CET P5', start_time: '13:15:00', end_time: '14:00:00', is_break: false },
  { id: P.p6, period_name: 'CET P6', start_time: '14:00:00', end_time: '14:45:00', is_break: false },
  { id: P.p7, period_name: 'CET P7', start_time: '15:00:00', end_time: '15:45:00', is_break: false },
  { id: P.p8, period_name: 'CET P8', start_time: '15:45:00', end_time: '16:30:00', is_break: false },
];

// 2026-07-24 is a Friday.
const FRIDAY = '2026-07-24';

function buildSlot(periodId: string) {
  return {
    slot_id: `slot-${periodId}`,
    course_id: COURSE_ID,
    period_mode: 'standard',
    practical_config: null,
    section_ids: ['35b81c8d-cc17-44a4-8f2e-895fc19c7ebd'],
    is_break_slot: false,
  };
}

const TIMETABLE = {
  id: '288dae4a-e4d7-457e-a276-659b4a4d4448',
  section_id: null,
  semester_id: 'sem-1',
  is_active: true,
  timetable_data: {
    FRIDAY: Object.fromEntries(Object.values(P).map((id) => [id, buildSlot(id)])),
  },
};

/** When set, the periods query fails with this error regardless of columns. */
let forcedPeriodsError: { code: string; message: string } | null = null;

function makeClient() {
  return {
    from(table: string) {
      if (table === 'timetables') {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          is: () => builder,
          order: () => builder,
          limit: () => builder,
          // Service tries section-specific first, then falls back to
          // semester-only. Return the timetable on the semester-only attempt.
          maybeSingle: () => Promise.resolve({ data: TIMETABLE, error: null }),
        };
        return builder;
      }

      if (table === 'periods') {
        return {
          select: (cols: string) => ({
            in: (_col: string, ids: string[]) => {
              if (forcedPeriodsError) {
                return Promise.resolve({ data: null, error: forcedPeriodsError });
              }
              // Postgres rejects the ENTIRE statement on an unknown column.
              const unknown = cols
                .split(',')
                .map((c) => c.trim())
                .find((c) => !PERIODS_COLUMNS.has(c));
              if (unknown) {
                return Promise.resolve({
                  data: null,
                  error: {
                    code: '42703',
                    message: `column periods.${unknown} does not exist`,
                  },
                });
              }
              return Promise.resolve({
                data: PERIOD_ROWS.filter((r) => ids.includes(r.id)),
                error: null,
              });
            },
          }),
        };
      }

      if (table === 'courses') {
        return {
          select: () => ({
            in: (_col: string, ids: string[]) =>
              Promise.resolve({
                data: ids.includes(COURSE_ID)
                  ? [{ id: COURSE_ID, course_name: 'Digital System Design Laboratory', course_code: 'EC25C08' }]
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
  forcedPeriodsError = null;
  // The service is very chatty; keep test output pristine.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LeaveOndutyService.getPeriodsForDate — period enrichment', () => {
  it('enriches periods with their real name and times', async () => {
    const result = await LeaveOndutyService.getPeriodsForDate('sec-1', 'sem-1', FRIDAY, 'fullday');

    expect(result.valid).toBe(true);
    const p8 = (result.timetable as Record<string, any>)[P.p8];
    expect(p8.period_name).toBe('CET P8');
    expect(p8.start_time).toBe('15:45:00');
    expect(p8.end_time).toBe('16:30:00');
  });

  it('returns the morning periods for a forenoon request', async () => {
    const result = await LeaveOndutyService.getPeriodsForDate('sec-1', 'sem-1', FRIDAY, 'forenoon');

    expect(result.valid).toBe(true);
    // forenoon window is 09:00–13:00 → CET P1..P4
    expect([...result.periods].sort()).toEqual([P.p1, P.p2, P.p3, P.p4].sort());
  });

  it('returns the afternoon periods for an afternoon request', async () => {
    const result = await LeaveOndutyService.getPeriodsForDate('sec-1', 'sem-1', FRIDAY, 'afternoon');

    expect(result.valid).toBe(true);
    // afternoon window is 14:00–17:00 → CET P6..P8
    expect([...result.periods].sort()).toEqual([P.p6, P.p7, P.p8].sort());
  });

  it('surfaces an error instead of silently returning unenriched periods', async () => {
    forcedPeriodsError = { code: '57014', message: 'canceling statement due to statement timeout' };

    const result = await LeaveOndutyService.getPeriodsForDate('sec-1', 'sem-1', FRIDAY, 'forenoon');

    expect(result.valid).toBe(false);
    expect(result.periods).toEqual([]);
    expect(result.error).toMatch(/period/i);
  });
});
