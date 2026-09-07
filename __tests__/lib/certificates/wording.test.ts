import { describe, expect, it } from 'vitest';
import {
  bonafideParagraphs,
  courseCompletionParagraph,
  displayLearnerName,
  formatIssueDate,
  monthYearLabel,
  normalizeGender,
  type CertificateData,
} from '@/lib/certificates/wording';
import {
  batchSpanLabel,
  currentAcademicYearLabel,
  purposeFromFormData,
  yearOfStudyFromBatch,
  yearOfStudyLabel,
} from '@/lib/certificates/derive';

const manijothi: CertificateData = {
  learnerName: 'C. Manijothi',
  registerNumber: 'C24JPGCHE006',
  parentName: 'P. Chandrasekar',
  gender: 'Female',
  programName: 'M.Sc. Chemistry',
  batchSpan: '2024-2026',
  batchEndDate: '2026-04-30',
  yearOfStudy: '',
  requestPurpose: '',
  currentAcademicYear: '2025-2026',
};

const flat = (runs: Array<{ text: string }>) => runs.map((r) => r.text).join('');

describe('courseCompletionParagraph', () => {
  it('reproduces the approved 27/08/2026 reference wording exactly', () => {
    const p = courseCompletionParagraph(manijothi);
    expect(flat(p.runs)).toBe(
      'This is to certify that Selvi. C. Manijothi (C24JPGCHE006), D/o P. Chandrasekar ' +
        'was a bonafide student of M.Sc. Chemistry degree of our college during the academic year 2024-2026. ' +
        'She has completed the course in April 2026.'
    );
    expect(p.runs.find((r) => r.bold)?.text).toBe('C. Manijothi (C24JPGCHE006)');
  });

  it('switches salutation, relation and pronoun for male learners', () => {
    const text = flat(courseCompletionParagraph({ ...manijothi, gender: 'M' }).runs);
    expect(text).toContain('Selvan. C. Manijothi');
    expect(text).toContain('S/o P. Chandrasekar');
    expect(text).toContain('He has completed');
  });

  it('prefers the office override for the completion month and leaves a blank when nothing is known', () => {
    expect(flat(courseCompletionParagraph(manijothi, { completionMonth: 'May 2026' }).runs)).toContain(
      'completed the course in May 2026.'
    );
    expect(flat(courseCompletionParagraph({ ...manijothi, batchEndDate: null }).runs)).toContain(
      'completed the course in ________.'
    );
  });

  it('omits the parent clause and register number when the record lacks them', () => {
    const text = flat(courseCompletionParagraph({ ...manijothi, parentName: '', registerNumber: '' }).runs);
    expect(text).toContain('Selvi. C. Manijothi was a bonafide student');
    expect(text).not.toContain('D/o');
  });
});

describe('bonafideParagraphs', () => {
  it('matches the pre-printed bonafide form wording', () => {
    const [body] = bonafideParagraphs(
      {
        ...manijothi,
        learnerName: 'B. Dhivyadharshini',
        registerNumber: '',
        parentName: 'K. Balasamy',
        yearOfStudy: 'I',
      },
      { purpose: 'Scholarship' }
    );
    expect(flat(body.runs)).toBe(
      'This is to certify that Selvi. B. Dhivyadharshini, D/o Thiru K. Balasamy is a I - M.Sc. Chemistry ' +
        'Degree student of this College during the academic year 2025-2026. Her Conduct and Character are Good. ' +
        'This certificate is issued only for the purpose of availing Scholarship.'
    );
  });

  it('falls back to the purpose captured on the request form', () => {
    const [body] = bonafideParagraphs({ ...manijothi, requestPurpose: 'Bank loan' });
    expect(flat(body.runs)).toContain('availing Bank loan.');
  });
});

describe('helpers', () => {
  it('normalizes gender spellings', () => {
    expect(normalizeGender('female')).toBe('female');
    expect(normalizeGender('F')).toBe('female');
    expect(normalizeGender('MALE')).toBe('male');
    expect(normalizeGender('')).toBe('unknown');
    expect(normalizeGender('other')).toBe('unknown');
  });

  it('formats the issue date as dd/mm/yyyy', () => {
    expect(formatIssueDate('2026-08-27')).toBe('27/08/2026');
  });

  it('derives "Month YYYY" from an ISO date', () => {
    expect(monthYearLabel('2026-04-30')).toBe('April 2026');
    expect(monthYearLabel('bad')).toBeNull();
  });

  it('puts a single-letter initial in front of the first name', () => {
    expect(displayLearnerName('Manijothi', 'C')).toBe('C. Manijothi');
    expect(displayLearnerName('Manijothi', 'c.')).toBe('C. Manijothi');
    expect(displayLearnerName('Dhivya', 'Dharshini')).toBe('Dhivya Dharshini');
    expect(displayLearnerName('  Manijothi ', null)).toBe('Manijothi');
  });

  it('labels the batch span from batch_name or the start/end years', () => {
    expect(batchSpanLabel({ batch_name: '2024 - 2026', start_date: null, end_date: null })).toBe('2024-2026');
    expect(batchSpanLabel({ batch_name: 'PG-24', start_date: '2024-06-01', end_date: '2026-04-30' })).toBe('2024-2026');
    expect(batchSpanLabel(null)).toBe('');
  });

  it('maps every semester naming style in the semesters table to a Roman year of study', () => {
    expect(yearOfStudyLabel({ semester_name: 'Semester III', semester_code: 'ECE-3', semester_order: 3 })).toBe('II');
    expect(yearOfStudyLabel({ semester_name: 'Semester I', semester_code: 'UCM-1', semester_order: 1 })).toBe('I');
    expect(yearOfStudyLabel({ semester_name: 'semester 1' })).toBe('I');
    expect(yearOfStudyLabel({ semester_name: 'Semester VIII' })).toBe('IV');
    expect(yearOfStudyLabel({ semester_name: 'Sem', semester_code: 'PCS-4', semester_order: 4 })).toBe('II');
    expect(yearOfStudyLabel({ semester_name: '2 Year', semester_code: 'CCT-YEAR-2', semester_order: 1 })).toBe('II');
    expect(yearOfStudyLabel({ semester_name: '4 YEAR', semester_code: 'MRS-YEAR-4', semester_order: 1 })).toBe('IV');
    expect(yearOfStudyLabel({ semester_name: 'TERM', semester_code: 'TERM', semester_order: 1 })).toBe('');
    expect(yearOfStudyLabel({ semester_name: 'CRRI' })).toBe('');
    expect(yearOfStudyLabel('III')).toBe('III');
    expect(yearOfStudyLabel('SEM-4')).toBe('II');
    expect(yearOfStudyLabel('')).toBe('');
  });

  it('falls back to counting years from the batch start', () => {
    expect(yearOfStudyFromBatch('2025-06-01', '2026-2027')).toBe('II');
    expect(yearOfStudyFromBatch('2024-06-01', '2024-2025')).toBe('I');
    expect(yearOfStudyFromBatch(null, '2026-2027')).toBe('');
  });

  it('computes the June-to-May academic year', () => {
    expect(currentAcademicYearLabel(new Date('2026-09-05T12:00:00'))).toBe('2026-2027');
    expect(currentAcademicYearLabel(new Date('2026-03-01T12:00:00'))).toBe('2025-2026');
  });

  it('finds a purpose/reason field in form data', () => {
    expect(purposeFromFormData({ certificate_purpose: 'Passport', other: 'x' })).toBe('Passport');
    expect(purposeFromFormData({ reason_for_request: ' Bank  loan ' })).toBe('Bank loan');
    expect(purposeFromFormData({ other: 'x' })).toBe('');
  });
});
