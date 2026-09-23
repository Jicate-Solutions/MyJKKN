// lib/services/pde-clinical-cap-notice.ts
// ============================================================================
// The message that gets sent when a learner runs out of attempts on a clinical
// case — and the rule for deciding who reads it.
//
// THE SILENCE THIS ENDS
//   pde-coach-clinical-reasoning throws CAP_REACHED at the learner and the
//   attempt page renders CapReachedState. Both told the learner to "ask your
//   faculty". Nobody told the faculty. A Senior Learner could grant more
//   attempts at any time, but only if they happened to open the cohort screen
//   and notice. That is exactly the silent gating dead end this repo forbids.
//
//   It matters more from 2026-09-18, when the pass mark moved 60 -> 80 with the
//   cap still at 5: a higher bar over the same number of tries means more
//   learners reach the end of them.
//
// DELIVERY
//   Through fanoutNotification (lib/services/_shared/notifications/notify.ts),
//   the canonical two-write helper — one `notifications` row plus a
//   `user_notifications` link per recipient. Nothing here writes either table
//   directly; that helper's own docblock forbids it.
//
// ONE NOTICE PER CAP EVENT
//   idempotencyKey is `pde_clinical_cap_reached:<learner>:<case>:<cap>`,
//   matching the UNIQUE partial index on notifications.idempotency_key. Every
//   trigger in this change builds the same key, so the three call sites — the
//   coach's cap gate, the score route, and the attempt page — cannot between
//   them produce a second bell item however many times the learner retries or
//   reloads. The cap is part of the key so that running out AGAIN after a grant
//   is heard as the new event it is. Same guarantee shape as accreditation's
//   narrative cap-out notice.
//
// BEST EFFORT, ALWAYS
//   notifyFacultyOfCapReached never throws. A learner being blocked is already
//   a bad moment; a notification table hiccup must not also break the page they
//   are looking at or the scoring of the attempt they just submitted.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';

/** notifications.category — same bucket PDE's other learner-facing notices use. */
const NOTICE_CATEGORY = 'pde';
/** metadata.source — how this row is found again in the notifications table. */
const NOTICE_SOURCE = 'pde_clinical_cap_reached';
/** Fallback when clinical_reasoning.faculty.cap_reset_default_count is unreadable. */
const DEFAULT_CAP_RESET_COUNT = 3;
/**
 * Middle segment of clinical_reasoning.faculty.cap_reset_default_count, as the
 * 2026-05-22 seed spells it. Named here so the RPC argument below is assembled
 * from identifiers rather than carrying the path inline.
 */
const CAP_RESET_POLICY_NAMESPACE = 'faculty';
/** Key suffix the RPC expects — it prefixes `clinical_reasoning.` itself. */
const CAP_RESET_POLICY_KEY = `${CAP_RESET_POLICY_NAMESPACE}.cap_reset_default_count`;

/** How the recipient was decided — carried into metadata so routing is auditable. */
export type CapNoticeRecipientKind = 'assigned_faculty' | 'case_creator';

export interface CapReachedNoticeInput {
  learnerName: string | null;
  caseTitle: string | null;
  assessmentId: string;
  attemptsUsed: number;
  attemptsCap: number;
  /** clinical_reasoning.faculty.cap_reset_default_count — the usual grant size. */
  suggestedGrant: number;
  recipientKind: CapNoticeRecipientKind;
}

export interface CapReachedNotice {
  title: string;
  body: string;
  url: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Pure builders
// ---------------------------------------------------------------------------

/**
 * One notice per cap EVENT: per (learner, case, the cap they ran out of).
 *
 * Not per attempt and not per retry — a learner who reloads the cap screen ten
 * times is still one stuck learner, and every trigger in this change builds the
 * same key for them.
 *
 * The cap is in the key on purpose. Once a Senior Learner grants more attempts
 * the learner's effective cap rises (see pde-clinical-attempt-cap), and running
 * out of THOSE is a second, genuine cap event that deserves to be heard. Keying
 * on (learner, case) alone would have silently swallowed it and left the learner
 * stuck exactly the way this whole change exists to prevent.
 */
export function capReachedIdempotencyKey(
  learnerId: string,
  assessmentId: string,
  attemptsCap: number,
): string {
  return `pde_clinical_cap_reached:${learnerId}:${assessmentId}:${attemptsCap}`;
}

/**
 * The one screen where the Senior Learner can actually act: the cohort roster
 * for this case, which carries the "Grant additional attempts" dialog.
 */
export function facultyAttemptsDeepLink(assessmentId: string): string {
  return `/pde/faculty/cases/${assessmentId}/attempts`;
}

/** Explains, inside the notice, why THIS person is the one reading it. */
function routingSentence(kind: CapNoticeRecipientKind): string {
  return kind === 'assigned_faculty'
    ? 'You are reading this because you assigned this case to their section.'
    : 'No one has assigned this case to their section, so this went to whoever created the case.';
}

/**
 * Compose the notice. Plain words on purpose: a Senior Learner opening the bell
 * between sessions should know who is stuck, on what, and what one click fixes
 * it — without having to reconstruct any of it.
 */
export function buildCapReachedNotice(
  input: CapReachedNoticeInput & { learnerId: string },
): CapReachedNotice {
  const learner = (input.learnerName ?? '').trim() || 'A learner';
  const caseTitle = (input.caseTitle ?? '').trim() || 'a clinical case';
  const grant = Math.max(1, Math.trunc(input.suggestedGrant) || DEFAULT_CAP_RESET_COUNT);

  const title = `${learner} is out of attempts on ${caseTitle}`;

  const body = [
    `${learner} has used all ${input.attemptsUsed} of ${input.attemptsCap} attempts on ` +
      `"${caseTitle}" and cannot open the case again. They are stopped until someone ` +
      `grants them more.`,

    `Open the case roster, find them in the list and use "Grant additional attempts". ` +
      `The usual grant is ${grant}; you can set any number from 1 to 10 and the reason ` +
      `you type is kept for audit.`,

    `They were told to ask you, and they have also been told that you were sent this. ` +
      routingSentence(input.recipientKind),
  ].join('\n\n');

  return {
    title,
    body,
    url: facultyAttemptsDeepLink(input.assessmentId),
    idempotencyKey: capReachedIdempotencyKey(
      input.learnerId,
      input.assessmentId,
      input.attemptsCap,
    ),
    metadata: {
      learner_id: input.learnerId,
      assessment_id: input.assessmentId,
      attempts_used: input.attemptsUsed,
      attempts_cap: input.attemptsCap,
      suggested_grant: grant,
      recipient_kind: input.recipientKind,
    },
  };
}

// ---------------------------------------------------------------------------
// Recipient resolution
// ---------------------------------------------------------------------------

export interface ResolvedCapRecipients {
  userIds: string[];
  kind: CapNoticeRecipientKind | null;
}

/**
 * Who is "their faculty member" for this case?
 *
 * There is no instructor column anywhere on the path — vac_courses carries no
 * owner, and pde_assessments has only created_by — so this is a decided rule,
 * not a lookup of something the schema already states:
 *
 *   1. The Senior Learner who assigned THIS case to THIS learner's section
 *      (pde_case_assignments.assigned_by, matched through
 *      profiles.learner_id -> learners_profiles.section_id). They chose to put
 *      this case in front of this learner, so they are the closest thing the
 *      data has to "their" faculty.
 *   2. Otherwise the case's creator (pde_assessments.created_by). Open cases
 *      carry no assignment row at all, and this is the only other person the
 *      schema names.
 *
 * Deliberately NOT a union of the two: notifying the author of a case used by
 * forty sections every time any learner anywhere runs out would train them to
 * ignore the bell, which is the same silence with extra steps.
 *
 * Every read is best-effort. A missing table or a learner with no section
 * falls through to the next tier rather than failing.
 */
export async function resolveCapNoticeRecipients(
  supabase: SupabaseClient,
  params: { assessmentId: string; learnerId: string },
): Promise<ResolvedCapRecipients> {
  const sb = supabase as any;

  // ---- Tier 1: the Senior Learner who assigned the case to their section ----
  try {
    const { data: profile } = await sb
      .from('profiles')
      .select('learner_id')
      .eq('id', params.learnerId)
      .maybeSingle();

    if (profile?.learner_id) {
      const { data: lp } = await sb
        .from('learners_profiles')
        .select('section_id')
        .eq('id', profile.learner_id)
        .maybeSingle();

      if (lp?.section_id) {
        // UNIQUE (assessment_id, section_id) => at most one row.
        const { data: assignment } = await sb
          .from('pde_case_assignments')
          .select('assigned_by')
          .eq('assessment_id', params.assessmentId)
          .eq('section_id', lp.section_id)
          .maybeSingle();

        if (assignment?.assigned_by) {
          return { userIds: [assignment.assigned_by as string], kind: 'assigned_faculty' };
        }
      }
    }
  } catch {
    // Fall through to the creator — an unreadable assignment path must not
    // cost the learner their notice.
  }

  // ---- Tier 2: whoever created the case ----
  try {
    const { data: assessment } = await sb
      .from('pde_assessments')
      .select('created_by')
      .eq('id', params.assessmentId)
      .maybeSingle();

    if (assessment?.created_by) {
      return { userIds: [assessment.created_by as string], kind: 'case_creator' };
    }
  } catch {
    // Nothing left to try.
  }

  return { userIds: [], kind: null };
}

// ---------------------------------------------------------------------------
// The one entry point the call sites use
// ---------------------------------------------------------------------------

export interface NotifyCapReachedParams {
  learnerId: string;
  assessmentId: string;
  attemptsUsed: number;
  attemptsCap: number;
  /** Skips a lookup when the caller already has it (the coach and the page do). */
  caseTitle?: string | null;
}

export interface NotifyCapReachedResult {
  /** True when a notice provably exists — created now, or already there. */
  delivered: boolean;
  recipientKind: CapNoticeRecipientKind | null;
  /** Why nothing was sent, when nothing was. */
  reason?: 'no_recipient' | 'error';
}

/**
 * Tell the learner's Senior Learner that they are out of attempts.
 *
 * Idempotent per (learner, case) and safe to call from anywhere that discovers
 * the learner is capped. NEVER throws: callers treat the boolean as "is it true
 * that someone has been told", which is the only thing the learner-facing copy
 * is allowed to claim.
 *
 * Needs a SERVICE-ROLE client. The recipient is not the caller, and neither
 * `notifications` nor `user_notifications` permits a cross-user write from an
 * `authenticated` session.
 */
export async function notifyFacultyOfCapReached(
  supabase: SupabaseClient,
  params: NotifyCapReachedParams,
): Promise<NotifyCapReachedResult> {
  try {
    const sb = supabase as any;

    const recipients = await resolveCapNoticeRecipients(supabase, {
      assessmentId: params.assessmentId,
      learnerId: params.learnerId,
    });

    if (recipients.userIds.length === 0 || !recipients.kind) {
      // Loud, because it means a stuck learner has nobody to unstick them.
      console.error(
        '[pde-cap-notice] no Senior Learner resolved for case',
        params.assessmentId,
        '- learner',
        params.learnerId,
        'stays blocked with nobody notified',
      );
      return { delivered: false, recipientKind: null, reason: 'no_recipient' };
    }

    const [learnerName, caseTitle, suggestedGrant] = await Promise.all([
      readLearnerName(sb, params.learnerId),
      params.caseTitle !== undefined
        ? Promise.resolve(params.caseTitle)
        : readCaseTitle(sb, params.assessmentId),
      readCapResetDefaultCount(sb),
    ]);

    const notice = buildCapReachedNotice({
      learnerId: params.learnerId,
      learnerName,
      caseTitle,
      assessmentId: params.assessmentId,
      attemptsUsed: params.attemptsUsed,
      attemptsCap: params.attemptsCap,
      suggestedGrant,
      recipientKind: recipients.kind,
    });

    const outcome = await fanoutNotification(supabase, {
      title: notice.title,
      body: notice.body,
      url: notice.url,
      userIds: recipients.userIds,
      // Something a person must act on, not an announcement to read.
      kind: 'work_item',
      priority: 'high',
      category: NOTICE_CATEGORY,
      idempotencyKey: notice.idempotencyKey,
      metadata: notice.metadata,
      source: NOTICE_SOURCE,
      // created_by is NOT NULL. The recipient is the only profiles.id this
      // path is sure of — the learner is blocked, not the author of the alert.
      createdBy: recipients.userIds[0],
    });

    // 'idempotent' is a success: it proves an earlier call already told them.
    const delivered = outcome.skipped === 'idempotent' || outcome.notified > 0;
    if (!delivered) {
      console.error(
        '[pde-cap-notice] fanout delivered nothing for learner',
        params.learnerId,
        'case',
        params.assessmentId,
        outcome.skipped ?? 'no notification row returned',
      );
    }
    return { delivered, recipientKind: recipients.kind };
  } catch (e) {
    // Best effort by contract — see the module docblock.
    console.error(
      '[pde-cap-notice] failed to notify for learner',
      params.learnerId,
      'case',
      params.assessmentId,
      e instanceof Error ? e.message : e,
    );
    return { delivered: false, recipientKind: null, reason: 'error' };
  }
}

// ---------------------------------------------------------------------------
// Small reads — each returns a fallback rather than failing the notice
// ---------------------------------------------------------------------------

/**
 * profiles.full_name, keyed by profiles.id. pde_submissions.learner_id is that
 * id (see the coach service's ClinicalReasoningCoachInput), NOT
 * learners_profiles.id — and learners_profiles has no full_name column, which
 * once made PostgREST reject a whole query in the cohort route.
 */
async function readLearnerName(sb: any, learnerId: string): Promise<string | null> {
  try {
    const { data } = await sb
      .from('profiles')
      .select('full_name')
      .eq('id', learnerId)
      .maybeSingle();
    return (data?.full_name as string | null) ?? null;
  } catch {
    return null;
  }
}

async function readCaseTitle(sb: any, assessmentId: string): Promise<string | null> {
  try {
    const { data } = await sb
      .from('pde_assessments')
      .select('title')
      .eq('id', assessmentId)
      .maybeSingle();
    return (data?.title as string | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * clinical_reasoning.faculty.cap_reset_default_count — the number the policy
 * says a reset should usually be. It is seeded and editable on
 * /pde/admin/policies/clinical-reasoning; putting it in the notice is what
 * makes it reach the person doing the granting.
 */
async function readCapResetDefaultCount(sb: any): Promise<number> {
  try {
    const { data, error } = await sb.rpc('fn_get_policy_clinical_reasoning', {
      p_key: CAP_RESET_POLICY_KEY,
    });
    if (error || data === null || data === undefined) return DEFAULT_CAP_RESET_COUNT;
    const n = typeof data === 'number' ? data : Number(data);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_CAP_RESET_COUNT;
  } catch {
    return DEFAULT_CAP_RESET_COUNT;
  }
}
