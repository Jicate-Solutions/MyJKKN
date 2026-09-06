/**
 * Excel mapping utility for the Bulk Receipt Generation flow (super-admin).
 *
 * The template is server-PRE-FILLED with outstanding bills picked up by the
 * dialog's hierarchy filters AND with per-row payment metadata defaults from
 * Step 1. The admin then fills "Paid Amount" and can override the per-row
 * Payment Mode / Paid Date / Payer Name / Contact / Reference / Remarks for
 * any row that doesn't match the defaults. The hidden Bill ID column is the
 * deterministic key the importer uses to bind a row back to a specific
 * billing_student_bills row — never trust roll_number + amount alone.
 */

export const BULK_RECEIPT_TEMPLATE_HEADERS = [
  'Roll Number',
  'Student Name',
  'Bill ID',
  'Bill Description',
  'Category',
  'Balance Amount',
  'Paid Amount',
  'Payment Mode',
  'Paid Date',
  'Payer Name',
  'Payer Contact',
  'Payment Reference',
  'Remarks'
] as const;

export type BulkReceiptTemplateHeader =
  (typeof BULK_RECEIPT_TEMPLATE_HEADERS)[number];

/** Allowed values for the Payment Mode column. Kept aligned with billing-schedule.PaymentMode. */
export const BULK_RECEIPT_PAYMENT_MODES = [
  'cash',
  'online',
  'bank_transfer',
  'dd',
  'cheque',
  'combined'
] as const;
export type BulkReceiptPaymentMode =
  (typeof BULK_RECEIPT_PAYMENT_MODES)[number];

/**
 * Shape of a single parsed Excel row before it is grouped by
 * (student, payment_paid_date, payment_mode) and turned into a billing_receipt
 * with billing_receipt_items underneath.
 */
export interface BulkReceiptRow {
  roll_number: string;
  student_name: string;
  bill_id: string;
  bill_description: string | null;
  category: string | null;
  balance_amount: number;
  paid_amount: number;

  // Per-row payment metadata (new — was batch-level prior to 2026-05-15).
  payment_mode: BulkReceiptPaymentMode;
  payment_paid_date: string; // ISO yyyy-mm-dd
  payer_name: string;
  payer_contact: string | null;
  payment_reference_number: string | null;
  payment_remarks: string | null;

  // Filled by validator
  _resolved_student_id?: string;
  _resolved_institution_id?: string;
}

/**
 * Outstanding bill projection used to populate the template.
 * Mirrors the columns the user will see in Excel.
 */
export interface OutstandingBillForBulk {
  bill_id: string;
  student_id: string;
  institution_id: string;
  roll_number: string;
  student_name: string;
  bill_description: string | null;
  category: string | null;
  balance_amount: number;
}

export interface BulkReceiptImportError {
  row: number;
  field?: string;
  message: string;
}

/**
 * Per-student summary returned in the import response so the UI can show
 * "Created N receipts covering M bills, ₹X total" without an extra round-trip.
 */
export interface BulkReceiptCreated {
  receipt_id: string;
  receipt_number: string;
  student_id: string;
  roll_number: string;
  student_name: string;
  payment_amount: number;
  bill_count: number;
}

export interface BulkReceiptImportResult {
  success: boolean;
  successCount: number; // # of receipts created
  errorCount: number;
  totalRows: number;
  totalStudents: number; // distinct students attempted
  receipts: BulkReceiptCreated[];
  errors: BulkReceiptImportError[];
}

/**
 * A single (student, paid_date, mode) bucket that the preview shows. One of
 * these will become exactly one billing_receipts row on commit.
 */
export interface BulkReceiptPreviewGroup {
  group_key: string; // student_id::paid_date::payment_mode (stable for React keys)
  student_id: string;
  roll_number: string;
  student_name: string;
  bill_count: number;
  total_amount: number;
  payment_mode: BulkReceiptPaymentMode;
  payment_paid_date: string;
  payer_name: string;
  payer_contact: string | null;
  payment_reference_number: string | null;
  payment_remarks: string | null;
  row_numbers: number[]; // Excel row numbers (2-indexed) for traceability
}

/**
 * Returned by the preview endpoint (dry_run=true). The dialog displays this
 * to the admin and only commits if they hit "Confirm & Generate".
 */
export interface BulkReceiptPreviewResult {
  totalRows: number; // distinct non-blank data rows in the upload
  validRows: number; // rows that passed all validation
  errorCount: number;
  groups: BulkReceiptPreviewGroup[];
  totalCollected: number;
  totalStudents: number; // distinct students across the groups
  totalReceipts: number; // === groups.length, surfaced for readability
  errors: BulkReceiptImportError[];
}

/**
 * Statuses that qualify for receipt generation. Bills that are already
 * fully paid / cancelled / refunded must NOT appear in the template.
 */
export const RECEIPTABLE_BILL_STATUSES = ['unpaid', 'partially_paid'] as const;
export type ReceiptableBillStatus = (typeof RECEIPTABLE_BILL_STATUSES)[number];
