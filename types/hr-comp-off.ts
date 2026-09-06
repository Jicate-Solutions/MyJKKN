/**
 * Compensatory off earned-credit ledger.
 *
 * Comp off is EARNED, not granted: each credit traces to the day worked and
 * expires 90 days later on its own schedule. That is why it lives in
 * hr_comp_off_credits rather than hr_leave_balances, which holds one flat
 * (entitled, used, carried_forward) row per type per academic year.
 */

import type { LeaveDocument } from '@/types/hr';

/** What a human decided. Expiry is NOT stored here — see `effective_status`. */
export type CompOffCreditStatus = 'pending' | 'approved' | 'rejected' | 'consumed';

/**
 * Status as displayed, with lapse folded in.
 *
 * 'expired' exists only here: it is derived from `expires_on` at read time.
 * Storing it would need a scheduled job whose failure would silently keep dead
 * credits spendable.
 */
export type CompOffEffectiveStatus = CompOffCreditStatus | 'expired';

/**
 * How the credit came to exist.
 * - `claim`      team member asserts a worked date, an approver confirms
 * - `hr_grant`   HR creates it directly
 * - `attendance` auto-created from approved attendance on a holiday/week-off.
 *                Defined but dormant: hr_attendance_records and
 *                hr_public_holidays are both empty, so nothing writes it yet.
 *                (hr_shift_templates was removed 2026-08-06; shift config now
 *                lives in hr_shift_timings, which IS populated.)
 */
export type CompOffCreditSource = 'claim' | 'hr_grant' | 'attendance';

export interface CompOffCredit {
  id: string;
  worked_date: string;
  expires_on: string;
  credit_days: number;
  status: CompOffCreditStatus;
  effective_status: CompOffEffectiveStatus;
  source: CompOffCreditSource;
  notes: string | null;
  rejection_reason: string | null;
  /** 0 once lapsed — never negative. */
  days_until_expiry: number;
}

export interface CompOffBalance {
  employee_id?: string;
  /** Approved + consumed. What was ever earned, regardless of what remains. */
  earned: number;
  /** Approved, unconsumed, unexpired — the only spendable figure. */
  available: number;
  /** Approved but lapsed unused. */
  expired: number;
  consumed: number;
  /** Claimed, awaiting a decision. Not yet spendable. */
  pending: number;
  credits: CompOffCredit[];
}

export const COMP_OFF_STATUS_LABELS: Record<CompOffEffectiveStatus, string> = {
  pending: 'Pending approval',
  approved: 'Available',
  rejected: 'Rejected',
  consumed: 'Used',
  expired: 'Expired',
};

/** Credits within this many days of lapsing get a visual warning. */
export const COMP_OFF_EXPIRY_WARNING_DAYS = 14;

/** A claim awaiting an approver's decision, with the claimant resolved. */
export interface PendingCompOffClaim {
  id: string;
  employee_id: string;
  /** 'Unknown' when the staff row is unreadable — the claim still shows. */
  employee_name: string;
  employee_code: string | null;
  /** From the claimant's staff row; null when that row is unreadable. */
  institution_id: string | null;
  institution_name: string | null;
  worked_date: string;
  expires_on: string;
  credit_days: number;
  source: CompOffCreditSource;
  notes: string | null;
  /** Proof of the worked day — same Drive-backed shape as leave documents. */
  documents: LeaveDocument[];
  created_at: string;
}
