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
 * and only then writes the count. Only a row with notified_count > 0 counts as
 * sent. A dispatch that reached nobody releases the claim so the next run can
 * try again; a claim left at 0 by a run that died between claiming and
 * recording (a killed after(), the cron's time limit) is re-taken by a
 * conditional update once it is STALE_CLAIM_MINUTES old. So the daily run, a
 * manual re-run and the event hooks can overlap without double-sending.
 *
 * GUARDRAIL (harness design): no chase reaches someone on approved leave. A
 * scheduled reminder goes to the recipients who are in today; the ones on
 * leave are kept on the row (pending_user_ids) and get the same notice on the
 * first later run when they are back. If everyone is on leave, nothing is
 * claimed and the whole reminder waits. Event notices ("it is your turn", "a
 * request arrived", "your request was decided") are not chases and are not
 * held back.
 *
 * RECIPIENTS STAY IN THE SUBJECT'S COLLEGE. Step owners, the HR head and the
 * regularisation approvers are looked up inside the candidate's or the team
 * member's institution; the only people from outside it are holders of a role
 * whose institution_scope is 'all' (group-wide by design). Nobody falls back
 * to "every holder in every college".
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
  decidedSubjectKey,
  istDate,
  ledgerKey,
  goLiveFromPolicy,
  GO_LIVE_POLICY_KEY,
  planOnboardingNotices,
  planRegularizationNotices,
  positiveNumberOr,
  readOnboardingSteps,
  stepSubjectKey,
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

/**
 * A claim still at notified_count = 0 after this long belongs to a run that
 * died between claiming and recording; the next run may re-take it. Well past
 * the cron's 120 s limit and any after() callback.
 */
export const STALE_CLAIM_MINUTES = 15;

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

interface LedgerRow {
  subject_id: string;
  subject_key: string;
  reminder_kind: string;
  notified_count: number | null;
  pending_user_ids: string[] | null;
}

/**
 * Every ledgerKey already delivered IN FULL for these subjects: reached
 * somebody (notified_count > 0) and owes nobody a later copy (no one left in
 * pending_user_ids). A claim still at 0 is a send in flight or one that died;
 * sendOnce decides which. A row with people still pending is planned again so
 * they can be reached.
 */
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
      .select('subject_id, subject_key, reminder_kind, notified_count, pending_user_ids')
      .eq('duty_code', duty)
      .in('subject_id', chunk);
    if (error) throw new Error(`hr_duty_notices read failed: ${error.message}`);
    for (const r of (data ?? []) as LedgerRow[]) {
      if ((r.notified_count ?? 0) > 0 && (r.pending_user_ids ?? []).length === 0) {
        out.add(ledgerKey(r.subject_id, r.subject_key, r.reminder_kind));
      }
    }
  }
  return out;
}

interface ExistingClaim {
  id: string;
  notified_count: number;
  recipient_user_ids: string[];
  pending_user_ids: string[];
  updated_at: string;
}

function ledgerLabel(t: LedgerTarget): string {
  return `${t.duty}/${t.kind} ${t.subjectId}${t.subjectKey ? ` [${t.subjectKey}]` : ''}`;
}

/**
 * Claim → dispatch → record. `onLeave` is given for chases only: people on
 * approved leave today are not sent to now, they are kept on the row as
 * pending and reached by a later run (see topUpPending). `errors`, when
 * given, collects ledger write problems so the run report shows them.
 */
async function sendOnce(
  supabase: SupabaseClient,
  target: LedgerTarget,
  recipientIds: string[],
  send: (userIds: string[]) => Promise<number>,
  onLeave?: ReadonlySet<string>,
  errors?: string[],
): Promise<SendOutcome> {
  const report = (msg: string) => {
    const line = `${ledgerLabel(target)}: ${msg}`;
    errors?.push(line);
    console.warn('[hr/duty-notices]', line);
  };
  const all = Array.from(new Set(recipientIds.filter(Boolean)));
  if (all.length === 0) return 'no_recipients';
  const away = onLeave ? all.filter((id) => onLeave.has(id)) : [];
  const recipients = onLeave ? all.filter((id) => !onLeave.has(id)) : all;

  const ledger = () => supabase.from('hr_duty_notices');
  const nowIso = new Date().toISOString();

  let claimId: string | null = null;
  if (recipients.length > 0) {
    const { data: claimed, error: claimErr } = await ledger()
      .upsert(
        {
          duty_code: target.duty,
          subject_table: target.subjectTable,
          subject_id: target.subjectId,
          subject_key: target.subjectKey,
          reminder_kind: target.kind,
          recipient_user_ids: recipients,
          pending_user_ids: away,
        },
        { onConflict: 'duty_code,subject_id,subject_key,reminder_kind', ignoreDuplicates: true },
      )
      .select('id');
    if (claimErr) throw new Error(`hr_duty_notices claim failed: ${claimErr.message}`);
    claimId = (claimed as Array<{ id: string }> | null)?.[0]?.id ?? null;
  }

  if (!claimId) {
    // The row exists already (or everyone is on leave). Read it to tell a
    // finished notice from an orphaned claim or one that still owes people.
    const { data: row, error: readErr } = await ledger()
      .select('id, notified_count, recipient_user_ids, pending_user_ids, updated_at')
      .eq('duty_code', target.duty)
      .eq('subject_id', target.subjectId)
      .eq('subject_key', target.subjectKey)
      .eq('reminder_kind', target.kind)
      .maybeSingle();
    if (readErr) throw new Error(`hr_duty_notices read failed: ${readErr.message}`);
    const existing = row as ExistingClaim | null;
    if (!existing) return recipients.length === 0 ? 'deferred_on_leave' : 'already_sent';

    if ((existing.notified_count ?? 0) === 0) {
      if (recipients.length === 0) return 'deferred_on_leave';
      // Nothing was recorded as sent. Re-take it only once it is stale — a
      // younger claim is another run's send still in flight. The WHERE is
      // re-checked under the row lock, so two runs cannot both re-take it.
      const staleBefore = new Date(Date.now() - STALE_CLAIM_MINUTES * 60 * 1000).toISOString();
      const { data: retaken, error: retakeErr } = await ledger()
        .update({ recipient_user_ids: recipients, pending_user_ids: away, updated_at: nowIso })
        .eq('id', existing.id)
        .eq('notified_count', 0)
        .lt('updated_at', staleBefore)
        .select('id');
      if (retakeErr) throw new Error(`hr_duty_notices re-take failed: ${retakeErr.message}`);
      claimId = (retaken as Array<{ id: string }> | null)?.[0]?.id ?? null;
      if (!claimId) return 'already_sent';
    } else if (onLeave && (existing.pending_user_ids ?? []).length > 0) {
      return topUpPending(supabase, existing, all, onLeave, send, report);
    } else {
      return 'already_sent';
    }
  }

  let notified = 0;
  try {
    notified = await send(recipients);
  } catch (err) {
    console.error('[hr/duty-notices] dispatch threw', target, err);
    notified = 0;
  }

  if (notified <= 0) {
    // Nothing reached anyone — release the claim so the next run can try
    // again. If the release itself fails, the claim is re-taken once stale.
    const { error: relErr } = await ledger().delete().eq('id', claimId).eq('notified_count', 0);
    if (relErr) report(`release after a failed send did not go through (${relErr.message}); it is re-taken after ${STALE_CLAIM_MINUTES} minutes`);
    return 'failed';
  }
  if (notified < recipients.length) {
    // Some were reached: keep the claim, so nobody gets it twice.
    report(`reached ${notified} of ${recipients.length} recipients; kept as sent`);
  }
  const record = () =>
    ledger().update({ notified_count: notified, updated_at: new Date().toISOString() }).eq('id', claimId);
  let { error: recErr } = await record();
  if (recErr) ({ error: recErr } = await record());
  if (recErr) {
    report(`sent to ${notified} but recording failed (${recErr.message}); it may be sent again after ${STALE_CLAIM_MINUTES} minutes`);
  }
  return 'sent';
}

/**
 * A chase that went out while some recipients were on leave: send the same
 * notice to the ones who are back and still recipients today. They are taken
 * off the row first, with an optimistic check on updated_at so two runs never
 * both send; a failed send puts them back.
 */
async function topUpPending(
  supabase: SupabaseClient,
  existing: ExistingClaim,
  currentRecipients: string[],
  onLeave: ReadonlySet<string>,
  send: (userIds: string[]) => Promise<number>,
  report: (msg: string) => void,
): Promise<SendOutcome> {
  const current = new Set(currentRecipients);
  const pending = existing.pending_user_ids ?? [];
  // People no longer among the recipients (role or college changed) are dropped.
  const due = pending.filter((id) => current.has(id) && !onLeave.has(id));
  const stillAway = pending.filter((id) => current.has(id) && onLeave.has(id));
  if (due.length === 0 && stillAway.length === pending.length) return 'deferred_on_leave';

  const ledger = () => supabase.from('hr_duty_notices');
  const { data: took, error: takeErr } = await ledger()
    .update({ pending_user_ids: stillAway, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
    .eq('updated_at', existing.updated_at)
    .select('id');
  if (takeErr) throw new Error(`hr_duty_notices pending update failed: ${takeErr.message}`);
  if (!((took as Array<{ id: string }> | null)?.length)) return 'already_sent';
  if (due.length === 0) return stillAway.length > 0 ? 'deferred_on_leave' : 'already_sent';

  let notified = 0;
  try {
    notified = await send(due);
  } catch (err) {
    console.error('[hr/duty-notices] dispatch threw (pending recipients)', existing.id, err);
    notified = 0;
  }
  if (notified <= 0) {
    const { error: backErr } = await ledger()
      .update({ pending_user_ids: [...stillAway, ...due] })
      .eq('id', existing.id);
    if (backErr) report(`could not put ${due.length} pending recipient(s) back after a failed send (${backErr.message})`);
    return 'failed';
  }
  const { error: recErr } = await ledger()
    .update({
      recipient_user_ids: Array.from(new Set([...(existing.recipient_user_ids ?? []), ...due])),
      notified_count: (existing.notified_count ?? 0) + notified,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);
  if (recErr) report(`sent to ${notified} pending recipient(s) but recording failed (${recErr.message})`);
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
 * Holders of any of the roles who belong to the institution: their profile or
 * staff row is there, they have a user_institution_access grant to it, or
 * their role is group-wide (institution_scope = 'all'). With no institution,
 * only the group-wide holders. There is no "every holder in every college"
 * answer any more (review of #4150, item 1).
 */
export async function roleHolderIds(
  supabase: SupabaseClient,
  roleKeys: string[],
  institutionId: string | null,
): Promise<string[]> {
  const keys = roleKeys.map((k) => k.toLowerCase().trim()).filter(Boolean);
  if (keys.length === 0) return [];
  return rpcIds(supabase, 'fn_hr_role_holder_ids', {
    p_role_keys: keys,
    p_institution_id: institutionId,
  });
}

/** The HR head(s) for the subject's institution (plus any group-wide HR head). */
export async function hrHeadIds(supabase: SupabaseClient, institutionId: string | null): Promise<string[]> {
  return roleHolderIds(supabase, HR_HEAD_ROLES, institutionId);
}

/**
 * Who may decide the team member's request, inside their institution: holders
 * of the approver keys there, plus holders of a group-wide role.
 */
export async function regularizationApproverIds(
  supabase: SupabaseClient,
  institutionId: string | null,
): Promise<string[]> {
  return rpcIds(supabase, 'fn_hr_permission_holder_ids', {
    p_keys: REGULARIZATION_APPROVER_KEYS,
    p_institution_id: institutionId,
  });
}

/**
 * Owners of one step: the pinned person, else its role's holders in the
 * candidate's college, else that college's own HR. Never another college's
 * holders of the role.
 */
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
  if (step.assigned_role) {
    const holders = await roleHolderIds(supabase, [step.assigned_role], institutionId);
    if (holders.length > 0) return holders;
    console.warn(
      '[hr/duty-notices] nobody in the college holds the step role; telling its HR instead',
      step.assigned_role,
      institutionId,
    );
  }
  return roleHolderIds(supabase, UNASSIGNED_STEP_ROLES, institutionId);
}

/** Per-institution memo for recipient lookups within one run. */
function memoByInstitution(load: (institutionId: string | null) => Promise<string[]>) {
  const cache = new Map<string, Promise<string[]>>();
  return (institutionId: string | null) => {
    const k = institutionId ?? '';
    let hit = cache.get(k);
    if (!hit) {
      hit = load(institutionId);
      cache.set(k, hit);
    }
    return hit;
  };
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
    const { data: staff, error: staffErr } = await supabase
      .from('staff')
      .select('profile_id')
      .in('id', staffIds.slice(i, i + 200));
    // A half-read list would let a chase reach someone on leave: fail loudly.
    if (staffErr) throw new Error(`leave lookup (team members) failed: ${staffErr.message}`);
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

function onboardingStartedAtOf(c: CandidateRow): string | null {
  return ((c.role_specific_details ?? {}) as { onboarding_started_at?: string | null }).onboarding_started_at ?? null;
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
      subjectKey: stepSubjectKey(step, onboardingStartedAtOf(c)),
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
  /** Chases not sent because today's leave list could not be read. */
  skipped_leave_unknown: number;
  errors: string[];
}

function emptyCounts(): SweepCounts {
  return {
    examined: 0, sent: 0, already_sent: 0, no_recipients: 0, deferred_on_leave: 0, failed: 0,
    handed_to_ladder: 0, skipped_leave_unknown: 0, errors: [],
  };
}

function tally(counts: SweepCounts, outcome: SendOutcome) {
  counts[outcome] += 1;
}

/**
 * The daily onboarding chases. Every notice here is a chase, so with
 * `onLeave` null (today's leave list could not be read) nothing is sent and
 * each planned notice is counted as skipped_leave_unknown.
 */
export async function runOnboardingSweep(
  supabase: SupabaseClient,
  now: Date,
  thresholds: OnboardingThresholds,
  onLeave: ReadonlySet<string> | null,
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

  const hrHeadsOf = memoByInstitution((inst) => hrHeadIds(supabase, inst));
  for (const c of candidates) {
    try {
      const startedAt = onboardingStartedAtOf(c);
      const steps = readOnboardingSteps(c.role_specific_details);
      const joiningDate = joiningDateOf(c);
      const plan = planOnboardingNotices(
        { id: c.id, onboardingStartedAt: startedAt, joiningDate, steps },
        now,
        sent,
        goLiveAt,
        thresholds,
      );
      const candidateName = c.name ?? 'The new joiner';
      const roleTitle = c.role_title ?? 'new role';
      const openSteps = steps.filter((s) => !s.completed);

      for (const p of plan) {
        if (onLeave === null) {
          counts.skipped_leave_unknown += 1;
          continue;
        }
        if (p.kind === 'joining_passed') {
          const outcome = await sendOnce(
            supabase,
            { duty: DUTY_ONBOARDING, subjectTable: TBL_CANDIDATES, subjectId: c.id, subjectKey: '', kind: 'joining_passed' },
            await hrHeadsOf(c.institution_id),
            (ids) =>
              StaffNotificationService.notifyOnboardingJoiningPassed(supabase, c.id, ids, {
                candidateName,
                roleTitle,
                joiningDate: joiningDate ?? '',
                openSteps: openSteps.map((s) => s.step),
              }),
            onLeave,
            counts.errors,
          );
          tally(counts, outcome);
          continue;
        }

        if (p.kind === 'joining_soon') {
          // One notice for the joiner, to the owners of every open step.
          const owners: string[] = [];
          for (const s of openSteps) owners.push(...(await stepOwnerIds(supabase, s, c.institution_id)));
          const outcome = await sendOnce(
            supabase,
            { duty: DUTY_ONBOARDING, subjectTable: TBL_CANDIDATES, subjectId: c.id, subjectKey: '', kind: 'joining_soon' },
            owners,
            (ids) =>
              StaffNotificationService.notifyOnboardingJoiningSoon(supabase, c.id, ids, {
                candidateName,
                roleTitle,
                joiningDate: joiningDate ?? '',
                openSteps: openSteps.map((s) => s.step),
              }),
            onLeave,
            counts.errors,
          );
          tally(counts, outcome);
          continue;
        }

        const pos = p.position as number;
        const step = steps[pos];
        const owners = await stepOwnerIds(supabase, step, c.institution_id);
        const held = workingDaysElapsed(
          stepTurnStartedAt(steps, pos, startedAt ?? now.toISOString()),
          now,
        );
        const outcome = await sendOnce(
          supabase,
          {
            duty: DUTY_ONBOARDING,
            subjectTable: TBL_CANDIDATES,
            subjectId: c.id,
            subjectKey: stepSubjectKey(step, startedAt),
            kind: 'step_reminder',
          },
          owners,
          (ids) =>
            StaffNotificationService.notifyOnboardingStepReminder(supabase, c.id, ids, {
              candidateName,
              roleTitle,
              stepName: step.step,
              stepNumber: pos + 1,
              stepCount: steps.length,
              joiningDate,
              reason: 'held_too_long',
              workingDaysHeld: held,
            }),
          onLeave,
          counts.errors,
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
    approvers: (institutionId: string | null) => Promise<string[]>;
    hrHeads: (institutionId: string | null) => Promise<string[]>;
    onLeave?: ReadonlySet<string>;
    monthClosed?: boolean;
    errors?: string[];
  },
): Promise<SendOutcome> {
  const target: LedgerTarget = {
    duty: DUTY_REGULARIZATION,
    subjectTable: TBL_REGULARIZATIONS,
    subjectId: r.id,
    subjectKey: kind === 'decided' ? decidedSubjectKey(r.status) : '',
    kind,
  };
  const requester = r.employee?.profile_id ?? null;
  const institutionId = r.employee?.institution_id ?? null;
  const base = {
    staffName: staffNameOf(r),
    forDate: r.for_date,
    reason: reasonOf(r),
    waitingDays: waitingDays(r, now),
  };

  if (kind === 'decided') {
    if (!requester) return 'no_recipients';
    return sendOnce(
      supabase,
      target,
      [requester],
      () =>
        StaffNotificationService.notifyRegularizationDecided(supabase, r.id, requester, {
          forDate: r.for_date,
          approved: r.status === 'approved',
          rejectionReason: r.rejection_reason,
        }),
      undefined,
      ctx.errors,
    );
  }

  if (kind === 'hr_head') {
    const heads = await ctx.hrHeads(institutionId);
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
      ctx.errors,
    );
  }

  // The requester is never asked to approve their own request.
  const approvers = (await ctx.approvers(institutionId)).filter((id) => id !== requester);
  if (kind === 'submitted') {
    return sendOnce(
      supabase,
      target,
      approvers,
      (ids) => StaffNotificationService.notifyRegularizationSubmitted(supabase, r.id, ids, base),
      undefined,
      ctx.errors,
    );
  }
  return sendOnce(
    supabase,
    target,
    approvers,
    (ids) => StaffNotificationService.notifyRegularizationReminder(supabase, r.id, ids, base),
    ctx.onLeave,
    ctx.errors,
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

  const ctx = {
    approvers: (inst: string | null) => regularizationApproverIds(supabase, inst),
    hrHeads: (inst: string | null) => hrHeadIds(supabase, inst),
  };

  if (r.status === 'pending') {
    return { kind: 'submitted', outcome: await sendRegularizationNotice(supabase, r, 'submitted', now, ctx) };
  }
  if ((r.status === 'approved' || r.status === 'rejected') && wasEverPending(r)) {
    return { kind: 'decided', outcome: await sendRegularizationNotice(supabase, r, 'decided', now, ctx) };
  }
  return { kind: null, outcome: 'nothing_due' };
}

/** Rows per page when the daily run reads regularisation requests. */
export const REGULARIZATION_PAGE_SIZE = 500;

/**
 * Read every row of an ordered query, one page at a time, so a backlog larger
 * than PostgREST's row cap is walked in a fixed order instead of an arbitrary
 * subset (review of #4150, item 10).
 */
async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += REGULARIZATION_PAGE_SIZE) {
    const { data, error } = await page(from, from + REGULARIZATION_PAGE_SIZE - 1);
    if (error) throw new Error(`${label} read failed: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < REGULARIZATION_PAGE_SIZE) return out;
  }
}

export async function runRegularizationSweep(
  supabase: SupabaseClient,
  now: Date,
  thresholds: RegularizationThresholds,
  /** null = today's leave list could not be read: chases are skipped, the rest still go. */
  onLeave: ReadonlySet<string> | null,
  goLiveAt: Date,
  /** True when the chase ladder owns A3: skip the reminder and hr_head chases. */
  ladderOwnsChases = false,
): Promise<SweepCounts> {
  const counts = emptyCounts();
  const since = new Date(now.getTime() - thresholds.decidedBackstopDays * 24 * 60 * 60 * 1000).toISOString();

  const decided = await readAllPages<RegularizationRow>(
    (from, to) =>
      supabase
        .from(TBL_REGULARIZATIONS)
        .select(REG_SELECT)
        .in('status', ['approved', 'rejected'])
        .gte('approved_at', since)
        .order('approved_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    'decided regularization',
  );
  const pending = await readAllPages<RegularizationRow>(
    (from, to) =>
      supabase
        .from(TBL_REGULARIZATIONS)
        .select(REG_SELECT)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    'pending regularization',
  );

  // A request decided between the two reads appears in both. The decided
  // snapshot wins (it was read first and is the later state), so nobody is
  // told "awaiting approval" about a request that is already decided.
  const decidedIds = new Set(decided.map((r) => r.id));
  const rows = [
    ...pending.filter((r) => !decidedIds.has(r.id)),
    ...decided.filter(wasEverPending),
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

  const baseCtx = {
    approvers: memoByInstitution((inst) => regularizationApproverIds(supabase, inst)),
    hrHeads: memoByInstitution((inst) => hrHeadIds(supabase, inst)),
    errors: counts.errors,
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
        if (isChase && onLeave === null) {
          counts.skipped_leave_unknown += 1;
          continue;
        }
        const outcome = await sendRegularizationNotice(supabase, r, p.kind, now, {
          ...baseCtx,
          onLeave: isChase ? (onLeave ?? undefined) : undefined,
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
