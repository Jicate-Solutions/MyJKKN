/**
 * Excel mapping utility for the Student Bill bulk import flow.
 *
 * Unlike entity imports (programs, departments, etc.) which carry static
 * enum dropdowns (UG/PG/Active/Inactive), bill imports have only one
 * dropdown — Billing Category — and that data is dynamic (loaded from the
 * `billing_categories` table at template-generation time). So this file
 * deliberately stays small: column headers, the row-shape type, and a
 * shared ImportResult contract that the API and dialog both use.
 */

/**
 * Column order of the generated template. The importer reads by header TEXT,
 * so this order is free to change — but the template generator's ExcelJS
 * dataValidation cell letters track it exactly. Change both together.
 *
 * Institution sits next to Academic Year because the two are a cascading pair:
 * academic years are per-institution, so the Academic Year dropdown is driven
 * by whatever Institution the row picked.
 */
export const STUDENT_BILL_TEMPLATE_HEADERS = [
  'Roll Number',
  'First Name',
  'Last Name',
  'Institution',
  'Academic Year',
  'Billing Category',
  'Bill Description',
  'Due Date',
  'Billing Amount',
  'Remarks'
] as const;

export type StudentBillTemplateHeader = (typeof STUDENT_BILL_TEMPLATE_HEADERS)[number];

/**
 * Canonical field -> accepted header spellings, matched case/space-insensitively.
 *
 * The importer resolves columns through THIS map rather than by position.
 * It used to read cells[0]..cells[6] by index, so inserting a column (e.g. the
 * First/Last Name pair) silently shifted Billing Category into the Due Date
 * slot and Bill Description into the Billing Amount slot — field corruption
 * with no error. Header-driven reading means sheets already in circulation keep
 * working and new columns can be added anywhere.
 *
 * Keep every historical spelling here forever; users re-upload old templates.
 */
export const STUDENT_BILL_HEADER_ALIASES: Record<string, string[]> = {
  roll_number: ['roll number', 'rollnumber', 'roll no', 'roll_number'],
  first_name: ['first name', 'firstname', 'first_name', 'learner first name', 'student first name'],
  last_name: ['last name', 'lastname', 'last_name', 'surname', 'learner last name', 'student last name'],
  institution_name: ['institution', 'institution name', 'institution_name', 'college'],
  billing_category_name: ['billing category', 'billingcategory', 'billing_category', 'category'],
  bill_description: ['bill description', 'description', 'bill_description'],
  due_date: ['due date', 'duedate', 'due_date'],
  billing_amount: ['billing amount', 'amount', 'billing_amount'],
  remarks: ['remarks', 'remark', 'notes'],
  academic_year_name: [
    'academic year',
    // Retained: the header was "Academic Year (optional)" until 2026-07-29,
    // and those sheets are still in circulation. The column is now REQUIRED —
    // an old sheet still maps, it just fails the row if the cell is blank.
    'academic year (optional)',
    'academicyear',
    'academic_year'
  ]
};

/** Normalize a header cell for alias matching: lowercase, collapse whitespace. */
function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Map the sheet's header row to column indexes.
 *
 * Returns `{ field: columnIndex }` for every field the sheet actually carries.
 * Unknown columns are ignored, so users may add their own notes columns.
 */
export function resolveStudentBillColumns(headerRow: unknown[]): Record<string, number> {
  const lookup = new Map<string, string>();
  for (const [field, aliases] of Object.entries(STUDENT_BILL_HEADER_ALIASES)) {
    for (const alias of aliases) lookup.set(alias, field);
  }

  const indexes: Record<string, number> = {};
  headerRow.forEach((cell, index) => {
    const field = lookup.get(normalizeHeader(cell));
    // First occurrence wins — a duplicated header shouldn't silently retarget.
    if (field && indexes[field] === undefined) indexes[field] = index;
  });
  return indexes;
}

/**
 * Shape of a single parsed-and-resolved Excel row before it becomes a
 * `CreateStudentBillDto`. The `_resolved_*` fields are populated during
 * row validation by looking up the student / category by their
 * human-friendly identifiers.
 */
export interface StudentBillRow {
  roll_number: string;
  billing_category_name: string;
  bill_description?: string;
  due_date: string; // ISO YYYY-MM-DD
  billing_amount: number;
  remarks?: string;

  // Filled by validator
  _resolved_student_id?: string;
  _resolved_institution_id?: string;
  _resolved_item_category_id?: string;
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
  /** Learner identity so the user can tell WHOSE row failed, not just which Excel row. */
  roll_number?: string;
  student_name?: string;
}

/**
 * One successfully-created bill, echoed back so the post-upload summary can
 * name the learner and the downloadable report can list exactly what was
 * committed.
 */
export interface ImportSuccessRow {
  row: number;
  roll_number: string;
  student_name: string;
  billing_category: string;
  due_date: string;
  billing_amount: number;
  academic_year?: string | null;
  bill_id?: string;
}

export interface ImportResult {
  success: boolean;
  successCount: number;
  errorCount: number;
  totalRows: number;
  errors: ImportError[];
  /** Per-learner detail for committed rows (absent on legacy/error responses). */
  successes?: ImportSuccessRow[];
}
