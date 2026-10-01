import { describe, it, expect } from 'vitest';
import {
  buildIdCardColumns,
  buildIdCardWorkbook,
  pickIdCardMapping,
  normalizeIdCardDate,
  formatDateDDMMYYYY,
  ID_CARD_MAPPING_KEYS,
  ID_CARD_DOB_HEADER,
  ID_CARD_PHOTO_HEADER,
} from '@/lib/services/bulk-learner-id-card-template';
import { BULK_EDIT_SHEET_NAME } from '@/lib/services/bulk-learner-edit-workbook';

const EXPECTED_HEADERS = [
  'ID*',
  'First Name',
  'Last Name',
  'Date of Birth(DD-MM-YYYY)',
  'Blood Group',
  'Father Name',
  'Father Mobile',
  'Institution',
  'Program',
  'Section',
  'Academic Year',
  'College Email',
  'Permanent Address Street',
  'Permanent Address Taluk',
  'Permanent Address District',
  'Permanent Address Pin Code',
  'Permanent Address State',
  'Roll Number',
  'Photo',
];

/**
 * Mirror of the routes' COLUMN_MAPPING entries the ID-card sheet relies on.
 * Kept here so a header rename on either side breaks a test rather than
 * silently dropping the column from every upload.
 */
const ROUTE_MAPPING: Record<string, string[]> = {
  id: ['ID*', 'ID', 'id', 'learner_id'],
  first_name: ['First Name'],
  last_name: ['Last Name'],
  date_of_birth: ['Date of Birth', ID_CARD_DOB_HEADER, 'DOB'],
  gender: ['Gender'],
  blood_group: ['Blood Group'],
  father_name: ['Father Name', 'father_name', 'fathername'],
  father_mobile: ['Father Mobile'],
  mother_mobile: ['Mother Mobile'],
  institution_name: ['Institution'],
  program_name: ['Program'],
  section_name: ['Section'],
  academic_year_name: ['Academic Year'],
  college_email: ['College Email'],
  student_email: ['Personal Email'],
  permanent_address_street: ['Permanent Address Street'],
  permanent_address_taluk: ['Permanent Address Taluk'],
  permanent_address_district: ['Permanent Address District'],
  permanent_address_pin_code: ['Permanent Address Pin Code'],
  permanent_address_state: ['Permanent Address State'],
  roll_number: ['Roll Number'],
  register_number: ['Register Number'],
  student_photo_url: ['Photo URL', ID_CARD_PHOTO_HEADER, 'photo_url'],
};

describe('ID Card Data template — columns', () => {
  it('exports exactly the requested headers in order', () => {
    expect(buildIdCardColumns().map((c) => c.header)).toEqual(EXPECTED_HEADERS);
  });

  it('every exported header resolves through the picked mapping', () => {
    const picked = pickIdCardMapping(ROUTE_MAPPING);
    const aliases = new Set(Object.values(picked).flat());
    for (const header of EXPECTED_HEADERS) {
      expect(aliases.has(header), `no alias for "${header}"`).toBe(true);
    }
  });

  it('the picked mapping drops everything outside the ID-card subset', () => {
    const picked = pickIdCardMapping(ROUTE_MAPPING);
    expect(Object.keys(picked).sort()).toEqual([...ID_CARD_MAPPING_KEYS].sort());
    expect(picked).not.toHaveProperty('gender');
    expect(picked).not.toHaveProperty('mother_mobile');
    expect(picked).not.toHaveProperty('student_email');
    expect(picked).not.toHaveProperty('register_number');
  });

  it('writes DOB as DD-MM-YYYY and photo from student_photo_url', () => {
    const cols = buildIdCardColumns();
    const learner = {
      id: 'x',
      date_of_birth: '2005-08-15',
      student_photo_url: 'https://drive/photo.jpg',
      institution: { name: 'JKKN CAS' },
      program: { program_name: 'B.Sc CS' },
      section: { section_name: 'A' },
      academic_year: { academic_year_name: '2026-2027' },
    };
    const row = Object.fromEntries(cols.map((c) => [c.header, c.value(learner)]));
    expect(row[ID_CARD_DOB_HEADER]).toBe('15-08-2005');
    expect(row[ID_CARD_PHOTO_HEADER]).toBe('https://drive/photo.jpg');
    expect(row['Institution']).toBe('JKKN CAS');
    expect(row['Program']).toBe('B.Sc CS');
    expect(row['Section']).toBe('A');
    expect(row['Academic Year']).toBe('2026-2027');
  });

  it('workbook keeps the sheet name the upload routes parse', () => {
    const wb = buildIdCardWorkbook([{ id: 'a' }]);
    expect(wb.getWorksheet(BULK_EDIT_SHEET_NAME)).toBeDefined();
    const ws = wb.getWorksheet(BULK_EDIT_SHEET_NAME)!;
    expect(ws.getRow(1).values).toEqual([undefined, ...EXPECTED_HEADERS]);
    expect(ws.rowCount).toBe(2);
  });
});

describe('ID Card Data template — date handling', () => {
  it('formats ISO to DD-MM-YYYY and passes other text through', () => {
    expect(formatDateDDMMYYYY('2005-08-15')).toBe('15-08-2005');
    expect(formatDateDDMMYYYY('2005-08-15T00:00:00.000Z')).toBe('15-08-2005');
    expect(formatDateDDMMYYYY('')).toBe('');
    expect(formatDateDDMMYYYY(null)).toBe('');
    expect(formatDateDDMMYYYY('unknown')).toBe('unknown');
  });

  it('reads DD-MM-YYYY without swapping day and month', () => {
    // V8's new Date('05-08-2005') is May 8 — this must be 5 August.
    expect(normalizeIdCardDate('05-08-2005')).toBe('2005-08-05');
    expect(normalizeIdCardDate('15-08-2005')).toBe('2005-08-15');
    expect(normalizeIdCardDate('15/08/2005')).toBe('2005-08-15');
    expect(normalizeIdCardDate('5-8-2005')).toBe('2005-08-05');
  });

  it('accepts ISO YYYY-MM-DD as well', () => {
    expect(normalizeIdCardDate('2005-08-15')).toBe('2005-08-15');
    expect(normalizeIdCardDate('2005/08/15')).toBe('2005-08-15');
    expect(normalizeIdCardDate('2005-08-15T00:00:00.000Z')).toBe('2005-08-15');
  });

  it('accepts Excel serials and JS Dates', () => {
    expect(normalizeIdCardDate(38579)).toBe('2005-08-15');
    expect(normalizeIdCardDate(new Date(Date.UTC(2005, 7, 15)))).toBe('2005-08-15');
  });

  it('rejects impossible or unreadable dates', () => {
    expect(normalizeIdCardDate('31-02-2005')).toBeNull();
    expect(normalizeIdCardDate('2005-13-01')).toBeNull();
    expect(normalizeIdCardDate('15-08-05')).toBeNull();
    expect(normalizeIdCardDate('August 15 2005')).toBeNull();
    expect(normalizeIdCardDate('')).toBeNull();
    expect(normalizeIdCardDate(null)).toBeNull();
  });
});
