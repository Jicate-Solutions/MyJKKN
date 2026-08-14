/**
 * The attendance dashboard stops asking whether a learner has paid.
 *
 * Every assertion here is a RELATIONSHIP, never a live number: the estate's
 * counts move hourly as marking proceeds, so a test pinned to "5,383" would be
 * red by tomorrow and would prove nothing today. What must always hold:
 *
 *   marked + unmarked === total at every level of the tree
 *   a parent === the exact sum of its children
 *   percentage === present ÷ MARKED, and no reading at all when marked is 0
 *   a college with nothing in view is still listed, with the reason
 *   the pending list's day set === what the timetables actually schedule
 *
 * NOTE ON CI: this repository has no general vitest job — every workflow names
 * its test files explicitly, and none globs `__tests__/**`. Run this file with
 *   npx vitest run __tests__/academic/attendance/dashboard-counts-provisional-learners.test.ts
 */

import { describe, expect, it, vi } from 'vitest';

// The service builds a browser Supabase client at class-definition time, and
// reads platform policies. Neither is exercised by the pure functions below.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc: vi.fn(), from: vi.fn() })
}));
vi.mock('@/lib/policies/get-policy-client', () => ({
  getPolicyString: vi.fn(),
  getPolicyInt: vi.fn()
}));

import { AttendanceDashboardService } from '@/lib/services/academic/attendance-dashboard-service';

/** The two functions under test are implementation detail, not public API. */
const svc = AttendanceDashboardService as unknown as {
  buildStatsHierarchy: (rows: any[]) => any[];
  timetableSchedulesWeekday: (timetable: any, dayOfWeek: string) => boolean;
};

/** One flat RPC row, shaped exactly as fn_attendance_dashboard_section_stats returns it. */
function row(over: Record<string, unknown> = {}) {
  return {
    institution_id: 'inst-1',
    institution_name: 'A College',
    department_id: 'dept-1',
    department_name: 'A Department',
    semester_id: 'sem-1',
    semester_name: 'Semester 1',
    section_id: 'sec-1',
    section_name: 'Section A',
    // bigint arrives as a string over PostgREST — deliberately modelled as such
    total_students: '10',
    present: '6',
    absent: '1',
    marked: '7',
    is_unplaced: false,
    is_empty_view: false,
    ...over
  };
}

describe('buildStatsHierarchy — marked/unmarked spine', () => {
  it('marked + unmarked equals the headcount at every level', () => {
    const [institution] = svc.buildStatsHierarchy([
      row(),
      row({ section_id: 'sec-2', total_students: '20', present: '5', absent: '3', marked: '8' }),
      row({
        department_id: 'dept-2',
        semester_id: 'sem-2',
        section_id: 'sec-3',
        total_students: '4',
        present: '0',
        absent: '0',
        marked: '0'
      })
    ]);

    const check = (node: any) =>
      expect(node.total_marked + node.total_unmarked).toBe(node.total_students);

    check(institution);
    institution.departments.forEach((department: any) => {
      check(department);
      department.semesters.forEach((semester: any) => {
        check(semester);
        semester.sections.forEach((section: any) =>
          expect(section.marked + section.unmarked).toBe(section.total_students)
        );
      });
    });
  });

  it('every parent is exactly the sum of its children', () => {
    const [institution] = svc.buildStatsHierarchy([
      row(),
      row({ section_id: 'sec-2', total_students: '20', present: '5', absent: '3', marked: '8' }),
      row({
        department_id: 'dept-2',
        semester_id: 'sem-2',
        section_id: 'sec-3',
        total_students: '4',
        present: '2',
        absent: '1',
        marked: '3'
      })
    ]);

    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

    institution.departments.forEach((department: any) => {
      department.semesters.forEach((semester: any) => {
        const sections = semester.sections;
        expect(semester.total_students).toBe(sum(sections.map((s: any) => s.total_students)));
        expect(semester.total_present).toBe(sum(sections.map((s: any) => s.present)));
        expect(semester.total_marked).toBe(sum(sections.map((s: any) => s.marked)));
        expect(semester.total_unmarked).toBe(sum(sections.map((s: any) => s.unmarked)));
      });
      const semesters = department.semesters;
      expect(department.total_students).toBe(sum(semesters.map((s: any) => s.total_students)));
      expect(department.total_marked).toBe(sum(semesters.map((s: any) => s.total_marked)));
      expect(department.total_unmarked).toBe(sum(semesters.map((s: any) => s.total_unmarked)));
    });

    const departments = institution.departments;
    expect(institution.total_students).toBe(sum(departments.map((d: any) => d.total_students)));
    expect(institution.total_marked).toBe(sum(departments.map((d: any) => d.total_marked)));
    expect(institution.total_unmarked).toBe(sum(departments.map((d: any) => d.total_unmarked)));
  });

  it('divides by learners marked, not by the headcount', () => {
    // The case the Director named: 1 present out of 1 marked, from a cohort of
    // 93 where 92 were never marked. The old rule reported 1%.
    const [institution] = svc.buildStatsHierarchy([
      row({ total_students: '93', present: '1', absent: '0', marked: '1' })
    ]);

    expect(institution.attendance_percentage).toBe(100);
    // ...which is only honest because the backlog travels with it.
    expect(institution.total_unmarked).toBe(92);
    expect(institution.total_marked).toBe(1);
  });

  it('reports no rate at all when nobody has been marked', () => {
    const [institution] = svc.buildStatsHierarchy([
      row({ total_students: '30', present: '0', absent: '0', marked: '0' })
    ]);

    // 0, not NaN and not a division by the headcount. The UI renders a dash for
    // this case rather than a "0% — Poor" grade nobody earned.
    expect(institution.attendance_percentage).toBe(0);
    expect(institution.total_marked).toBe(0);
    expect(institution.total_unmarked).toBe(30);
  });

  it('never reports a negative backlog if marked overshoots the headcount', () => {
    const [institution] = svc.buildStatsHierarchy([
      row({ total_students: '5', present: '5', absent: '0', marked: '9' })
    ]);

    expect(institution.total_unmarked).toBe(0);
    expect(institution.total_marked).toBeLessThanOrEqual(institution.total_students);
  });
});

describe('buildStatsHierarchy — the cases that used to be silent', () => {
  it('keeps a college with nothing in view, as an explicit zero', () => {
    const stats = svc.buildStatsHierarchy([
      row(),
      row({
        institution_id: 'inst-2',
        institution_name: 'B College',
        department_id: null,
        department_name: null,
        semester_id: null,
        semester_name: null,
        section_id: null,
        section_name: null,
        total_students: '0',
        present: '0',
        absent: '0',
        marked: '0',
        is_empty_view: true
      })
    ]);

    // Listed, not dropped — that is the whole point.
    expect(stats).toHaveLength(2);
    const empty = stats.find((i: any) => i.institution_id === 'inst-2');
    expect(empty.is_empty_view).toBe(true);
    expect(empty.total_students).toBe(0);
    // And it does not invent an "Unknown Department" to hang the zero on.
    expect(empty.departments).toHaveLength(0);

    const real = stats.find((i: any) => i.institution_id === 'inst-1');
    expect(real.is_empty_view).toBe(false);
  });

  it('flags learners with no section instead of calling them an unknown section', () => {
    const [institution] = svc.buildStatsHierarchy([
      row(),
      row({
        section_id: null,
        section_name: 'Unknown Section',
        total_students: '12',
        present: '0',
        absent: '0',
        marked: '0',
        is_unplaced: true
      })
    ]);

    const sections = institution.departments[0].semesters[0].sections;
    const unplaced = sections.filter((s: any) => s.is_unplaced);
    expect(unplaced).toHaveLength(1);
    expect(unplaced[0].total_students).toBe(12);
    // The placed learners are untouched by the grouping.
    expect(sections.filter((s: any) => !s.is_unplaced)).toHaveLength(1);
  });

  it('counts unplaced learners in the headcount but never in the rate', () => {
    const [institution] = svc.buildStatsHierarchy([
      row({ total_students: '10', present: '8', absent: '2', marked: '10' }),
      row({
        section_id: null,
        total_students: '40',
        present: '0',
        absent: '0',
        marked: '0',
        is_unplaced: true
      })
    ]);

    // counted + unplaced === intake
    expect(institution.total_students).toBe(50);
    // ...and the 40 who cannot be marked do not drag the rate to 16%.
    expect(institution.attendance_percentage).toBe(80);
    expect(institution.total_unmarked).toBe(40);
  });
});

describe('buildStatsHierarchy — safe against an unapplied migration', () => {
  it('derives marked from present + absent when the RPC does not return it', () => {
    // The migration adding `marked` is Director-gated. Until it is applied the
    // old function still answers, and its rows carry no `marked` column.
    const [institution] = svc.buildStatsHierarchy([
      row({ total_students: '50', present: '30', absent: '10', marked: undefined })
    ]);

    expect(institution.total_marked).toBe(40);
    expect(institution.total_unmarked).toBe(10);
    // 30 of 40 marked — not 30 of 50, and emphatically not "nobody marked yet".
    expect(institution.attendance_percentage).toBe(75);
  });

  it('labels a section-less row as unplaced from the old shape too', () => {
    const [institution] = svc.buildStatsHierarchy([
      row({ section_id: null, is_unplaced: undefined, total_students: '7' })
    ]);

    const sections = institution.departments[0].semesters[0].sections;
    expect(sections[0].is_unplaced).toBe(true);
  });
});

describe('timetableSchedulesWeekday — the pending list stops hiding Saturday', () => {
  const selectedDays = (...days: string[]) => ({
    timetable_format: 'regular',
    selected_days: days,
    timetable_data: {}
  });

  it('lists a Saturday the timetable actually schedules', () => {
    const t = selectedDays('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');
    expect(svc.timetableSchedulesWeekday(t, 'SATURDAY')).toBe(true);
  });

  it('drops Sunday because nothing selects it, not because of a day number', () => {
    const everyTeachingDay = selectedDays(
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY'
    );
    expect(svc.timetableSchedulesWeekday(everyTeachingDay, 'SUNDAY')).toBe(false);

    // The proof it is data-driven: a timetable that DID select Sunday is listed.
    const sundaySchool = selectedDays('SUNDAY');
    expect(svc.timetableSchedulesWeekday(sundaySchool, 'SUNDAY')).toBe(true);
  });

  it('drops a weekday the timetable does not schedule', () => {
    const weekdaysOnly = selectedDays('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY');
    expect(svc.timetableSchedulesWeekday(weekdaysOnly, 'SATURDAY')).toBe(false);
  });

  it('accepts a day present in timetable_data but missing from selected_days', () => {
    // Measured on production: 3 weekday slots exist in timetable_data with no
    // matching selected_days entry. Gating on selected_days alone would drop
    // rows that are listed today, so the rule is the union of the two.
    const t = {
      timetable_format: 'regular',
      selected_days: ['MONDAY'],
      timetable_data: { SATURDAY: { 'p-1': { course_id: 'c-1' } } }
    };
    expect(svc.timetableSchedulesWeekday(t, 'SATURDAY')).toBe(true);
  });

  it('is case- and whitespace-insensitive about the day name', () => {
    const t = { timetable_format: 'regular', selected_days: [' saturday '], timetable_data: {} };
    expect(svc.timetableSchedulesWeekday(t, 'SATURDAY')).toBe(true);
  });

  it('leaves cycle timetables to their own date-to-cycle map', () => {
    const cycle = { timetable_format: 'cycle', selected_days: ['MONDAY'], timetable_data: {} };
    // A weekday gate here would second-guess the cycle map, which already
    // returns null for a non-teaching day.
    expect(svc.timetableSchedulesWeekday(cycle, 'SATURDAY')).toBe(true);
    expect(svc.timetableSchedulesWeekday(cycle, 'SUNDAY')).toBe(true);
  });

  it('does not silently drop a timetable that records no days at all', () => {
    const noDays = { timetable_format: 'regular', selected_days: null, timetable_data: null };
    expect(svc.timetableSchedulesWeekday(noDays, 'SUNDAY')).toBe(true);
  });
});
