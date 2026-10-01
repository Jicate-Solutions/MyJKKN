/**
 * Salary revisions — the plain-words side of the Director's 16 rulings of
 * 29 September 2026 (see supabase/migrations/20270519090000_hr_salary_revision_requests.sql).
 *
 * Pure: no database, no React. What each status is called, which flags a
 * request carries (CUT / asking for self / asking for a senior), the red
 * "above the band by ₹X" warning shown to the Director, and the checks the ask
 * form runs before it sends anything. The database makes every real decision;
 * this file only says it in words a 10th-grade reader follows.
 */

import { checkPayBand, type PayBandPolicy } from '@/lib/hr/pay-band-check';
import { formatRupees } from '@/lib/hr/salary-suggestion';

export type SalaryRevisionStatus =
  | 'waiting_principal'
  | 'waiting_director'
  | 'approved'
  | 'applied'
  | 'stopped'
  | 'refused'
  /** 30 Sep: an approved raise whose person left before its start date. */
  | 'cancelled';

export type SalaryRevisionAskedAs = 'director' | 'hr_head' | 'principal' | 'hod';

/** One request as the list function returns it. */
export interface SalaryRevisionRow {
  id: string;
  staff_id: string;
  person_name: string;
  staff_code: string | null;
  designation: string | null;
  institution_id: string;
  institution_name: string | null;
  department_name: string | null;
  asked_by: string;
  asked_by_name: string | null;
  asked_as: SalaryRevisionAskedAs;
  route: 'direct' | 'via_principal';
  is_self: boolean;
  is_for_senior: boolean;
  current_monthly_gross: number | string;
  asked_monthly_gross: number | string;
  is_cut: boolean;
  final_monthly_gross: number | string | null;
  final_is_cut: boolean | null;
  reason: string;
  status: SalaryRevisionStatus;
  starts_on: string | null;
  created_at: string;
  principal_decided_at: string | null;
  director_decided_at: string | null;
  applied_at: string | null;
  comment_count: number;
  /** 30 Sep: the asker is the principal AND the head of this person's department. */
  asker_is_also_hod: boolean;
  /** 30 Sep: the college's pay band changed since the request. Only ever true for the Director. */
  band_changed: boolean;
  /** Why an approved raise could not be written yet, or that its start date was missed. */
  apply_note: string | null;
  /** 30 Sep: why an approved raise was cancelled (the person left). */
  cancel_note: string | null;
  /**
   * 1 Oct 2026: may THIS viewer give the final yes or no on it now? False for
   * their own raise, and for a raise for someone on the Director list unless
   * they are the Director himself (20271003101503). The database refuses anyway.
   */
  can_decide: boolean;
}

/**
 * 1 Oct 2026, rule 6: a yes given before that day's rulings that breaks them
 * (fn_hr_salary_revision_held_approvals, Director list only). Read-only:
 * an approved one is never written to the pay, an applied one was written
 * before the rules, and nothing about either is changed.
 */
export interface HeldApprovalRow {
  id: string;
  staff_id: string;
  person_name: string;
  staff_code: string | null;
  status: SalaryRevisionStatus;
  final_monthly_gross: number | string | null;
  starts_on: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  why: string;
}

/** The database's reason, in the words the approval page shows. */
export function heldReasonInWords(why: string): string {
  if (why.startsWith('Nobody can tell')) return 'Linked to no account, so it cannot be checked';
  return why.startsWith('Approved by the person')
    ? 'Approved by the person themself'
    : 'Approved by someone other than the Director';
}

export const STATUS_LABELS: Record<SalaryRevisionStatus, string> = {
  waiting_principal: 'Waiting for the principal',
  waiting_director: 'Waiting for the Director',
  approved: 'Approved — starts soon',
  applied: 'Approved — now in the pay',
  stopped: 'Stopped by the principal',
  refused: 'Not approved',
  cancelled: 'Cancelled — the person left before the start',
};

export const ASKED_AS_LABELS: Record<SalaryRevisionAskedAs, string> = {
  director: 'the Director',
  hr_head: 'the HR head',
  principal: 'the principal',
  hod: 'the head of department',
};

/** Still waiting for somebody (ruling 10 counts 'approved' as open too). */
export function isOpen(status: SalaryRevisionStatus): boolean {
  return status === 'waiting_principal' || status === 'waiting_director' || status === 'approved';
}

/** numeric(12,2) arrives from PostgREST as a string. Unusable → null, never NaN. */
export function toAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export type SalaryRevisionFlagKind = 'cut' | 'self' | 'senior' | 'also_hod';

export interface SalaryRevisionFlag {
  kind: SalaryRevisionFlagKind;
  label: string;
}

/**
 * The flags a request carries, in the order they matter. RULING 7: a cut is
 * marked everywhere — and the Director's own figure decides once he has given
 * one, so a raise he turns into a cut is marked, and a cut he turns into a
 * raise is not. RULING 9: asking for oneself or for a senior is flagged.
 */
export function flagsFor(row: Pick<SalaryRevisionRow,
  'is_cut' | 'final_is_cut' | 'final_monthly_gross' | 'is_self' | 'is_for_senior'>
  & { asker_is_also_hod?: boolean }): SalaryRevisionFlag[] {
  const flags: SalaryRevisionFlag[] = [];
  const decided = toAmount(row.final_monthly_gross) !== null;
  const cut = decided ? row.final_is_cut === true : row.is_cut === true;
  if (cut) flags.push({ kind: 'cut', label: 'PAY CUT' });
  if (row.is_self) flags.push({ kind: 'self', label: 'Asking for self' });
  if (row.is_for_senior) flags.push({ kind: 'senior', label: 'Asking for a senior' });
  // 30 Sep: a principal who is also the head of the department had nobody to
  // check them, so the Director sees it marked.
  if (row.asker_is_also_hod) flags.push({ kind: 'also_hod', label: 'Principal is also the head of department' });
  return flags;
}

/** "+₹4,000 (8.3%)" / "−₹5,000 (12.5%) — a pay cut". */
export function changeText(current: number | null, next: number | null): string {
  if (current === null || next === null || current <= 0) return '—';
  const diff = next - current;
  const pct = Math.abs((diff / current) * 100);
  const pctText = `${pct.toFixed(pct < 10 ? 1 : 0)}%`;
  if (diff === 0) return 'No change';
  if (diff > 0) return `+${formatRupees(diff)} (${pctText})`;
  return `−${formatRupees(-diff)} (${pctText}) — a pay cut`;
}

/**
 * RULING 6: above the band maximum is allowed, with a red warning to the
 * Director. #4103's checker decides; this only words it. Returns null when the
 * figure is inside or below the band, or the band cannot be told.
 */
export function bandWarning(
  designation: string | null,
  figure: number | null,
  band: PayBandPolicy | null,
): string | null {
  if (figure === null) return null;
  const result = checkPayBand({ designation, monthlyPay: figure }, band);
  if (result.verdict !== 'above_band' || result.excess <= 0) return null;
  return `Above the band by ${formatRupees(result.excess)}`;
}

/** What the ask form checks before sending. The database checks again. */
export interface AskInput {
  figure: string;
  reason: string;
  currentPay: number | null;
}

export interface AskProblems {
  figure?: string;
  reason?: string;
}

export function checkAsk(input: AskInput): AskProblems {
  const problems: AskProblems = {};
  const figure = Number(String(input.figure).replace(/[,\s₹]/g, ''));
  if (!input.figure.trim() || !Number.isFinite(figure) || figure <= 0) {
    problems.figure = 'Write the new monthly pay, in rupees.';
  } else if (input.currentPay !== null && figure === input.currentPay) {
    problems.figure = 'That is the same as the pay now.';
  }
  // RULING 13: the asker must write a reason.
  if (!input.reason.trim()) {
    problems.reason = 'Write a reason. The Director reads it before he decides.';
  } else if (input.reason.trim().length > 2000) {
    problems.reason = 'The reason is too long (2,000 characters at most).';
  }
  return problems;
}

/** "1 October 2026" from yyyy-MM-dd. */
export function longDate(date: string | null): string {
  if (!date) return '—';
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const month = new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
  return `${d} ${month} ${y}`;
}

/** The sentence the Director's tick-box list and the single view both show. */
export function decisionSummary(row: Pick<SalaryRevisionRow,
  'status' | 'final_monthly_gross' | 'asked_monthly_gross' | 'starts_on'>): string {
  const finalPay = toAmount(row.final_monthly_gross);
  const asked = toAmount(row.asked_monthly_gross);
  switch (row.status) {
    case 'approved':
    case 'applied': {
      const changed = finalPay !== null && asked !== null && finalPay !== asked;
      return `Approved at ${finalPay === null ? '—' : formatRupees(finalPay)} a month from ${longDate(row.starts_on)}`
        + (changed ? ` (asked: ${formatRupees(asked as number)})` : '')
        + (row.status === 'applied' ? '. It is now in the pay.' : '.');
    }
    case 'refused':
      return 'The Director said no.';
    case 'stopped':
      return 'The principal stopped it.';
    case 'waiting_principal':
      return 'Waiting for the principal to agree or stop it.';
    case 'cancelled':
      // 30 Sep: an approved raise whose person left before its start date.
      return `Cancelled: the person left before the new pay was to start${row.starts_on ? ` on ${longDate(row.starts_on)}` : ''}.`;
    default:
      return 'Waiting for the Director’s yes or no.';
  }
}
