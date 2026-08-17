/**
 * Regression tests for the "0 section(s)" stat on a semester-level timetable.
 *
 * Reported 2026-08-17 against I B.SC CHEMISTRY
 * (e9d019bd-c8e9-45de-8e12-c910af5d4ae8): the timetable header showed
 * "Sections — 0 section(s)" although section A
 * (442bdd4d-1af3-40dd-9750-bf3f7f3dce3b) exists, is_active, sits in the
 * timetable's own semester, and holds 19 active learners.
 *
 * Root cause: TimetableService.getTimetable asked PostgREST to embed a
 * relationship that does not exist —
 *
 *   .select('id, section_name, student_count:students(count)')
 *
 * There is no `students` table in this database. Learners live in
 * `learners_profiles` (FK `fk_learners_profiles_section`). PostgREST cannot
 * resolve the embed, so the WHOLE sections query fails. The result was then
 * discarded by `if (!sectionsError && semesterSections)` with no log, leaving
 * `available_sections` undefined, and the header's
 * `available_sections?.length || 0` rendered a confident "0 section(s)".
 *
 * The count broke the list. That is the shape worth pinning: an optional
 * decoration (a headcount) was fused into the query for the essential data (the
 * sections), so failing to decorate erased the thing being decorated. These
 * tests therefore separate the two and assert that a failing count still yields
 * sections.
 *
 * The same swallow-and-continue is why it went unreported for so long: a wrong
 * zero looks like a real answer, while an error would have been investigated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const loggerWarn = vi.fn();
const loggerError = vi.fn();

vi.mock('@/lib/utils/enhanced-logger', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/enhanced-logger')>(
    '@/lib/utils/enhanced-logger'
  );
  return {
    ...actual,
    logger: { error: loggerError, warn: loggerWarn, info: vi.fn(), debug: vi.fn(), dev: vi.fn() }
  };
});

// TimetableService builds its client in a static initialiser, so this must be
// mocked before the module is imported or @supabase/ssr throws on missing env.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: vi.fn(() => ({ from: vi.fn() }))
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
  toast: { error: vi.fn(), success: vi.fn() }
}));

const TIMETABLE_ID = 'e9d019bd-c8e9-45de-8e12-c910af5d4ae8';
const SEMESTER_ID = '21cf48c2-0219-4f30-a710-6fbb8e851360';
const SECTION_A = '442bdd4d-1af3-40dd-9750-bf3f7f3dce3b';

/** The row as `timetables` returns it. No timetable_data: enrichment is not under test. */
const TIMETABLE_ROW = {
  id: TIMETABLE_ID,
  timetable_name: 'I B.SC CHEMISTRY',
  timetable_type: 'semester',
  semester_id: SEMESTER_ID,
  section_id: null,
  timetable_data: null
};

interface TableResult {
  data: any;
  error: any;
}

/** Records every select() string per table so the tests can inspect the query shape. */
function makeClient(byTable: Record<string, TableResult | (() => TableResult)>) {
  const selects: Record<string, string[]> = {};

  const from = vi.fn((table: string) => {
    const builder: any = {};
    for (const m of ['eq', 'in', 'order', 'is', 'neq', 'limit']) {
      builder[m] = vi.fn(() => builder);
    }
    builder.select = vi.fn((cols?: string) => {
      (selects[table] ||= []).push(cols ?? '');
      return builder;
    });
    const resolve = () => {
      const entry = byTable[table];
      if (!entry) return { data: null, error: { message: `no stub for ${table}` } };
      return typeof entry === 'function' ? entry() : entry;
    };
    builder.single = vi.fn(() => Promise.resolve(resolve()));
    builder.then = (res: any, rej: any) => Promise.resolve(resolve()).then(res, rej);
    return builder;
  });

  return { client: { from } as any, selects };
}

let TimetableService: typeof import('@/lib/services/academic/timetable-service').TimetableService;

beforeEach(async () => {
  loggerWarn.mockClear();
  loggerError.mockClear();
  vi.resetModules();
  ({ TimetableService } = await import('@/lib/services/academic/timetable-service'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TimetableService.getTimetable — available_sections', () => {
  it('returns the semester\'s sections instead of a phantom-relationship zero', async () => {
    const { client } = makeClient({
      timetables: { data: TIMETABLE_ROW, error: null },
      sections: {
        data: [{ id: SECTION_A, section_name: 'A' }],
        error: null
      },
      learners_profiles: { data: [{ section_id: SECTION_A }], error: null }
    });
    (TimetableService as any).supabase = client;

    const result: any = await TimetableService.getTimetable(TIMETABLE_ID);

    expect(result.available_sections).toHaveLength(1);
    expect(result.available_sections[0]).toMatchObject({
      id: SECTION_A,
      section_name: 'A'
    });
  });

  it('never asks PostgREST for a `students` relationship — no such table exists', async () => {
    const { client, selects } = makeClient({
      timetables: { data: TIMETABLE_ROW, error: null },
      sections: { data: [{ id: SECTION_A, section_name: 'A' }], error: null },
      learners_profiles: { data: [], error: null }
    });
    (TimetableService as any).supabase = client;

    await TimetableService.getTimetable(TIMETABLE_ID);

    const sectionSelects = (selects.sections || []).join(' ');
    expect(sectionSelects).not.toMatch(/students/);
    expect(sectionSelects).toContain('section_name');
  });

  it('counts only active learners per section', async () => {
    const OTHER = '00000000-0000-4000-8000-0000000000ff';
    const { client } = makeClient({
      timetables: { data: TIMETABLE_ROW, error: null },
      sections: {
        data: [
          { id: SECTION_A, section_name: 'A' },
          { id: OTHER, section_name: 'B' }
        ],
        error: null
      },
      learners_profiles: {
        data: [
          { section_id: SECTION_A },
          { section_id: SECTION_A },
          { section_id: OTHER }
        ],
        error: null
      }
    });
    (TimetableService as any).supabase = client;

    const result: any = await TimetableService.getTimetable(TIMETABLE_ID);

    const byId = Object.fromEntries(
      result.available_sections.map((s: any) => [s.id, s.student_count])
    );
    expect(byId[SECTION_A]).toBe(2);
    expect(byId[OTHER]).toBe(1);
  });

  it('still lists sections when the headcount query fails', async () => {
    // The whole point of the bug. A decoration must not be able to erase the
    // thing it decorates: a section with an unknown headcount is still a
    // section, and "0 section(s)" sends the user hunting a data problem that
    // does not exist.
    const { client } = makeClient({
      timetables: { data: TIMETABLE_ROW, error: null },
      sections: { data: [{ id: SECTION_A, section_name: 'A' }], error: null },
      learners_profiles: { data: null, error: { message: 'statement timeout' } }
    });
    (TimetableService as any).supabase = client;

    const result: any = await TimetableService.getTimetable(TIMETABLE_ID);

    expect(result.available_sections).toHaveLength(1);
    expect(result.available_sections[0].student_count).toBe(0);
  });

  it('logs when the sections query itself fails rather than reporting zero silently', async () => {
    const { client } = makeClient({
      timetables: { data: TIMETABLE_ROW, error: null },
      sections: { data: null, error: { message: 'permission denied', code: '42501' } }
    });
    (TimetableService as any).supabase = client;

    const result: any = await TimetableService.getTimetable(TIMETABLE_ID);

    // Still resolves — the timetable itself is usable without the stat.
    expect(result.id).toBe(TIMETABLE_ID);
    expect(loggerWarn).toHaveBeenCalledWith(
      'academic/timetables',
      expect.stringMatching(/section/i),
      expect.anything()
    );
  });

  it('does not query sections at all for a section-level timetable', async () => {
    const { client, selects } = makeClient({
      timetables: {
        data: { ...TIMETABLE_ROW, timetable_type: 'section', section_id: SECTION_A },
        error: null
      }
    });
    (TimetableService as any).supabase = client;

    await TimetableService.getTimetable(TIMETABLE_ID);

    expect(selects.sections).toBeUndefined();
  });
});
