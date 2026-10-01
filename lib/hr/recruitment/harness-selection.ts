// =====================================================================================
// Recruitment harness — who is due a nudge, and who receives it (pure logic)
// =====================================================================================
// HR staff harness, duty cards R5 (approval steps), R6 (interview scorecards) and
// R8 (issue the offer, record the joining). Design:
// artifacts/hr-staff-harness-design-2026-10-01.html.
//
// Every function in this file is pure: the loader (harness-run.ts) reads the rows,
// these decide, the runner sends. That split is what lets the tests prove the
// rules without a database.
//
// THE FIVE NUDGES
//   approval_reminder        a candidate has waited at one approval step longer than
//                            that step's frozen escalate_after_hours (seeded 72) —
//                            ONE reminder to the step's approver.
//   approval_escalation      48 hours after that reminder the step is still waiting —
//                            ONE notice to the HR Head (role key 'hr_head').
//   scorecard_missing        24 hours after an interview an interviewer on the panel
//                            has no scorecard — ONE nudge to that interviewer.
//   offer_not_issued         a candidate has sat at 'package_fixed' for 2 days —
//                            ONE nudge to the job's creator, or HR if there is none.
//   joining_outcome_missing  'offer_issued' and the joining date passed 2 days ago
//                            with nothing recorded — ONE nudge to the same people.
//
// "ONE" is enforced by hr_recruitment_nudges_sent (UNIQUE (kind, ref_key)). A nudge
// is recorded even when it found nobody to send to: for approval_reminder that is
// what starts the 48-hour clock, so a step whose role NOBODY holds still reaches the
// HR Head instead of waiting for ever.
//
// WHO IS "THE STEP'S APPROVER" — mirrors fn_decide_recruitment_candidate
//   * a step pinned to a user (approver_user_id)  -> that user
//   * otherwise                                    -> holders of approver_role
//     (user_roles, compared lower-case, as the RPC and fn_my_desk_waiting do),
//     confined to people who can reach the candidate's institution, because the
//     RPC refuses an 'own'-scoped HOD of another college — telling them would be a
//     nudge they cannot act on.
//   A deactivated or login-disabled account is never a recipient.
// =====================================================================================

export const HOUR_MS = 60 * 60 * 1000;

/** Frozen default, same as RecruitmentService.toChainSteps (R3.3). */
export const DEFAULT_ESCALATE_AFTER_HOURS = 72;
/** After the approver's reminder, how long before the HR Head hears about it. */
export const ESCALATION_GRACE_HOURS = 48;
/** How long after the interview start a missing scorecard is nudged. */
export const SCORECARD_DUE_HOURS = 24;
/** Interviews older than this are not chased — a scorecard written weeks later is not a record of the interview. */
export const SCORECARD_LOOKBACK_DAYS = 14;
/** 'package_fixed' for this long with no offer -> nudge. */
export const OFFER_DUE_HOURS = 48;
/** Days after the expected joining date before the outcome is chased. */
export const JOINING_OUTCOME_GRACE_DAYS = 2;
/** The role that owns a stuck approval once the approver has been reminded. */
export const HR_HEAD_ROLE_KEY = 'hr_head';

export type NudgeKind =
  | 'approval_reminder'
  | 'approval_escalation'
  | 'scorecard_missing'
  | 'offer_not_issued'
  | 'joining_outcome_missing';

export const NUDGE_KINDS: readonly NudgeKind[] = [
  'approval_reminder',
  'approval_escalation',
  'scorecard_missing',
  'offer_not_issued',
  'joining_outcome_missing',
];

// ---------------------------------------------------------------------------
// Input shapes (what the loader hands in)
// ---------------------------------------------------------------------------

export interface ChainStep {
  approver_role?: string | null;
  approver_user_id?: string | null;
  status?: string | null;
  decided_at?: string | null;
  escalate_after_hours?: number | null;
}

export interface HarnessCandidate {
  id: string;
  name: string;
  role_title: string;
  status: string;
  institution_id: string | null;
  approval_chain: ChainStep[] | null;
  current_step: number;
  submitted_at: string;
  final_decided_at: string | null;
  expected_joining_date: string | null;
  actual_joining_date: string | null;
  offer_issued_at: string | null;
  /** role_specific_details->>job_id when it is uuid-shaped, else null. */
  job_id: string | null;
}

export interface HarnessInterview {
  id: string;
  candidate_id: string;
  round_number: number;
  round_name: string | null;
  scheduled_at: string;
  status: string;
  panel_member_ids: string[];
}

export interface DirectoryUser {
  id: string;
  fullName: string;
  institutionId: string | null;
  /** profiles.is_active AND NOT profiles.is_login_disabled */
  active: boolean;
  isSuperAdmin: boolean;
  /** Role keys from user_roles, lower-cased. The step-matching set. */
  roleKeys: string[];
  /** Any role (user_roles OR the legacy profiles.role) has institution_scope = 'all'. */
  allScope: boolean;
  /** Active user_institution_access grants. */
  grantInstitutionIds: string[];
  /** A role (user_roles OR legacy profiles.role) grants hr.recruitment.edit. */
  canEditRecruitment: boolean;
}

export interface Directory {
  users: Map<string, DirectoryUser>;
  /** institution id -> counselling_code (non-blank only); siblings share a code. */
  counsellingCodeOf: Map<string, string>;
  /** role key (lower) -> display name. */
  roleNameOf: Map<string, string>;
}

export interface SentNudge {
  kind: NudgeKind;
  ref_key: string;
  sent_at: string;
}

export interface Nudge {
  kind: NudgeKind;
  refKey: string;
  candidateId: string;
  recipients: string[];
  title: string;
  body: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const TERMINAL_CANDIDATE_STATUSES = new Set(['rejected', 'withdrawn', 'offer_rescinded', 'no_show']);
const WAITING_STATUSES = new Set(['submitted', 'pending_approval']);

export function sentKey(kind: NudgeKind, refKey: string): string {
  return `${kind}|${refKey}`;
}

export function indexSent(sent: SentNudge[]): Map<string, SentNudge> {
  return new Map(sent.map((s) => [sentKey(s.kind, s.ref_key), s]));
}

function hoursBetween(fromIso: string, now: Date): number {
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return 0;
  return (now.getTime() - t) / HOUR_MS;
}

function wholeDays(hours: number): number {
  return Math.floor(hours / 24);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** YYYY-MM-DD of `now` in India time. */
export function istDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatIstDate(isoOrYmd: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoOrYmd)
    ? new Date(`${isoOrYmd}T12:00:00+05:30`)
    : new Date(isoOrYmd);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

function candidateLabel(c: { name: string; role_title: string }): string {
  const role = (c.role_title ?? '').trim();
  return role ? `${c.name.trim()} — ${role}` : c.name.trim();
}

export function roleLabel(roleKey: string | null | undefined, dir: Directory): string {
  const key = (roleKey ?? '').toLowerCase();
  if (!key) return 'an unnamed role';
  return dir.roleNameOf.get(key) ?? key.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Reach and recipients
// ---------------------------------------------------------------------------

/**
 * Can this user act on a record of `institutionId`? Mirrors
 * role_has_institution_access(), evaluated for another user instead of auth.uid():
 * NULL institution, super admin, any 'all'-scoped role, own institution, a sibling
 * institution sharing a non-blank counselling code, or an active grant.
 *
 * NOT mirrored: Director handovers (fn_handover_grants_key). A handover grants a
 * permission key, not institution reach, so it does not change this answer.
 */
export function userReachesInstitution(
  user: DirectoryUser,
  institutionId: string | null,
  dir: Directory,
): boolean {
  if (institutionId === null) return true;
  if (user.isSuperAdmin || user.allScope) return true;
  if (user.institutionId === institutionId) return true;
  if (user.institutionId) {
    const mine = dir.counsellingCodeOf.get(user.institutionId);
    if (mine && mine === dir.counsellingCodeOf.get(institutionId)) return true;
  }
  return user.grantInstitutionIds.includes(institutionId);
}

/** The step a candidate is waiting at, or null when there is none to wait at. */
export function currentPendingStep(c: HarnessCandidate): ChainStep | null {
  const chain = Array.isArray(c.approval_chain) ? c.approval_chain : [];
  const idx = c.current_step;
  if (!Number.isInteger(idx) || idx < 0 || idx >= chain.length) return null;
  const step = chain[idx];
  if (!step || step.status !== 'pending') return null;
  return step;
}

/**
 * When the current step started waiting: the moment the previous step was decided,
 * or the submission for the first step. A previous step with no decided_at (an
 * old, hand-repaired chain) falls back to the submission — the older clock, so a
 * malformed chain can only make a reminder earlier, never suppress it.
 */
export function stepWaitingSince(c: HarnessCandidate): string {
  const chain = Array.isArray(c.approval_chain) ? c.approval_chain : [];
  if (c.current_step > 0) {
    const prev = chain[c.current_step - 1];
    if (prev?.decided_at) return prev.decided_at;
  }
  return c.submitted_at;
}

export function stepEscalateAfterHours(step: ChainStep): number {
  const h = Number(step.escalate_after_hours);
  return Number.isFinite(h) && h > 0 ? h : DEFAULT_ESCALATE_AFTER_HOURS;
}

/** Who may decide this step — see the file header. Sorted for stable output. */
export function resolveStepApprovers(
  step: ChainStep,
  candidateInstitutionId: string | null,
  dir: Directory,
): string[] {
  const pinned = step.approver_user_id ?? null;
  if (pinned) {
    // A pinned step is routed to one person by name; fn_my_desk_waiting shows it
    // on their desk whatever their institution, so they are told too.
    const u = dir.users.get(pinned);
    return u && u.active ? [u.id] : [];
  }
  const role = (step.approver_role ?? '').toLowerCase();
  if (!role) return [];
  return holdersOfRole(role, candidateInstitutionId, dir);
}

export function holdersOfRole(
  roleKeyLower: string,
  institutionId: string | null,
  dir: Directory,
): string[] {
  const out: string[] = [];
  for (const u of dir.users.values()) {
    if (!u.active) continue;
    if (!u.roleKeys.includes(roleKeyLower)) continue;
    if (!userReachesInstitution(u, institutionId, dir)) continue;
    out.push(u.id);
  }
  return out.sort();
}

/**
 * Who follows up an offer: the job's creator when they can still edit recruitment,
 * otherwise the college's HR editors as hr_recruitment_application_recipient_ids()
 * defines them — the SAME list the public-careers "new applicant" bell uses:
 * hr.recruitment.edit holders who can reach the candidate's institution, falling
 * back to all-scope editors only when the college has none, super admins excluded.
 *
 * @param hrEditors that function's answer for this candidate's institution.
 */
export function offerRecipients(
  jobCreatorId: string | null,
  hrEditors: string[],
  dir: Directory,
): string[] {
  if (jobCreatorId) {
    const creator = dir.users.get(jobCreatorId);
    if (creator && creator.active && creator.canEditRecruitment) return [creator.id];
  }
  return Array.from(new Set(hrEditors)).sort();
}

/** Map key for an institution id, including the NULL institution. */
export function institutionKey(institutionId: string | null): string {
  return institutionId ?? 'none';
}

// ---------------------------------------------------------------------------
// R5 — approval steps
// ---------------------------------------------------------------------------

export function approvalRefKey(candidateId: string, stepIndex: number): string {
  return `${candidateId}:${stepIndex}`;
}

export function selectApprovalNudges(
  candidates: HarnessCandidate[],
  sent: Map<string, SentNudge>,
  dir: Directory,
  now: Date,
): Nudge[] {
  const out: Nudge[] = [];
  for (const c of candidates) {
    if (!WAITING_STATUSES.has(c.status)) continue;
    const step = currentPendingStep(c);
    if (!step) continue;

    const chainLen = c.approval_chain?.length ?? 0;
    const stepNo = c.current_step + 1;
    const waited = hoursBetween(stepWaitingSince(c), now);
    const limit = stepEscalateAfterHours(step);
    if (waited < limit) continue;

    const refKey = approvalRefKey(c.id, c.current_step);
    const label = candidateLabel(c);
    const who = roleLabel(step.approver_role, dir);
    const days = wholeDays(waited);

    const reminder = sent.get(sentKey('approval_reminder', refKey));
    if (!reminder) {
      out.push({
        kind: 'approval_reminder',
        refKey,
        candidateId: c.id,
        recipients: resolveStepApprovers(step, c.institution_id, dir),
        title: `Approval waiting ${plural(days, 'day', 'days')}: ${label}`,
        body:
          `This hire has waited ${plural(Math.floor(waited), 'hour', 'hours')} at step ${stepNo} of ${chainLen} ` +
          `(${who}). The step should be decided within ${limit} hours. ` +
          'Open your approvals list to approve or reject.',
        url: '/hr/recruitment/approvals',
      });
      continue;
    }

    if (sent.has(sentKey('approval_escalation', refKey))) continue;
    if (hoursBetween(reminder.sent_at, now) < ESCALATION_GRACE_HOURS) continue;

    const approvers = resolveStepApprovers(step, c.institution_id, dir);
    const whyStuck = approvers.length === 0
      ? `Nobody who can decide it could be found (${who}), so the reminder reached no one. ` +
        'Reassign the step or fix the approval flow.'
      : `The approver (${who}) was reminded ${plural(wholeDays(hoursBetween(reminder.sent_at, now)), 'day', 'days')} ago and has not decided.`;
    out.push({
      kind: 'approval_escalation',
      refKey,
      candidateId: c.id,
      recipients: holdersOfRole(HR_HEAD_ROLE_KEY, c.institution_id, dir),
      title: `Stuck approval, ${plural(days, 'day', 'days')}: ${label}`,
      body: `Step ${stepNo} of ${chainLen} has waited ${plural(days, 'day', 'days')}. ${whyStuck}`,
      url: `/hr/recruitment/candidates/${c.id}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// R6 — interview scorecards
// ---------------------------------------------------------------------------

export function scorecardRefKey(interviewId: string, interviewerId: string): string {
  return `${interviewId}:${interviewerId}`;
}

/**
 * @param submitted  keys `${interview_id}:${interviewer_id}` of scorecards that exist
 * @param candidateOf candidate id -> the candidate (for the name and status)
 */
export function selectScorecardNudges(
  interviews: HarnessInterview[],
  submitted: Set<string>,
  candidateOf: Map<string, Pick<HarnessCandidate, 'id' | 'name' | 'role_title' | 'status'>>,
  sent: Map<string, SentNudge>,
  dir: Directory,
  now: Date,
): Nudge[] {
  const out: Nudge[] = [];
  for (const iv of interviews) {
    if (iv.status !== 'scheduled' && iv.status !== 'completed') continue;
    const age = hoursBetween(iv.scheduled_at, now);
    if (age < SCORECARD_DUE_HOURS || age > SCORECARD_LOOKBACK_DAYS * 24) continue;
    const cand = candidateOf.get(iv.candidate_id);
    if (!cand || TERMINAL_CANDIDATE_STATUSES.has(cand.status)) continue;

    const round = iv.round_name?.trim() || `Round ${iv.round_number}`;
    for (const interviewerId of Array.from(new Set(iv.panel_member_ids ?? []))) {
      const refKey = scorecardRefKey(iv.id, interviewerId);
      if (submitted.has(refKey)) continue;
      if (sent.has(sentKey('scorecard_missing', refKey))) continue;
      const u = dir.users.get(interviewerId);
      out.push({
        kind: 'scorecard_missing',
        refKey,
        candidateId: cand.id,
        recipients: u && u.active ? [u.id] : [],
        title: `Scorecard due: ${candidateLabel(cand)}`,
        body:
          `You were on the panel for ${round} on ${formatIstDate(iv.scheduled_at)}. ` +
          'Your scorecard is not in yet. Please add it while the interview is fresh.',
        url: `/hr/recruitment/interviews/${iv.id}`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// R8 — issue the offer, record the joining
// ---------------------------------------------------------------------------

function candidatePageFor(c: HarnessCandidate): string {
  // Both pages carry the Issue Offer control (fn_my_desk_waiting's offer href rule).
  return c.job_id ? `/hr/recruitment/approvals/${c.job_id}` : `/hr/recruitment/candidates/${c.id}`;
}

/**
 * @param packageFixedAt candidate id -> when the package was fixed (earliest
 *   approved package). Falls back to final_decided_at, then submitted_at.
 * @param jobCreatorOf job id -> hr_recruitment_jobs.created_by
 * @param hrEditorsOf institutionKey() -> hr_recruitment_application_recipient_ids()
 */
export function selectOfferNudges(
  candidates: HarnessCandidate[],
  packageFixedAt: Map<string, string>,
  jobCreatorOf: Map<string, string | null>,
  hrEditorsOf: Map<string, string[]>,
  sent: Map<string, SentNudge>,
  dir: Directory,
  now: Date,
): Nudge[] {
  const out: Nudge[] = [];
  const today = istDate(now);
  for (const c of candidates) {
    const creator = c.job_id ? jobCreatorOf.get(c.job_id) ?? null : null;
    const hrEditors = hrEditorsOf.get(institutionKey(c.institution_id)) ?? [];

    if (c.status === 'package_fixed') {
      const since = packageFixedAt.get(c.id) ?? c.final_decided_at ?? c.submitted_at;
      const waited = hoursBetween(since, now);
      const refKey = c.id;
      if (waited >= OFFER_DUE_HOURS && !sent.has(sentKey('offer_not_issued', refKey))) {
        out.push({
          kind: 'offer_not_issued',
          refKey,
          candidateId: c.id,
          recipients: offerRecipients(creator, hrEditors, dir),
          title: `Offer not issued: ${candidateLabel(c)}`,
          body:
            `The salary package was fixed ${plural(wholeDays(waited), 'day', 'days')} ago and no offer has gone out. ` +
            'Issue the offer, or record why the hire is not going ahead.',
          url: candidatePageFor(c),
        });
      }
      continue;
    }

    if (c.status === 'offer_issued') {
      if (!c.expected_joining_date || c.actual_joining_date) continue;
      const joining = c.expected_joining_date.slice(0, 10);
      if (today < addDays(joining, JOINING_OUTCOME_GRACE_DAYS)) continue;
      // Keyed on the date: if HR moves the joining date, the new date is chased once too.
      const refKey = `${c.id}:${joining}`;
      if (sent.has(sentKey('joining_outcome_missing', refKey))) continue;
      out.push({
        kind: 'joining_outcome_missing',
        refKey,
        candidateId: c.id,
        recipients: offerRecipients(creator, hrEditors, dir),
        title: `Joining date passed: ${candidateLabel(c)}`,
        body:
          `${c.name.trim()} was due to join on ${formatIstDate(joining)}. ` +
          'Record the outcome: joined, or did not come (no-show).',
        url: `/hr/recruitment/candidates/${c.id}`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step-ready notice (sent at the moment a chain advances, not by the schedule)
// ---------------------------------------------------------------------------

export interface StepReadyNotice {
  candidateId: string;
  stepIndex: number;
  recipients: string[];
  title: string;
  body: string;
  url: string;
}

/**
 * The notice for the NEXT approver after a step is approved. Returns null when the
 * candidate is not waiting at a pending step (the chain finished, or was rejected).
 * The person who just acted is left out: they are looking at the screen already.
 */
export function buildStepReadyNudge(
  c: HarnessCandidate,
  actorId: string,
  actorName: string,
  dir: Directory,
): StepReadyNotice | null {
  if (!WAITING_STATUSES.has(c.status)) return null;
  const step = currentPendingStep(c);
  if (!step) return null;
  const chainLen = c.approval_chain?.length ?? 0;
  const recipients = resolveStepApprovers(step, c.institution_id, dir).filter((id) => id !== actorId);
  const stepNo = c.current_step + 1;
  const limit = stepEscalateAfterHours(step);
  return {
    candidateId: c.id,
    stepIndex: c.current_step,
    recipients,
    title: `Your approval is needed: ${candidateLabel(c)}`,
    body:
      `${actorName} approved step ${stepNo - 1} of ${chainLen}. Step ${stepNo} (${roleLabel(step.approver_role, dir)}) ` +
      `is now waiting on you. Please decide within ${limit} hours.`,
    url: '/hr/recruitment/approvals',
  };
}
