/**
 * Compensatory off earned-credit ledger.
 *
 * Comp off is EARNED, not granted: each credit traces to the day worked and
 * expires one calendar month later on its own schedule (90 days until
 * 2026-09-11). That is why it lives in
 * hr_comp_off_credits rather than hr_leave_balances, which holds one flat
 * (entitled, used, carried_forward) row per type per academic year.
 */

import type { LeaveDocument } from '@/types/hr';

/**
 * What a human decided. Expiry is NOT stored here — see `effective_status`.
 * 'withdrawn' = the claimant took back a pending claim (hcoc_withdraw_own_pending);
 * the database has always allowed it, the type just never listed it.
 */
export type CompOffCreditStatus = 'pending' | 'approved' | 'rejected' | 'consumed' | 'withdrawn';

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

/**
 * Where a claimed day was worked (2026-09-11). Required on new claims; NULL on
 * claims filed before then and on hr_grant / attendance credits. Outside campus
 * always carries `work_place` — the database CHECKs the pairing.
 */
export type CompOffWorkLocation = 'inside_campus' | 'outside_campus';

export const COMP_OFF_WORK_LOCATION_LABELS: Record<CompOffWorkLocation, string> = {
  inside_campus: 'Inside campus',
  outside_campus: 'Outside campus',
};

/**
 * One wording for the three places this is shown (claim queue, claim detail,
 * the claimant's ledger). A claim filed before the field existed says so rather
 * than looking blank; a credit nobody claimed has no location to report.
 */
/**
 * Did the person punch in on the worked day? Only asked of INSIDE-campus claims
 * (2026-09-11). Computed by fn_hr_comp_off_biometric_check — the same function
 * trg_hcoc_require_biometric runs on approval — and read through the
 * hr_comp_off_claims_biometric RPC, because attendance rows are RLS-hidden from
 * most approvers.
 */
export type CompOffBiometricStatus =
  | 'punched'       // attendance row with in/out times — eligible
  | 'no_punch'      // day uploaded, nothing for this person — NOT eligible
  | 'not_uploaded'  // nothing imported for that day yet — cannot approve yet
  | 'no_device'     // not enrolled on any device — verify with the proof
  | 'not_required'  // outside campus
  | 'not_recorded'; // claim predates the location field

export interface CompOffClaimBiometric {
  claim_id: string;
  status: CompOffBiometricStatus;
  in_at: string | null;
  out_at: string | null;
  /** 'biometric', or 'regularization' for an HR-approved correction. */
  source: string | null;
}

/** The two results trg_hcoc_require_biometric refuses an approval on. */
export function biometricBlocksApproval(status: CompOffBiometricStatus | null | undefined): boolean {
  return status === 'no_punch' || status === 'not_uploaded';
}

const punchTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
      })
    : null;

/**
 * One wording for the queue row and the detail sheet. `tone` picks the colour.
 * Outside-campus and pre-location claims have nothing to report (null).
 */
export function describeBiometric(
  check: Pick<CompOffClaimBiometric, 'status' | 'in_at' | 'out_at' | 'source'>
): { label: string; detail: string; tone: 'ok' | 'bad' | 'warn' | 'muted' } | null {
  switch (check.status) {
    case 'punched': {
      const span = [punchTime(check.in_at), punchTime(check.out_at)].filter(Boolean).join('–');
      return {
        label: check.source === 'regularization'
          ? `Attendance (regularised) ${span}`
          : `Biometric ${span}`,
        detail: 'A punch was found for the worked day, so the claim is eligible.',
        tone: 'ok',
      };
    }
    case 'no_punch':
      return {
        label: 'No biometric punch',
        detail: 'There is no punch for the worked day, so this inside-campus claim is not eligible. Reject it.',
        tone: 'bad',
      };
    case 'not_uploaded':
      return {
        label: 'Biometric not uploaded',
        detail: 'Attendance for this day has not been imported yet. Import it from HR › Attendance › Import, then approve.',
        tone: 'warn',
      };
    case 'no_device':
      return {
        label: 'No biometric device',
        detail: 'This person is not enrolled on an attendance device — verify the day with the proof document.',
        tone: 'muted',
      };
    default:
      return null;
  }
}

export function formatWorkLocation(
  location: CompOffWorkLocation | null,
  source: CompOffCreditSource
): string {
  if (location) return COMP_OFF_WORK_LOCATION_LABELS[location] ?? location;
  return source === 'claim' ? 'Not recorded' : '—';
}

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
  work_location: CompOffWorkLocation | null;
  work_place: string | null;
  /** Shared by the days of one multi-day claim; null for a single-day claim. */
  claim_batch_id?: string | null;
  /** 0 once lapsed — never negative. */
  days_until_expiry: number;
  /**
   * Who approved or refused the claim (who revoked it, for a revoked one).
   * Null while pending, for a decision taken before 2026-09-30 (nobody was
   * recorded), and for the nightly auto-reject.
   */
  decided_by_name?: string | null;
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
  withdrawn: 'Withdrawn',
};

/** Credits within this many days of lapsing get a visual warning. */
export const COMP_OFF_EXPIRY_WARNING_DAYS = 14;

/**
 * The day a credit earned on `iso` (YYYY-MM-DD) expires: one CALENDAR month
 * later, clamped to the end of a shorter month — exactly what Postgres does for
 * `worked_date + INTERVAL '1 month'` in hr_comp_off_set_expiry. JS `setMonth`
 * would roll 31 Jan into 3 Mar and promise a date the database never set.
 */
export function addOneMonth(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const year = m === 12 ? y + 1 : y;
  const month = m === 12 ? 1 : m + 1;
  // Day 0 of the following month is the last day of `month` (1-based here).
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
}

type WindowCredit = Pick<CompOffCredit, 'worked_date' | 'expires_on' | 'effective_status'>;

/**
 * Can comp off be taken on `date`? Only against a credit that is approved and
 * unexpired, AFTER the day it was worked and no later than its expiry —
 * the same test hr_trig_comp_off_consume applies when the request is approved.
 * ISO dates compare correctly as strings.
 */
export function isBookableCompOffDate(date: string, credits: WindowCredit[]): boolean {
  return credits.some(
    (c) => c.effective_status === 'approved' && c.worked_date < date && date <= c.expires_on
  );
}

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
  work_location: CompOffWorkLocation | null;
  work_place: string | null;
  /** Shared by the days of one multi-day claim; null for a single-day claim. */
  claim_batch_id: string | null;
  /** Proof of the worked day — same Drive-backed shape as leave documents. */
  documents: LeaveDocument[];
  created_at: string;
}

/**
 * A claim as the approvals queue lists it: pending ones plus anything created
 * in the last 12 months, so decided history is one filter away.
 */
export interface CompOffClaimQueueRow extends PendingCompOffClaim {
  status: CompOffCreditStatus;
  /** When it was approved or rejected (the column is named approved_at). */
  decided_at: string | null;
  rejection_reason: string | null;
  /**
   * Set when an APPROVED claim was taken back. `status` is 'rejected' either
   * way — this is what separates it from a claim refused on day one.
   */
  revoked_at: string | null;
  revoke_reason: string | null;
}

/** Most individual days one claim may carry — a month of dates. */
export const MAX_CLAIM_DAYS = 31;

/**
 * Why a picked worked day cannot be claimed, or null when it can. The same
 * refusals the database raises per row (future date, expired on arrival,
 * closed month, day already occupied) — named here so the claimant sees which
 * day to remove before the all-or-nothing insert refuses the lot.
 */
export function claimDayProblem(
  workedDate: string,
  today: string,
  opts: {
    closedMonth: boolean;
    clash: string | null;
    /** Status of an earlier claim for this day, if any (see priorClaimStatus). */
    priorClaim?: CompOffCreditStatus | null;
  }
): string | null {
  if (workedDate > today) return 'You cannot claim a day you have not worked yet.';
  if (opts.priorClaim) {
    return `Already claimed (${PRIOR_CLAIM_LABEL[opts.priorClaim] ?? opts.priorClaim}) — a worked day can be claimed only once.`;
  }
  if (addOneMonth(workedDate) < today) {
    return `Too late — a credit for this day expired on ${formatIsoDate(addOneMonth(workedDate))}.`;
  }
  if (opts.closedMonth) return 'Attendance for this month is closed. Ask HR to reopen it.';
  if (opts.clash) return `Already booked: ${opts.clash}.`;
  return null;
}

/**
 * A worked day can be claimed ONCE: any earlier claim for it blocks a new one
 * except one the staff member withdrew. Mirrors fn_hr_comp_off_prior_claim,
 * which trg_hcoc_one_claim_per_day raises on — this only names it early.
 * Returns date -> the blocking status.
 */
export function priorClaimStatus(
  credits: Array<Pick<CompOffCredit, 'worked_date' | 'status'>>
): Map<string, CompOffCreditStatus> {
  const rank: Partial<Record<CompOffCreditStatus, number>> = {
    consumed: 0, approved: 1, pending: 2, rejected: 3,
  };
  const out = new Map<string, CompOffCreditStatus>();
  for (const c of credits) {
    const r = rank[c.status];
    if (r === undefined) continue;
    const cur = out.get(c.worked_date);
    if (cur === undefined || r < (rank[cur] ?? 9)) out.set(c.worked_date, c.status);
  }
  return out;
}

const PRIOR_CLAIM_LABEL: Partial<Record<CompOffCreditStatus, string>> = {
  consumed: 'credit already used',
  approved: 'approved',
  pending: 'awaiting approval',
  rejected: 'rejected',
};

/** "Day 2 of 3" for a claim row whose submission carried several days; null otherwise. */
export function claimBatchPosition(
  row: Pick<PendingCompOffClaim, 'id' | 'claim_batch_id'>,
  rows: Array<Pick<PendingCompOffClaim, 'id' | 'claim_batch_id' | 'worked_date'>>
): { index: number; total: number } | null {
  if (!row.claim_batch_id) return null;
  const siblings = rows
    .filter((r) => r.claim_batch_id === row.claim_batch_id)
    .sort((a, b) => a.worked_date.localeCompare(b.worked_date));
  if (siblings.length < 2) return null;
  return { index: siblings.findIndex((r) => r.id === row.id) + 1, total: siblings.length };
}

/** DD/MM/YYYY for an ISO date, without a timezone shift. */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
