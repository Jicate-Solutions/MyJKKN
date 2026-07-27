/**
 * Excel mapping utility for the Student Bill bulk import flow.
 *
 * Unlike entity imports (programs, departments, etc.) which carry static
 * enum dropdowns (UG/PG/Active/Inactive), bill imports have only one
 * dropdown — Billing Category — and that data is dynamic (loaded from the
 * `billing_categories` table at template-generation time). So this file
 * deliberately stays small: column headers, the row-shape type, and a
 * shared ImportResult contract that the API and dialog both use.
 *
 * It also owns the two normalisers used to identify a learner from a
 * spreadsheet row. They live here — not in the route — so the template
 * generator and the importer can never drift apart on what "the same name"
 * means.
 */

export const STUDENT_BILL_TEMPLATE_HEADERS = [
  'Roll Number',
  'First Name',
  'Last Name',
  'Billing Category',
  'Bill Description',
  'Due Date',
  'Billing Amount',
  'Remarks',
  'Academic Year (optional)'
] as const;

export type StudentBillTemplateHeader = (typeof STUDENT_BILL_TEMPLATE_HEADERS)[number];

/**
 * Canonical field keys the importer resolves spreadsheet columns to.
 * Parsing maps header text → these keys, so column ORDER stops mattering.
 */
export type StudentBillField =
  | 'roll_number'
  | 'first_name'
  | 'last_name'
  | 'billing_category_name'
  | 'bill_description'
  | 'due_date'
  | 'billing_amount'
  | 'remarks'
  | 'academic_year_name';

/**
 * Collapses a header cell to a comparable key: lowercase, punctuation to
 * spaces, whitespace collapsed. 'Academic Year (optional)' → 'academic year
 * optional'.
 */
export function normalizeHeaderKey(header: unknown): string {
  return String(header ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Normalised header text → canonical field.
 *
 * Includes the legacy 7-column template's headers so a sheet downloaded
 * before the name columns existed still maps correctly instead of being
 * read positionally into the wrong fields.
 *
 * 'Learner Name' / 'Student Name' map to `first_name` on purpose: the match
 * key is the FIRST+LAST concatenation, so a single whole-name column lands
 * in exactly the right place with no special casing.
 */
export const STUDENT_BILL_HEADER_ALIASES: Record<string, StudentBillField> = {
  'roll number': 'roll_number',
  'rollnumber': 'roll_number',
  'roll no': 'roll_number',
  'rollno': 'roll_number',
  'roll': 'roll_number',
  'register number': 'roll_number',

  'first name': 'first_name',
  'firstname': 'first_name',
  'learner first name': 'first_name',
  'given name': 'first_name',
  'learner name': 'first_name',
  'student name': 'first_name',
  'name': 'first_name',

  'last name': 'last_name',
  'lastname': 'last_name',
  'learner last name': 'last_name',
  'surname': 'last_name',

  'billing category': 'billing_category_name',
  'category': 'billing_category_name',
  'item category': 'billing_category_name',

  'bill description': 'bill_description',
  'description': 'bill_description',

  'due date': 'due_date',
  'duedate': 'due_date',

  'billing amount': 'billing_amount',
  'amount': 'billing_amount',

  'remarks': 'remarks',
  'remark': 'remarks',
  'notes': 'remarks',

  'academic year': 'academic_year_name',
  'academic year optional': 'academic_year_name',
  'academicyear': 'academic_year_name'
};

/**
 * Positional layout of the ORIGINAL 7-column template. Used only as a
 * fallback when a sheet's header row can't be recognised at all (e.g. the
 * user stripped or renamed the headers).
 */
export const STUDENT_BILL_LEGACY_COLUMN_ORDER: StudentBillField[] = [
  'roll_number',
  'billing_category_name',
  'bill_description',
  'due_date',
  'billing_amount',
  'remarks',
  'academic_year_name'
];

/**
 * The learner-name match key.
 *
 * `learners_profiles` splits names into first_name/last_name, but the split
 * point is unreliable in practice — 832 billable learners have a multi-word
 * first_name ("JAI BOMMANNAN" / "R") and 281 a multi-word last_name, so only
 * ~84% are a clean one-word-each split. Concatenating BEFORE normalising
 * makes the split point irrelevant: a user who types "KAVIN" / "BASKAR U"
 * matches a record stored as "KAVIN BASKAR" / "U".
 *
 * Stripping punctuation also collapses the dotted-initial styles that are
 * common here — "R. Kumar", "R.Kumar" and "r  kumar" all become "r kumar".
 *
 * Measured against production: this produces exactly the same number of
 * ambiguous groups (162 of 5,154 billable learners) as a strict field-wise
 * comparison, so the added tolerance costs nothing in precision.
 */
export function normalizeNameKey(
  first?: string | null,
  last?: string | null
): string {
  return `${first ?? ''} ${last ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Roll numbers are matched case-insensitively after trimming. Verified safe
 * against production: 4,944 distinct roll numbers both exact and
 * upper-cased, i.e. zero case-only variants, so this adds tolerance without
 * creating any new ambiguity.
 */
export function normalizeRollKey(roll?: string | null): string {
  return String(roll ?? '').trim().toUpperCase();
}

/** Human-readable name for display in reports and error messages. */
export function formatLearnerName(
  first?: string | null,
  last?: string | null
): string {
  return [first, last]
    .filter((part) => Boolean(part && String(part).trim()))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** How a row's learner was identified — carried into the report for audit. */
export type LearnerMatchMode = 'roll' | 'roll+name' | 'name';

/**
 * Shape of a single parsed-and-resolved Excel row before it becomes a
 * `CreateStudentBillDto`. The `_resolved_*` fields are populated during
 * row validation by looking up the learner / category by their
 * human-friendly identifiers.
 *
 * Identity is `roll_number` and/or `first_name`+`last_name` — at least one
 * of the two must be present, enforced per row by the importer.
 */
export interface StudentBillRow {
  roll_number?: string;
  first_name?: string;
  last_name?: string;
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
  /** Which identifier resolved this learner — audit trail for the report. */
  matched_by?: LearnerMatchMode;
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
