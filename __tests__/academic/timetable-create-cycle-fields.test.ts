/**
 * What createTimetable actually writes for a cycle-format timetable.
 *
 * Found while investigating BUG-006085 (I PG timetable on the wrong day order,
 * JKKN College of Arts and Science (Aided), 2026-09-10).
 *
 * `createTimetable` builds its insert by destructuring an explicit list of
 * columns off the DTO. `num_cycles` was never on that list — the form collected
 * it, zod required it for cycle format, updateTimetable accepted it, and the
 * insert silently dropped it. Every cycle timetable created through this path
 * landed with num_cycles NULL.
 *
 * That is not a cosmetic loss. get_cycle_for_date returns NULL when num_cycles
 * is NULL, so NO date ever resolves to a cycle: the grid still draws, the slots
 * are still there, and faculty are told "no classes scheduled for today" for the
 * whole term. Two live timetables in that college — I M.Com and I M.Sc ZOOLOGY,
 * both created 2026-08-28 with six authored cycle-N blocks — were in exactly
 * that state.
 *
 * The same shape would have swallowed `start_cycle`, the day order fix for
 * BUG-006085, on the day it shipped. Both are pinned here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/utils/enhanced-logger', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/enhanced-logger')>(
    '@/lib/utils/enhanced-logger'
  );
  return {
    ...actual,
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), dev: vi.fn() }
  };
});

// The service builds its client in a static initialiser, so this must be mocked
// before the module is imported or @supabase/ssr throws on missing env.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: vi.fn(() => ({ from: vi.fn() }))
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() }
}));

const BASE_DTO = {
  institution_id: 'i0000000-0000-0000-0000-000000000001',
  academic_year_id: 'a0000000-0000-0000-0000-000000000001',
  degree_id: 'd0000000-0000-0000-0000-000000000001',
  program_id: 'p0000000-0000-0000-0000-000000000001',
  department_id: 'e0000000-0000-0000-0000-000000000001',
  semester_id: 's0000000-0000-0000-0000-000000000003',
  timetable_name: 'I M.SC CHEMISTRY',
  start_date: '2026-08-18',
  end_date: '2026-10-31'
};

/** Captures the row handed to .insert() so the test can read every column. */
function makeClient() {
  const captured: any[] = [];

  const from = vi.fn(() => {
    const builder: any = {};
    builder.insert = vi.fn((rows: any[]) => {
      captured.push(rows[0]);
      return builder;
    });
    builder.select = vi.fn(() => builder);
    builder.single = vi.fn(() =>
      Promise.resolve({ data: { id: 't0000000-0000-0000-0000-000000000001' }, error: null })
    );
    return builder;
  });

  const client = {
    from,
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) }
  } as any;

  return { client, captured };
}

let TimetableService: typeof import('@/lib/services/academic/timetable-service').TimetableService;

beforeEach(async () => {
  vi.resetModules();
  ({ TimetableService } = await import('@/lib/services/academic/timetable-service'));
  // The duplicate guard is a separate concern with its own tests; short-circuit
  // it so these assertions are about the insert payload alone.
  vi.spyOn(TimetableService, 'checkExistingTimetable').mockResolvedValue({
    exists: false
  } as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createTimetable - cycle format', () => {
  it('writes num_cycles instead of dropping it', async () => {
    const { client, captured } = makeClient();
    (TimetableService as any).supabase = client;

    await TimetableService.createTimetable({
      ...BASE_DTO,
      timetable_format: 'cycle',
      num_cycles: 6
    } as any);

    expect(captured).toHaveLength(1);
    expect(captured[0].num_cycles).toBe(6);
  });

  it('writes start_cycle, the day order of the first working day', async () => {
    const { client, captured } = makeClient();
    (TimetableService as any).supabase = client;

    await TimetableService.createTimetable({
      ...BASE_DTO,
      timetable_format: 'cycle',
      num_cycles: 6,
      start_cycle: 3
    } as any);

    expect(captured[0].start_cycle).toBe(3);
  });

  it('leaves start_cycle null when the author did not set one', async () => {
    // NULL is read as Cycle 1 by get_cycle_for_date — the historic behaviour,
    // and the right default for a timetable that starts its own rotation.
    const { client, captured } = makeClient();
    (TimetableService as any).supabase = client;

    await TimetableService.createTimetable({
      ...BASE_DTO,
      timetable_format: 'cycle',
      num_cycles: 6
    } as any);

    expect(captured[0].start_cycle).toBeNull();
  });
});

describe('createTimetable - non-cycle formats', () => {
  it('does not carry a rotation count onto a regular timetable', async () => {
    // A format switch in the form can leave num_cycles populated in the DTO.
    // Persisting it would make a weekly timetable look like a cycle one to any
    // query that keys off the column rather than the format.
    const { client, captured } = makeClient();
    (TimetableService as any).supabase = client;

    await TimetableService.createTimetable({
      ...BASE_DTO,
      timetable_format: 'regular',
      num_cycles: 6,
      start_cycle: 3
    } as any);

    expect(captured[0].num_cycles).toBeNull();
    expect(captured[0].start_cycle).toBeNull();
  });
});
