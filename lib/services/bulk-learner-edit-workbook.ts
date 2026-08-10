// lib/services/bulk-learner-edit-workbook.ts
//
// Builds the "Bulk Edit Active Learners" workbook.
//
// Split out of app/api/learners/export-exited-for-edit/route.ts (2026-08-01) so
// the sheet can be built and asserted without standing up an authenticated
// request — the route file can only export HTTP handlers, which made the
// column list and the validation formulas untestable while they lived there.
//
// Ported from SheetJS to ExcelJS at the same time: SheetJS community edition
// cannot write data validation, and the reference columns need dropdowns.
// Every pre-existing header string is preserved BYTE-FOR-BYTE — the import side
// matches on header NAME, so one renamed header silently drops that column from
// every upload without raising anything.

import ExcelJS from 'exceljs';
import {
  REFERENCE_TYPE_EXCEL_LABEL,
  type ReferenceResolvers,
  type ReferenceTypeKey,
} from './bulk-learner-reference-fields';

/** Order of the type columns on the Lists sheet — also the dropdown order. */
const REFERENCE_TYPE_ORDER: ReferenceTypeKey[] = ['consultant', 'faculty', 'student'];

/**
 * COUNTA window for the cascading Person dropdown. Must exceed the longest list
 * (students: 5,657) or the dropdown silently truncates. The enquiries template
 * uses 100 because its lists are small.
 */
const LIST_WINDOW = 8000;

/** Sheet name is load-bearing: parseExcelFile(file, 'Active Learners', …) targets it. */
export const BULK_EDIT_SHEET_NAME = 'Active Learners';

export interface BulkEditColumn {
  header: string;
  value: (learner: any) => any;
}

function colLetter(index: number): string {
  let letter = '';
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/**
 * The template's columns, in order.
 *
 * Kept as data rather than an object literal so the reference columns' positions
 * can be DERIVED for data validation. The enquiries template hardcodes column
 * indices and they drift every time a column is inserted.
 */
export function buildBulkEditColumns(resolvers: ReferenceResolvers): BulkEditColumn[] {
  const referenceLabel = (learner: any): string => {
    const id = learner.referred_by_id;
    if (id) {
      const hit = resolvers.byId.get(String(id).toLowerCase());
      if (hit) return hit.candidate.label;
    }
    // Name-only reference, or a link whose target has since been deleted.
    return learner.referred_by_name || '';
  };

  return [
    // REQUIRED: ID for matching (read-only)
    { header: 'ID*', value: (l: any) => l.id },

    // SECTION 1: Basic Details
    { header: 'First Name', value: (l: any) => l.first_name || '' },
    { header: 'Last Name', value: (l: any) => l.last_name || '' },
    // Tamil-script name. Nullable columns, so most cells export blank until
    // they are back-filled. Emitted as plain Unicode text — Excel stores the
    // sheet as UTF-8 XML, so the glyphs survive a round-trip through the file
    // regardless of which font the editor's machine renders them with.
    { header: 'First Name (Tamil)', value: (l: any) => l.first_name_tamil || '' },
    { header: 'Last Name (Tamil)', value: (l: any) => l.last_name_tamil || '' },
    { header: 'Date of Birth', value: (l: any) => l.date_of_birth || '' },
    { header: 'Gender', value: (l: any) => l.gender || '' },
    { header: 'Religion', value: (l: any) => l.religion || '' },
    // FK-backed fields ship as an ID column (authoritative — what bulk-edit
    // compares and writes) plus the readable label beside it. Editors may fill
    // either one; the ID wins when both are present. Emitting the label alone
    // is what previously made every exported row look "changed" on re-upload.
    { header: 'Community ID', value: (l: any) => l.community_category_id || '' },
    { header: 'Community', value: (l: any) => l.community_ref?.code || '' },
    { header: 'Caste ID', value: (l: any) => l.caste_id || '' },
    { header: 'Caste', value: (l: any) => l.caste_ref?.name || '' },
    { header: 'Aadhar Number', value: (l: any) => l.aadhar_number || '' },
    { header: 'Blood Group', value: (l: any) => l.blood_group || '' },
    // External identifiers. Plain text columns — no dropdown, no format check;
    // most cells export blank until they are back-filled.
    { header: 'ABC ID', value: (l: any) => l.abc_id || '' },
    { header: 'EMIS Number', value: (l: any) => l.emis || '' },
    { header: 'UMIS Number', value: (l: any) => l.umis || '' },
    { header: 'Admission Year ID', value: (l: any) => l.admission_year_id || '' },
    { header: 'Admission Year', value: (l: any) => l.admission_year_obj?.year ?? '' },

    // SECTION 2: Parent/Guardian Information
    { header: 'Father Name', value: (l: any) => l.father_name || '' },
    { header: 'Father Occupation', value: (l: any) => l.father_occupation || '' },
    { header: 'Father Mobile', value: (l: any) => l.father_mobile || '' },
    { header: 'Mother Name', value: (l: any) => l.mother_name || '' },
    { header: 'Mother Occupation', value: (l: any) => l.mother_occupation || '' },
    { header: 'Mother Mobile', value: (l: any) => l.mother_mobile || '' },
    { header: 'Annual Income', value: (l: any) => l.annual_income || '' },

    // SECTION 3: Academic Assignment
    { header: 'Institution', value: (l: any) => l.institution?.name || '' },
    { header: 'Degree', value: (l: any) => l.degree?.degree_name || '' },
    { header: 'Department', value: (l: any) => l.department?.department_name || '' },
    { header: 'Program', value: (l: any) => l.program?.program_name || '' },
    { header: 'Semester', value: (l: any) => l.semester?.semester_name || '' },
    { header: 'Section', value: (l: any) => l.section?.section_name || '' },
    { header: 'Academic Year', value: (l: any) => l.academic_year?.academic_year_name || '' },
    {
      header: 'Regulation',
      value: (l: any) => l.regulation?.regulation_code || l.regulation?.regulation_year || '',
    },
    { header: 'Batch', value: (l: any) => l.batch?.batch_name || '' },

    // SECTION 4: Contact Details
    // 2026-08-01: was `l.mobile`, a column that does not exist on
    // learners_profiles (only father_/mother_/student_mobile), so this column
    // exported blank for every learner since the template was written.
    { header: 'Student Mobile', value: (l: any) => l.student_mobile || '' },
    { header: 'College Email', value: (l: any) => l.college_email || '' },
    { header: 'Personal Email', value: (l: any) => l.student_email || '' },

    // SECTION 5: Address Information
    { header: 'Permanent Address Street', value: (l: any) => l.permanent_address_street || '' },
    { header: 'Permanent Address Taluk', value: (l: any) => l.permanent_address_taluk || '' },
    { header: 'Permanent Address District', value: (l: any) => l.permanent_address_district || '' },
    { header: 'Permanent Address Pin Code', value: (l: any) => l.permanent_address_pin_code || '' },
    { header: 'Permanent Address State', value: (l: any) => l.permanent_address_state || '' },

    // SECTION 6: Entry Type
    { header: 'Entry Type', value: (l: any) => l.entry_type || '' },
    { header: 'Scholarship Type', value: (l: any) => l.scholarship_type || '' },

    // SECTION 7: Previous Education
    { header: 'Last School', value: (l: any) => l.last_school || '' },
    { header: 'Board of Study', value: (l: any) => l.board_of_study || '' },
    { header: '10th Max Marks', value: (l: any) => l.tenth_marks?.max_marks || '' },
    { header: '10th Obtained Marks', value: (l: any) => l.tenth_marks?.obtained_marks || '' },
    { header: '10th Percentage', value: (l: any) => l.tenth_marks?.percentage || '' },
    { header: '12th Group', value: (l: any) => l.twelfth_marks?.group || '' },
    { header: '12th Max Marks', value: (l: any) => l.twelfth_marks?.max_marks || '' },
    { header: '12th Obtained Marks', value: (l: any) => l.twelfth_marks?.obtained_marks || '' },
    { header: '12th Percentage', value: (l: any) => l.twelfth_marks?.percentage || '' },

    // SECTION 8: Entrance Exam Details
    { header: 'Medical Cutoff Marks', value: (l: any) => l.medical_cutoff_marks || '' },
    { header: 'Engineering Cutoff Marks', value: (l: any) => l.engineering_cutoff_marks || '' },
    { header: 'NEET Roll Number', value: (l: any) => l.neet_roll_number || '' },
    { header: 'NEET Score', value: (l: any) => l.neet_score || '' },
    { header: 'Counseling Applied', value: (l: any) => (l.counseling_applied ? 'TRUE' : 'FALSE') },
    { header: 'Counseling Number', value: (l: any) => l.counseling_number || '' },

    // SECTION 9: Accommodation Details
    { header: 'Accommodation Type ID', value: (l: any) => l.accommodation_type_id || '' },
    { header: 'Accommodation Type', value: (l: any) => l.accommodation_ref?.name || '' },
    {
      header: 'Bus Required',
      value: (l: any) => (l.bus_required === true ? 'Yes' : l.bus_required === false ? 'No' : ''),
    },

    // SECTION 10: Reference Information — the TYPED reference.
    // Type + ID + Person resolve together to referral_type / referred_by_id /
    // referred_by_name, and the legacy reference_type / reference_name /
    // reference_contact columns are written as a mirror so the profile detail
    // page (which renders only the legacy trio) keeps working unchanged.
    {
      header: 'Reference Type',
      value: (l: any) =>
        l.referral_type
          ? REFERENCE_TYPE_EXCEL_LABEL[l.referral_type as ReferenceTypeKey] ?? ''
          : '',
    },
    { header: 'Reference ID', value: (l: any) => l.referred_by_id || '' },
    { header: 'Reference Person', value: referenceLabel },
    { header: 'Reference Contact', value: (l: any) => l.reference_contact || '' },
    {
      // Context only — never imported. 4,088 rows hold an empty string here and
      // the rest hold free text like 'DIRECT', 'NILL' or 'BROTHER'. Showing it
      // beside the typed columns is how the editor knows what to replace.
      header: 'Current Reference (read-only)',
      value: (l: any) =>
        l.referral_type
          ? ''
          : [l.reference_type, l.reference_name]
              .filter((v: any) => v && String(v).trim())
              .join(' / '),
    },

    // SECTION 11: Student Specific
    { header: 'Roll Number', value: (l: any) => l.roll_number || '' },
    { header: 'Register Number', value: (l: any) => l.register_number || '' },
    { header: 'Quota ID', value: (l: any) => l.quota_id || '' },
    { header: 'Quota', value: (l: any) => l.quota_ref?.name || '' },
    { header: 'Photo URL', value: (l: any) => l.student_photo_url || '' },
  ];
}

const INSTRUCTIONS = [
  '📋 BULK EDIT ACTIVE LEARNERS - INSTRUCTIONS',
  '',
  '⚠️ IMPORTANT NOTES',
  '1. Do NOT modify the ID* column - it is used to match records',
  '2. Do NOT rename the "Active Learners" sheet - it must keep this exact name',
  '3. Fill in ONLY the empty or missing fields you want to update',
  '4. Leave cells blank to keep existing values unchanged',
  '5. You can update partial data - not all fields are required',
  '6. Only learners in "Active" status can be updated via this feature',
  '',
  '🔗 PAIRED ID + NAME COLUMNS',
  'Community, Caste, Quota, Accommodation Type and Admission Year are',
  'stored as links, so each ships as TWO columns:',
  '  • "<Field> ID"  - the stored value (e.g. Community ID)',
  '  • "<Field>"     - the readable label (e.g. Community = MBC)',
  'To CHANGE one, edit EITHER column - typing the label works, and so',
  'does pasting an ID. If you fill both, the ID column wins.',
  'To leave it alone, change neither. Values you did not touch are',
  'recognised as unchanged and will NOT appear in the preview.',
  'A label that matches no record is reported as a warning in the',
  'preview and that one field is skipped - the rest of the row applies.',
  '',
  '👥 REFERENCE (who referred this learner)',
  'Pick "Reference Type" first - Consultant, Staff or Student. The',
  '"Reference Person" dropdown then shows only that type\'s people.',
  'Each entry carries a code so people with the same name stay apart:',
  '  • Consultant  NAME — phone number',
  '  • Staff       NAME — staff ID       "(Former)" = no longer employed',
  '  • Student     NAME — roll number    "(Graduated)" / "(Inactive)"',
  '',
  'If the person has NO record in the system - old staff, or an old',
  'learner who was never entered - just TYPE THE NAME. It is saved as a',
  'name-only reference, and the validation step lists every one of them',
  'with a "did you mean...?" suggestion when it looks like a typo.',
  '',
  'If a name matches more than one person, nothing is saved for that row',
  '- the preview shows you the candidates. Pick from the dropdown, or',
  'paste that person\'s "Reference ID" instead.',
  '',
  '"Reference Contact" fills itself from the matched record. Type a',
  'number yourself only for name-only references.',
  '"Current Reference (read-only)" shows the old free-text value, if any.',
  'It is never imported - it is there so you can see what to replace.',
  '',
  '⚠️ Setting a CONSULTANT reference creates a consultant attribution at',
  '100%, which feeds commission calculation. The validation step tells',
  'you how many before anything is written.',
  '',
  '📝 ALL EDITABLE FIELDS (11 SECTIONS)',
  '',
  'SECTION 1: Basic Details',
  '• First Name, Last Name, Date of Birth, Gender',
  '• First Name (Tamil), Last Name (Tamil)',
  '• Religion, Community, Caste, Aadhar Number',
  '• Blood Group, Admission Year',
  '• ABC ID, EMIS Number, UMIS Number',
  '',
  '🆔 ABC ID / EMIS / UMIS',
  'Identifiers issued outside this system, so any mix of letters and',
  'digits is accepted and no length is enforced (e.g. ED453871909686).',
  'They are saved UPPERCASE with spaces removed, so pasting',
  '"ED 4538 7190 9686" out of a PDF is fine.',
  'Leave the cell blank for a learner who has not been issued one -',
  'blank means "no change", so an existing value is never wiped.',
  '',
  '🔤 THE TAMIL NAME COLUMNS',
  'Type or paste Tamil in Unicode - the same text you would type on a',
  'Tamil (phonetic / Anjal / InScript) keyboard. Most rows export blank',
  'because these are new fields being filled in over time.',
  'Do NOT paste text typed in Bamini or SunTommy: those fonts store',
  'English letters that only LOOK Tamil, so the upload would save the',
  'letters, not the name. Convert it to Unicode first, or enter that',
  'learner through Learners > Profiles > Edit, which converts for you.',
  '',
  'SECTION 2: Parent/Guardian Information',
  '• Father Name, Father Occupation, Father Mobile',
  '• Mother Name, Mother Occupation, Mother Mobile',
  '• Annual Income',
  '',
  'SECTION 3: Academic Assignment',
  '• Institution, Degree, Department',
  '• Program, Semester, Section',
  '• Academic Year, Regulation, Batch',
  '  Note: These fields show names for readability (view-only in Excel)',
  '',
  'SECTION 4: Contact Details',
  '• Student Mobile, College Email, Personal Email',
  '',
  'SECTION 5: Address Information',
  '• Street, Taluk, District, Pin Code, State',
  '',
  'SECTION 6: Entry Type & Scholarship',
  '• Entry Type, Scholarship Type (First Graduate / PMS / 7.5% / Not Applicable)',
  '',
  'SECTIONS 7-11: Optional Fields',
  '• Previous Education (School, Board, 10th & 12th Marks)',
  '• Entrance Exams (NEET, Cutoff Marks, Counseling)',
  '• Accommodation (Hostel, Food Details)',
  '• Reference (see above)',
  '• Student Specific (Roll Number, Register Number, Quota, Category)',
  '',
  '❌ PROTECTED FIELDS (Cannot be updated)',
  '• ID*, Institution, Lifecycle Status, Created At',
  '',
  '📤 UPLOAD STEPS',
  'Step 1: Fill in the missing fields in the "Active Learners" sheet',
  'Step 2: Save the file',
  'Step 3: Upload via the Bulk Edit dialog in MyJKKN',
  'Step 4: Review the update summary',
];

export function buildBulkEditWorkbook(
  learners: any[],
  resolvers: ReferenceResolvers
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const columns = buildBulkEditColumns(resolvers);

  const worksheet = workbook.addWorksheet(BULK_EDIT_SHEET_NAME);
  worksheet.columns = columns.map((c, i) => ({ header: c.header, key: `c${i}`, width: 20 }));
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.getRow(1).font = { bold: true };

  for (const learner of learners) {
    const row: Record<string, any> = {};
    columns.forEach((c, i) => {
      row[`c${i}`] = c.value(learner);
    });
    worksheet.addRow(row);
  }

  // ── Hidden Lists sheet ────────────────────────────────────────────────
  // Header cell is the KEY the Person dropdown matches on; the column body is
  // the dependent list. Same OFFSET+MATCH+COUNTA mechanic the enquiries
  // template uses — no INDIRECT and no named ranges, so it survives a round
  // trip through Excel, LibreOffice and Google Sheets.
  const lists = workbook.addWorksheet('Lists');
  lists.state = 'hidden';

  REFERENCE_TYPE_ORDER.forEach((type, index) => {
    const column = index + 1;
    lists.getCell(1, column).value = REFERENCE_TYPE_EXCEL_LABEL[type];
    const labels = resolvers.byType[type]
      .map((c) => c.label)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    labels.forEach((label, row) => {
      lists.getCell(row + 2, column).value = label;
    });
  });

  const typeListCol = REFERENCE_TYPE_ORDER.length + 2;
  lists.getCell(1, typeListCol).value = 'Reference Types';
  REFERENCE_TYPE_ORDER.forEach((type, i) => {
    lists.getCell(i + 2, typeListCol).value = REFERENCE_TYPE_EXCEL_LABEL[type];
  });

  // ── Data validation ───────────────────────────────────────────────────
  const typeColIndex = columns.findIndex((c) => c.header === 'Reference Type') + 1;
  const personColIndex = columns.findIndex((c) => c.header === 'Reference Person') + 1;
  const typeColLetter = colLetter(typeColIndex);
  const listsFirst = colLetter(1);
  const listsLast = colLetter(REFERENCE_TYPE_ORDER.length);
  const typeListLetter = colLetter(typeListCol);

  // errorStyle 'warning', never 'stop': a referrer who is genuinely absent from
  // every list is a SUPPORTED outcome, so the sheet has to let the editor type
  // a name that isn't in the dropdown. The server decides, not Excel.
  for (let row = 2; row <= learners.length + 1; row++) {
    worksheet.getCell(row, typeColIndex).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [
        `Lists!$${typeListLetter}$2:$${typeListLetter}$${REFERENCE_TYPE_ORDER.length + 1}`,
      ],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Invalid Reference Type',
      error: 'Please select Consultant, Staff or Student.',
    };

    const match = `MATCH(${typeColLetter}${row},Lists!$${listsFirst}$1:$${listsLast}$1,0)-1`;
    worksheet.getCell(row, personColIndex).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [
        `OFFSET(Lists!$${listsFirst}$1,1,${match},COUNTA(OFFSET(Lists!$${listsFirst}$1,1,${match},${LIST_WINDOW},1)),1)`,
      ],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Not in the list',
      error:
        'Choose Reference Type first, then pick from this list. If the person has ' +
        'no record at all (old staff, old learner), type their name anyway — it is ' +
        'stored as a name-only reference.',
    };
  }

  const wsInstructions = workbook.addWorksheet('📖 Instructions');
  wsInstructions.columns = [{ header: 'A', key: 'a', width: 80 }];
  INSTRUCTIONS.forEach((line) => wsInstructions.addRow({ a: line }));

  return workbook;
}
