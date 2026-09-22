import { describe, expect, it } from 'vitest';
import { buildCardElement, parseFrontLayout, schoolHeading, type CardRenderInput } from '@/lib/id-cards/render-card';
import { buildFieldReport } from '@/lib/id-cards/field-report';
import { schoolClassLabel, type CardPersonData } from '@/lib/id-cards/render-data';

const base: CardPersonData = {
  kind: 'learner', fullName: 'AADHIRA E M', rollNumber: null, registerNumber: null, designation: null,
  courseName: 'LKG', departmentName: 'Pre-Primary', institutionName: 'Nattraja Vidhyalya CBSE', isSchool: true, qrId: null, academicYearLabel: null,
  qrValue: 'x', photoCandidates: [], valueBag: {}, bloodGroup: null, dateOfBirthLabel: null, guardianName: null,
  guardianPhone: null, address: null, contactPhone: null, idCode: null, studyPeriod: null, staffId: null, courseEndDate: null
};

const collect = (n: unknown, out: string[] = []): string[] => {
  if (typeof n === 'string') out.push(n);
  else if (Array.isArray(n)) n.forEach((x) => collect(x, out));
  else if (n && typeof n === 'object') collect((n as { props?: { children?: unknown } }).props?.children, out);
  return out;
};

describe('school vocabulary on ID cards', () => {
  it('schoolHeading swaps college words and keeps punctuation', () => {
    expect(schoolHeading('COURSE :')).toBe('CLASS :');
    expect(schoolHeading('DEPARTMENT')).toBe('WING');
    expect(schoolHeading('SEMESTER')).toBe('TERM');
    expect(schoolHeading('YEAR :')).toBe('YEAR :');
    expect(schoolHeading('ROLL NO :')).toBe('ADM. NO. :');
  });

  it('an authored "COURSE :" heading prints as "CLASS :" on a school card, unchanged on a college card', () => {
    const layout = parseFrontLayout({
      orientation: 'portrait',
      elements: [
        { x: 60, y: 666, text: 'COURSE :', field: 'static_text', font_size: 22 },
        { x: 258, y: 664, field: 'course', width: 360, font_size: 16 }
      ]
    });
    const input = (person: CardPersonData): CardRenderInput => ({
      person, photoDataUrl: null, qrDataUrl: null, backgroundDataUrl: null, layout, mappings: [], validUntilLabel: 'x'
    });
    expect(collect(buildCardElement(input(base))).join(' | ')).toContain('CLASS :');
    const college = collect(buildCardElement(input({ ...base, isSchool: false }))).join(' | ');
    expect(college).toContain('COURSE :');
    expect(college).not.toContain('CLASS :');
  });

  it('the missing-data report says Class / Wing for a school', () => {
    const labels = buildFieldReport({
      person: { ...base, courseName: null, departmentName: null },
      validUntilLabel: 'x', photoResolved: false, qrResolved: true, signatureResolved: false, backConfigured: false
    }).map((f) => f.label);
    expect(labels).toContain('Class');
    expect(labels).toContain('Wing');
    expect(labels).not.toContain('Course');
  });

  it('school CLASS value: Roman class + section; Grade-named ones keep GRADE', () => {
    expect(schoolClassLabel('Standard 1', 'A')).toBe('I - A');
    expect(schoolClassLabel('Standard 12', 'Section B')).toBe('XII - B');
    expect(schoolClassLabel('Grade 1', 'A')).toBe('GRADE - I - A');
    expect(schoolClassLabel('LKG', 'B')).toBe('LKG - B');
    expect(schoolClassLabel('Standard 5', null)).toBe('V');
    expect(schoolClassLabel('', 'A')).toBeNull();
  });
});
