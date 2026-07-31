/**
 * Server-side data for the learner profile's "360° Standing" section.
 *
 * Created: 2026-07-30
 *
 * Every read below goes through the SERVER Supabase client, so the viewer's own
 * session (and therefore RLS) decides what comes back. That is the entire access
 * story — there is no second, client-side hide:
 *
 *   - learner_risk_assessments   → admin/principal, HOD+faculty in the learner's
 *                                  own department, and the learner themselves.
 *   - learner_contribution_scores→ ADMIN-ONLY, gated on `learners.contribution.view`.
 *                                  A faculty or learner session reads zero rows
 *                                  and the ranking card simply does not render.
 *   - mv_learner_attendance_summary → a materialized view; matviews cannot carry
 *                                  RLS, so this is read only for the one learner
 *                                  whose (already permission-gated) profile page
 *                                  is open.
 */

import { createClient } from '@/lib/supabase/server';
import { getPolicyInt } from '@/lib/policies/get-policy';
import { POLICY_KEYS } from '@/lib/policies/keys';
import {
  DEFAULT_ELIGIBILITY_THRESHOLDS,
  eligibilityBucket,
  type EligibilityThresholds,
} from '@/lib/services/exam-audit/compute';
import type { ExamAuditAttendanceBucket } from '@/types/exam-audit';
import type {
  LearnerRiskAssessment,
  LearnerAttendanceSummary,
} from '@/types/learner-risk';
import type { LearnerContributionScore } from '@/types/learner-contribution';

/**
 * AI Pulse engagement funnel for one learner.
 *
 * The two halves of this funnel are keyed on DIFFERENT identifiers — verified
 * against production on 2026-07-30:
 *
 *   ai_pulse_live_attendance.profile_id      → profiles.id  (= auth.users.id)
 *   ai_pulse_domain_starter_events.profile_id→ profiles.id
 *   ai_pulse_prompt_builds.learner_id        → learners_profiles.id
 *
 * Joining `profile_id` straight to learners_profiles.id matches ZERO rows, and
 * joining `ai_pulse_prompt_builds.learner_id` to profiles.id also matches zero.
 * So the first two stages must be resolved through `profiles.learner_id`, while
 * the last stage keys off the learner id directly.
 */
/**
 * One stage of the AI agency funnel.
 *
 * Deliberately NOT a plain number. A number cannot express "I was not allowed to
 * look", and collapsing that case to 0 is how this card came to state false
 * facts: on 2026-07-31, for a learner with two starter actions on record, both a
 * super admin and a HOD were shown "0".
 *
 * The trap is that an RLS refusal is SILENT. PostgREST answers a refused read
 * with an empty set, a count of 0 and NO error — RLS filters rows, it does not
 * raise. So checking `error` is necessary but nowhere near sufficient; a zero is
 * only trustworthy once we have positively proved the source is readable.
 */
export type FunnelStage =
  /** Proven readable. `count` is a fact — a 0 here means the learner did nothing. */
  | { status: 'counted'; count: number }
  /** The read was refused outright and Postgres/PostgREST said so. */
  | { status: 'denied' }
  /** Nothing came back AND readability could not be proved. Never render as 0. */
  | { status: 'unconfirmed' }
  /** The learner has no platform login, so this stage is unmeasurable for them. */
  | { status: 'unlinked' };

export interface AiAgencyFunnel {
  /** Sessions attended live. */
  attended: FunnelStage;
  /** Domain starter actions taken (the first act of authorship). */
  starters: FunnelStage;
  /** Prompts actually assembled and submitted. */
  builds: FunnelStage;
  /** False when the learner has no linked login, so the funnel is unmeasurable. */
  hasLinkedProfile: boolean;
}

export interface LearnerExamEligibility {
  bucket: ExamAuditAttendanceBucket;
  /** Live thresholds resolved from platform_policies (falls back to 75/65). */
  thresholds: EligibilityThresholds;
}

export interface Learner360 {
  risk: LearnerRiskAssessment | null;
  contribution: LearnerContributionScore | null;
  attendance: LearnerAttendanceSummary | null;
  eligibility: LearnerExamEligibility | null;
  funnel: AiAgencyFunnel;
}

/**
 * Count rows matching an equality filter, and report honestly when the count
 * cannot be trusted.
 *
 * A zero is only returned as a fact once we have proved the viewer can read the
 * table at all. That proof is one unfiltered "show me any single row" probe —
 * which costs a LIMIT 1 and, crucially, does NOT duplicate the RLS predicate in
 * TypeScript. Re-stating the policy here would only drift from the policy.
 */
async function readStage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: 'ai_pulse_live_attendance' | 'ai_pulse_domain_starter_events' | 'ai_pulse_prompt_builds',
  column: 'profile_id' | 'learner_id',
  value: string,
): Promise<FunnelStage> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value);

  if (error) {
    console.error(`[get-learner-360] ${table} read refused:`, error);
    return { status: 'denied' };
  }
  if ((count ?? 0) > 0) {
    return { status: 'counted', count: count as number };
  }

  // Zero rows. That is either a genuine zero or a silent RLS refusal, and the
  // two are indistinguishable from the row count alone. Prove readability
  // before we are willing to print a number.
  const { data: anyRow, error: probeError } = await supabase
    .from(table)
    .select('id')
    .limit(1);

  if (probeError) {
    console.error(`[get-learner-360] ${table} visibility probe refused:`, probeError);
    return { status: 'denied' };
  }
  if ((anyRow?.length ?? 0) > 0) {
    // We can see rows in this table, so the learner genuinely has none.
    return { status: 'counted', count: 0 };
  }
  // We can see nothing at all here. Either the source is empty platform-wide or
  // our role is refused; both look identical over PostgREST, so say so rather
  // than invent a zero.
  return { status: 'unconfirmed' };
}

export async function getLearner360(learnerId: string): Promise<Learner360> {
  const supabase = await createClient();

  const [riskRes, contributionRes, attendanceRes, profileRes] = await Promise.all([
    supabase
      .from('learner_risk_assessments')
      .select('*')
      .eq('learner_id', learnerId)
      .order('assessment_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('learner_contribution_scores')
      .select('*')
      .eq('learner_id', learnerId)
      .order('assessment_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('mv_learner_attendance_summary')
      .select('*')
      .eq('learner_id', learnerId)
      .maybeSingle(),
    // Bridge to the AI Pulse profile-keyed tables.
    supabase
      .from('profiles')
      .select('id')
      .eq('learner_id', learnerId)
      .limit(1)
      .maybeSingle(),
  ]);

  // A denied or empty read is a normal outcome here (RLS), not a failure — the
  // corresponding card just does not render. Only log genuine query errors.
  if (riskRes.error) {
    console.error('[get-learner-360] risk read failed:', riskRes.error);
  }
  if (attendanceRes.error) {
    console.error('[get-learner-360] attendance read failed:', attendanceRes.error);
  }

  const risk = (riskRes.data as LearnerRiskAssessment | null) ?? null;
  const contribution = (contributionRes.data as LearnerContributionScore | null) ?? null;
  const attendance = (attendanceRes.data as LearnerAttendanceSummary | null) ?? null;
  const profileId = (profileRes.data?.id as string | undefined) ?? null;

  // Exam eligibility reuses the ONE canonical bucketing helper and the live
  // policy thresholds — the 75/65 pair was consolidated out of four hardcoded
  // copies into platform_policies on 2026-07-26, so never re-inline it here.
  let eligibility: LearnerExamEligibility | null = null;
  if (attendance && (attendance.total_classes_14d ?? 0) > 0) {
    const [eligibilityPct, condonationPct] = await Promise.all([
      getPolicyInt(
        POLICY_KEYS.EXAM_ELIGIBILITY_ATTENDANCE_PCT,
        DEFAULT_ELIGIBILITY_THRESHOLDS.eligibility,
        attendance.institution_id,
      ),
      getPolicyInt(
        POLICY_KEYS.EXAM_ELIGIBILITY_CONDONATION_FLOOR_PCT,
        DEFAULT_ELIGIBILITY_THRESHOLDS.condonation,
        attendance.institution_id,
      ),
    ]);
    const thresholds: EligibilityThresholds = {
      eligibility: eligibilityPct,
      condonation: condonationPct,
    };
    eligibility = {
      bucket: eligibilityBucket(
        {
          present: Number(attendance.total_present_14d ?? 0),
          total: Number(attendance.total_classes_14d ?? 0),
        },
        thresholds,
      ),
      thresholds,
    };
  }

  const unlinked: FunnelStage = { status: 'unlinked' };
  const [attended, starters, builds] = await Promise.all([
    profileId
      ? readStage(supabase, 'ai_pulse_live_attendance', 'profile_id', profileId)
      : Promise.resolve(unlinked),
    profileId
      ? readStage(supabase, 'ai_pulse_domain_starter_events', 'profile_id', profileId)
      : Promise.resolve(unlinked),
    readStage(supabase, 'ai_pulse_prompt_builds', 'learner_id', learnerId),
  ]);

  return {
    risk,
    contribution,
    attendance,
    eligibility,
    funnel: { attended, starters, builds, hasLinkedProfile: profileId !== null },
  };
}
