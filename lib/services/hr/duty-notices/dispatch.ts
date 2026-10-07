/**
 * lib/services/hr/duty-notices/dispatch.ts
 *
 * SERVER-SIDE ONLY (service-role client). The sending half of the HR staff
 * harness notices for duties R9 (onboarding checklist) and A3 (attendance
 * regularisation). Which notice is due is decided in ./selection.ts; this file
 * resolves recipients, claims the ledger row, and dispatches through
 * StaffNotificationService.
 *
 * ONCE, AND RECORDED. Every notice goes through sendOnce(): it inserts the
 * hr_duty_notices row FIRST (the UNIQUE key refuses a second one), dispatches,
 * and only then writes the count. A dispatch that reached nobody releases the
 * claim so the next run can try again. So the daily run, a manual re-run and
 * the event hooks can overlap freely without double-sending.
 *
 * GUARDRAIL (harness design): no chase reaches someone on approved leave. The
 * scheduled reminders drop recipients on leave today; if that leaves nobody,
 * nothing is claimed and the reminder waits for a later run. Event notices
 * ("it is your turn", "a request arrived", "your request was decided") are
 * not chases and are not held back.
 *
 * Added: 2026-10-01 — HR staff harness, lane C.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { StaffNotificationService } from '@/lib/services/staff/notification-service';
import {
  DEFAULT_ONBOARDING_THRESHOLDS,
  DEFAULT_REGULARIZATION_THRESHOLDS,
  DUTY_ONBOARDING,
  DUTY_REGULARIZATION,
  istDate,
  ledgerKey,
  goLiveFromPolicy,
  GO_LIVE_POLICY_KEY,
  planOnboardingNotices,
  planRegularizationNotices,
  positiveNumberOr,
  readOnboardingSteps,
  stepTurnStartedAt,
  workingDaysElapsed,
  type OnboardingStepState,
  type OnboardingThresholds,
  type RegularizationThresholds,
} from './selection';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Keys the approvals screen (and hr_attendance_regs_select) admits on. */
export const REGULARIZATION_APPROVER_KEYS = [
  'hr.attendance.regularize_approve',
  'hr.attendance.approve_team',
];

/**
 * Who owns a step with no assignee. The complete-step route lets hr_officer,
 * hr_head and director_jkkn tick such a step; the Director is left off the
 * notice on purpose — a routine checklist step is HR's to do.
 */
const UNASSIGNED_STEP_ROLES = ['hr_officer', 'hr_head'];
const HR_HEAD_ROLES = ['hr_head'];

/** Candidate statuses in the pre-join onboarding stage (see onboarding-start). */
const PRE_JOIN_STATUSES = ['approved', 'package_fixed', 'offer_issued'];

const TBL_CANDIDATES = 'hr_recruitment_candidates';
const TBL_REGULARIZATIONS = 'hr_attendance_regularizations';

export type SendOutcome =
  | 'sent'
  | 'already_sent'
  | 'no_recipients'
  | 'deferred_on_leave'
  | 'failed';

interface LedgerTarget {
  duty: string;
  subjectTable: string;
  subjectId: string;
  subjectKey: string;
  kind: string;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

/** Every ledgerKey already recorded for these subjects. */
export async function loadSentKeys(
  supabase: SupabaseClient,
  duty: string,
  subjectIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < subjectIds.length; i += 200) {
    const chunk = subjectIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from('hr_duty_notices')
      .select('subject_id, subject_key, reminder_kind')
      .eq('duty_code', duty)
      .in('subject_id', chunk);
    if (error) throw new Error(`hr_duty_notices read failed: ${error.message}`);
    for (const r of (data ?? []) as Array<{ subject_id: string; subject_key: string; reminder_kind: string }>) {
      out.add(ledgerKey(r.subject_id, r.subject_key, r.reminder_kind));
    }
  }
  return out;
}

/**
 * Claim → dispatch → record. `onLeave` (chases only) removes people on
 * approved leave today before anything is claimed.
 */
async function sendOnce(
  supabase: SupabaseClient,
  target: LedgerTarget,
  recipientIds: string[],
  send: (userIds: string[]) => Promise<number>,
  onLeave?: ReadonlySet<string>,
): Promise<SendOutcome> {
  const all = Array.from(new Set(recipientIds.filter(Boolean)));
  if (all.length === 0) return 'no_recipients';
  const recipients = onLeave ? all.filter((id) => !onLeave.has(id)) : all;
  if (recipients.length === 0) return 'deferred_on_leave';

  const { data: claimed, error: claimErr } = await supabase
    .from('hr_duty_notices')
    .upsert(
      {
        duty_code: target.duty,
        subject_table: target.subjectTable,
        subject_id: target.subjectId,
        subject_key: target.subjectKey,
        reminder_kind: target.kind,
        recipient_user_ids: recipients,
      },
      { onConflict: 'duty_code,subject_id,subject_key,reminder_kind', ignoreDuplicates: true },
    )
    .select('id');
  if (claimErr) throw new Error(`hr_duty_notices claim failed: ${claimErr.message}`);
  const claimId = (claimed as Array<{ id: string }> | null)?.[0]?.id;
  if (!claimId) return 'already_sent';

  let notified = 0;
  try {
    notified = await send(recipients);
  } catch (err) {
    console.error('[hr/duty-notices] dispatch threw', target, err);
    notified = 0;
  }

  if (notified === 0) {
    // Nothing reached anyone — give the next run the chance to try again.
    await supabase.from('hr_duty_notices').delete().eq('id', claimId);
    return 'failed';
  }
  await supabase
    .from('hr_duty_notices')
    .update({ notified_count: notified, updated_at: new Date().toISOString() })
    .eq('id', claimId);
  return 'sent';
}

// ---------------------------------------------------------------------------
// Recipients
// ---------------------------------------------------------------------------

async function rpcIds(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<string[]> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  return ((data as string[] | null) ?? []).filter(Boolean);
}

/**
 * Holders of any of the roles, inside the institution when one is given. If
 * nobody in that institution holds the role (HR is often run from the group
 * office), falls back to every holder rather than telling nobody.
 */
export async function roleHolderIds(
  supabase: SupabaseClient,
  roleKeys: string[],
  institutionId: string | null,
): Promise<string[]> {
  const keys = roleKeys.map((k) => k.toLowerCase().trim()).filter(Boolean);
  if (keys.length === 0) return [];
  if (institutionId) {
    const scoped = await rpcIds(supabase, 'fn_hr_role_holder_ids', {
      p_role_keys: keys,
      p_institution_id: institutionId,
    });
    if (scoped.length > 0) return scoped;
  }
  return rpcIds(supabase, 'fn_hr_role_holder_ids', { p_role_keys: keys, p_institution_id: null });
}

export async function hrHeadIds(supabase: SupabaseClient): Promise<string[]> {
  return roleHolderIds(supabase, HR_HEAD_ROLES, null);
}

export async function regularizationApproverIds(supabase: SupabaseClient): Promise<string[]> {
  return rpcIds(supabase, 'fn_hr_permission_holder_ids', { p_keys: REGULARIZATION_APPROVER_KEYS });
}

/** Owners of one step: the pinned person, else its role's holders, else HR. */
async function stepOwnerIds(
  supabase: SupabaseClient,
  step: OnboardingStepState,
  institutionId: string | null,
): Promise<string[]> {
  if (step.assigned_user_id) return [step.assigned_user_id];
  if (step.assigned_user_email) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', step.assigned_user_email.toLowerCase().trim())
      .maybeSingle();
    const id = (data as { id?: string } | null)?.id;
    if (id) return [id];
  }
  if (step.assigned_role) return roleHolderIds(supabase, [step.assigned_role], institutionId);
  return roleHolderIds(supabase, UNASSIGNED_STEP_ROLES, institutionId);
}

/** Profile ids of everyone on approved leave on the given IST date. */
export async function profilesOnLeave(
  supabase: SupabaseClient,
  ymd: string,
): Promise<Set<string>> {
  const { data: leaves, error } = await supabase
    .from('hr_leave_applications')
    .select('employee_id')
    .eq('status', 'approved')
    .lte('start_date', ymd)
    .gte('end_date', ymd);
  if (error) throw new Error(`leave lookup failed: ${error.message}`);
  const staffIds = Array.from(
    new Set(((leaves ?? []) as Array<{ employee_id: string | null }>).map((l) => l.employee_id).filter(Boolean)),
  ) as string[];
  const out = new Set<string>();
  for (let i = 0; i < staffIds.length; i += 200) {
    const { data: staff } = await supabase
      .from('staff')
      .select('profile_id')
      .in('id', staffIds.slice(i, i + 200));
    for (const s of (staff ?? []) as Array<{ profile_id: string | null }>) {
      if (s.profile_id) out.add(s.profile_id);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Config (platform_policies rows seeded by 20270613101133)
// ---------------------------------------------------------------------------

/**
 * Master switch of the separate HR chase ladder (hr-duty-chase cron). When it
 * is on and the ladder's A3 duty is enabled, the ladder sends the A3 chases
 * itself, so this run must not send its own as well. Only a literal boolean
 * true counts as on.
 */
export const CHASE_LADDER_SWITCH_KEY = 'hr.harness.chase.enabled';

export async function loadThresholds(supabase: SupabaseClient, now: Date): Promise<{
  onboarding: OnboardingThresholds;
  regularization: RegularizationThresholds;
  /** Raw value of CHASE_LADDER_SWITCH_KEY; only `true` means on. */
  chaseLadderSwitch: unknown;
  /** Go-live cutoff: waits that started before it are never chased. `now` when the row is missing. */
  goLiveAt: Date;
}> {
  const { data } = await supabase
    .from('platform_policies')
    .select('policy_key, value')
    .eq('scope_type', 'global')
    .is('scope_id', null)
    .eq('is_active', true)
    .in('policy_key', [
      'hr.onboarding.step_reminder_after_working_days',
      'hr.onboarding.joining_soon_days',
      'hr.regularization.reminder_after_hours',
      'hr.regularization.hr_head_notice_after_days',
      CHASE_LADDER_SWITCH_KEY,
      GO_LIVE_POLICY_KEY,
    ]);
  const v = new Map(
    ((data ?? []) as Array<{ policy_key: string; value: unknown }>).map((r) => [r.policy_key, r.value]),
  );
  return {
    onboarding: {
      reminderAfterWorkingDays: positiveNumberOr(
        v.get('hr.onboarding.step_reminder_after_working_days'),
        DEFAULT_ONBOARDING_THRESHOLDS.reminderAfterWorkingDays,
      ),
      joiningSoonDays: positiveNumberOr(
        v.get('hr.onboarding.joining_soon_days'),
        DEFAULT_ONBOARDING_THRESHOLDS.joiningSoonDays,
      ),
    },
    regularization: {
      ...DEFAULT_REGULARIZATION_THRESHOLDS,
      reminderAfterHours: positiveNumberOr(
        v.get('hr.regularization.reminder_after_hours'),
        DEFAULT_REGULARIZATION_THRESHOLDS.reminderAfterHours,
      ),
      hrHeadAfterDays: positiveNumberOr(
        v.get('hr.regularization.hr_head_notice_after_days'),
        DEFAULT_REGULARIZATION_THRESHOLDS.hrHeadAfterDays,
      ),
    },
    chaseLadderSwitch: v.get(CHASE_LADDER_SWITCH_KEY),
    // A failed read leaves `data` null, so this too falls back to `now`.
    goLiveAt: goLiveFromPolicy(v.get(GO_LIVE_POLICY_KEY), now),
  };
}

/**
 * Does the chase ladder own this duty's chases right now? False unless the
 * switch is literally `true`; only then is hr_duty_definitions read (that
 * table does not exist until the ladder ships). Any read problem answers
 * false, so this run's own reminders keep going rather than nobody chasing.
 */
export async function ladderCoversDuty(
  supabase: SupabaseClient,
  switchValue: unknown,
  dutyCode: string,
): Promise<boolean> {
  if (switchValue !== true) return false;
  try {
    const { data, error } = await supabase
      .from('hr_duty_definitions')
      .select('enabled')
      .eq('config_key', dutyCode)
      .eq('is_active', true)
      .maybeSingle();
    if (error) {
      console.warn('[hr/duty-notices] chase ladder duty read failed; sending own reminders', dutyCode, error.message);
      return false;
    }
    return (data as { enabled?: unknown } | null)?.enabled === true;
  } catch (err) {
    console.warn('[hr/duty-notices] chase ladder duty read threw; sending own reminders', dutyCode, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// R9 — onboarding
// ---------------------------------------------------------------------------

interface CandidateRow {
  id: string;
  name: string | null;
  role_title: string | null;
  status: string;
  institution_id: string | null;
  expected_joining_date: string | null;
  actual_joining_date: string | null;
  role_specific_details: unknown;
}

const CANDIDATE_SELECT =
  'id, name, role_title, status, institution_id, expected_joining_date, actual_joining_date, role_specific_details';

function joiningDateOf(c: CandidateRow): string | null {
  return (c.expected_joining_date ?? c.actual_joining_date ?? null)?.slice(0, 10) ?? null;
}

/**
 * "Step N is now yours" — at onboarding start (position 0) and whenever a
 * completed step hands the baton on. Once per step, ever.
 */
export async function notifyOnboardingStepTurn(
  supabase: SupabaseClient,
  candidateId: string,
  position: number,
  previousPosition: number | null = null,
): Promise<SendOutcome> {
  const { data, error } = await supabase
    .from(TBL_CANDIDATES)
    .select(CANDIDATE_SELECT)
    .eq('id', candidateId)
    .maybeSingle();
  if (error) throw new Error(`candidate read failed: ${error.message}`);
  const c = data as CandidateRow | null;
  if (!c) return 'no_recipients';
  const steps = readOnboardingSteps(c.role_specific_details);
  const step = steps[position];
  if (!step || step.completed) return 'no_recipients';

  const owners = await stepOwnerIds(supabase, step, c.institution_id);
  return sendOnce(
    supabase,
    {
      duty: DUTY_ONBOARDING,
      subjectTable: TBL_CANDIDATES,
      subjectId: c.id,
      subjectKey: String(position),
      kind: 'step_turn',
    },
    owners,
    (ids) =>
      StaffNotificationService.notifyOnboardingStepTurn(supabase, c.id, ids, {
        candidateName: c.name ?? 'The new joiner',
        roleTitle: c.role_title ?? 'new role',
        stepName: step.step,
        stepNumber: position + 1,
        stepCount: steps.length,
        joiningDate: joiningDateOf(c),
        previousStepName: previousPosition !== null ? steps[previousPosition]?.step ?? null : null,
      }),
  );
}

export interface SweepCounts {
  examined: number;
  sent: number;
  already_sent: number;
  no_recipients: number;
  deferred_on_leave: number;
  failed: number;
  /** A3 chases left to the chase ladder because it owns them (see ladderCoversDuty). */
  handed_to_ladder: number;
  errors: string[];
}

function emptyCounts(): SweepCounts {
  return {
    examined: 0, sent: 0, already_sent: 0, no_recipients: 0, deferred_on_leave: 0, failed: 0,
    handed_to_ladder: 0, errors: [],
  };
}

function tally(counts: SweepCounts, outcome: SendOutcome) {
  counts[outcome] += 1;
}

export async function runOnboardingSweep(
  supabase: SupabaseClient,
  now: Date,
  thresholds: OnboardingThresholds,
  onLeave: ReadonlySet<string>,
  goLiveAt: Date,
): Promise<SweepCounts> {
  const counts = emptyCounts();
  const { data, error } = await supabase
    .from(TBL_CANDIDATES)
    .select(CANDIDATE_SELECT)
    .in('status', PRE_JOIN_STATUSES)
    .not('role_specific_details->onboarding_steps', 'is', null);
  if (error) throw new Error(`candidate sweep read failed: ${error.message}`);

  const candidates = ((data ?? []) as CandidateRow[]).filter(
    (c) => readOnboardingSteps(c.role_specific_details).length > 0,
  );
  counts.examined = candidates.length;
  const sent = await loadSentKeys(supabase, DUTY_ONBOARDING, candidates.map((c) => c.id));

  let hrHeads: string[] | null = null;
  for (const c of candidates) {
    try {
      const details = (c.role_specific_details ?? {}) as { onboarding_started_at?: string | null };
      const steps = readOnboardingSteps(c.role_specific_details);
      const joiningDate = joiningDateOf(c);
      const plan = planOnboardingNotices(
        { id: c.id, onboardingStartedAt: details.onboarding_started_at ?? null, joiningDate, steps },
        now,
        sent,
        goLiveAt,
        thresholds,
      );
      const candidateName = c.name ?? 'The new joiner';
      const roleTitle = c.role_title ?? 'new role';

      for (const p of plan) {
        if (p.kind === 'joining_passed') {
          hrHeads ??= await hrHeadIds(supabase);
          const openSteps = steps.filter((s) => !s.completed).map((s) => s.step);
          const outcome = await sendOnce(
            supabase,
            { duty: DUTY_ONBOARDING, subjectTable: TBL_CANDIDATES, subjectId: c.id, subjectKey: '', kind: 'joining_passed' },
            hrHeads,
            (ids) =>
              StaffNotificationService.notifyOnboardingJoiningPassed(supabase, c.id, ids, {
                candidateName,
                roleTitle,
                joiningDate: joiningDate ?? '',
                openSteps,
              }),
            onLeave,
          );
          tally(counts, outcome);
          continue;
        }

        const pos = p.position as number;
        const step = steps[pos];
        const owners = await stepOwnerIds(supabase, step, c.institution_id);
        const held = workingDaysElapsed(
          stepTurnStartedAt(steps, pos, details.onboarding_started_at ?? now.toISOString()),
          now,
        );
        const outcome = await sendOnce(
          supabase,
          { duty: DUTY_ONBOARDING, subjectTable: TBL_CANDIDATES, subjectId: c.id, subjectKey: String(pos), kind: 'step_reminder' },
          owners,
          (ids) =>
            StaffNotificationService.notifyOnboardingStepReminder(supabase, c.id, ids, {
              candidateName,
              roleTitle,
              stepName: step.step,
              stepNumber: pos + 1,
              stepCount: steps.length,
              joiningDate,
              reason: p.reason === 'joining_soon' ? 'joining_soon' : 'held_too_long',
              workingDaysHeld: held,
            }),
          onLeave,
        );
        tally(counts, outcome);
      }
    } catch (err) {
      counts.errors.push(`candidate ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// A3 — regularisation
// ---------------------------------------------------------------------------

interface RegularizationRow {
  id: string;
  status: string | null;
  for_date: string;
  created_at: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  reason_text: string | null;
  reason: { label: string | null } | null;
  employee: {
    first_name: string | null;
    last_name: string | null;
    profile_id: string | null;
    institution_id: string | null;
  } | null;
}

const REG_SELECT = `
  id, status, for_date, created_at, approved_at, rejection_reason, reason_text,
  reason:hr_regularization_reasons(label),
  employee:staff!hr_attendance_regularizations_employee_id_fkey(first_name, last_name, profile_id, institution_id)
`;

function staffNameOf(r: RegularizationRow): string {
  const n = [r.employee?.first_name, r.employee?.last_name].filter(Boolean).join(' ').trim();
  return n || 'A team member';
}

function reasonOf(r: RegularizationRow): string {
  return r.reason?.label ?? r.reason_text ?? 'not given';
}

function waitingDays(r: RegularizationRow, now: Date): number {
  if (!r.created_at) return 0;
  return Math.floor((now.getTime() - new Date(r.created_at).getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * A HR Head's direct day correction (fn_hr_regularize_attendance_day) inserts
 * the row already 'approved' in one statement, so created_at = approved_at.
 * Nobody asked for it; it must never read as "your request was approved".
 */
function wasEverPending(r: RegularizationRow): boolean {
  if (!r.created_at || !r.approved_at) return false;
  return Math.abs(new Date(r.approved_at).getTime() - new Date(r.created_at).getTime()) > 1000;
}

async function sendRegularizationNotice(
  supabase: SupabaseClient,
  r: RegularizationRow,
  kind: 'submitted' | 'reminder' | 'hr_head' | 'decided',
  now: Date,
  ctx: {
    approvers: () => Promise<string[]>;
    hrHeads: () => Promise<string[]>;
    onLeave?: ReadonlySet<string>;
    monthClosed?: boolean;
  },
): Promise<SendOutcome> {
  const target: LedgerTarget = {
    duty: DUTY_REGULARIZATION,
    subjectTable: TBL_REGULARIZATIONS,
    subjectId: r.id,
    subjectKey: '',
    kind,
  };
  const requester = r.employee?.profile_id ?? null;
  const base = {
    staffName: staffNameOf(r),
    forDate: r.for_date,
    reason: reasonOf(r),
    waitingDays: waitingDays(r, now),
  };

  if (kind === 'decided') {
    if (!requester) return 'no_recipients';
    return sendOnce(supabase, target, [requester], () =>
      StaffNotificationService.notifyRegularizationDecided(supabase, r.id, requester, {
        forDate: r.for_date,
        approved: r.status === 'approved',
        rejectionReason: r.rejection_reason,
      }),
    );
  }

  if (kind === 'hr_head') {
    const heads = await ctx.hrHeads();
    return sendOnce(
      supabase,
      target,
      heads,
      (ids) =>
        StaffNotificationService.notifyRegularizationHrHead(supabase, r.id, ids, {
          staffName: base.staffName,
          forDate: base.forDate,
          waitingDays: base.waitingDays,
          monthClosed: ctx.monthClosed ?? false,
        }),
      ctx.onLeave,
    );
  }

  // The requester is never asked to approve their own request.
  const approvers = (await ctx.approvers()).filter((id) => id !== requester);
  if (kind === 'submitted') {
    return sendOnce(supabase, target, approvers, (ids) =>
      StaffNotificationService.notifyRegularizationSubmitted(supabase, r.id, ids, base),
    );
  }
  return sendOnce(
    supabase,
    target,
    approvers,
    (ids) => StaffNotificationService.notifyRegularizationReminder(supabase, r.id, ids, base),
    ctx.onLeave,
  );
}

/**
 * Event path — called right after a request is submitted, approved or
 * rejected. The request's CURRENT state decides the notice, never the caller.
 */
export async function notifyRegularizationEvent(
  supabase: SupabaseClient,
  regularizationId: string,
  now: Date = new Date(),
): Promise<{ kind: 'submitted' | 'decided' | null; outcome: SendOutcome | 'nothing_due' }> {
  const { data, error } = await supabase
    .from(TBL_REGULARIZATIONS)
    .select(REG_SELECT)
    .eq('id', regularizationId)
    .maybeSingle();
  if (error) throw new Error(`regularization read failed: ${error.message}`);
  const r = data as unknown as RegularizationRow | null;
  if (!r) return { kind: null, outcome: 'nothing_due' };

  let approversCache: string[] | null = null;
  const ctx = {
    approvers: async () => (approversCache ??= await regularizationApproverIds(supabase)),
    hrHeads: () => hrHeadIds(supabase),
  };

  if (r.status === 'pending') {
    return { kind: 'submitted', outcome: await sendRegularizationNotice(supabase, r, 'submitted', now, ctx) };
  }
  if ((r.status === 'approved' || r.status === 'rejected') && wasEverPending(r)) {
    return { kind: 'decided', outcome: await sendRegularizationNotice(supabase, r, 'decided', now, ctx) };
  }
  return { kind: null, outcome: 'nothing_due' };
}

export async function runRegularizationSweep(
  supabase: SupabaseClient,
  now: Date,
  thresholds: RegularizationThresholds,
  onLeave: ReadonlySet<string>,
  goLiveAt: Date,
  /** True when the chase ladder owns A3: skip the reminder and hr_head chases. */
  ladderOwnsChases = false,
): Promise<SweepCounts> {
  const counts = emptyCounts();
  const since = new Date(now.getTime() - thresholds.decidedBackstopDays * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: pending, error: pErr }, { data: decided, error: dErr }] = await Promise.all([
    supabase.from(TBL_REGULARIZATIONS).select(REG_SELECT).eq('status', 'pending').limit(1000),
    supabase
      .from(TBL_REGULARIZATIONS)
      .select(REG_SELECT)
      .in('status', ['approved', 'rejected'])
      .gte('approved_at', since)
      .limit(1000),
  ]);
  if (pErr) throw new Error(`pending regularization read failed: ${pErr.message}`);
  if (dErr) throw new Error(`decided regularization read failed: ${dErr.message}`);

  const rows = [
    ...((pending ?? []) as unknown as RegularizationRow[]),
    ...((decided ?? []) as unknown as RegularizationRow[]).filter(wasEverPending),
  ];
  counts.examined = rows.length;
  if (rows.length === 0) return counts;

  const sent = await loadSentKeys(supabase, DUTY_REGULARIZATION, rows.map((r) => r.id));

  // Closed months, for the HR-head wording.
  const institutions = Array.from(
    new Set(rows.map((r) => r.employee?.institution_id).filter(Boolean)),
  ) as string[];
  const closed = new Set<string>();
  if (institutions.length > 0) {
    const { data: periods } = await supabase
      .from('hr_attendance_periods')
      .select('institution_id, period_year, period_month')
      .eq('status', 'locked')
      .in('institution_id', institutions);
    for (const p of (periods ?? []) as Array<{ institution_id: string; period_year: number; period_month: number }>) {
      closed.add(`${p.institution_id}|${p.period_year}|${p.period_month}`);
    }
  }

  let approversCache: string[] | null = null;
  let headsCache: string[] | null = null;
  const baseCtx = {
    approvers: async () => (approversCache ??= await regularizationApproverIds(supabase)),
    hrHeads: async () => (headsCache ??= await hrHeadIds(supabase)),
  };

  for (const r of rows) {
    try {
      const plan = planRegularizationNotices(
        { id: r.id, status: r.status ?? '', created_at: r.created_at, approved_at: r.approved_at },
        now,
        sent,
        goLiveAt,
        thresholds,
      );
      const monthClosed = closed.has(
        `${r.employee?.institution_id}|${Number(r.for_date.slice(0, 4))}|${Number(r.for_date.slice(5, 7))}`,
      );
      for (const p of plan) {
        const isChase = p.kind === 'reminder' || p.kind === 'hr_head';
        if (isChase && ladderOwnsChases) {
          counts.handed_to_ladder += 1;
          continue;
        }
        const outcome = await sendRegularizationNotice(supabase, r, p.kind, now, {
          ...baseCtx,
          onLeave: isChase ? onLeave : undefined,
          monthClosed,
        });
        tally(counts, outcome);
      }
    } catch (err) {
      counts.errors.push(`regularization ${r.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return counts;
}

/** Today's IST date — exported so the route and tests share one definition. */
export function todayIst(now: Date): string {
  return istDate(now);
}
