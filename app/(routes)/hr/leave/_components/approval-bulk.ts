// Bulk decision rules for the Leave / Short Time Off approval tables
// (2026-09-11). A bulk button only ever sends requests the database will accept,
// and says how many of the selection it left out and why — so a bulk approval
// never turns into a list of per-row refusals.

import type { HRLeaveApprovalQueueRow } from '@/types/hr';
import { isReviewStep } from './format';

export interface ApprovalBulkSkipped {
  /** Already approved / rejected / withdrawn / cancelled. */
  decided: number;
  /** Open, but can_decide is false — usually the caller's own request. */
  notYours: number;
  /** A final approval blocked by a missing biometric file. Approve only. */
  biometric: number;
}

export interface ApprovalBulkSplit {
  eligible: HRLeaveApprovalQueueRow[];
  skipped: ApprovalBulkSkipped;
}

const isOpen = (r: HRLeaveApprovalQueueRow) => r.status === 'pending' || r.status === 'escalated';

/**
 * What "Approve N selected" may send. Mirrors the row menu: can_decide
 * (hr_trig_leave_enforce_approver), and a missing biometric blocks only a
 * FINAL approval (trg_hla_block_approval_without_biometric fires on the
 * transition into approved; a review step does not make it).
 */
export function splitBulkApprove(rows: HRLeaveApprovalQueueRow[]): ApprovalBulkSplit {
  const skipped: ApprovalBulkSkipped = { decided: 0, notYours: 0, biometric: 0 };
  const eligible: HRLeaveApprovalQueueRow[] = [];
  for (const r of rows) {
    if (!isOpen(r)) skipped.decided += 1;
    else if (!r.can_decide) skipped.notYours += 1;
    else if (r.biometric_gap_from !== null && !isReviewStep(r)) skipped.biometric += 1;
    else eligible.push(r);
  }
  return { eligible, skipped };
}

/** What "Reject N selected" may send. Rejecting writes no stamp, so no biometric gate. */
export function splitBulkReject(rows: HRLeaveApprovalQueueRow[]): ApprovalBulkSplit {
  const skipped: ApprovalBulkSkipped = { decided: 0, notYours: 0, biometric: 0 };
  const eligible: HRLeaveApprovalQueueRow[] = [];
  for (const r of rows) {
    if (!isOpen(r)) skipped.decided += 1;
    else if (!r.can_decide) skipped.notYours += 1;
    else eligible.push(r);
  }
  return { eligible, skipped };
}

/** "2 already decided, 1 you cannot decide" — empty when nothing was left out. */
export function describeApprovalSkipped(s: ApprovalBulkSkipped): string {
  return [
    s.decided > 0 ? `${s.decided} already decided` : null,
    s.notYours > 0 ? `${s.notYours} you cannot decide` : null,
    s.biometric > 0 ? `${s.biometric} missing biometric` : null,
  ]
    .filter(Boolean)
    .join(', ');
}
