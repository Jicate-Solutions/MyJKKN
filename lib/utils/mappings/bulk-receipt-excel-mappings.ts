/**
 * Excel mapping utility for the Bulk Receipt Generation flow (super-admin).
 *
 * Unlike the bulk-bill import, this template is server-PRE-FILLED with
 * outstanding bills picked up by the schedule filters. The admin only fills
 * the "Paid Amount" column and uploads. The hidden Bill ID column is the
 * deterministic key the importer uses to bind a row back to a specific
 * billing_student_bills row — never trust roll_number + amount alone, that
 * combination is not unique when a student has two unpaid bills with the
 * same balance.
 */

export const BULK_RECEIPT_TEMPLATE_HEADERS = [
  'Roll Number',
  'Student Name',
  'Bill ID',
  'Bill Description',
  'Category',
  'Balance Amount',
  'Paid Amount'
] as const;

export type BulkReceiptTemplateHeader =
  (typeof BULK_RECEIPT_TEMPLATE_HEADERS)[number];

/**
 * Shape of a single parsed Excel row before it is grouped by student and
 * turned into a billing_receipt + billing_receipt_items pair.
 */
export interface BulkReceiptRow {
  roll_number: string;
  student_name: string;
  bill_id: string;
  bill_description: string | null;
  category: string | null;
  balance_amount: number;
  paid_amount: number;

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
 * Statuses that qualify for receipt generation. Bills that are already
 * fully paid / cancelled / refunded must NOT appear in the template.
 */
export const RECEIPTABLE_BILL_STATUSES = ['unpaid', 'partially_paid'] as const;
export type ReceiptableBillStatus = (typeof RECEIPTABLE_BILL_STATUSES)[number];
