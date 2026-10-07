// =====================================================================================
// Recruitment harness — read the rows, send the nudges (server only)
// =====================================================================================
// The decisions live in harness-selection.ts (pure, tested). This file only:
//   1. reads what those decisions need, with the SERVICE-ROLE client (the nudges go
//      to other people, and the directory reads roles and profiles across users);
//   2. for each due nudge, CLAIMS it in hr_recruitment_nudges_sent (UNIQUE
//      (kind, ref_key)) before sending, so two overlapping runs cannot both send;
//   3. sends it through fanoutNotification (notifications + user_notifications);
//   4. releases the claim only if the send THREW, so the next run tries again. A
//      send that returned without reaching anyone keeps its claim as a terminal
//      "found nobody" record (recipient_ids = {}), so it is not retried daily.
//   5. at the start of each run, re-arms claims whose send never finished (the run
//      was killed between the claim and the send) — see staleUnsentClaims.
//
// SERVER-SIDE ONLY. Never import from a client component.
// =====================================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import {
  GO_LIVE_POLICY_KEY,
  HR_HEAD_ROLE_KEY,
  SCORECARD_DUE_HOURS,
  SCORECARD_LOOKBACK_DAYS,
  HOUR_MS,
  NUDGE_KINDS,
  buildStepReadyNudge,
  goLiveFromPolicy,
  indexSent,
  institutionKey,
  scorecardRefKey,
  selectApprovalNudges,
  staleUnsentClaims,
  selectOfferNudges,
  selectScorecardNudges,
  type ChainStep,
  type Directory,
  type DirectoryUser,
  type HarnessCandidate,
  type HarnessInterview,
  type Nudge,
  type NudgeKind,
  type SentNudge,
} from './harness-selection';
import { applyLadderHandoff } from './ladder-handoff';

type Db = SupabaseClient<any, any, any>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const IN_CHUNK = 200;
const SOURCE = 'hr_recruitment_harness';

const CANDIDATE_COLUMNS =
  'id, name, role_title, status, institution_id, approval_chain, current_step, submitted_at, ' +
  'final_decided_at, expected_joining_date, actual_joining_date, offer_issued_at, role_specific_details';

// ---------------------------------------------------------------------------
// Reading helpers
// ---------------------------------------------------------------------------

function chunks<T>(items: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Page through a query past PostgREST's row cap. `build` must return a fresh query. */
async function readAll<T>(
  build: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }> },
  what: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(`[recruitment-harness] reading ${what} failed: ${(error as { message?: string }).message ?? String(error)}`);
    const page = (data as T[]) ?? [];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function readIn<T>(
  db: Db,
  table: string,
  columns: string,
  column: string,
  values: string[],
  what: string,
  extra?: (q: any) => any,
): Promise<T[]> {
  const out: T[] = [];
  for (const part of chunks(Array.from(new Set(values)))) {
    if (part.length === 0) continue;
    const rows = await readAll<T>(() => {
      let q = db.from(table).select(columns).in(column, part);
      if (extra) q = extra(q);
      return q;
    }, what);
    out.push(...rows);
  }
  return out;
}

interface CandidateRow extends Omit<HarnessCandidate, 'job_id' | 'approval_chain'> {
  approval_chain: unknown;
  role_specific_details: Record<string, unknown> | null;
}

function toCandidate(r: CandidateRow): HarnessCandidate {
  const jobId = r.role_specific_details?.job_id;
  return {
    ...r,
    approval_chain: Array.isArray(r.approval_chain) ? (r.approval_chain as ChainStep[]) : null,
    job_id: typeof jobId === 'string' && UUID.test(jobId) ? jobId : null,
  };
}

// ---------------------------------------------------------------------------
// The directory: who holds which role, and where they can act
// ---------------------------------------------------------------------------

interface RoleRow {
  id: string;
  role_key: string;
  role_name: string | null;
  institution_scope: string | null;
  permissions: Record<string, unknown> | null;
}

function grantsRecruitmentEdit(r: RoleRow | undefined): boolean {
  const v = r?.permissions?.['hr.recruitment.edit'];
  return v === true || v === 'true';
}

/**
 * Build the directory for the people who could receive a nudge: holders of the
 * given role keys, and the named users (pinned approvers, interviewers, job
 * creators). Each person's FULL role set is read, because any one 'all'-scoped
 * role gives them every institution.
 */
export async function loadDirectory(
  db: Db,
  opts: { roleKeys: string[]; userIds: string[] },
): Promise<Directory> {
  const roles = await readAll<RoleRow>(
    () => db.from('custom_roles').select('id, role_key, role_name, institution_scope, permissions'),
    'custom_roles',
  );
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const roleByKey = new Map(roles.map((r) => [r.role_key, r]));
  const roleNameOf = new Map(
    roles.map((r) => [r.role_key.toLowerCase(), (r.role_name ?? '').trim() || r.role_key]),
  );

  const wantedKeys = new Set(opts.roleKeys.map((k) => k.toLowerCase()).filter(Boolean));
  const relevantRoleIds = roles
    .filter((r) => wantedKeys.has(r.role_key.toLowerCase()))
    .map((r) => r.id);

  const holders = await readIn<{ user_id: string }>(
    db, 'user_roles', 'user_id', 'role_id', relevantRoleIds, 'user_roles (holders)',
  );

  const userIds = Array.from(
    new Set([...holders.map((h) => h.user_id), ...opts.userIds.filter((id) => UUID.test(id))]),
  );

  const [allRoles, profiles, grants, institutions] = await Promise.all([
    readIn<{ user_id: string; role_id: string }>(
      db, 'user_roles', 'user_id, role_id', 'user_id', userIds, 'user_roles (per user)',
    ),
    readIn<{
      id: string;
      full_name: string | null;
      institution_id: string | null;
      is_active: boolean | null;
      is_login_disabled: boolean | null;
      is_super_admin: boolean | null;
      role: string | null;
    }>(
      db, 'profiles',
      'id, full_name, institution_id, is_active, is_login_disabled, is_super_admin, role',
      'id', userIds, 'profiles',
    ),
    readIn<{ user_id: string; institution_id: string }>(
      db, 'user_institution_access', 'user_id, institution_id', 'user_id', userIds,
      'user_institution_access', (q) => q.eq('is_active', true),
    ),
    readAll<{ id: string; counselling_code: string | null }>(
      () => db.from('institutions').select('id, counselling_code'),
      'institutions',
    ),
  ]);

  const rolesOf = new Map<string, RoleRow[]>();
  for (const ur of allRoles) {
    const r = roleById.get(ur.role_id);
    if (!r) continue;
    const list = rolesOf.get(ur.user_id) ?? [];
    list.push(r);
    rolesOf.set(ur.user_id, list);
  }
  const grantsOf = new Map<string, string[]>();
  for (const g of grants) {
    const list = grantsOf.get(g.user_id) ?? [];
    list.push(g.institution_id);
    grantsOf.set(g.user_id, list);
  }

  const users = new Map<string, DirectoryUser>();
  for (const p of profiles) {
    const mine = rolesOf.get(p.id) ?? [];
    const legacy = p.role ? roleByKey.get(p.role) : undefined;
    const scoped = legacy ? [...mine, legacy] : mine;
    users.set(p.id, {
      id: p.id,
      fullName: (p.full_name ?? '').trim() || 'Someone',
      institutionId: p.institution_id,
      active: p.is_active !== false && p.is_login_disabled !== true,
      isSuperAdmin: p.is_super_admin === true,
      roleKeys: mine.map((r) => r.role_key.toLowerCase()),
      allScope: scoped.some((r) => r.institution_scope === 'all'),
      grantInstitutionIds: grantsOf.get(p.id) ?? [],
      canEditRecruitment: scoped.some(grantsRecruitmentEdit),
    });
  }

  const counsellingCodeOf = new Map<string, string>();
  for (const i of institutions) {
    const code = (i.counselling_code ?? '').trim();
    if (code) counsellingCodeOf.set(i.id, code);
  }

  return { users, counsellingCodeOf, roleNameOf };
}

// ---------------------------------------------------------------------------
// Go-live cutoff
// ---------------------------------------------------------------------------

/**
 * The moment the nudges went live (the policy row the migration seeds). A read
 * error, a missing row or an unreadable value all answer `now` — fail closed,
 * so nothing that started waiting before this run is nudged.
 */
export async function readGoLiveAt(db: Db, now: Date): Promise<Date> {
  try {
    const { data, error } = await db
      .from('platform_policies')
      .select('value')
      .eq('policy_key', GO_LIVE_POLICY_KEY)
      .eq('scope_type', 'global')
      .is('scope_id', null)
      .eq('is_active', true)
      .maybeSingle();
    if (error) {
      console.warn('[recruitment-harness] reading the go-live cutoff failed; using now', error);
      return now;
    }
    return goLiveFromPolicy((data as { value?: unknown } | null)?.value, now);
  } catch (err) {
    console.warn('[recruitment-harness] go-live cutoff read threw; using now', err);
    return now;
  }
}

// ---------------------------------------------------------------------------
// Claim, send, release
// ---------------------------------------------------------------------------

export type SendOutcome = 'sent' | 'no_recipient' | 'already_claimed' | 'failed';

export async function claimAndSend(db: Db, nudge: Nudge, createdBy: string | null): Promise<SendOutcome> {
  // 1. Claim. A 23505 means another run (or an earlier one) already owns it.
  const { data: claim, error: claimErr } = await db
    .from('hr_recruitment_nudges_sent')
    .insert({
      kind: nudge.kind,
      ref_key: nudge.refKey,
      candidate_id: nudge.candidateId,
      recipient_ids: nudge.recipients,
    })
    .select('id')
    .maybeSingle();
  if (claimErr) {
    if ((claimErr as { code?: string }).code === '23505') return 'already_claimed';
    console.error('[recruitment-harness] claim failed', { kind: nudge.kind, ref: nudge.refKey, error: claimErr });
    return 'failed';
  }

  // 2. Nobody to tell. The claim stays: it is the record that the nudge fell due
  //    and found no one, and for an approval reminder it starts the HR Head's clock.
  if (nudge.recipients.length === 0) return 'no_recipient';

  // 3. Send.
  const result = await fanoutNotification(db, {
    title: nudge.title,
    body: nudge.body,
    userIds: nudge.recipients,
    createdBy: createdBy ?? undefined,
    category: 'staff',
    kind: 'work_item',
    priority: nudge.kind === 'approval_escalation' ? 'high' : 'normal',
    url: nudge.url,
    source: SOURCE,
    idempotencyKey: `${SOURCE}:${nudge.kind}:${nudge.refKey}`,
    metadata: { nudge_kind: nudge.kind, candidate_id: nudge.candidateId, ref_key: nudge.refKey },
  }).catch((err: unknown) => {
    console.error('[recruitment-harness] send threw', { kind: nudge.kind, ref: nudge.refKey, err });
    return null;
  });

  // 4. The send threw: release so the next run retries.
  if (result === null) {
    if (claim?.id) {
      const { error: releaseErr } = await db.from('hr_recruitment_nudges_sent').delete().eq('id', claim.id);
      if (releaseErr) {
        // The claim stays unsent; the next run re-arms it once it is stale.
        console.error('[recruitment-harness] releasing a failed claim failed', { kind: nudge.kind, ref: nudge.refKey, error: releaseErr });
      }
    }
    return 'failed';
  }

  if (result.notified > 0 || result.skipped === 'idempotent') {
    if (claim?.id && result.notificationId) {
      const { error: markErr } = await db
        .from('hr_recruitment_nudges_sent')
        .update({ notification_id: result.notificationId })
        .eq('id', claim.id);
      if (markErr) {
        // Not a failed send: the notification exists. A later run may re-arm the
        // claim and re-send, which finds the same notification by its key.
        console.error('[recruitment-harness] recording the notification id failed', { kind: nudge.kind, ref: nudge.refKey, error: markErr });
      }
    }
    return 'sent';
  }

  // 5. The send returned without reaching anyone and without an error. Keep the
  //    claim as a terminal "found nobody" record instead of releasing it: a
  //    release here would retry the same nudge every day and turn every run into
  //    an HTTP 500 (review of #4149, finding 1). For a reminder, the kept row
  //    starts the HR Head's clock, the same as a nudge with no recipients.
  if (claim?.id) {
    const { error: markErr } = await db
      .from('hr_recruitment_nudges_sent')
      .update({ recipient_ids: [] })
      .eq('id', claim.id);
    if (markErr) {
      console.error('[recruitment-harness] marking a claim as found-nobody failed', { kind: nudge.kind, ref: nudge.refKey, error: markErr });
    }
  }
  return 'no_recipient';
}

/**
 * Release claims whose send never finished, so this run can send them again.
 * Deletes only rows still without a notification (a send that landed meanwhile
 * keeps its row). A failed delete is logged and the rows stay claimed — nothing
 * is re-sent, nothing is duplicated.
 *
 * @returns the ids actually released.
 */
export async function releaseStaleClaims(db: Db, rows: SentNudge[], now: Date): Promise<Set<string>> {
  const ids = staleUnsentClaims(rows, now);
  const released = new Set<string>();
  for (const part of chunks(ids)) {
    const { data, error } = await db
      .from('hr_recruitment_nudges_sent')
      .delete()
      .in('id', part)
      .is('notification_id', null)
      .select('id');
    if (error) {
      console.error('[recruitment-harness] re-arming unfinished claims failed', { count: part.length, error });
      continue;
    }
    for (const r of (data as { id: string }[] | null) ?? []) released.add(r.id);
  }
  return released;
}

/**
 * Each college's HR editors (hr_recruitment_application_recipient_ids, the
 * existing service-role-only definition from migration 20260922000646).
 *
 * One failed lookup must not stop the run (review of #4149, finding 2): the
 * college is listed in `unavailable` and its offer nudges are left for the next
 * run. Its editors are deliberately NOT taken as [] — that would record a
 * terminal "found nobody" claim and the nudge would never be sent.
 */
export async function loadHrEditors(
  db: Db,
  institutions: (string | null)[],
): Promise<{ editorsOf: Map<string, string[]>; unavailable: Set<string> }> {
  const editorsOf = new Map<string, string[]>();
  const unavailable = new Set<string>();
  for (const inst of Array.from(new Set(institutions))) {
    let data: unknown = null;
    let error: { message?: string } | null = null;
    try {
      ({ data, error } = await db.rpc('hr_recruitment_application_recipient_ids', {
        p_institution_id: inst,
      }));
    } catch (err) {
      error = { message: err instanceof Error ? err.message : String(err) };
    }
    if (error) {
      console.error('[recruitment-harness] HR editors lookup failed; offer nudges for this college wait for the next run', {
        institution: inst ?? 'no institution',
        error: error.message ?? error,
      });
      unavailable.add(institutionKey(inst));
      continue;
    }
    editorsOf.set(
      institutionKey(inst),
      ((data as unknown[]) ?? [])
        .map((row) => (typeof row === 'string' ? row : (row as Record<string, string>)?.hr_recruitment_application_recipient_ids))
        .filter((id): id is string => typeof id === 'string'),
    );
  }
  return { editorsOf, unavailable };
}

// ---------------------------------------------------------------------------
// The scheduled run
// ---------------------------------------------------------------------------

export interface HarnessRunSummary {
  due: Record<NudgeKind, number>;
  sent: Record<NudgeKind, number>;
  noRecipient: Record<NudgeKind, number>;
  alreadyClaimed: number;
  failed: number;
  /** Claims whose send never finished, released at the start of this run. */
  rearmed: number;
  /** Colleges whose HR-editor lookup failed; their offer nudges wait for the next run. */
  hrEditorsUnavailable: number;
  /** Approval reminders/escalations left to the HR chase ladder (it covers duty R5). */
  handedToLadder: number;
}

function zero(): Record<NudgeKind, number> {
  return Object.fromEntries(NUDGE_KINDS.map((k) => [k, 0])) as Record<NudgeKind, number>;
}

export async function runRecruitmentHarness(db: Db, now: Date = new Date()): Promise<HarnessRunSummary> {
  // --- candidates the three duties look at --------------------------------
  const candidates = (
    await readAll<CandidateRow>(
      () =>
        db
          .from('hr_recruitment_candidates')
          .select(CANDIDATE_COLUMNS)
          .in('status', ['submitted', 'pending_approval', 'package_fixed', 'offer_issued'])
          .order('id'),
      'hr_recruitment_candidates',
    )
  ).map(toCandidate);

  // --- interviews in the scorecard window -----------------------------------
  const windowEnd = new Date(now.getTime() - SCORECARD_DUE_HOURS * HOUR_MS).toISOString();
  const windowStart = new Date(now.getTime() - SCORECARD_LOOKBACK_DAYS * 24 * HOUR_MS).toISOString();
  const interviews = await readAll<HarnessInterview>(
    () =>
      db
        .from('hr_recruitment_interviews')
        .select('id, candidate_id, round_number, round_name, scheduled_at, status, panel_member_ids')
        .in('status', ['scheduled', 'completed'])
        .gte('scheduled_at', windowStart)
        .lte('scheduled_at', windowEnd)
        .order('id'),
    'hr_recruitment_interviews',
  );
  const interviewIds = interviews.map((i) => i.id);
  const scorecards = await readIn<{ interview_id: string; interviewer_id: string }>(
    db, 'hr_recruitment_scorecards', 'interview_id, interviewer_id', 'interview_id', interviewIds,
    'hr_recruitment_scorecards',
  );
  const submitted = new Set(scorecards.map((s) => scorecardRefKey(s.interview_id, s.interviewer_id)));

  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const missingInterviewCandidates = interviews
    .map((i) => i.candidate_id)
    .filter((id) => !candidateById.has(id));
  const interviewCandidates = await readIn<{ id: string; name: string; role_title: string; status: string }>(
    db, 'hr_recruitment_candidates', 'id, name, role_title, status', 'id', missingInterviewCandidates,
    'hr_recruitment_candidates (interviews)',
  );
  const candidateOf = new Map<string, { id: string; name: string; role_title: string; status: string }>(
    [...candidates, ...interviewCandidates].map((c) => [c.id, c]),
  );

  // --- offer inputs ----------------------------------------------------------
  const packageFixed = candidates.filter((c) => c.status === 'package_fixed').map((c) => c.id);
  const packages = await readIn<{ candidate_id: string; approved_at: string | null }>(
    db, 'hr_recruitment_candidate_packages', 'candidate_id, approved_at', 'candidate_id', packageFixed,
    'hr_recruitment_candidate_packages', (q) => q.eq('status', 'approved'),
  );
  const packageFixedAt = new Map<string, string>();
  for (const p of packages) {
    if (!p.approved_at) continue;
    const prev = packageFixedAt.get(p.candidate_id);
    if (!prev || p.approved_at < prev) packageFixedAt.set(p.candidate_id, p.approved_at);
  }
  const jobIds = candidates.map((c) => c.job_id).filter((id): id is string => !!id);
  const jobs = await readIn<{ id: string; created_by: string | null }>(
    db, 'hr_recruitment_jobs', 'id, created_by', 'id', jobIds, 'hr_recruitment_jobs',
  );
  const jobCreatorOf = new Map(jobs.map((j) => [j.id, j.created_by]));

  // --- what has already been sent ---------------------------------------------
  const sentRows = await readIn<SentNudge>(
    db, 'hr_recruitment_nudges_sent', 'id, kind, ref_key, sent_at, notification_id, recipient_ids', 'candidate_id',
    Array.from(candidateOf.keys()), 'hr_recruitment_nudges_sent',
  );
  // A claim whose send never finished is released, so the rules see it as unsent.
  const rearmed = await releaseStaleClaims(db, sentRows, now);
  const sent = indexSent(sentRows.filter((r) => !(r.id && rearmed.has(r.id))));

  // --- directory ---------------------------------------------------------------
  const stepRoleKeys = candidates.flatMap((c) =>
    (c.approval_chain ?? []).map((s) => (s.approver_role ?? '').toLowerCase()),
  );
  const namedUsers = [
    ...candidates.flatMap((c) =>
      (c.approval_chain ?? []).map((s) => s.approver_user_id).filter((id): id is string => !!id),
    ),
    ...interviews.flatMap((i) => i.panel_member_ids ?? []),
    ...jobs.map((j) => j.created_by).filter((id): id is string => !!id),
  ];
  const dir = await loadDirectory(db, {
    roleKeys: [...stepRoleKeys, HR_HEAD_ROLE_KEY],
    userIds: namedUsers,
  });

  // HR editors per college, for offers whose job has no creator who can act.
  const { editorsOf: hrEditorsOf, unavailable: hrEditorsUnavailable } = await loadHrEditors(
    db,
    candidates
      .filter((c) => c.status === 'package_fixed' || c.status === 'offer_issued')
      .map((c) => c.institution_id),
  );
  const offerCandidates = candidates.filter((c) => !hrEditorsUnavailable.has(institutionKey(c.institution_id)));

  // --- decide -------------------------------------------------------------------
  // Waits that started before go-live are never nudged (no backlog flood).
  const goLiveAt = await readGoLiveAt(db, now);
  const selected: Nudge[] = [
    ...selectApprovalNudges(candidates, sent, dir, now, goLiveAt),
    ...selectScorecardNudges(interviews, submitted, candidateOf, sent, dir, now, goLiveAt),
    ...selectOfferNudges(offerCandidates, packageFixedAt, jobCreatorOf, hrEditorsOf, sent, dir, now, goLiveAt),
  ];
  // When the HR chase ladder is on and covers R5, it owns approval chasing.
  const { nudges, handedToLadder } = await applyLadderHandoff(db, selected);

  // --- send ---------------------------------------------------------------------
  const summary: HarnessRunSummary = {
    due: zero(), sent: zero(), noRecipient: zero(), alreadyClaimed: 0, failed: 0, handedToLadder,
    rearmed: rearmed.size, hrEditorsUnavailable: hrEditorsUnavailable.size,
  };
  for (const n of nudges) {
    summary.due[n.kind] += 1;
    const outcome = await claimAndSend(db, n, n.recipients[0] ?? null);
    if (outcome === 'sent') summary.sent[n.kind] += 1;
    else if (outcome === 'no_recipient') summary.noRecipient[n.kind] += 1;
    else if (outcome === 'already_claimed') summary.alreadyClaimed += 1;
    else summary.failed += 1;
  }
  return summary;
}

// ---------------------------------------------------------------------------
// The step-ready notice (called by the approve handler, not the schedule)
// ---------------------------------------------------------------------------

/**
 * Tell the next step's approver that a candidate is now waiting on them. Called
 * after fn_decide_recruitment_candidate returns. Never throws: a failed notice must
 * not turn a recorded approval into an error for the person who approved.
 *
 * @returns how many people were told (0 when the chain finished or nobody holds the role).
 */
export async function notifyNextApprover(
  db: Db,
  candidateId: string,
  actorId: string,
): Promise<number> {
  try {
    const { data, error } = await db
      .from('hr_recruitment_candidates')
      .select(CANDIDATE_COLUMNS)
      .eq('id', candidateId)
      .maybeSingle();
    if (error || !data) return 0;
    const candidate = toCandidate(data as unknown as CandidateRow);
    const step = (candidate.approval_chain ?? [])[candidate.current_step];
    if (!step) return 0;

    const dir = await loadDirectory(db, {
      roleKeys: [step.approver_role ?? ''],
      userIds: [actorId, ...(step.approver_user_id ? [step.approver_user_id] : [])],
    });
    const actorName = dir.users.get(actorId)?.fullName ?? 'Someone';
    const notice = buildStepReadyNudge(candidate, actorId, actorName, dir);
    if (!notice || notice.recipients.length === 0) return 0;

    const result = await fanoutNotification(db, {
      title: notice.title,
      body: notice.body,
      userIds: notice.recipients,
      createdBy: actorId,
      category: 'staff',
      kind: 'work_item',
      url: notice.url,
      source: SOURCE,
      idempotencyKey: `${SOURCE}:step_ready:${candidateId}:${notice.stepIndex}`,
      metadata: { nudge_kind: 'step_ready', candidate_id: candidateId, step_index: notice.stepIndex },
    });
    return result.notified;
  } catch (err) {
    console.error('[recruitment-harness] next-approver notice failed', { candidateId, err });
    return 0;
  }
}
