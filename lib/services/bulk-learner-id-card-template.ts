// lib/services/bulk-learner-id-card-template.ts
//
// "ID Card Data" — a reduced-column variant of Bulk Edit Active.
//
// Same download → preview → validate → apply pipeline as Bulk Edit Active
// (Learners > Profiles), same routes, same sheet name. The only differences:
//   • the workbook carries only the fields printed on an ID card;
//   • upload maps ONLY those fields — any other column in the file is ignored,
//     so validation runs on this subset alone;
//   • Date of Birth travels as DD-MM-YYYY (the header says so), and upload also
//     accepts ISO YYYY-MM-DD and Excel date serials.
//
// The routes switch on `template=id_card` (query string on the export GET,
// form field on the preview/apply POSTs). Every header below must exist as an
// alias in the routes' COLUMN_MAPPING — the import side matches on header
// NAME, so a header with no alias is silently dropped from every upload.

import ExcelJS from 'exceljs';
import { BULK_EDIT_SHEET_NAME, type BulkEditColumn } from './bulk-learner-edit-workbook';

export const ID_CARD_TEMPLATE = 'id_card' as const;

/** Header strings are the import contract — change them in the routes too. */
export const ID_CARD_DOB_HEADER = 'Date of Birth(DD-MM-YYYY)';
export const ID_CARD_PHOTO_HEADER = 'Photo';

/**
 * COLUMN_MAPPING keys the ID-card upload is allowed to map. Everything else in
 * the uploaded file is ignored, which is what makes "validate only these
 * fields" true for the preview and the apply routes alike.
 */
export const ID_CARD_MAPPING_KEYS = [
  'id',
  'first_name',
  'last_name',
  'date_of_birth',
  'blood_group',
  'father_name',
  'father_mobile',
  'institution_name',
  'program_name',
  'section_name',
  'academic_year_name',
  'college_email',
  'permanent_address_street',
  'permanent_address_taluk',
  'permanent_address_district',
  'permanent_address_pin_code',
  'permanent_address_state',
  'roll_number',
  'student_photo_url',
] as const;

export function pickIdCardMapping(
  mapping: Record<string, string[]>
): Record<string, string[]> {
  const picked: Record<string, string[]> = {};
  for (const key of ID_CARD_MAPPING_KEYS) {
    if (mapping[key]) picked[key] = mapping[key];
  }
  return picked;
}

/** `2005-08-15` → `15-08-2005`. Anything that is not an ISO date passes through. */
export function formatDateDDMMYYYY(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  return s;
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/**
 * Upload-side date normaliser for the ID-card sheet. Returns ISO YYYY-MM-DD
 * (what learners_profiles.date_of_birth stores) or null when the cell cannot be
 * read as a date — null is what the caller turns into a row-level error.
 *
 * Accepts: DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, YYYY/MM/DD, Excel serial, and a
 * JS Date (SheetJS hands one back for date-typed cells). Never falls through to
 * `new Date(string)`: V8 reads "05-08-2005" as May 8, which is exactly the
 * silent swap the DD-MM-YYYY header is meant to rule out.
 */
export function normalizeIdCardDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number') {
    // Excel serial: days since 1899-12-30.
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  const s = String(value).trim();

  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (!isRealDate(y, m, d)) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const ymd = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (!isRealDate(y, m, d)) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return null;
}

/** The ID-card sheet's columns, in the order the user asked for. */
export function buildIdCardColumns(): BulkEditColumn[] {
  return [
    { header: 'ID*', value: (l: any) => l.id },
    { header: 'First Name', value: (l: any) => l.first_name || '' },
    { header: 'Last Name', value: (l: any) => l.last_name || '' },
    { header: ID_CARD_DOB_HEADER, value: (l: any) => formatDateDDMMYYYY(l.date_of_birth) },
    { header: 'Blood Group', value: (l: any) => l.blood_group || '' },
    { header: 'Father Name', value: (l: any) => l.father_name || '' },
    { header: 'Father Mobile', value: (l: any) => l.father_mobile || '' },
    { header: 'Institution', value: (l: any) => l.institution?.name || '' },
    { header: 'Program', value: (l: any) => l.program?.program_name || '' },
    { header: 'Section', value: (l: any) => l.section?.section_name || '' },
    { header: 'Academic Year', value: (l: any) => l.academic_year?.academic_year_name || '' },
    { header: 'College Email', value: (l: any) => l.college_email || '' },
    { header: 'Permanent Address Street', value: (l: any) => l.permanent_address_street || '' },
    { header: 'Permanent Address Taluk', value: (l: any) => l.permanent_address_taluk || '' },
    { header: 'Permanent Address District', value: (l: any) => l.permanent_address_district || '' },
    { header: 'Permanent Address Pin Code', value: (l: any) => l.permanent_address_pin_code || '' },
    { header: 'Permanent Address State', value: (l: any) => l.permanent_address_state || '' },
    { header: 'Roll Number', value: (l: any) => l.roll_number || '' },
    { header: ID_CARD_PHOTO_HEADER, value: (l: any) => l.student_photo_url || '' },
  ];
}

const INSTRUCTIONS = [
  '🪪 ID CARD DATA - INSTRUCTIONS',
  '',
  '⚠️ IMPORTANT NOTES',
  '1. Do NOT modify the ID* column - it is used to match records',
  `2. Do NOT rename the "${BULK_EDIT_SHEET_NAME}" sheet - it must keep this exact name`,
  '3. Fill in ONLY the empty or missing fields you want to update',
  '4. Leave cells blank to keep existing values unchanged',
  '5. Only learners in "Active" status can be updated via this feature',
  '6. Only the columns in this sheet are read - any extra column is ignored',
  '',
  '📅 DATE OF BIRTH',
  'Enter as DD-MM-YYYY (e.g. 15-08-2005). YYYY-MM-DD is also accepted.',
  'Any other layout is reported as an error in the validation step.',
  '',
  '📝 FIELDS',
  '• First Name, Last Name, Date of Birth, Blood Group',
  '• Father Name, Father Mobile, College Email',
  '• Institution, Program, Section, Academic Year (names, as shown in MyJKKN)',
  '• Permanent Address: Street, Taluk, District, Pin Code, State',
  '• Roll Number, Photo (URL of the learner photo)',
  '',
  '📤 UPLOAD STEPS',
  `Step 1: Fill in the missing fields in the "${BULK_EDIT_SHEET_NAME}" sheet`,
  'Step 2: Save the file',
  'Step 3: Upload via the ID Card Data dialog in MyJKKN',
  'Step 4: Review the update summary',
];

export function buildIdCardWorkbook(learners: any[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const columns = buildIdCardColumns();

  const worksheet = workbook.addWorksheet(BULK_EDIT_SHEET_NAME);
  worksheet.columns = columns.map((c, i) => ({ header: c.header, key: `c${i}`, width: 22 }));
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.getRow(1).font = { bold: true };

  for (const learner of learners) {
    const row: Record<string, any> = {};
    columns.forEach((c, i) => {
      row[`c${i}`] = c.value(learner);
    });
    worksheet.addRow(row);
  }

  const wsInstructions = workbook.addWorksheet('📖 Instructions');
  wsInstructions.columns = [{ header: 'A', key: 'a', width: 80 }];
  INSTRUCTIONS.forEach((line) => wsInstructions.addRow({ a: line }));

  return workbook;
}
