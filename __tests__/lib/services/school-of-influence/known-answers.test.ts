// The pure half of "the system already knows this" — the classifier, the year
// reader, and the mismatch detector.
//
// These are tested rather than the service around them because they are where a
// wrong answer becomes INVISIBLE: a misclassified field silently deletes a
// question from the form, and a wrong year quietly prefills a confident number
// into somebody's application. Every case below is a real value read off the
// live form or the live `semesters` table on 2026-08-14, not an invented one.

import { describe, expect, it } from 'vitest';

import {
  classifySoiField,
  deriveSoiYearFromSemesterName,
  isSoiServerDerivedField,
  soiKnownAnswersFor,
  soiOnRecordAnswerKey,
  soiPrefillMismatches,
} from '@/lib/services/school-of-influence/known-answers';
import { soiDisplayName } from '@/lib/services/school-of-influence/constants';

/** The seven fields the live application form actually asks, in order. */
const LIVE_FIELDS = [
  { field_key: 'name', field_label: 'Name' },
  { field_key: 'college_name', field_label: 'College Name' },
  { field_key: 'department', field_label: 'Department' },
  { field_key: 'year', field_label: 'Year' },
  { field_key: 'learner_or_senior_learner', field_label: 'Learner or Senior Learner' },
  { field_key: 'field_of_interest', field_label: 'Field of Interest 1' },
  { field_key: 'field_of_interest_2', field_label: 'Field of Interest 2' },
];

const RECORD = {
  name: 'ARUN S',
  college: 'JKKN College of Engineering and Technology',
  department: 'Computer Science and Engineering',
  year: '2',
};

describe('classifySoiField', () => {
  it('classifies the five questions the platform already answers', () => {
    expect(LIVE_FIELDS.map(classifySoiField)).toEqual([
      'name',
      'college',
      'department',
      'year',
      'member_type',
      null,
      null,
    ]);
  });

  it('matches on the label when the key is one the form builder generated', () => {
    expect(classifySoiField({ field_key: 'field_1723', field_label: 'College Name' })).toBe(
      'college'
    );
  });

  it('leaves a question that merely CONTAINS a known word alone', () => {
    // The classifier must not be a substring match: this is a real question
    // nobody has an answer to on file.
    expect(classifySoiField({ field_key: 'project_name', field_label: 'Name of your project' })).toBe(
      null
    );
  });

  it('only "learner or senior learner" is dropped from the form', () => {
    expect(LIVE_FIELDS.filter(isSoiServerDerivedField).map((f) => f.field_key)).toEqual([
      'learner_or_senior_learner',
    ]);
  });
});

describe('deriveSoiYearFromSemesterName', () => {
  it('reads a year-laddered programme straight off the name', () => {
    expect(deriveSoiYearFromSemesterName('1 Year')).toBe('1');
    expect(deriveSoiYearFromSemesterName('4 Year')).toBe('4');
    expect(deriveSoiYearFromSemesterName('6 Year')).toBe('6');
  });

  it('folds two semesters into one year', () => {
    expect(deriveSoiYearFromSemesterName('Semester I')).toBe('1');
    expect(deriveSoiYearFromSemesterName('Semester II')).toBe('1');
    expect(deriveSoiYearFromSemesterName('Semester III')).toBe('2');
    expect(deriveSoiYearFromSemesterName('Semester VIII')).toBe('4');
    expect(deriveSoiYearFromSemesterName('semester 1')).toBe('1');
  });

  it('returns nothing for the rows that carry no year at all', () => {
    // 854 active learners sit on these — the schools and the internship year.
    // A blank editable box is the decided answer; an invented number is not.
    for (const name of ['YEAR', 'TERM', 'CRRI', '', null, undefined]) {
      expect(deriveSoiYearFromSemesterName(name)).toBe(null);
    }
  });
});

describe('soiKnownAnswersFor', () => {
  it('prefills exactly the four boxes the record can answer', () => {
    const known = soiKnownAnswersFor(LIVE_FIELDS, RECORD);
    expect(Object.keys(known).sort()).toEqual(['college_name', 'department', 'name', 'year']);
    expect(known.name.value).toBe('ARUN S');
    expect(known.year.value).toBe('2');
  });

  it('leaves a box blank rather than filling it with nothing', () => {
    const known = soiKnownAnswersFor(LIVE_FIELDS, { ...RECORD, year: null, department: '' });
    expect(known.year).toBeUndefined();
    expect(known.department).toBeUndefined();
    // The person can still apply — the other boxes are unaffected.
    expect(known.name.value).toBe('ARUN S');
  });

  it('prefills nothing at all when the record could not be read', () => {
    expect(soiKnownAnswersFor(LIVE_FIELDS, null)).toEqual({});
  });
});

describe('soiPrefillMismatches', () => {
  const known = soiKnownAnswersFor(LIVE_FIELDS, RECORD);

  it('records nothing when every box was left as the record had it', () => {
    expect(
      soiPrefillMismatches(LIVE_FIELDS, known, {
        name: 'ARUN S',
        college_name: RECORD.college,
        department: RECORD.department,
        year: '2',
      })
    ).toEqual([]);
  });

  it('ignores a difference that is only spacing or capitals', () => {
    expect(soiPrefillMismatches(LIVE_FIELDS, known, { name: '  arun   s ' })).toEqual([]);
  });

  it('keeps BOTH values when the applicant typed something else', () => {
    const found = soiPrefillMismatches(LIVE_FIELDS, known, { name: 'Arun Sundaram', year: '3' });
    expect(found).toEqual([
      {
        field_key: 'name',
        field_label: 'Name',
        kind: 'name',
        on_record: 'ARUN S',
        submitted: 'Arun Sundaram',
      },
      {
        field_key: 'year',
        field_label: 'Year',
        kind: 'year',
        on_record: '2',
        submitted: '3',
      },
    ]);
  });

  it('is not a disagreement when the record held nothing', () => {
    const thin = soiKnownAnswersFor(LIVE_FIELDS, { ...RECORD, year: null });
    expect(soiPrefillMismatches(LIVE_FIELDS, thin, { year: '11' })).toEqual([]);
  });

  it('files the record value under a key a reviewer can read', () => {
    expect(soiOnRecordAnswerKey('College Name')).toBe('College Name — on record');
  });
});

describe('soiDisplayName', () => {
  it('prints a batch row written before the rename under the current name', () => {
    expect(soiDisplayName('School of Influence — Batch A')).toBe(
      'School of Influencer — Batch A'
    );
  });

  it('is idempotent, so a name can pass through more than one surface', () => {
    const once = soiDisplayName('School of Influence — Batch A');
    expect(soiDisplayName(once)).toBe(once);
    expect(soiDisplayName('JKKN School of Influencer')).toBe('JKKN School of Influencer');
  });

  it('falls back to the programme name when there is nothing to print', () => {
    expect(soiDisplayName(null)).toBe('School of Influencer');
    expect(soiDisplayName('   ')).toBe('School of Influencer');
  });
});
