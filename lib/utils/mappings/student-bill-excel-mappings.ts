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

export const STUDENT_BILL_TEMPLATE_HEADERS = [
  'Roll Number',
  'Billing Category',
  'Bill Description',
  'Due Date',
  'Billing Amount',
  'Remarks',
  'Academic Year (optional)'
] as const;

export type StudentBillTemplateHeader = (typeof STUDENT_BILL_TEMPLATE_HEADERS)[number];

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
