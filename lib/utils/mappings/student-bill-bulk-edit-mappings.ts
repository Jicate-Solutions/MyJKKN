/**
 * Excel mapping utility for the Student Bill BULK EDIT flow.
 *
 * Unlike bulk-CREATE (which keys rows by roll number to make new bills),
 * bulk-EDIT must key rows by a stable Bill ID — one student has many bills,
 * so roll number is ambiguous as an update key. The export is pre-filled with
 * each bill's CURRENT values; an unchanged cell yields no diff, and a blank
 * editable cell means "clear it" (for optional fields).
 *
 * Final Amount IS editable, but it is the one field with financial consequence:
 * `billing_student_bills` has a BEFORE UPDATE trigger
 * (`update_bill_balance_on_amount_change`) that, whenever final_amount changes,
 * re-sums billing_receipt_items and REWRITES balance_amount + status. That is
 * exactly what we want for a live bill — and exactly what must never happen to
 * a void one, since the trigger would resurrect a cancelled/superseded/refunded
 * bill as 'unpaid'. Hence AMOUNT_LOCKED_STATUSES below.
 */

export const STUDENT_BILL_BULK_EDIT_HEADERS = [
  'Bill ID',          // A  locked — match key
  'Roll Number',      // B  read-only
  'Student Name',     // C  read-only
  'Institution',      // D  read-only
  'Status',           // E  read-only
  'Final Amount',     // F  editable (number) — blank = keep current
  'Academic Year',    // G  editable (dropdown) — blank = clear
  'Billing Category', // H  editable (dropdown) — required
  'Bill Description', // I  editable
  'Due Date',         // J  editable — required
  'Remarks'           // K  editable
] as const;

export type StudentBillBulkEditHeader =
  (typeof STUDENT_BILL_BULK_EDIT_HEADERS)[number];

/** The six editable fields and their display labels (used in diffs + audit). */
export type EditableField =
  | 'final_amount'
  | 'academic_year'
  | 'item_category'
  | 'bill_description'
  | 'due_date'
  | 'remarks';

export const EDITABLE_FIELD_LABELS: Record<EditableField, string> = {
  final_amount: 'Final Amount',
  academic_year: 'Academic Year',
  item_category: 'Billing Category',
  bill_description: 'Bill Description',
  due_date: 'Due Date',
  remarks: 'Remarks'
};

/**
 * Statuses whose amount may NOT be edited in bulk. These are void/settled
 * states; the balance trigger keys only off final_amount and would rewrite
 * status back to unpaid/partially_paid/paid, silently un-voiding the bill.
 * Every other field stays editable on these bills, as before.
 */
export const AMOUNT_LOCKED_STATUSES = ['cancelled', 'superseded', 'refunded'] as const;

/** Bill statuses (for the download filter dropdown). */
export const BULK_EDIT_STATUS_OPTIONS = [
  'unpaid',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
  'refunded',
  'superseded'
] as const;

/** Filters the download/count endpoints understand (v1 — no hierarchy cascade). */
export interface BulkEditDownloadFilters {
  institution_id?: string;
  item_category_id?: string;
  status?: string;
  // 'unspecified' → bills whose academic_year_id IS NULL
  academic_year_id?: string;
  due_date_from?: string;
  due_date_to?: string;
}

/** One existing bill projected for the Excel export (current values). */
export interface BillForBulkEdit {
  bill_id: string;
  institution_id: string;
  institution_name: string;
  roll_number: string;
  student_name: string;
  status: string;
  final_amount: number;
  academic_year_name: string | null;
  category_name: string;
  bill_description: string | null;
  due_date: string;
  remarks: string | null;
}

/** A single field's before→after, with human-readable display values. */
export interface BillFieldChange {
  field: EditableField;
  label: string;
  old: string | null; // display
  new: string | null; // display
}

/** Per-row preview returned to the client (only changed rows are surfaced). */
export interface BulkEditRowPreview {
  row: number; // Excel row number (2-indexed)
  bill_id: string;
  roll_number: string;
  student_name: string;
  status: string;
  changes: BillFieldChange[];
}

export interface BulkEditError {
  row: number;
  field?: string;
  message: string;
}

/** Dry-run result (preview endpoint). Nothing is written. */
export interface BulkEditPreviewResult {
  totalRows: number; // non-blank data rows
  changedRows: number; // rows with ≥1 valid change
  unchangedRows: number; // valid rows with no change
  errorCount: number;
  fieldsAffected: string[]; // distinct labels across all changes
  rows: BulkEditRowPreview[]; // changed rows only (for the diff table)
  errors: BulkEditError[];
}

/** One successfully-updated bill (for the result + downloadable report). */
export interface BulkEditAppliedRow {
  bill_id: string;
  roll_number: string;
  student_name: string;
  changes: BillFieldChange[];
}

/** Commit result (apply endpoint). */
export interface BulkEditApplyResult {
  success: boolean;
  changedRows: number; // successfully updated
  unchangedRows: number;
  failedRows: number;
  errorCount: number;
  fieldsAffected: string[];
  applied: BulkEditAppliedRow[]; // FULL (uncapped) — feeds the client report
  errors: BulkEditError[];
}
