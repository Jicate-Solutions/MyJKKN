/**
 * BUG-005985 (2026-08-28, MR. ESWARAMOORTHI M, faculty, JKKN College of
 * Pharmacy): "august 26 is a holiday kindly change to holiday". The
 * institution-wide leave "Miladi Nabi Holiday" (2026-08-26) was approved on
 * 2026-08-24, yet My Classes still listed his class that day - both of his
 * timetables are regular (weekday-keyed), and only cycle timetables skipped
 * holidays (via get_cycle_for_date).
 */
import { describe, it, expect } from 'vitest';
import { isTimetableOnApprovedLeave } from '@/lib/utils/academic/approved-leave-scope';

const PHARMACY = 'pharmacy-inst';
const OTHER_INST = 'other-inst';

// Shape of prod leave b701472e (institution scope: all lists empty).
const miladiNabi = {
  institution_id: PHARMACY,
  start_date: '2026-08-26',
  end_date: '2026-08-26',
  department_ids: [],
  semester_ids: [],
  section_ids: []
};

// Shape of prod timetable de410924 "I PHARM D" (regular format).
const iPharmD = {
  institution_id: PHARMACY,
  department_id: 'dept-pharmd',
  semester_id: 'sem-1',
  section_id: 'sec-a',
  sections: { id: 'sec-a' }
};

describe('isTimetableOnApprovedLeave', () => {
  it('covers every timetable of the institution on an institution-wide holiday', () => {
    expect(isTimetableOnApprovedLeave(iPharmD, '2026-08-26', [miladiNabi])).toBe(true);
  });

  it('does not cover the days either side of the holiday', () => {
    expect(isTimetableOnApprovedLeave(iPharmD, '2026-08-25', [miladiNabi])).toBe(false);
    expect(isTimetableOnApprovedLeave(iPharmD, '2026-08-27', [miladiNabi])).toBe(false);
  });

  it("ignores another institution's holiday", () => {
    const elsewhere = { ...miladiNabi, institution_id: OTHER_INST };
    expect(isTimetableOnApprovedLeave(iPharmD, '2026-08-26', [elsewhere])).toBe(false);
  });

  it('covers a multi-day leave on an inner date', () => {
    const week = { ...miladiNabi, start_date: '2026-08-24', end_date: '2026-08-29' };
    expect(isTimetableOnApprovedLeave(iPharmD, '2026-08-26', [week])).toBe(true);
  });

  it('applies a department-scoped leave only to that department', () => {
    const deptLeave = { ...miladiNabi, department_ids: ['dept-bpharm'] };
    expect(isTimetableOnApprovedLeave(iPharmD, '2026-08-26', [deptLeave])).toBe(false);
    expect(
      isTimetableOnApprovedLeave({ ...iPharmD, department_id: 'dept-bpharm' }, '2026-08-26', [deptLeave])
    ).toBe(true);
  });

  it('applies a semester-scoped leave only to that semester', () => {
    const semLeave = { ...miladiNabi, semester_ids: ['sem-4'] };
    expect(isTimetableOnApprovedLeave(iPharmD, '2026-08-26', [semLeave])).toBe(false);
    expect(
      isTimetableOnApprovedLeave({ ...iPharmD, semester_id: 'sem-4' }, '2026-08-26', [semLeave])
    ).toBe(true);
  });

  it('matches a section-scoped leave through section_id, section_ids or the joined sections', () => {
    const secLeave = { ...miladiNabi, section_ids: ['sec-b'] };
    expect(isTimetableOnApprovedLeave(iPharmD, '2026-08-26', [secLeave])).toBe(false);
    // Semester-level timetable: section_id null, sections carried in section_ids.
    const multi = { ...iPharmD, section_id: null, sections: null, section_ids: ['sec-a', 'sec-b'] };
    expect(isTimetableOnApprovedLeave(multi, '2026-08-26', [secLeave])).toBe(true);
    const joinedArray = { ...iPharmD, section_id: null, sections: [{ id: 'sec-b' }] };
    expect(isTimetableOnApprovedLeave(joinedArray, '2026-08-26', [secLeave])).toBe(true);
  });

  it('treats no leaves as a working day', () => {
    expect(isTimetableOnApprovedLeave(iPharmD, '2026-08-26', [])).toBe(false);
    expect(isTimetableOnApprovedLeave(iPharmD, '2026-08-26', null)).toBe(false);
  });
});
