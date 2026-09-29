/**
 * "Save as Template" must copy the timetable, never flag the live row.
 *
 * BUG-006045 (2026-09-05, JKKN College of Arts and Science): "I M.Sc zoology
 * time table shown in Template status ... no one can visible time table".
 * The row was a real, active, in-window timetable with slots for Section A and
 * two faculty — but `is_template = true`. saveTimetableAsTemplate (and the
 * create/edit form checkbox) set that flag IN PLACE, and every surface that
 * treats templates as "not a real schedule" dropped the class: the Pending
 * dropdown, fn_timetable_scheduled_sections, the AQS unmarked/compliance RPCs.
 * On 2026-09-15, 18 active in-window timetables were in that state and all 18
 * were having attendance marked.
 *
 * The list badge also printed "Template" ahead of the date-derived status, so
 * an active schedule read as not running.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { timetableStatus } from '@/app/(routes)/academic/timetables/_components/timetable-status';

vi.mock('@/lib/utils/enhanced-logger', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/enhanced-logger')>(
    '@/lib/utils/enhanced-logger'
  );
  return {
    ...actual,
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), dev: vi.fn() }
  };
});

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: vi.fn(() => ({ from: vi.fn() }))
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() }
}));

const SOURCE = {
  id: 'e05a9bca-8fc4-4cf1-8530-e74942f47edd',
  institution_id: 'i1',
  academic_year_id: 'a1',
  degree_id: 'd1',
  program_id: 'p1',
  department_id: 'dep1',
  semester_id: 's1',
  section_id: null,
  section_ids: null,
  timetable_name: 'I M.Sc ZOOLOGY',
  timetable_type: 'semester',
  timetable_format: 'cycle',
  num_cycles: 6,
  start_cycle: null,
  selected_days: null,
  selected_dates: null,
  periods: [{ id: 'p' }],
  timetable_data: { 'cycle-1': { x: { slot_id: 'sl', section_ids: ['sec-a'] } } },
  attendance_mode: 'period_wise',
  class_incharge_id: null,
  start_date: '2026-08-18',
  end_date: '2026-10-31',
  is_active: true,
  is_template: false,
  usage_count: 0,
  created_by: 'creator',
  created_at: '2026-08-28',
  updated_at: '2026-09-10'
};

function makeClient() {
  const inserts: any[] = [];
  const updates: any[] = [];

  const from = vi.fn(() => {
    const b: any = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.insert = vi.fn((rows: any) => {
      inserts.push(Array.isArray(rows) ? rows[0] : rows);
      return b;
    });
    b.update = vi.fn((row: any) => {
      updates.push(row);
      return b;
    });
    b.single = vi.fn(() =>
      Promise.resolve(
        inserts.length
          ? { data: { ...inserts[inserts.length - 1], id: 'copy-id' }, error: null }
          : { data: SOURCE, error: null }
      )
    );
    b.then = (res: any, rej: any) => Promise.resolve({ data: null, error: null }).then(res, rej);
    return b;
  });

  return {
    client: {
      from,
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) }
    } as any,
    inserts,
    updates
  };
}

let TimetableService: typeof import('@/lib/services/academic/timetable-service').TimetableService;

beforeEach(async () => {
  vi.resetModules();
  ({ TimetableService } = await import('@/lib/services/academic/timetable-service'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('saveTimetableAsTemplate', () => {
  it('inserts a separate inactive template copy of the structure', async () => {
    const { client, inserts } = makeClient();
    (TimetableService as any).supabase = client;

    await TimetableService.saveTimetableAsTemplate(SOURCE.id, 'Zoology PG shape');

    expect(inserts).toHaveLength(1);
    const copy = inserts[0];
    expect(copy.id).toBeUndefined();
    expect(copy.is_template).toBe(true);
    expect(copy.is_active).toBe(false);
    expect(copy.template_name).toBe('Zoology PG shape');
    expect(copy.timetable_data).toEqual(SOURCE.timetable_data);
    expect(copy.periods).toEqual(SOURCE.periods);
    expect(copy.num_cycles).toBe(6);
  });

  it('never flags the live timetable as a template', async () => {
    const { client, updates } = makeClient();
    (TimetableService as any).supabase = client;

    await TimetableService.saveTimetableAsTemplate(SOURCE.id, 'Zoology PG shape');

    expect(updates.some((u) => u.is_template === true)).toBe(false);
  });
});

describe('createTimetable', () => {
  it('never creates a live timetable already flagged as a template', async () => {
    const { client, inserts } = makeClient();
    (TimetableService as any).supabase = client;
    vi.spyOn(TimetableService, 'checkExistingTimetable').mockResolvedValue({ exists: false } as any);

    await TimetableService.createTimetable({
      ...SOURCE,
      id: undefined,
      is_template: true,
      template_name: 'x'
    } as any);

    expect(inserts[0].is_template).toBe(false);
  });
});

describe('timetableStatus badge', () => {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  it('reads Active for an active in-window row even if it is flagged as a template', () => {
    expect(
      timetableStatus({ isActive: true, isTemplate: true, startDate: '2000-01-01', endDate: '2999-12-31' }).label
    ).toBe('Active');
  });

  it('reads Template for an inactive template', () => {
    expect(
      timetableStatus({ isActive: false, isTemplate: true, startDate: today, endDate: today }).label
    ).toBe('Template');
  });
});
