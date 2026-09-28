/**
 * Bill cancel REQUEST — the approval step in front of a bill cancellation.
 *
 * Mirrors `billing_bill_cancel_requests` / `billing_bill_cancel_request_actions`
 * (migration 20260928100000). A request carries the evidence; approval copies
 * it into `billing_bill_cancellations` and voids the bill.
 */

import type {
  BillCancelReasonCode,
  BillCancellationAttachment,
  BillCancellationSnapshot,
} from './billing-bill-cancellation';

export type BillCancelRequestStatus =
  | 'pending_approval'
  | 'approved'
  | 'declined'
  | 'withdrawn'
  | 'failed';

export interface BillCancelRequest {
  id: string;
  request_number: string;
  /** NULL once a super admin hard-deletes the bill; bill_snapshot survives. */
  bill_id: string | null;
  institution_id: string;
  student_id: string | null;
  reason_code: BillCancelReasonCode;
  reason: string;
  attachments: BillCancellationAttachment[];
  bill_snapshot: BillCancellationSnapshot;
  amount: number;
  status: BillCancelRequestStatus;
  // Identity SNAPSHOTS taken at request/decision time.
  requested_by: string | null;
  requested_by_name: string | null;
  requested_by_email: string | null;
  requested_by_role: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_by_email: string | null;
  decided_by_role: string | null;
  decided_by_designation: string | null;
  decided_by_is_super_admin: boolean | null;
  decided_at: string | null;
  decision_notes: string | null;
}

export interface BillCancelAction {
  id: string;
  request_id: string;
  action_type: 'requested' | 'approved' | 'declined' | 'withdrawn' | 'failed';
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  actor_role_name: string | null;
  actor_is_super_admin: boolean | null;
  notes: string | null;
  created_at: string;
}

export interface BillCancelLearner {
  id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
  register_number: string | null;
  institution_name: string | null;
  program_name: string | null;
}

export interface BillCancelRequestDetail {
  request: BillCancelRequest | null;
  actions: BillCancelAction[];
  learner: BillCancelLearner | null;
  /** The live bill row (status/balance now), null if it was deleted. */
  bill: {
    id: string;
    status: string | null;
    final_amount: number | null;
    balance_amount: number | null;
    bill_description: string | null;
  } | null;
}

/** One row of fn_bill_cancel_eligibility. */
export interface BillCancelEligibility {
  bill_id: string;
  eligible: boolean;
  blocked_reason: string | null;
  receipted_amount: number;
  receipt_numbers: string | null;
  pending_request_id: string | null;
  pending_request_number: string | null;
}

export interface RequestBillCancelInput {
  billId: string;
  reasonCode: BillCancelReasonCode;
  reason: string;
  attachments: BillCancellationAttachment[];
}

export interface BillCancelApprovalFlow {
  id: string;
  institution_id: string | null;
  flow_name: string;
  approver_role_key: string | null;
  approver_user_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
