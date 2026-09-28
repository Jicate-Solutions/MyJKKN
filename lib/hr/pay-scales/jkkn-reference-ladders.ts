/**
 * JKKN pay band — reference YEAR LADDERS, as read from the workbook.
 *
 * REFERENCE ONLY (Director ruling 2026-09-18): nobody's pay changes because of
 * these figures. Nothing here reads or writes any salary table; the ladders are
 * stored additively as `ladders` inside the per-college `hr.pay_scales` policy
 * row so a person's pay can be READ against the band.
 *
 * Figures were read cell by cell from `JKKN Salary Band.xlsx` on 2026-09-28 and
 * rounded half-up to whole rupees. Do not "correct" a figure here — a
 * disagreement with the workbook is raised with the Director, not fixed in code.
 */

import type { PayLadder, PayLadderStep } from '@/types/hr-pay-ladders';

export const ENGINEERING_INSTITUTION_ID = '5de4fba1-4564-41ed-8c73-5d948b74b843';
export const ARTS_SCIENCE_INSTITUTION_ID = 'b0b8a724-7c65-4f07-8047-2a38e8100ad5';

const ENGR_SOURCE = 'JKKN Salary Band.xlsx · Engr 2nd Work Sheet 6% · dated 24 Jan 2024';
const ARTS_SOURCE = 'JKKN Salary Band.xlsx · Arts & Science Basic + 5% · dated 24 Jan 2024';
const OFFICE_SOURCE = 'JKKN Salary Band.xlsx · Office Assistants cum Typist';
const LAB_TECH_SOURCE = 'JKKN Salary Band.xlsx · Lab Technician';
const LIBRARIAN_SOURCE = 'JKKN Salary Band.xlsx · Librarians';

/** Labels '0-1', '2', '3', … up to `lastYear`. */
function yearLabels(lastYear: number): string[] {
  const labels = ['0-1'];
  for (let y = 2; y <= lastYear; y++) labels.push(String(y));
  return labels;
}

/** Labels `from` … `to` as plain numbers, e.g. '6' … '10'. */
function rangeLabels(from: number, to: number): string[] {
  const labels: string[] = [];
  for (let y = from; y <= to; y++) labels.push(String(y));
  return labels;
}

function steps(labels: string[], pays: number[]): PayLadderStep[] {
  if (labels.length !== pays.length) {
    throw new Error(`jkkn-reference-ladders: ${labels.length} labels for ${pays.length} figures`);
  }
  return labels.map((label, i) => ({ label, basic_pay: pays[i] }));
}

// ── Engineering ──────────────────────────────────────────────────────────────

export const ENGINEERING_LADDERS: PayLadder[] = [
  {
    id: 'eng-ap-me-mech-eee-ece',
    staff_group: 'teaching',
    designation: 'Assistant Professor',
    qualification: 'M.E (Mech/EEE/ECE)',
    steps: steps(yearLabels(5), [18000, 18720, 19469, 20248, 21058]),
    note: null,
    source: ENGR_SOURCE,
  },
  {
    id: 'eng-ap-me-cse-it',
    staff_group: 'teaching',
    designation: 'Assistant Professor',
    qualification: 'M.E (CSE/IT)',
    steps: steps(yearLabels(5), [20000, 20800, 21632, 22497, 23397]),
    note: null,
    source: ENGR_SOURCE,
  },
  {
    id: 'eng-ap-years-6-10',
    staff_group: 'teaching',
    designation: 'Assistant Professor',
    qualification: null,
    steps: steps(rangeLabels(6, 10), [25000, 26000, 27040, 28122, 29247]),
    note: 'Years 6 to 10, after either M.E track.',
    source: ENGR_SOURCE,
  },
  {
    id: 'eng-associate-professor',
    staff_group: 'teaching',
    designation: 'Associate Professor',
    qualification: null,
    steps: steps(rangeLabels(11, 15), [31000, 32240, 33530, 34871, 36266]),
    note: null,
    source: ENGR_SOURCE,
  },
  {
    id: 'eng-professor',
    staff_group: 'teaching',
    designation: 'Professor',
    qualification: null,
    steps: steps(rangeLabels(16, 20), [40000, 41600, 43264, 44995, 46795]),
    note: null,
    source: ENGR_SOURCE,
  },
  {
    id: 'eng-ap-sh-msc-mca',
    staff_group: 'teaching',
    designation: 'Assistant Professor (Science & Humanities)',
    qualification: 'M.Sc./M.C.A.',
    steps: steps(yearLabels(5), [13000, 13520, 14061, 14623, 15208]),
    note: 'The sheet says this scale equals Arts & Science Assistant Professor.',
    source: ENGR_SOURCE,
  },
  {
    id: 'eng-ap-mba-mphil',
    staff_group: 'teaching',
    designation: 'Assistant Professor',
    qualification: 'MBA/M.Phil',
    steps: steps(yearLabels(15), [
      14000, 14560, 15142, 15745, 16375, 17030, 17711, 18419, 19156, 19922, 20719, 21548, 22410,
      23306, 24238,
    ]),
    note: 'The sheet leaves open whether this should start at 15,000.',
    source: ENGR_SOURCE,
  },
  {
    id: 'eng-ap-set-net',
    staff_group: 'teaching',
    designation: 'Assistant Professor',
    qualification: 'SET/NET',
    steps: steps(yearLabels(5), [15000, 15600, 16224, 16873, 17548]),
    note: null,
    source: ENGR_SOURCE,
  },
  {
    id: 'eng-lab-instructor-degree',
    staff_group: 'non_teaching',
    designation: 'Lab Instructor',
    qualification: 'B.E./M.Sc./M.C.A.',
    steps: steps(yearLabels(5), [11000, 11440, 11898, 12374, 12869]),
    note: null,
    source: ENGR_SOURCE,
  },
  {
    id: 'eng-lab-instructor-diploma',
    staff_group: 'non_teaching',
    designation: 'Lab Instructor',
    qualification: 'Diploma',
    steps: steps(yearLabels(5), [8000, 8240, 8487, 8742, 9004]),
    note: null,
    source: ENGR_SOURCE,
  },
  {
    id: 'eng-lab-instructor-other-ug',
    staff_group: 'non_teaching',
    designation: 'Lab Instructor',
    qualification: 'Any other UG degree',
    steps: steps(['0-1'], [9000]),
    note: 'The sheet leaves years 2 to 5 blank.',
    source: ENGR_SOURCE,
  },
];

export const ENGINEERING_BAND_NOTES: string[] = [
  'Head of department allowance: 3,000 a month on top of the ladder.',
  'There is no Ph.D. line in the band. A doctorate makes someone eligible to move up, and the Director approves each person.',
  "The sheet is headed as held for the MD's final approval.",
];

// ── Arts & Science ───────────────────────────────────────────────────────────

export const ARTS_SCIENCE_LADDERS: PayLadder[] = [
  {
    id: 'as-assistant-professor',
    staff_group: 'teaching',
    designation: 'Assistant Professor',
    qualification: null,
    steps: steps(
      Array.from({ length: 12 }, (_, i) => `Step ${i + 1}`),
      [15000, 15500, 16000, 16500, 17000, 17500, 18000, 18500, 19000, 19500, 20000, 21500],
    ),
    note: 'The last step rises 1,500, not 500, as written in the sheet.',
    source: ARTS_SOURCE,
  },
];

export const ARTS_SCIENCE_BAND_NOTES: string[] = [
  'The sheet shows one designation only: Assistant Professor.',
];

// ── Support staff (all colleges) ─────────────────────────────────────────────

const OFFICE_ASSISTANT_PAYS = [
  7000, 7210, 7426, 7649, 7878, 8115, 8358, 8609, 8867, 9133, 9407, 9689, 9980, 10279, 10588,
];

export const SUPPORT_STAFF_LADDERS: PayLadder[] = [
  {
    id: 'support-office-assistant-typist',
    staff_group: 'non_teaching',
    designation: 'Office Assistant & Typist',
    qualification: 'High school diploma',
    steps: steps(yearLabels(15), OFFICE_ASSISTANT_PAYS),
    note: '3% a year.',
    source: OFFICE_SOURCE,
  },
  {
    id: 'support-lab-technician',
    staff_group: 'non_teaching',
    designation: 'Lab Technician',
    qualification: null,
    steps: steps(yearLabels(15), OFFICE_ASSISTANT_PAYS),
    note: 'The Lab Technician sheet is a copy of the Office Assistant sheet.',
    source: LAB_TECH_SOURCE,
  },
  {
    id: 'support-librarian',
    staff_group: 'non_teaching',
    designation: 'Librarian',
    qualification: "Master's in Library Science",
    steps: steps(yearLabels(15), [
      10000, 10500, 11025, 11576, 12155, 12763, 13401, 14071, 14775, 15513, 16289, 17103, 17959,
      18856, 19799,
    ]),
    note: '5% a year.',
    source: LIBRARIAN_SOURCE,
  },
];

// ── Routing ──────────────────────────────────────────────────────────────────

/**
 * The reference ladders for one college: Engineering or Arts & Science, each
 * followed by the support-staff ladders. Every other college (Dental included)
 * has no ladders in the workbook yet and gets []. Always a fresh copy.
 */
export function referenceLaddersFor(institutionId: string): PayLadder[] {
  if (institutionId === ENGINEERING_INSTITUTION_ID) {
    return structuredClone([...ENGINEERING_LADDERS, ...SUPPORT_STAFF_LADDERS]);
  }
  if (institutionId === ARTS_SCIENCE_INSTITUTION_ID) {
    return structuredClone([...ARTS_SCIENCE_LADDERS, ...SUPPORT_STAFF_LADDERS]);
  }
  return [];
}

/** The band-level notes for one college; [] for any college without ladders. Always a fresh copy. */
export function referenceNotesFor(institutionId: string): string[] {
  if (institutionId === ENGINEERING_INSTITUTION_ID) return structuredClone(ENGINEERING_BAND_NOTES);
  if (institutionId === ARTS_SCIENCE_INSTITUTION_ID) return structuredClone(ARTS_SCIENCE_BAND_NOTES);
  return [];
}
