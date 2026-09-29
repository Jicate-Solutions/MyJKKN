/**
 * Pins the key that TimetableService.checkExistingTimetable compares on.
 *
 * The rule is ONE ACTIVE TIMETABLE PER SECTION, PER ACADEMIC YEAR — and the
 * key is exactly that: `academic_year_id + section_id + is_active`.
 *
 * WHY THE SCOPE SHRANK
 * The key used to be seven columns (institution + academic_year + degree +
 * program + department + semester + section). All six extras are functionally
 * determined by the section: `sections` carries institution_id, degree_id,
 * program_id, department_id AND semester_id. A section_id match has therefore
 * already pinned every one of them, and re-asserting a determined column can
 * only narrow a match section_id had already made — never widen it. They were
 * dead weight whose only possible effect was a false negative once the two
 * copies of a value drifted apart.
 *
 * THE TWO SEMESTERS OF AN ACADEMIC YEAR ARE UNAFFECTED
 * A section row belongs to exactly one semester, so "Section A" is a DIFFERENT
 * ROW in Semester III and in Semester IV, with a different id. Both timetables
 * therefore coexist in one academic year under different keys. Production
 * 2026-09-07: across 202 non-template timetables, sections.semester_id equals
 * timetables.semester_id in 202 cases — 0 divergences, 0 sections without a
 * semester. Dropping semester_id from the key removes a duplicate of the
 * section's own column, not the distinction between semesters.
 *
 * Measured the same day, collapsing the key to (academic_year, section) flags
 * exactly ONE pair — the long-standing "NEW CRRI ZENFORIANZ SECTION - A"
 * duplicate, itself a duplicate within the SAME semester. Zero legitimate rows
 * are newly blocked.
 *
 * SECTIONLESS TIMETABLES ARE UNCHANGED
 * A semester-level timetable (timetable_type='semester', section_id NULL) has
 * no section to be identified by, so it keeps the original full-hierarchy key.
 * Dropping it would leave those rows with no duplicate guard at all.
 *
 * These tests inspect the FILTERS, not just the verdict: the bug class here is
 * a key that silently matches too much or too little, and the verdict alone
 * cannot distinguish "found nothing because the scope was right" from "found
 * nothing because an extra .eq() excluded it".
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

const INSTITUTION = 'i0000000-0000-0000-0000-000000000001';
const ACADEMIC_YEAR = 'a0000000-0000-0000-0000-000000000001';
const DEGREE = 'd0000000-0000-0000-0000-000000000001';
const PROGRAM = 'p0000000-0000-0000-0000-000000000001';
const DEPARTMENT = 'e0000000-0000-0000-0000-000000000001';
const SEMESTER_3 = 's0000000-0000-0000-0000-000000000003';
const SEMESTER_4 = 's0000000-0000-0000-0000-000000000004';
/**
 * Two rows, both named "A". `sections` carries semester_id, so a section
 * belongs to one semester and the same display name is a distinct row in each.
 */
const SECTION_A = 'c0000000-0000-0000-0000-00000000000a';
const SECTION_A_SEM_4 = 'c0000000-0000-0000-0000-00000000000b';

/** The full seven-key argument every caller still passes. */
const FULL_SCOPE = {
  institution_id: INSTITUTION,
  academic_year_id: ACADEMIC_YEAR,
  degree_id: DEGREE,
  program_id: PROGRAM,
  department_id: DEPARTMENT,
  semester_id: SEMESTER_3,
  section_id: SECTION_A
};

/** An existing row as the embedded select returns it. */
const EXISTING_ROW = {
  id: 't0000000-0000-0000-0000-000000000001',
  timetable_name: 'CSE III A - Odd',
  start_date: '2026-06-01',
  end_date: '2026-11-30',
  semesters: { semester_name: 'Semester 3' },
  sections: { section_name: 'A' }
};

interface Filters {
  eq: Array<[string, any]>;
  is: Array<[string, any]>;
  neq: Array<[string, any]>;
  not: Array<[string, string, any]>;
}

/** Records every filter applied to `timetables` so the tests can read the key. */
function makeClient(rows: any[] | null, error: any = null) {
  const filters: Filters = { eq: [], is: [], neq: [], not: [] };

  const from = vi.fn(() => {
    const builder: any = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((col: string, val: any) => {
      filters.eq.push([col, val]);
      return builder;
    });
    builder.is = vi.fn((col: string, val: any) => {
      filters.is.push([col, val]);
      return builder;
    });
    builder.neq = vi.fn((col: string, val: any) => {
      filters.neq.push([col, val]);
      return builder;
    });
    builder.not = vi.fn((col: string, op: string, val: any) => {
      filters.not.push([col, op, val]);
      return builder;
    });
    builder.then = (res: any, rej: any) =>
      Promise.resolve({ data: rows, error }).then(res, rej);
    return builder;
  });

  return { client: { from } as any, filters };
}

const cols = (pairs: Array<[string, any]>) => pairs.map(([c]) => c);

let TimetableService: typeof import('@/lib/services/academic/timetable-service').TimetableService;

beforeEach(async () => {
  vi.resetModules();
  ({ TimetableService } = await import('@/lib/services/academic/timetable-service'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkExistingTimetable - a section-scoped timetable', () => {
  it('keys on academic_year + section + is_active and nothing else', async () => {
    const { client, filters } = makeClient([]);
    (TimetableService as any).supabase = client;

    await TimetableService.checkExistingTimetable(FULL_SCOPE);

    expect(filters.eq).toEqual(
      expect.arrayContaining([
        ['academic_year_id', ACADEMIC_YEAR],
        ['section_id', SECTION_A],
        ['is_active', true]
      ])
    );
    expect(filters.eq).toHaveLength(3);
  });

  it('does not re-assert the hierarchy that section_id already pins', async () => {
    const { client, filters } = makeClient([]);
    (TimetableService as any).supabase = client;

    await TimetableService.checkExistingTimetable(FULL_SCOPE);

    expect(cols(filters.eq)).not.toContain('institution_id');
    expect(cols(filters.eq)).not.toContain('degree_id');
    expect(cols(filters.eq)).not.toContain('program_id');
    expect(cols(filters.eq)).not.toContain('department_id');
  });

  it('does not filter on semester - the section row already carries it', async () => {
    const { client, filters } = makeClient([]);
    (TimetableService as any).supabase = client;

    await TimetableService.checkExistingTimetable(FULL_SCOPE);

    expect(cols(filters.eq)).not.toContain('semester_id');
  });

  it('lets both semesters of one academic year through - they are different sections', async () => {
    const { client, filters } = makeClient([]);
    (TimetableService as any).supabase = client;

    // The even-semester timetable for what an operator calls "Section A". It is
    // NOT SECTION_A: `sections` is keyed per semester, so Semester IV's A is
    // its own row. The sem-3 timetable already on SECTION_A is outside this
    // query's WHERE clause and cannot be returned as a conflict.
    await TimetableService.checkExistingTimetable({
      ...FULL_SCOPE,
      semester_id: SEMESTER_4,
      section_id: SECTION_A_SEM_4
    });

    expect(filters.eq).toContainEqual(['section_id', SECTION_A_SEM_4]);
    expect(filters.eq).not.toContainEqual(['section_id', SECTION_A]);
  });

  it('reports the conflict when the same section already has one in that year', async () => {
    const { client } = makeClient([EXISTING_ROW]);
    (TimetableService as any).supabase = client;

    const result = await TimetableService.checkExistingTimetable(FULL_SCOPE);

    expect(result.exists).toBe(true);
    expect(result.message).toContain('Section A');
    expect(result.message).toContain('CSE III A - Odd');
  });

  it('leaves a different section in the same academic year alone', async () => {
    const { client, filters } = makeClient([]);
    (TimetableService as any).supabase = client;

    const result = await TimetableService.checkExistingTimetable(FULL_SCOPE);

    // The section is the discriminator: it is in the WHERE clause, so a row for
    // any other section can never come back in the first place.
    expect(filters.eq).toContainEqual(['section_id', SECTION_A]);
    expect(result.exists).toBe(false);
  });

  it('ignores templates - a template is not a section\'s timetable', async () => {
    const { client, filters } = makeClient([]);
    (TimetableService as any).supabase = client;

    await TimetableService.checkExistingTimetable(FULL_SCOPE);

    // Templates live in this same table. One active template in production
    // carries BOTH an academic year and a section, so without this filter it
    // would refuse the real timetable for that section - and the operator would
    // be pointed at a row that is not a timetable at all. `IS NOT TRUE` rather
    // than `= false` so a NULL flag can never slip a template through.
    expect(filters.not).toContainEqual(['is_template', 'is', true]);
  });

  it('excludes the timetable being edited inside the query, not after it', async () => {
    const { client, filters } = makeClient([]);
    (TimetableService as any).supabase = client;

    await TimetableService.checkExistingTimetable({
      ...FULL_SCOPE,
      exclude_timetable_id: EXISTING_ROW.id
    });

    expect(filters.neq).toContainEqual(['id', EXISTING_ROW.id]);
  });
});

describe('checkExistingTimetable - a semester-level (sectionless) timetable', () => {
  const SECTIONLESS = { ...FULL_SCOPE, section_id: undefined };

  it('keeps the full hierarchy key, since there is no section to key on', async () => {
    const { client, filters } = makeClient([]);
    (TimetableService as any).supabase = client;

    await TimetableService.checkExistingTimetable(SECTIONLESS);

    expect(filters.is).toContainEqual(['section_id', null]);
    expect(filters.eq).toEqual(
      expect.arrayContaining([
        ['academic_year_id', ACADEMIC_YEAR],
        ['is_active', true],
        ['institution_id', INSTITUTION],
        ['degree_id', DEGREE],
        ['program_id', PROGRAM],
        ['department_id', DEPARTMENT],
        ['semester_id', SEMESTER_3]
      ])
    );
  });

  it('still distinguishes semesters, so odd and even may coexist', async () => {
    const { client, filters } = makeClient([]);
    (TimetableService as any).supabase = client;

    await TimetableService.checkExistingTimetable({
      ...SECTIONLESS,
      semester_id: SEMESTER_4
    });

    expect(filters.eq).toContainEqual(['semester_id', SEMESTER_4]);
  });
});

/**
 * THE SEMESTER-LEVEL BRANCH IS A DATE-RANGE RULE, NOT A "ONE PER YEAR" RULE.
 *
 * A semester-level timetable has no section. The rule the section branch
 * enforces — one per section per academic year — has nothing to key on here,
 * and applying it anyway makes the FIRST semester-level timetable of a year the
 * only one that department may ever create. Production 2026-09-10, JKKN Dental
 * "4 Year": "4th Year 2026-2027 DRAVENCOREZ THEORY" (section_id NULL,
 * 2026-01-05 → 2027-01-05) permanently refused every later semester-level
 * timetable in that year, and the HOD's report is exactly that.
 *
 * WHY OVERLAP IS THE RIGHT KEY HERE
 * Semester-level rows are resolved for a learner by
 * StudentTimetableService.selectBestTimetable, which collects every candidate
 * and then returns THE ONE whose date range covers today. Disjoint ranges are
 * therefore unambiguous — each is the answer on its own days. Two ranges that
 * overlap are not: one of them is silently invisible to learners and to
 * attendance, which is the conflict actually worth refusing.
 *
 * A missing bound is unbounded on that side, so it overlaps everything. That
 * keeps the dateless hole in the old rule shut: a dateless semester-level
 * timetable still conflicts with any other.
 */
describe('checkExistingTimetable - semester-level rows conflict on dates, not on the year', () => {
  const SECTIONLESS = {
    ...FULL_SCOPE,
    section_id: undefined,
    start_date: '2026-12-01',
    end_date: '2027-03-31'
  };

  /** The blocking row from the production report, dates included. */
  const YEAR_LONG = {
    id: 't0000000-0000-0000-0000-000000000009',
    timetable_name: '4th Year 2026-2027 DRAVENCOREZ THEORY',
    start_date: '2026-01-05',
    end_date: '2027-01-05',
    semesters: { semester_name: '4 Year' },
    sections: null
  };

  it('allows a second semester-level timetable whose dates do not overlap', async () => {
    const { client } = makeClient([
      { ...YEAR_LONG, start_date: '2026-06-01', end_date: '2026-11-30' }
    ]);
    (TimetableService as any).supabase = client;

    const result = await TimetableService.checkExistingTimetable(SECTIONLESS);

    expect(result.exists).toBe(false);
  });

  it('refuses one whose dates overlap an existing semester-level timetable', async () => {
    const { client } = makeClient([YEAR_LONG]);
    (TimetableService as any).supabase = client;

    const result = await TimetableService.checkExistingTimetable(SECTIONLESS);

    expect(result.exists).toBe(true);
    expect(result.message).toContain('DRAVENCOREZ THEORY');
  });

  it('reports the overlapping row, not merely the first row returned', async () => {
    const { client } = makeClient([
      { ...YEAR_LONG, id: 'x', timetable_name: 'Spent - last term', start_date: '2025-01-01', end_date: '2025-12-31' },
      YEAR_LONG
    ]);
    (TimetableService as any).supabase = client;

    const result = await TimetableService.checkExistingTimetable(SECTIONLESS);

    expect(result.exists).toBe(true);
    expect(result.message).toContain('DRAVENCOREZ THEORY');
    expect(result.message).not.toContain('Spent - last term');
  });

  it('treats a missing bound as unbounded, so a dateless row still conflicts', async () => {
    const { client } = makeClient([
      { ...YEAR_LONG, start_date: null, end_date: null }
    ]);
    (TimetableService as any).supabase = client;

    const result = await TimetableService.checkExistingTimetable(SECTIONLESS);

    expect(result.exists).toBe(true);
  });

  it('treats a dateless NEW timetable as unbounded too', async () => {
    const { client } = makeClient([YEAR_LONG]);
    (TimetableService as any).supabase = client;

    const result = await TimetableService.checkExistingTimetable({
      ...SECTIONLESS,
      start_date: undefined,
      end_date: undefined
    });

    expect(result.exists).toBe(true);
  });

  it('words the conflict for a semester, and never tells the operator to fix a section they never chose', async () => {
    const { client } = makeClient([YEAR_LONG]);
    (TimetableService as any).supabase = client;

    const result = await TimetableService.checkExistingTimetable(SECTIONLESS);

    expect(result.conflictScope).toBe('semester');
    expect(result.message).toContain('4 Year');
    expect(result.message).not.toMatch(/A section may hold only one/);
  });

  it('leaves the section rule unconditional - dates never excuse a taken section', async () => {
    const { client } = makeClient([
      { ...EXISTING_ROW, start_date: '2020-01-01', end_date: '2020-12-31' }
    ]);
    (TimetableService as any).supabase = client;

    const result = await TimetableService.checkExistingTimetable({
      ...FULL_SCOPE,
      start_date: '2026-12-01',
      end_date: '2027-03-31'
    });

    expect(result.exists).toBe(true);
    expect(result.conflictScope).toBe('section');
  });
});
