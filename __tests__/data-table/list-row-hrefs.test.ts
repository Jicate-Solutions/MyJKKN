/**
 * Where each opted-in list row opens.
 *
 * The row-tap MECHANISM is already proven by `row-navigation.test.ts` (a tap on
 * a plain cell opens the row; a tap on the tick box, menu or link does not; a
 * table with no `rowHref` renders exactly what it rendered before). None of
 * that is retested here.
 *
 * What that file cannot prove is the part that is different on every page: the
 * DESTINATION. A builder that returns a plausible-looking but wrong path gives
 * the Director a row that looks tappable and lands on a 404 — the same bug as
 * an untappable row, wearing a better costume. So each builder is asserted
 * against the path its page's own `<Link>` already produces, and against the
 * `null` it must return when the row has no usable identifier.
 */

import { describe, it, expect } from 'vitest';

import {
  admissionApplicationRowHref,
  admissionLeadRowHref,
  applicationRowHref,
  attendanceReportRowHref,
  billingScheduleRowHref,
  courseMappingRowHref,
  courseRowHref,
  degreeRowHref,
  departmentRowHref,
  maintenanceLogRowHref,
  programRowHref,
  sectionRowHref,
  semesterRowHref,
  staffPlanningRowHref
} from '@/components/data-table/utils/list-row-hrefs';

const ID = '9f8c1d2e-4a5b-6c7d-8e9f-0a1b2c3d4e5f';

/**
 * One entry per opted-in list page: the builder, a row shaped like that page's
 * real row, and the path the page's existing name link produces for it.
 */
const PAGES: Array<{
  page: string;
  build: (row: never) => string | null;
  row: Record<string, unknown>;
  expected: string;
}> = [
  {
    page: 'academic/attendance/reports',
    build: attendanceReportRowHref as (row: never) => string | null,
    row: { id: ID },
    expected: `/academic/attendance/reports/${ID}`
  },
  {
    page: 'academic/staff-planning',
    build: staffPlanningRowHref as (row: never) => string | null,
    row: { id: ID },
    expected: `/academic/staff-planning/${ID}`
  },
  {
    // An application IS a lead; /admission/applications/[id] only redirects here.
    page: 'admission/applications',
    build: admissionApplicationRowHref as (row: never) => string | null,
    row: { id: ID },
    expected: `/admission/leads/${ID}`
  },
  {
    page: 'admission/leads',
    build: admissionLeadRowHref as (row: never) => string | null,
    row: { id: ID },
    expected: `/admission/leads/${ID}`
  },
  {
    page: 'applications',
    build: applicationRowHref as (row: never) => string | null,
    row: { id: ID },
    expected: `/applications/${ID}`
  },
  {
    // Keyed on the learner, not the bill: there is no bill detail page.
    page: 'billing/schedule',
    build: billingScheduleRowHref as (row: never) => string | null,
    row: { id: 'bill-row-id', student_id: ID },
    expected: `/billing/schedule/students/${ID}`
  },
  {
    page: 'resource-management/maintenance',
    build: maintenanceLogRowHref as (row: never) => string | null,
    row: { id: ID },
    expected: `/resource-management/maintenance/${ID}`
  },
  {
    page: 'organizations/courses',
    build: courseRowHref as (row: never) => string | null,
    row: { id: ID },
    expected: `/organizations/courses/${ID}`
  },
  {
    page: 'organizations/courses/mappings',
    build: courseMappingRowHref as (row: never) => string | null,
    row: { id: ID },
    expected: `/organizations/courses/mappings/${ID}`
  },
  {
    page: 'organizations/degrees',
    build: degreeRowHref as (row: never) => string | null,
    row: { id: ID },
    expected: `/organizations/degrees/${ID}`
  },
  {
    page: 'organizations/departments',
    build: departmentRowHref as (row: never) => string | null,
    row: { id: ID },
    expected: `/organizations/departments/${ID}`
  },
  {
    page: 'organizations/programs',
    build: programRowHref as (row: never) => string | null,
    row: { id: ID },
    expected: `/organizations/programs/${ID}`
  },
  {
    page: 'organizations/sections',
    build: sectionRowHref as (row: never) => string | null,
    row: { id: ID },
    expected: `/organizations/sections/${ID}`
  },
  {
    page: 'organizations/semesters',
    build: semesterRowHref as (row: never) => string | null,
    row: { id: ID },
    expected: `/organizations/semesters/${ID}`
  }
];

describe('list row hrefs', () => {
  it('covers every page that opted in, and no page twice', () => {
    const pages = PAGES.map((p) => p.page);
    expect(pages).toHaveLength(14);
    expect(new Set(pages).size).toBe(14);
  });

  for (const { page, build, row, expected } of PAGES) {
    it(`${page} opens the path its own name link points at`, () => {
      expect(build(row as never)).toBe(expected);
    });

    it(`${page} is inert when the row carries no identifier`, () => {
      // Every field blanked: whatever this builder keys on, it is missing.
      const blanked = Object.fromEntries(
        Object.keys(row).map((key) => [key, null])
      );
      expect(build(blanked as never)).toBeNull();

      const undef = Object.fromEntries(
        Object.keys(row).map((key) => [key, undefined])
      );
      expect(build(undef as never)).toBeNull();

      const blank = Object.fromEntries(
        Object.keys(row).map((key) => [key, '   '])
      );
      expect(build(blank as never)).toBeNull();
    });
  }

  it('an attendance report with no real report behind it stays inert', () => {
    // Grouped rows carry a synthesised placeholder id. columns.tsx already
    // refuses to link those; the row must refuse too, or the whole row would
    // open a report that does not exist.
    expect(
      attendanceReportRowHref({ id: '%%drp:id:2026-09-14-group%%' })
    ).toBeNull();
  });

  it('a billing row falls back to nothing when the bill has no learner', () => {
    // The bill's own id must NOT be used — /billing/schedule/[id] is an edit
    // form, and a stray thumb must never land there.
    expect(billingScheduleRowHref({ student_id: null })).toBeNull();
  });
});
