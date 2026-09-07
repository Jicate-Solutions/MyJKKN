import { describe, it, expect } from 'vitest';
import {
  NOT_SORTED_LABEL,
  TEACHING_CADRE_NAME,
  buildTitleRows,
  classifyStaffCadre,
  isStaffCadreSorted,
  isTeachingStaff,
  isTitleSorted,
  matchDesignationExact,
  normalizeDesignationKey,
  summariseTitleProgress,
  type DesignationOption,
} from '@/lib/services/hr/designation-mapping';

// ---------------------------------------------------------------------------
// Every job title below is a real value from `staff.designation`, read live
// 2026-08-03: staff 857 rows, 150 distinct case-insensitive titles,
// hr_designations 187 rows, hr_cadres 44 rows = exactly 4 names across 11
// organisations. Headcounts are the live ones.
// ---------------------------------------------------------------------------

const d = (
  id: string,
  name: string,
  cadre_name: string,
  cadre_id = `c-${cadre_name}`
): DesignationOption => ({ id, name, cadre_id, cadre_name });

const SENIOR_LECTURER = d('d1', 'Senior Lecturer', 'Teaching');
const LECTURER = d('d2', 'Lecturer', 'Teaching');
const READER = d('d3', 'Reader', 'Teaching');
// A title that teaches AND carries a department-head duty. 4 people hold it.
const READER_AND_HOD = d('d4', 'Reader & HOD', 'Teaching');
const BUS_DRIVER = d('d5', 'Bus Driver', 'Non-Technical');
const DENTAL_TECHNICIAN = d('d6', 'Dental Technician', 'Supporting (Technical)');
const OFFICE_ASSISTANT = d('d7', 'Office Assistant', 'Administrative');

const ALL: DesignationOption[] = [
  SENIOR_LECTURER,
  LECTURER,
  READER,
  READER_AND_HOD,
  BUS_DRIVER,
  DENTAL_TECHNICIAN,
  OFFICE_ASSISTANT,
];

describe('normalizeDesignationKey', () => {
  it('collapses case variants to one key', () => {
    expect(normalizeDesignationKey('Senior Lecturer')).toBe('senior lecturer');
    expect(normalizeDesignationKey('SENIOR LECTURER')).toBe('senior lecturer');
  });

  it('strips the trailing space that production actually carries on "Lecturer "', () => {
    expect(normalizeDesignationKey('Lecturer ')).toBe('lecturer');
    expect(normalizeDesignationKey('Lecturer')).toBe('lecturer');
  });

  it('mirrors Postgres btrim, which strips spaces only — not tabs', () => {
    // btrim(lower('Lecturer\t')) is 'lecturer\t' in Postgres. If this used
    // String.trim() the screen would claim a match the migration does not make.
    expect(normalizeDesignationKey('Lecturer\t')).toBe('lecturer\t');
  });

  it('treats null and blank as no title', () => {
    expect(normalizeDesignationKey(null)).toBe('');
    expect(normalizeDesignationKey('   ')).toBe('');
  });
});

describe('matchDesignationExact', () => {
  it('matches ignoring case — part of the 314 rows the backfill resolves for free', () => {
    expect(matchDesignationExact('SENIOR LECTURER', ALL)).toBe(SENIOR_LECTURER);
    expect(matchDesignationExact('Senior Lecturer', ALL)).toBe(SENIOR_LECTURER);
  });

  it('never matches two titles that differ by a single character', () => {
    // Production really does carry both 'Primary Teacher' (12 people) and the
    // misspelling 'Pimary Teacher' (11). They are one character apart and must
    // stay two separate rows for a human to judge. The fixture mirrors that
    // shape with a title the JKKN vocabulary gate accepts in a string literal.
    const titles = [d('p1', 'Physical Director', 'Teaching')];
    expect(matchDesignationExact('Physical Director', titles)).toBe(titles[0]);
    expect(matchDesignationExact('Phyical Director', titles)).toBeNull();
  });

  it('never prefix-matches a longer, different job', () => {
    // 'Reader' is a prefix of 'Reader & HOD'. Different jobs, 15 and 4 people.
    expect(matchDesignationExact('Reader', ALL)).toBe(READER);
    expect(matchDesignationExact('Reader & HOD', ALL)).toBe(READER_AND_HOD);
    expect(matchDesignationExact('Reader &', ALL)).toBeNull();
    expect(matchDesignationExact('Senior Lect', ALL)).toBeNull();
  });

  it('leaves an unknown title unmatched rather than guessing the nearest', () => {
    expect(matchDesignationExact('Dental College Ayaah', ALL)).toBeNull();
    expect(matchDesignationExact('Girls Hostel Scavenger', ALL)).toBeNull();
    expect(matchDesignationExact('NURSING ATTENDER', ALL)).toBeNull();
  });

  it('refuses an ambiguous match when two designations share a name', () => {
    const dupes = [d('x1', 'Tutor', 'Teaching'), d('x2', 'tutor', 'Administrative')];
    expect(matchDesignationExact('Tutor', dupes)).toBeNull();
  });

  it('matches nothing for a blank title', () => {
    expect(matchDesignationExact('', ALL)).toBeNull();
    expect(matchDesignationExact(null, ALL)).toBeNull();
  });
});

describe('classifyStaffCadre / isTeachingStaff', () => {
  it('Director decision 6, 2026-08-03: a person who both teaches and does admin counts as TEACHING', () => {
    // 'Reader & HOD' — the HOD duty is administrative, the teaching part
    // decides the answer. If any part of the role teaches, they are teaching.
    const headOfDepartment = {
      designation_id: READER_AND_HOD.id,
      cadre_name: READER_AND_HOD.cadre_name,
      is_management: true,
    };
    expect(isTeachingStaff(headOfDepartment)).toBe(true);
    expect(classifyStaffCadre(headOfDepartment)).toBe('teaching');
  });

  it('is_management alone never demotes someone out of Teaching', () => {
    const plain = { designation_id: 'd3', cadre_name: 'Teaching', is_management: false };
    const managing = { designation_id: 'd3', cadre_name: 'Teaching', is_management: true };
    expect(isTeachingStaff(plain)).toBe(isTeachingStaff(managing));
    expect(isTeachingStaff(managing)).toBe(true);
  });

  it('counts a plain teaching designation as teaching', () => {
    expect(isTeachingStaff({ designation_id: 'd1', cadre_name: TEACHING_CADRE_NAME })).toBe(true);
  });

  it('does not count the other three groups as teaching', () => {
    expect(isTeachingStaff({ designation_id: 'd5', cadre_name: 'Non-Technical' })).toBe(false);
    expect(isTeachingStaff({ designation_id: 'd6', cadre_name: 'Supporting (Technical)' })).toBe(false);
    expect(isTeachingStaff({ designation_id: 'd7', cadre_name: 'Administrative' })).toBe(false);
    expect(classifyStaffCadre({ designation_id: 'd5', cadre_name: 'Non-Technical' })).toBe('non_teaching');
  });

  it('an unsorted person is not-sorted, and is never guessed into Teaching', () => {
    // This is today's bug: all 857 staff rows read role_type='teacher',
    // Bus Driver and Attender included, because unknown was defaulted.
    expect(classifyStaffCadre({ designation_id: null, cadre_name: null })).toBe('not_sorted');
    expect(isTeachingStaff({ designation_id: null, cadre_name: null })).toBe(false);
    expect(isStaffCadreSorted({ designation_id: null, cadre_name: null })).toBe(false);
  });

  it('a designation_id whose cadre could not be resolved is not-sorted, not teaching', () => {
    expect(classifyStaffCadre({ designation_id: 'd1', cadre_name: null })).toBe('not_sorted');
    expect(isTeachingStaff({ designation_id: 'd1', cadre_name: null })).toBe(false);
  });

  it('treats a missing row as not-sorted', () => {
    expect(classifyStaffCadre(null)).toBe('not_sorted');
    expect(classifyStaffCadre(undefined)).toBe('not_sorted');
  });

  it('matches the cadre name case-insensitively', () => {
    expect(isTeachingStaff({ designation_id: 'd1', cadre_name: 'teaching' })).toBe(true);
  });
});

describe('buildTitleRows', () => {
  // Live spellings and counts: 'Senior Lecturer' 27 + 'SENIOR LECTURER' 3 = ONE
  // title of 30. 'Attender' 35 and 'Bus Driver' 30 have a single spelling each.
  const staff = [
    ...Array.from({ length: 27 }, (_, i) => ({ id: `a${i}`, designation: 'Senior Lecturer' })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `b${i}`, designation: 'SENIOR LECTURER' })),
    ...Array.from({ length: 35 }, (_, i) => ({ id: `c${i}`, designation: 'Attender' })),
    ...Array.from({ length: 15 }, (_, i) => ({ id: `e${i}`, designation: 'Reader' })),
  ];

  it('collapses case variants into ONE row whose headcount is their sum', () => {
    const rows = buildTitleRows(staff);
    const senior = rows.find((r) => r.key === 'senior lecturer');
    expect(senior).toBeDefined();
    expect(senior!.headcount).toBe(30);
    expect(senior!.variants).toContain('Senior Lecturer');
    expect(senior!.variants).toContain('SENIOR LECTURER');
    // One row, not two — so mapping it once maps both spellings.
    expect(rows.filter((r) => r.key === 'senior lecturer')).toHaveLength(1);
  });

  it('labels the title with the spelling most people carry', () => {
    const rows = buildTitleRows(staff);
    expect(rows.find((r) => r.key === 'senior lecturer')!.label).toBe('Senior Lecturer');
  });

  it('orders biggest headcount first', () => {
    const rows = buildTitleRows(staff);
    expect(rows.map((r) => r.headcount)).toEqual([35, 30, 15]);
  });

  it('collapses a trailing-space variant with its trimmed twin', () => {
    const rows = buildTitleRows([
      { id: '1', designation: 'Lecturer' },
      { id: '2', designation: 'Lecturer ' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].headcount).toBe(2);
  });

  it('reports a title as sorted only when every person under it is sorted', () => {
    const rows = buildTitleRows([
      { id: '1', designation: 'Bus Driver', designation_id: 'd5' },
      { id: '2', designation: 'Bus Driver', designation_id: null },
    ]);
    expect(rows[0].sortedCount).toBe(1);
    expect(rows[0].headcount).toBe(2);
    expect(rows[0].designationId).toBeNull();
    expect(isTitleSorted(rows[0])).toBe(false);
  });

  it('claims a designation only when everyone under the title agrees', () => {
    const agreed = buildTitleRows([
      { id: '1', designation: 'Bus Driver', designation_id: 'd5' },
      { id: '2', designation: 'BUS DRIVER', designation_id: 'd5' },
    ]);
    expect(agreed[0].designationId).toBe('d5');
    expect(isTitleSorted(agreed[0])).toBe(true);

    // Designations are per-organisation, so the same title legitimately maps to
    // two different hr_designations rows across two colleges. Everyone here IS
    // sorted — the title just has no single value to show in one dropdown.
    const split = buildTitleRows([
      { id: '1', designation: 'Tutor', designation_id: 'dA' },
      { id: '2', designation: 'Tutor', designation_id: 'dB' },
    ]);
    expect(split[0].designationId).toBeNull();
    expect(split[0].sortedCount).toBe(2);
    expect(isTitleSorted(split[0])).toBe(true);
  });

  it('ignores rows with no title at all', () => {
    expect(buildTitleRows([{ id: '1', designation: null }, { id: '2', designation: '  ' }])).toHaveLength(0);
  });
});

describe('summariseTitleProgress', () => {
  it('states progress as a count of job titles, never a score or percentage', () => {
    const rows = buildTitleRows([
      { id: '1', designation: 'Bus Driver', designation_id: 'd5' },
      { id: '2', designation: 'Attender' },
      { id: '3', designation: 'Reader' },
    ]);
    const progress = summariseTitleProgress(rows);
    expect(progress.sorted).toBe(1);
    expect(progress.total).toBe(3);
    expect(progress.label).toBe('1 of 3 job titles sorted');
    expect(progress.label).not.toMatch(/%|score|grade|rank/i);
  });

  it('reads 0 of N before anybody has sorted anything', () => {
    // Production today: hr_staff_details.designation_id is set on 0 of 543 rows.
    const rows = buildTitleRows([
      { id: '1', designation: 'Attender' },
      { id: '2', designation: 'Bus Driver' },
    ]);
    expect(summariseTitleProgress(rows).label).toBe('0 of 2 job titles sorted');
  });
});

describe('NOT_SORTED_LABEL', () => {
  it('reads as unsorted and never as a group name', () => {
    expect(NOT_SORTED_LABEL).toBe('Not sorted yet');
    expect(NOT_SORTED_LABEL).not.toMatch(/teaching/i);
  });
});
