/**
 * Bill cancellation — the audit record behind voiding a learner bill.
 *
 * Shapes here mirror `billing_bill_cancellations` and the payload
 * `fn_cancel_student_bill` accepts. The attachment shape is deliberately
 * identical to RefundAttachment so the two upload fields stay interchangeable.
 */

export const BILL_CANCEL_REASON_CODES = [
  'duplicate_bill',
  'raised_in_error',
  'fee_waived',
  'learner_withdrawn',
  'structure_corrected',
  'other',
] as const;

export type BillCancelReasonCode = (typeof BILL_CANCEL_REASON_CODES)[number];

/** Labels for the dialog's reason picker. Keys must match the DB CHECK. */
export const BILL_CANCEL_REASON_LABELS: Record<BillCancelReasonCode, string> = {
  duplicate_bill: 'Duplicate bill',
  raised_in_error: 'Raised in error',
  fee_waived: 'Fee waived',
  learner_withdrawn: 'Learner withdrawn / not joined',
  structure_corrected: 'Fee structure corrected',
  other: 'Other',
};

export interface BillCancellationAttachment {
  name: string;
  drive_file_id: string;
  drive_url: string;
  mime?: string;
  size?: number;
}

/** The bill as it stood at cancel time — frozen, because the row stays editable. */
export interface BillCancellationSnapshot {
  bill_description?: string | null;
  final_amount?: number | null;
  balance_amount?: number | null;
  status?: string | null;
  due_date?: string | null;
  fee_source?: string | null;
  category_name?: string | null;
}

export interface BillCancellation {
  id: string;
  bill_id: string;
  institution_id: string;
  student_id: string;
  reason_code: BillCancelReasonCode;
  reason: string;
  attachments: BillCancellationAttachment[];
  bill_snapshot: BillCancellationSnapshot;
  amount_cancelled: number;
  // Identity SNAPSHOTS taken at cancel time. A profile can be renamed, have its
  // email changed or be deactivated long after the fact, so the uuid alone
  // cannot answer "who voided this bill" years later.
  cancelled_by: string | null;
  cancelled_by_name: string | null;
  cancelled_by_email: string | null;
  cancelled_by_role: string | null;
  cancelled_by_is_super_admin: boolean | null;
  cancelled_at: string;
  created_at: string;
}

export interface CancelBillInput {
  billId: string;
  reasonCode: BillCancelReasonCode;
  reason: string;
  attachments: BillCancellationAttachment[];
  /** Display only, for the activity-log line. Never trusted for authorization. */
  studentName?: string;
}

export interface CancelBillResult {
  cancellationId: string;
  billId: string;
  amountCancelled: number;
}
