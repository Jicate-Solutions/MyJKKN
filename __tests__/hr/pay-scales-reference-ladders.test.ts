/**
 * JKKN pay band reference ladders — every figure, exactly as read from
 * `JKKN Salary Band.xlsx` on 2026-09-28 (rounded half-up to whole rupees).
 *
 * The expected table below is written out by hand with literal labels, so it
 * does not share the label helpers the module uses to build its steps.
 *
 * Run: npx vitest run __tests__/hr/pay-scales-reference-ladders.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  ARTS_SCIENCE_BAND_NOTES,
  ARTS_SCIENCE_INSTITUTION_ID,
  ARTS_SCIENCE_LADDERS,
  ENGINEERING_BAND_NOTES,
  ENGINEERING_INSTITUTION_ID,
  ENGINEERING_LADDERS,
  SUPPORT_STAFF_LADDERS,
  referenceLaddersFor,
  referenceNotesFor,
} from '@/lib/hr/pay-scales/jkkn-reference-ladders';
import type { PayLadder } from '@/types/hr-pay-ladders';

const DENTAL_INSTITUTION_ID = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5';

const ENGR = 'JKKN Salary Band.xlsx · Engr 2nd Work Sheet 6% · dated 24 Jan 2024';
const ARTS = 'JKKN Salary Band.xlsx · Arts & Science Basic + 5% · dated 24 Jan 2024';
const OFFICE = 'JKKN Salary Band.xlsx · Office Assistants cum Typist';
const LABTECH = 'JKKN Salary Band.xlsx · Lab Technician';
const LIB = 'JKKN Salary Band.xlsx · Librarians';

const Y5 = ['0-1', '2', '3', '4', '5'];
const Y15 = ['0-1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];

interface Expected {
  list: 'eng' | 'as' | 'support';
  id: string;
  staff_group: 'teaching' | 'non_teaching';
  designation: string;
  qualification: string | null;
  labels: string[];
  pays: number[];
  note: string | null;
  source: string;
}

const EXPECTED: Expected[] = [
  {
    list: 'eng', id: 'eng-ap-me-mech-eee-ece', staff_group: 'teaching',
    designation: 'Assistant Professor', qualification: 'M.E (Mech/EEE/ECE)',
    labels: Y5, pays: [18000, 18720, 19469, 20248, 21058], note: null, source: ENGR,
  },
  {
    list: 'eng', id: 'eng-ap-me-cse-it', staff_group: 'teaching',
    designation: 'Assistant Professor', qualification: 'M.E (CSE/IT)',
    labels: Y5, pays: [20000, 20800, 21632, 22497, 23397], note: null, source: ENGR,
  },
  {
    list: 'eng', id: 'eng-ap-years-6-10', staff_group: 'teaching',
    designation: 'Assistant Professor', qualification: null,
    labels: ['6', '7', '8', '9', '10'], pays: [25000, 26000, 27040, 28122, 29247],
    note: 'Years 6 to 10, after either M.E track.', source: ENGR,
  },
  {
    list: 'eng', id: 'eng-associate-professor', staff_group: 'teaching',
    designation: 'Associate Professor', qualification: null,
    labels: ['11', '12', '13', '14', '15'], pays: [31000, 32240, 33530, 34871, 36266],
    note: null, source: ENGR,
  },
  {
    list: 'eng', id: 'eng-professor', staff_group: 'teaching',
    designation: 'Professor', qualification: null,
    labels: ['16', '17', '18', '19', '20'], pays: [40000, 41600, 43264, 44995, 46795],
    note: null, source: ENGR,
  },
  {
    list: 'eng', id: 'eng-ap-sh-msc-mca', staff_group: 'teaching',
    designation: 'Assistant Professor (Science & Humanities)', qualification: 'M.Sc./M.C.A.',
    labels: Y5, pays: [13000, 13520, 14061, 14623, 15208],
    note: 'The sheet says this scale equals Arts & Science Assistant Professor.', source: ENGR,
  },
  {
    list: 'eng', id: 'eng-ap-mba-mphil', staff_group: 'teaching',
    designation: 'Assistant Professor', qualification: 'MBA/M.Phil',
    labels: Y15,
    pays: [14000, 14560, 15142, 15745, 16375, 17030, 17711, 18419, 19156, 19922, 20719, 21548, 22410, 23306, 24238],
    note: 'The sheet leaves open whether this should start at 15,000.', source: ENGR,
  },
  {
    list: 'eng', id: 'eng-ap-set-net', staff_group: 'teaching',
    designation: 'Assistant Professor', qualification: 'SET/NET',
    labels: Y5, pays: [15000, 15600, 16224, 16873, 17548], note: null, source: ENGR,
  },
  {
    list: 'eng', id: 'eng-lab-instructor-degree', staff_group: 'non_teaching',
    designation: 'Lab Instructor', qualification: 'B.E./M.Sc./M.C.A.',
    labels: Y5, pays: [11000, 11440, 11898, 12374, 12869], note: null, source: ENGR,
  },
  {
    list: 'eng', id: 'eng-lab-instructor-diploma', staff_group: 'non_teaching',
    designation: 'Lab Instructor', qualification: 'Diploma',
    labels: Y5, pays: [8000, 8240, 8487, 8742, 9004], note: null, source: ENGR,
  },
  {
    list: 'eng', id: 'eng-lab-instructor-other-ug', staff_group: 'non_teaching',
    designation: 'Lab Instructor', qualification: 'Any other UG degree',
    labels: ['0-1'], pays: [9000], note: 'The sheet leaves years 2 to 5 blank.', source: ENGR,
  },
  {
    list: 'as', id: 'as-assistant-professor', staff_group: 'teaching',
    designation: 'Assistant Professor', qualification: null,
    labels: ['Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5', 'Step 6', 'Step 7', 'Step 8', 'Step 9', 'Step 10', 'Step 11', 'Step 12'],
    pays: [15000, 15500, 16000, 16500, 17000, 17500, 18000, 18500, 19000, 19500, 20000, 21500],
    note: 'The last step rises 1,500, not 500, as written in the sheet.', source: ARTS,
  },
  {
    list: 'support', id: 'support-office-assistant-typist', staff_group: 'non_teaching',
    designation: 'Office Assistant & Typist', qualification: 'High school diploma',
    labels: Y15,
    pays: [7000, 7210, 7426, 7649, 7878, 8115, 8358, 8609, 8867, 9133, 9407, 9689, 9980, 10279, 10588],
    note: '3% a year.', source: OFFICE,
  },
  {
    list: 'support', id: 'support-lab-technician', staff_group: 'non_teaching',
    designation: 'Lab Technician', qualification: null,
    labels: Y15,
    pays: [7000, 7210, 7426, 7649, 7878, 8115, 8358, 8609, 8867, 9133, 9407, 9689, 9980, 10279, 10588],
    note: 'The Lab Technician sheet is a copy of the Office Assistant sheet.', source: LABTECH,
  },
  {
    list: 'support', id: 'support-librarian', staff_group: 'non_teaching',
    designation: 'Librarian', qualification: "Master's in Library Science",
    labels: Y15,
    pays: [10000, 10500, 11025, 11576, 12155, 12763, 13401, 14071, 14775, 15513, 16289, 17103, 17959, 18856, 19799],
    note: '5% a year.', source: LIB,
  },
];

const LISTS: Record<Expected['list'], PayLadder[]> = {
  eng: ENGINEERING_LADDERS,
  as: ARTS_SCIENCE_LADDERS,
  support: SUPPORT_STAFF_LADDERS,
};

const ALL_LADDERS = [...ENGINEERING_LADDERS, ...ARTS_SCIENCE_LADDERS, ...SUPPORT_STAFF_LADDERS];
const stepCount = (ls: PayLadder[]) => ls.reduce((n, l) => n + l.steps.length, 0);

describe('JKKN reference ladders — every figure', () => {
  it.each(EXPECTED.map((e) => [e.id, e] as const))('%s matches the workbook exactly', (_id, e) => {
    const ladder = LISTS[e.list].find((l) => l.id === e.id);
    expect(ladder).toBeDefined();
    expect(ladder).toEqual({
      id: e.id,
      staff_group: e.staff_group,
      designation: e.designation,
      qualification: e.qualification,
      steps: e.labels.map((label, i) => ({ label, basic_pay: e.pays[i] })),
      note: e.note,
      source: e.source,
    });
  });

  it('holds no ladder that the expected table does not list', () => {
    expect(ENGINEERING_LADDERS.map((l) => l.id)).toEqual(EXPECTED.filter((e) => e.list === 'eng').map((e) => e.id));
    expect(ARTS_SCIENCE_LADDERS.map((l) => l.id)).toEqual(EXPECTED.filter((e) => e.list === 'as').map((e) => e.id));
    expect(SUPPORT_STAFF_LADDERS.map((l) => l.id)).toEqual(EXPECTED.filter((e) => e.list === 'support').map((e) => e.id));
  });
});

describe('JKKN reference ladders — counts and shape', () => {
  it('Engineering: 11 ladders, 61 steps', () => {
    expect(ENGINEERING_LADDERS).toHaveLength(11);
    expect(stepCount(ENGINEERING_LADDERS)).toBe(61);
  });

  it('Arts & Science: 1 ladder, 12 steps', () => {
    expect(ARTS_SCIENCE_LADDERS).toHaveLength(1);
    expect(stepCount(ARTS_SCIENCE_LADDERS)).toBe(12);
  });

  it('Support staff: 3 ladders, 45 steps', () => {
    expect(SUPPORT_STAFF_LADDERS).toHaveLength(3);
    expect(stepCount(SUPPORT_STAFF_LADDERS)).toBe(45);
  });

  it.each([
    ['Engineering', ENGINEERING_INSTITUTION_ID],
    ['Arts & Science', ARTS_SCIENCE_INSTITUTION_ID],
  ])('ladder ids are unique within %s', (_name, institutionId) => {
    const ids = referenceLaddersFor(institutionId).map((l) => l.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every basic_pay is a positive whole number of rupees', () => {
    for (const ladder of ALL_LADDERS) {
      for (const step of ladder.steps) {
        expect(Number.isInteger(step.basic_pay), `${ladder.id} ${step.label}`).toBe(true);
        expect(step.basic_pay, `${ladder.id} ${step.label}`).toBeGreaterThan(0);
      }
    }
  });

  it('steps never go down within a ladder', () => {
    for (const ladder of ALL_LADDERS) {
      for (let i = 1; i < ladder.steps.length; i++) {
        expect(ladder.steps[i].basic_pay, `${ladder.id} ${ladder.steps[i].label}`).toBeGreaterThanOrEqual(
          ladder.steps[i - 1].basic_pay,
        );
      }
    }
  });
});

describe('referenceLaddersFor / referenceNotesFor', () => {
  it('Engineering gets its own ladders followed by the support-staff ladders', () => {
    expect(referenceLaddersFor(ENGINEERING_INSTITUTION_ID)).toEqual([...ENGINEERING_LADDERS, ...SUPPORT_STAFF_LADDERS]);
    expect(referenceNotesFor(ENGINEERING_INSTITUTION_ID)).toEqual([
      'Head of department allowance: 3,000 a month on top of the ladder.',
      'There is no Ph.D. line in the band. A doctorate makes someone eligible to move up, and the Director approves each person.',
      "The sheet is headed as held for the MD's final approval.",
    ]);
    expect(referenceNotesFor(ENGINEERING_INSTITUTION_ID)).toEqual(ENGINEERING_BAND_NOTES);
  });

  it('Arts & Science gets its own ladder followed by the support-staff ladders', () => {
    expect(referenceLaddersFor(ARTS_SCIENCE_INSTITUTION_ID)).toEqual([...ARTS_SCIENCE_LADDERS, ...SUPPORT_STAFF_LADDERS]);
    expect(referenceNotesFor(ARTS_SCIENCE_INSTITUTION_ID)).toEqual([
      'The sheet shows one designation only: Assistant Professor.',
    ]);
    expect(referenceNotesFor(ARTS_SCIENCE_INSTITUTION_ID)).toEqual(ARTS_SCIENCE_BAND_NOTES);
  });

  it('Dental, and any other college, gets nothing', () => {
    expect(referenceLaddersFor(DENTAL_INSTITUTION_ID)).toEqual([]);
    expect(referenceNotesFor(DENTAL_INSTITUTION_ID)).toEqual([]);
    expect(referenceLaddersFor('')).toEqual([]);
    expect(referenceNotesFor('not-a-college')).toEqual([]);
  });

  it('mutating a returned ladder does not change the next call or the constants', () => {
    const first = referenceLaddersFor(ENGINEERING_INSTITUTION_ID);
    first[0].steps[0].basic_pay = 1;
    first[0].designation = 'changed';
    first.push({ ...first[1], id: 'extra' });
    const supportRow = first.find((l) => l.id === 'support-librarian')!;
    supportRow.steps.pop();

    const second = referenceLaddersFor(ENGINEERING_INSTITUTION_ID);
    expect(second).toHaveLength(14);
    expect(second[0].steps[0].basic_pay).toBe(18000);
    expect(second[0].designation).toBe('Assistant Professor');
    expect(second.find((l) => l.id === 'support-librarian')!.steps).toHaveLength(15);
    expect(ENGINEERING_LADDERS[0].steps[0].basic_pay).toBe(18000);
    expect(SUPPORT_STAFF_LADDERS[2].steps).toHaveLength(15);
    // The shared support ladders must not leak a mutation across colleges either.
    expect(referenceLaddersFor(ARTS_SCIENCE_INSTITUTION_ID).find((l) => l.id === 'support-librarian')!.steps).toHaveLength(15);

    const notes = referenceNotesFor(ENGINEERING_INSTITUTION_ID);
    notes.push('extra');
    expect(referenceNotesFor(ENGINEERING_INSTITUTION_ID)).toHaveLength(3);
  });
});
