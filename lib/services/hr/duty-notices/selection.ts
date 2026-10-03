/**
 * lib/services/hr/duty-notices/selection.ts
 *
 * PURE decision logic for the HR staff harness, duties R9 (onboarding
 * checklist) and A3 (attendance regularisation requests). No Supabase, no
 * clock of its own: every function takes `now` so the rules can be tested.
 *
 * The server half (who the recipients are, the ledger, the dispatch) lives in
 * ./dispatch.ts. Keeping the "which notice is due" rules here means the cron
 * route and the event hooks can never disagree about them.
 *
 * Added: 2026-10-01 — HR staff harness, lane C.
 */

// ---------------------------------------------------------------------------
// Shared: the ledger keys
// ---------------------------------------------------------------------------

/** Duty codes as used on the HR staff harness design page. */
export const DUTY_ONBOARDING = 'R9';
export const DUTY_REGULARIZATION = 'A3';

export type OnboardingNoticeKind =
  /** The step has become this owner's turn (start, or the previous step was done). */
  | 'step_turn'
  /** One reminder to the step owner: held too long, or the joining date is close. */
  | 'step_reminder'
  /** One notice to the HR head: the joining date passed with steps still open. */
  | 'joining_passed';

export type RegularizationNoticeKind =
  /** New request → the approvers. */
  | 'submitted'
  /** Pending past the reminder window → the approvers, once. */
  | 'reminder'
  /** Pending past the HR-head window → the HR head, once. */
  | 'hr_head'
  /** Approved or rejected → the requester. */
  | 'decided';

/** The ledger's natural key: one row per (subject, key, kind), ever. */
export function ledgerKey(subjectId: string, subjectKey: string, kind: string): string {
  return `${subjectId}|${subjectKey}|${kind}`;
}

// ---------------------------------------------------------------------------
// Dates (Asia/Kolkata, the calendar the institutions work to)
// ---------------------------------------------------------------------------

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD of an instant, in IST. */
export function istDate(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function dateOnlyUtc(ymd: string): number {
  return Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
}

/**
 * Working days that have passed since `fromIso`, counted as whole IST dates
 * strictly after the start date up to and including today. Sunday is the one
 * weekly holiday; institution holidays are NOT known here (no single holiday
 * table spans every college), so a holiday week can bring a reminder a day
 * early — never late.
 *
 * Started Monday → Tuesday 1, Wednesday 2, Thursday 3.
 */
export function workingDaysElapsed(fromIso: string, now: Date): number {
  const from = dateOnlyUtc(istDate(new Date(fromIso)));
  const to = dateOnlyUtc(istDate(now));
  let count = 0;
  for (let t = from + DAY_MS; t <= to; t += DAY_MS) {
    if (new Date(t).getUTCDay() !== 0) count += 1;
  }
  return count;
}

/** Whole IST days from today until `ymd` (negative once it has passed). */
export function daysUntil(ymd: string, now: Date): number {
  return Math.round((dateOnlyUtc(ymd.slice(0, 10)) - dateOnlyUtc(istDate(now))) / DAY_MS);
}

// ---------------------------------------------------------------------------
// R9 — onboarding checklist
// ---------------------------------------------------------------------------

/** One element of role_specific_details.onboarding_steps[]. */
export interface OnboardingStepState {
  index: number;
  step: string;
  completed: boolean;
  completed_at: string | null;
  completed_by?: string | null;
  assigned_role?: string | null;
  assigned_user_id?: string | null;
  assigned_user_email?: string | null;
}

/** Read the stamped steps defensively — the column is free-form JSON. */
export function readOnboardingSteps(details: unknown): OnboardingStepState[] {
  const raw = (details as { onboarding_steps?: unknown } | null)?.onboarding_steps;
  if (!Array.isArray(raw)) return [];
  return raw.map((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>;
    return {
      index: typeof o.index === 'number' ? o.index : i,
      step: typeof o.step === 'string' && o.step ? o.step : `Step ${i + 1}`,
      completed: o.completed === true,
      completed_at: typeof o.completed_at === 'string' ? o.completed_at : null,
      completed_by: typeof o.completed_by === 'string' ? o.completed_by : null,
      assigned_role: typeof o.assigned_role === 'string' ? o.assigned_role : null,
      assigned_user_id: typeof o.assigned_user_id === 'string' ? o.assigned_user_id : null,
      assigned_user_email: typeof o.assigned_user_email === 'string' ? o.assigned_user_email : null,
    };
  });
}

/**
 * The step whose turn it becomes after `completedPosition` is ticked: the
 * first open step AFTER it, else (everything after it is done) the first open
 * step anywhere. null when the checklist is complete.
 *
 * Positions are array positions, not the stored `index` field, so a template
 * with a gap in its numbering still walks in the order HR sees it.
 */
export function nextStepAfterCompletion(
  steps: OnboardingStepState[],
  completedPosition: number,
): number | null {
  for (let i = completedPosition + 1; i < steps.length; i += 1) {
    if (!steps[i].completed) return i;
  }
  for (let i = 0; i < steps.length; i += 1) {
    if (!steps[i].completed) return i;
  }
  return null;
}

/**
 * Steps that are somebody's turn right now: open, and either the first step
 * or directly after a completed one. These are exactly the steps that got a
 * `step_turn` notice, so a reminder only ever follows a "your turn" notice.
 */
export function activeStepPositions(steps: OnboardingStepState[]): number[] {
  const out: number[] = [];
  steps.forEach((s, i) => {
    if (!s.completed && (i === 0 || steps[i - 1].completed)) out.push(i);
  });
  return out;
}

/** When the step became its owner's turn. */
export function stepTurnStartedAt(
  steps: OnboardingStepState[],
  position: number,
  onboardingStartedAt: string,
): string {
  if (position === 0) return onboardingStartedAt;
  const prev = steps[position - 1]?.completed_at;
  if (!prev) return onboardingStartedAt;
  return new Date(prev).getTime() > new Date(onboardingStartedAt).getTime()
    ? prev
    : onboardingStartedAt;
}

export interface OnboardingThresholds {
  /** Remind a step owner after holding the step for MORE than this many working days. */
  reminderAfterWorkingDays: number;
  /** Remind every open step's owner once the joining date is this close. */
  joiningSoonDays: number;
}

export const DEFAULT_ONBOARDING_THRESHOLDS: OnboardingThresholds = {
  reminderAfterWorkingDays: 2,
  joiningSoonDays: 3,
};

export interface OnboardingCandidateState {
  id: string;
  onboardingStartedAt: string | null;
  /** expected_joining_date (YYYY-MM-DD), or null when HR has not set one. */
  joiningDate: string | null;
  steps: OnboardingStepState[];
}

export interface PlannedOnboardingNotice {
  kind: 'step_reminder' | 'joining_passed';
  /** Array position of the step, or null for the HR-head notice. */
  position: number | null;
  /** Why it is due — goes into the message and the run report. */
  reason: 'held_too_long' | 'joining_soon' | 'joining_passed';
}

/**
 * The scheduled nudges due for one candidate today. `alreadySent` holds
 * ledgerKey(candidateId, subjectKey, kind) for every notice ever recorded, so
 * each rule fires at most once per step (or once per candidate).
 */
export function planOnboardingNotices(
  c: OnboardingCandidateState,
  now: Date,
  alreadySent: ReadonlySet<string>,
  t: OnboardingThresholds = DEFAULT_ONBOARDING_THRESHOLDS,
): PlannedOnboardingNotice[] {
  if (!c.onboardingStartedAt || c.steps.length === 0) return [];
  const open = c.steps.map((s, i) => (s.completed ? -1 : i)).filter((i) => i >= 0);
  if (open.length === 0) return [];

  const out: PlannedOnboardingNotice[] = [];
  const toJoin = c.joiningDate ? daysUntil(c.joiningDate, now) : null;

  if (toJoin !== null && toJoin < 0) {
    // Past the joining date: the step owners have had their chance; this is
    // now the HR head's to sort out. One notice, per candidate, ever.
    if (!alreadySent.has(ledgerKey(c.id, '', 'joining_passed'))) {
      out.push({ kind: 'joining_passed', position: null, reason: 'joining_passed' });
    }
    return out;
  }

  const joiningSoon = toJoin !== null && toJoin <= t.joiningSoonDays;
  const active = new Set(activeStepPositions(c.steps));

  for (const pos of open) {
    if (alreadySent.has(ledgerKey(c.id, String(pos), 'step_reminder'))) continue;
    if (joiningSoon) {
      // Days from joining: every open step's owner can still prepare, and the
      // candidate page lets them tick a step out of order.
      out.push({ kind: 'step_reminder', position: pos, reason: 'joining_soon' });
      continue;
    }
    if (!active.has(pos)) continue;
    const since = stepTurnStartedAt(c.steps, pos, c.onboardingStartedAt);
    if (workingDaysElapsed(since, now) > t.reminderAfterWorkingDays) {
      out.push({ kind: 'step_reminder', position: pos, reason: 'held_too_long' });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// A3 — attendance regularisation requests
// ---------------------------------------------------------------------------

export interface RegularizationThresholds {
  /** Remind the approvers once a request has waited MORE than this many hours. */
  reminderAfterHours: number;
  /** Tell the HR head once a request has waited MORE than this many days. */
  hrHeadAfterDays: number;
  /** How far back a decision still gets its (missed) notice to the requester. */
  decidedBackstopDays: number;
}

export const DEFAULT_REGULARIZATION_THRESHOLDS: RegularizationThresholds = {
  reminderAfterHours: 48,
  hrHeadAfterDays: 4,
  decidedBackstopDays: 14,
};

export interface RegularizationRowState {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  created_at: string | null;
  approved_at: string | null;
}

export interface PlannedRegularizationNotice {
  kind: RegularizationNoticeKind;
}

/**
 * The notices due for one request today. At most ONE approver-side notice per
 * run: a request that never had its "submitted" notice (the browser closed
 * before it went out, or it predates this feature) gets that one first, and
 * its reminder no earlier than the next run.
 *
 * Decisions are only notified for requests that had a "submitted" notice. That
 * is what keeps a HR Head's direct day correction (written straight as
 * 'approved' by fn_hr_regularize_attendance_day — nobody asked for it) from
 * reading as "your request was approved".
 */
export function planRegularizationNotices(
  row: RegularizationRowState,
  now: Date,
  alreadySent: ReadonlySet<string>,
  t: RegularizationThresholds = DEFAULT_REGULARIZATION_THRESHOLDS,
): PlannedRegularizationNotice[] {
  const sent = (k: RegularizationNoticeKind) => alreadySent.has(ledgerKey(row.id, '', k));
  const out: PlannedRegularizationNotice[] = [];

  if (row.status === 'pending') {
    if (!row.created_at) return out;
    const ageHours = (now.getTime() - new Date(row.created_at).getTime()) / (60 * 60 * 1000);
    if (!sent('submitted')) out.push({ kind: 'submitted' });
    else if (ageHours > t.reminderAfterHours && !sent('reminder')) out.push({ kind: 'reminder' });
    if (ageHours > t.hrHeadAfterDays * 24 && !sent('hr_head')) out.push({ kind: 'hr_head' });
    return out;
  }

  if ((row.status === 'approved' || row.status === 'rejected') && row.approved_at) {
    const ageDays = (now.getTime() - new Date(row.approved_at).getTime()) / DAY_MS;
    if (ageDays <= t.decidedBackstopDays && sent('submitted') && !sent('decided')) {
      out.push({ kind: 'decided' });
    }
  }
  return out;
}

/** Read a numeric config value, keeping the default for anything unusable. */
export function positiveNumberOr(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
