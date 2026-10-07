/**
 * HR staff harness, lane A — the leave deadline decisions, with no database.
 * Created 2026-10-01.
 *
 * Pure on purpose, like approval-chain.ts: the cron routes do the reading and
 * writing (lib/hr/leave/deadline-runner.ts), and every rule that decides WHO
 * is chased and WHEN lives here, where a test can reach every branch.
 *
 * WHAT "ESCALATED" MEANS (the database half is
 * supabase/migrations/20270613101117_hr_leave_deadline_enforcement.sql):
 * status 'escalated' = the request is still open and at least one of its steps
 * has overrun that step's own `escalate_after_hours`. It is not a new owner and
 * not a decision; current_step does not move. Every screen that already reads
 * ('pending', 'escalated') as open keeps working. Each STEP is escalated at
 * most once — the ledger row hr_leave_deadline_nudges(application, step) is
 * the key — so a two-step request can be escalated twice, once per step.
 */

import type { LeaveApprovalStep } from '@/types/hr';
import { finalStepIndex } from '@/lib/hr/leave/approval-chain';

/** What the flow editor defaults a step to, and what a step with no usable value means. */
export const DEFAULT_ESCALATE_AFTER_HOURS = 48;

/**
 * At most this many per-request notices reach one person in one run; the rest
 * are folded into a single "and N more" notice. The first run after this ships
 * meets the whole backlog at once, and 200 bell entries for the HR head would
 * bury the requests they are meant to surface.
 */
export const MAX_ITEM_NOTICES_PER_RECIPIENT = 10;

/** Upper bound of escalations recorded in one hourly run; the rest wait for the next. */
export const MAX_ESCALATIONS_PER_RUN = 200;

// ---------------------------------------------------------------------------
// Go-live cutoff (Director, 7 Oct 2026: reminders stay on, no backlog flood)
// ---------------------------------------------------------------------------
// Nothing whose wait began before the moment migration 20270613101117 applied
// is ever escalated or nudged: a leave step that started waiting before it,
// or a comp-off claim filed before it. The moment is the global
// platform_policies row GO_LIVE_POLICY_KEY. A missing or unreadable row
// answers the run's own `now`, so the cutoff fails toward silence, never
// toward a flood of old items.

/** Global platform_policies row the migration seeds with now(). */
export const GO_LIVE_POLICY_KEY = 'hr.leave_deadlines.go_live_at';

/** The go-live moment from the stored policy value, else `now` (fail closed). */
export function goLiveFromPolicy(value: unknown, now: Date): Date {
  if (typeof value === 'string') {
    const t = Date.parse(value);
    if (!Number.isNaN(t)) return new Date(t);
  }
  return now;
}

/** True when the wait began before go-live, or its start cannot be read. */
export function startedBeforeGoLive(startIso: string | null | undefined, goLiveAt: Date): boolean {
  const t = Date.parse(startIso ?? '');
  return Number.isNaN(t) || t < goLiveAt.getTime();
}

const HOUR_MS = 60 * 60 * 1000;

/** The columns of hr_leave_applications the escalation decision reads. */
export interface EscalationCandidate {
  id: string;
  status: string;
  current_step: number | null;
  approval_chain: unknown;
  created_at: string;
  superseded_by: string | null;
  final_decided_at: string | null;
}

export interface OverdueStep {
  applicationId: string;
  /** 0-based, the same number as current_step. */
  stepIndex: number;
  /** When the step started waiting — see stepWaitingSince. */
  waitingSince: string;
  dueAt: string;
  escalateAfterHours: number;
  /** Whole hours waited so far, for the notice text. */
  hoursWaited: number;
  /** The step is the one that grants the approval; there is no final step above it. */
  isFinalStep: boolean;
  chainLength: number;
}

/** A step's own limit, or the default when it is missing, zero, negative or not a number. */
export function stepEscalateAfterHours(step: Partial<LeaveApprovalStep> | null | undefined): number {
  const raw = Number(step?.escalate_after_hours);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ESCALATE_AFTER_HOURS;
}

function asChain(value: unknown): LeaveApprovalStep[] | null {
  return Array.isArray(value) ? (value as LeaveApprovalStep[]) : null;
}

function latest(a: number, iso: string | null | undefined): number {
  if (!iso) return a;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t > a ? t : a;
}

/**
 * When the current step began waiting: the latest moment anything happened on
 * an EARLIER step (an approval, a skip, any decision), else when the request
 * was filed. A step that starts only when the one below it finishes must not be
 * judged late for time the step below spent — that would escalate step 2 the
 * moment step 1 approved on hour 47.
 *
 * Decisions recorded on the current step itself (1 of 2 on an 'all' quorum)
 * do NOT restart the clock: the step is still waiting on somebody.
 */
export function stepWaitingSince(
  chain: LeaveApprovalStep[],
  currentStep: number,
  createdAt: string
): string {
  let t = Date.parse(createdAt);
  if (!Number.isFinite(t)) t = 0;
  for (let i = 0; i < currentStep && i < chain.length; i++) {
    const s = chain[i];
    if (!s) continue;
    t = latest(t, s.decided_at);
    t = latest(t, s.skipped_at);
    for (const d of s.decisions ?? []) t = latest(t, d.at);
  }
  return new Date(t).toISOString();
}

/**
 * Is this request's current step overdue, and not yet escalated?
 *
 * Returns null — never escalate — when the request is decided in any way
 * (status other than pending/escalated, superseded, a final decision stamped),
 * has no usable chain, points past its chain, or is waiting on a step that is
 * itself no longer pending. `alreadyEscalated` holds `${applicationId}:${step}`
 * keys from the ledger; the database enforces the same key, so this is an
 * optimisation and a test surface, not the only guard.
 */
export function findOverdueStep(
  app: EscalationCandidate,
  now: Date,
  alreadyEscalated: ReadonlySet<string> = new Set()
): OverdueStep | null {
  if (app.status !== 'pending' && app.status !== 'escalated') return null;
  if (app.superseded_by) return null;
  if (app.final_decided_at) return null;

  const chain = asChain(app.approval_chain);
  if (!chain || chain.length === 0) return null;

  const idx = app.current_step ?? 0;
  if (!Number.isInteger(idx) || idx < 0 || idx >= chain.length) return null;

  const step = chain[idx];
  if (!step || typeof step !== 'object') return null;
  if ((step.status ?? 'pending') !== 'pending') return null;

  if (alreadyEscalated.has(escalationKey(app.id, idx))) return null;

  const hours = stepEscalateAfterHours(step);
  const waitingSince = stepWaitingSince(chain, idx, app.created_at);
  const dueMs = Date.parse(waitingSince) + hours * HOUR_MS;
  if (now.getTime() < dueMs) return null;

  return {
    applicationId: app.id,
    stepIndex: idx,
    waitingSince,
    dueAt: new Date(dueMs).toISOString(),
    escalateAfterHours: hours,
    hoursWaited: Math.floor((now.getTime() - Date.parse(waitingSince)) / HOUR_MS),
    isFinalStep: idx >= finalStepIndex(chain),
    chainLength: chain.length,
  };
}

export function escalationKey(applicationId: string, stepIndex: number): string {
  return `${applicationId}:${stepIndex}`;
}

/**
 * Oldest due first, capped — the order a backlog is worked through across runs.
 * A step that began waiting before `goLiveAt` is left out: it is never escalated.
 */
export function selectOverdue(
  apps: readonly EscalationCandidate[],
  now: Date,
  alreadyEscalated: ReadonlySet<string>,
  goLiveAt: Date,
  limit: number = MAX_ESCALATIONS_PER_RUN
): OverdueStep[] {
  return apps
    .map((a) => findOverdueStep(a, now, alreadyEscalated))
    .filter((o): o is OverdueStep => o !== null)
    .filter((o) => !startedBeforeGoLive(o.waitingSince, goLiveAt))
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
    .slice(0, Math.max(0, limit));
}

// ---------------------------------------------------------------------------
// Who is told
// ---------------------------------------------------------------------------

/** One row of fn_hr_leave_escalation_recipients. */
export interface EscalationRecipientRow {
  tier: 'current' | 'final' | 'hr' | string;
  user_id: string;
  on_leave_today: boolean;
}

export type NextLevelTier = 'final' | 'hr';

export interface EscalationRecipients {
  /** Current approvers who are at work today. */
  approvers: string[];
  /** The next level that is told, never overlapping `approvers`. */
  nextLevel: string[];
  nextLevelTier: NextLevelTier | null;
  /** Current approvers passed over because they are on approved leave today. */
  currentOnLeave: string[];
  /** Everyone passed over for being on leave, any tier. */
  skippedOnLeave: string[];
}

function uniq(ids: Iterable<string>): string[] {
  return [...new Set(ids)];
}

/**
 * Pick who hears about one overdue step.
 *
 *   approvers  = the current step's holders, minus anyone on leave today.
 *   next level = the FINAL step's holders when the request is still below the
 *                final step (the final approver may approve at any point, so
 *                they are the level above that can actually act); otherwise,
 *                or when nobody on the final step is reachable, the HR tier
 *                (holders of hr.leave.approve for that organisation — the HR
 *                head). Anyone on leave today is passed over at every tier.
 *
 * A current approver on leave is never chased; the request goes to the next
 * level instead, which is told either way. When nobody at all is reachable
 * both lists are empty and the caller records the escalation with no notice
 * (the status still changes, so every screen shows it as late).
 */
export function pickEscalationRecipients(
  rows: readonly EscalationRecipientRow[],
  opts: { currentIsFinal: boolean }
): EscalationRecipients {
  const atWork = (tier: string) =>
    uniq(rows.filter((r) => r.tier === tier && !r.on_leave_today).map((r) => r.user_id));
  const away = (tier: string) =>
    uniq(rows.filter((r) => r.tier === tier && r.on_leave_today).map((r) => r.user_id));

  const approvers = atWork('current');
  const currentOnLeave = away('current').filter((id) => !approvers.includes(id));
  const taken = new Set(approvers);

  let nextLevel: string[] = [];
  let nextLevelTier: NextLevelTier | null = null;

  if (!opts.currentIsFinal) {
    nextLevel = atWork('final').filter((id) => !taken.has(id));
    if (nextLevel.length > 0) nextLevelTier = 'final';
  }
  if (nextLevel.length === 0) {
    nextLevel = atWork('hr').filter((id) => !taken.has(id));
    nextLevelTier = nextLevel.length > 0 ? 'hr' : null;
  }

  const skippedOnLeave = uniq(
    rows.filter((r) => r.on_leave_today).map((r) => r.user_id)
  ).filter((id) => !taken.has(id) && !nextLevel.includes(id));

  return { approvers, nextLevel, nextLevelTier, currentOnLeave, skippedOnLeave };
}

// ---------------------------------------------------------------------------
// The notice text — the item opened, never just a count
// ---------------------------------------------------------------------------

export interface EscalationContext {
  applicantName: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
}

export interface EscalationNotice {
  userId: string;
  applicationId: string;
  audience: 'approver' | 'next_level';
  title: string;
  message: string;
}

function dateRange(start: string, end: string): string {
  return start === end ? start : `${start} to ${end}`;
}

export function buildEscalationNotices(
  overdue: OverdueStep,
  recipients: EscalationRecipients,
  ctx: EscalationContext
): EscalationNotice[] {
  const what = `${ctx.applicantName}'s ${ctx.leaveTypeName} request (${dateRange(ctx.startDate, ctx.endDate)})`;
  const stepLabel =
    overdue.chainLength > 1 ? ` at step ${overdue.stepIndex + 1} of ${overdue.chainLength}` : '';
  const toldLabel =
    recipients.nextLevelTier === 'final'
      ? ' The final approver has also been told.'
      : recipients.nextLevelTier === 'hr'
        ? ' HR has also been told.'
        : '';

  const notices: EscalationNotice[] = recipients.approvers.map((userId) => ({
    userId,
    applicationId: overdue.applicationId,
    audience: 'approver',
    title: 'Leave request overdue for your decision',
    message:
      `${what} has waited ${overdue.hoursWaited} hours for your decision; ` +
      `the limit for this step is ${overdue.escalateAfterHours} hours.${toldLabel}`,
  }));

  const awayNote =
    recipients.approvers.length === 0 && recipients.currentOnLeave.length > 0
      ? ' The approver on that step is on leave today.'
      : recipients.approvers.length === 0
        ? ' Nobody can be reached on that step.'
        : '';
  const ask =
    recipients.nextLevelTier === 'final'
      ? ' You can approve or reject it directly.'
      : ' Please decide it or follow up with the approver.';

  for (const userId of recipients.nextLevel) {
    notices.push({
      userId,
      applicationId: overdue.applicationId,
      audience: 'next_level',
      title: 'Leave request escalated to you',
      message:
        `${what} has waited ${overdue.hoursWaited} hours${stepLabel} without a decision ` +
        `(limit ${overdue.escalateAfterHours} hours).${awayNote}${ask}`,
    });
  }

  return notices;
}

/**
 * Keep at most `max` per-request notices per person, in the order given; count
 * the rest so one "and N more" notice can stand in for them.
 */
export function capNoticesPerRecipient<T extends { userId: string }>(
  notices: readonly T[],
  max: number = MAX_ITEM_NOTICES_PER_RECIPIENT
): { items: T[]; overflow: Map<string, number> } {
  const seen = new Map<string, number>();
  const items: T[] = [];
  const overflow = new Map<string, number>();
  for (const n of notices) {
    const count = seen.get(n.userId) ?? 0;
    seen.set(n.userId, count + 1);
    if (count < max) items.push(n);
    else overflow.set(n.userId, (overflow.get(n.userId) ?? 0) + 1);
  }
  return { items, overflow };
}

// ---------------------------------------------------------------------------
// Comp-off expiry nudges
// ---------------------------------------------------------------------------

export type CompOffExpiryKind = 'comp_off_expiry_7d' | 'comp_off_expiry_2d';

/** The prefix fn_hr_comp_off_reject_expired_claims writes. Kept in step with the SQL. */
export const COMP_OFF_AUTO_REJECT_PREFIX = 'Automatically rejected: not approved before';

/** Whole days from one yyyy-MM-dd to another (negative when `to` is earlier). */
export function daysBetweenISO(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / (24 * HOUR_MS));
}

/**
 * Which nudge, if any, a pending claim is due today (dates in India time).
 *
 * A credit is good THROUGH its expiry day and is rejected just after that IST
 * midnight (fn_hr_comp_off_reject_expired_claims). Windows, not single days,
 * so a missed run catches up instead of skipping the nudge:
 *   7 to 3 days left  → the 7-day nudge;
 *   2 to 0 days left  → the 2-day nudge (the last call, on the expiry day too);
 *   more than 7, or already past expiry → nothing.
 * Each is sent once per claim (ledger key), so the 7-day nudge is not repeated
 * daily through its window.
 */
export function compOffNudgeKind(expiresOn: string, todayIST: string): CompOffExpiryKind | null {
  const left = daysBetweenISO(todayIST, expiresOn);
  if (!Number.isFinite(left) || left < 0) return null;
  if (left <= 2) return 'comp_off_expiry_2d';
  if (left <= 7) return 'comp_off_expiry_7d';
  return null;
}

export interface CompOffClaimRow {
  id: string;
  status: string;
  source: string;
  expires_on: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
}

/** Closed by the nightly auto-reject, not by a person. */
export function isAutoLapsed(c: Pick<CompOffClaimRow, 'status' | 'approved_by' | 'rejection_reason'>): boolean {
  return (
    c.status === 'rejected' &&
    !c.approved_by &&
    (c.rejection_reason ?? '').startsWith(COMP_OFF_AUTO_REJECT_PREFIX)
  );
}

/** One row of fn_hr_comp_off_nudge_recipients. */
export interface CompOffRecipientRow {
  tier: 'approver' | 'claimant' | string;
  user_id: string;
  on_leave_today: boolean;
}

/** Approvers at work today. An approver on leave is never chased. */
export function pickCompOffApprovers(rows: readonly CompOffRecipientRow[]): string[] {
  return uniq(rows.filter((r) => r.tier === 'approver' && !r.on_leave_today).map((r) => r.user_id));
}

/** The claimant, told of a lapse whether or not they are on leave (it is news, not a chase). */
export function pickCompOffClaimant(rows: readonly CompOffRecipientRow[]): string | null {
  return rows.find((r) => r.tier === 'claimant')?.user_id ?? null;
}
