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
   * they are the Director himself (20271007150103). The database refuses anyway.
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

// ============================================================================
// Target-gated raises (rulings of 7 Oct 2026, 20271007180207). At the
// Director's yes a raise splits: the annual increment starts on the start
// date; the rest is HELD until a month with every target met. The database
// measures and decides everything; this says it in plain words.
// ============================================================================

export type TargetKey = 't1' | 't2' | 't3' | 't4' | 't5';

export type TargetPlanState =
  | 'none' | 'awaiting_measurement' | 'waiting' | 'released' | 'paused' | 'back_to_director' | 'held_listed' | 'lapsed';

export type TargetMonthStatus =
  | 'in_progress' | 'met' | 'missed' | 'not_counted' | 'not_measured' | 'flagged' | 'decided_met' | 'decided_missed';

export interface TargetThresholds {
  t1_marked_by_self_min_pct: number;
  t1_mark_within_hours: number;
  t3_linked_min_pct: number;
  t4_resource_min_pct: number;
  t5_min_pulses_per_week: number;
}

export interface TargetPlan {
  request_id: string;
  staff_id: string;
  base_monthly_gross: number | string;
  increment_amount: number | string;
  held_amount: number | string;
  target_role: string | null;
  /** The copy kept at the yes (role and targets at switch-on); later edits to the setting never change it. */
  rules: {
    annual_increment_percent: number;
    window_months: number;
    pause_after_missed_months: number;
    role: string | null;
    targets: TargetThresholds | null;
  };
  window_start: string;
  window_months: number;
  state: TargetPlanState;
  state_reason: string | null;
  missed_in_row: number;
  held_paid_from: string | null;
  paused_from: string | null;
  run_note: string | null;
  lapse_note?: string | null;
}

export interface TargetResult {
  target: TargetKey;
  numerator: number;
  denominator: number;
  met: boolean;
}

export interface TargetMonth {
  request_id: string;
  month: string;
  status: TargetMonthStatus;
  results: TargetResult[];
  acted: boolean;
  action: 'released' | 'paused' | 'resumed' | 'none' | null;
  action_effective_from: string | null;
}

/** The principal's flag on a month and the Director's decision. Never sent to the person. */
export interface TargetFlag {
  request_id: string;
  month: string;
  note: string;
  flagged_at: string;
  decided_at: string | null;
  counts_as_met: boolean | null;
  decision_note: string | null;
}

export interface RaiseTargets {
  plan: TargetPlan | null;
  months: TargetMonth[];
  flags: TargetFlag[];
}

export const TARGET_KEYS: TargetKey[] = ['t1', 't2', 't3', 't4', 't5'];

export const TARGET_LABELS: Record<TargetKey, string> = {
  t1: 'Attendance marked by you, on time',
  t2: 'Lesson plan reviewed for every course',
  t3: 'Sessions linked to the lesson taught',
  t4: 'Class material on your periods',
  t5: 'A live class pulse every week, per course',
};

/** What each target asks, with the numbers kept on this raise. */
export function targetRule(key: TargetKey, t: TargetThresholds): string {
  switch (key) {
    case 't1': return `At least ${t.t1_marked_by_self_min_pct}% of your periods, first marked by you between the start of the session and ${t.t1_mark_within_hours} hours after it ends (as the server recorded it)`;
    case 't2': return 'For each course: at least one lesson you did not write yourself reviewed and published, and none of your own drafts left';
    case 't3': return `At least ${t.t3_linked_min_pct}% of the sessions you marked (counted once every lesson plan is reviewed)`;
    case 't4': return `Class material on at least ${t.t4_resource_min_pct}% of your periods, posted by the end of that day`;
    case 't5': return `At least ${t.t5_min_pulses_per_week} opened each week (Monday to Sunday) for each course you teach`;
  }
}

export const MONTH_STATUS_LABELS: Record<TargetMonthStatus, string> = {
  in_progress: 'So far',
  met: 'All met',
  missed: 'Missed',
  not_counted: 'No sessions: not counted',
  not_measured: 'Not measured: targets being set up',
  flagged: 'Flagged: waiting for the Director',
  decided_met: 'Director: counts as met',
  decided_missed: 'Director: counts as missed',
};

/** "October 2026" from yyyy-MM-dd. */
export function monthName(month: string): string {
  const [y, m] = month.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, 1)));
}

/** The last month of the window, yyyy-MM-01. */
export function windowEnd(plan: Pick<TargetPlan, 'window_start' | 'window_months'>): string {
  const [y, m] = plan.window_start.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + plan.window_months - 1, 1));
  return d.toISOString().slice(0, 10);
}

function heldRupees(plan: TargetPlan): string {
  const held = toAmount(plan.held_amount);
  return held === null ? 'The held part' : `The held ${formatRupees(held)} a month`;
}

/** One sentence: where the held part stands. */
export function planStateText(plan: TargetPlan): string {
  const pause = plan.rules.pause_after_missed_months;
  switch (plan.state) {
    case 'none':
      return 'Nothing is held: the whole raise starts on the start date.';
    case 'awaiting_measurement':
      return `${heldRupees(plan)} is held while the targets are being set up. `
        + 'Nothing is measured yet, and nothing changes your pay until they are.';
    case 'waiting':
      return `${heldRupees(plan)} starts on the 1st of the month after a month with every target met, `
        + `if that happens by ${monthName(windowEnd(plan))}.`;
    case 'released':
      return `${heldRupees(plan)} is being paid${plan.held_paid_from ? ` from ${longDate(plan.held_paid_from)}` : ''}.`
        + (plan.missed_in_row > 0
          ? ` ${plan.missed_in_row} month${plan.missed_in_row === 1 ? '' : 's'} below target in a row; ${pause} in a row pause it.`
          : ` ${pause} months below target in a row would pause it.`);
    case 'paused':
      return `${heldRupees(plan)} is paused${plan.paused_from ? ` from ${longDate(plan.paused_from)}` : ''} after ${pause} months below target in a row. `
        + 'It is paid again from the 1st after a month on target. Months already paid are not taken back.';
    case 'back_to_director':
      return `No month met every target by ${monthName(windowEnd(plan))}. It is back with the Director, with the numbers.`;
    case 'lapsed':
      // The person's own view carries no reason (default cc).
      if (plan.state_reason === null) return 'Lapsed: this held part will not be paid under this raise.';
      if (plan.state_reason === 'lapsed_by_director') {
        return 'Lapsed by the Director, so a new raise can be asked for. Nobody’s pay changed.';
      }
      return plan.state_reason === 'moved_college'
        ? 'Lapsed: the person moved to another college before it was paid. Listed for the Director.'
        : 'Lapsed: the person left before it was paid. Listed for the Director.';
    case 'held_listed': {
      if (plan.state_reason === null) return 'Held: the Director decides when it is paid.';
      const reason = plan.state_reason ?? '';
      if (reason === 'director_list') return 'Held: the person is on the Director list, so only the Director decides when it is paid.';
      if (reason.startsWith('waits_for_own_targets:')) {
        return `Held: there are no targets for the ${reason.split(':')[1]} role yet. Listed for the Director.`;
      }
      if (reason.startsWith('several_target_roles:')) {
        return 'Held: the person holds more than one role with targets. Listed for the Director.';
      }
      return 'Held: MyJKKN has no targets for this person’s role yet. Listed for the Director.';
    }
  }
}

/** "12 of 14 (86%)" — or "none scheduled". */
export function resultText(r: Pick<TargetResult, 'numerator' | 'denominator'>): string {
  if (r.denominator === 0) return 'none scheduled';
  return `${r.numerator} of ${r.denominator} (${Math.floor((r.numerator * 100) / r.denominator)}%)`;
}

/** A principal may flag a month the monthly run has not counted yet. */
export function canFlagMonth(plan: TargetPlan, month: TargetMonth): boolean {
  return ['waiting', 'released', 'paused'].includes(plan.state) && month.status === 'in_progress';
}

/** The Director may lapse a held part that is still open (one held raise at a time). */
export function canLapsePlan(plan: TargetPlan): boolean {
  return ['awaiting_measurement', 'waiting', 'released', 'paused', 'back_to_director', 'held_listed'].includes(plan.state);
}

/** The Director decides a flagged month once it is over. */
export function canDecideMonth(month: TargetMonth, todayIst: string): boolean {
  return month.status === 'flagged' && month.month.slice(0, 7) < todayIst.slice(0, 7);
}

/** One row of fn_hr_salary_revision_targets_listed() (Director list only). */
export interface ListedTargetRow {
  request_id: string;
  staff_id: string;
  person_name: string;
  staff_code: string | null;
  state: string;
  why: string;
  /** Set for a flagged month waiting for his decision. */
  month: string | null;
  increment_amount: number | string;
  held_amount: number | string;
  /** A flagged month: its five results. Otherwise each counted month: { month, status, results }. */
  results: unknown;
}

/** Why a held part is on the Director's list, in plain words. */
export function listedReasonInWords(why: string): string {
  const [code, ...rest] = why.split(':');
  const note = rest.join(':').trim();
  switch (code) {
    case 'awaiting_measurement': return 'Waiting for measurement to be switched on';
    case 'director_list': return 'On the Director list: you decide when it is paid';
    case 'waits_for_own_targets': return `No targets for the ${note || 'principal'} role yet`;
    case 'no_targets_for_role': return 'No targets set for this person’s role';
    case 'no_teaching_timetable': return 'Does not teach (no timetable): no targets';
    case 'several_target_roles': return 'Holds more than one role with targets';
    case 'window_over': return 'No month met every target in time: back with you';
    case 'left': return 'Left before it was paid';
    case 'moved_college': return 'Moved to another college before it was paid';
    case 'start_missed': return 'Start date passed without the pay being written';
    case 'left_before_start': return 'Left before the start date';
    case 'lapsed_by_director': return note ? `Lapsed by you: ${note}` : 'Lapsed by you';
    case 'flagged': return note ? `Principal flagged this month: ${note}` : 'Principal flagged this month';
    case 'run': return note ? `Monthly check skipped it: ${note}` : 'Monthly check skipped it';
    case 'start date': return note ? `Start date wrote nothing: ${note}` : 'Start date wrote nothing';
    default: return why;
  }
}
