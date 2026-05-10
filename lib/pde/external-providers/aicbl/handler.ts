import { createServiceRoleClient } from "@/lib/supabase/server";
import type {
  CaseCompletedPayload,
  OsceScoredPayload,
  AtRiskPayload,
} from "./types";

// Resolves the MyJKKN learner UUID from an AICBL roll number.
// AICBL students are enrolled in JKKN dental college; their roll_number
// column in learners_profiles is "BDS-XXX" format from AICBL.
// Returns null when the student is not (yet) in MyJKKN.
async function resolveLearnerIdByRollNo(
  rollNo: string
): Promise<string | null> {
  const supabase = createServiceRoleClient();

  const { data } = await supabase
    .from("learners_profiles")
    .select("id")
    .eq("roll_number", rollNo)
    .maybeSingle();

  return data?.id ?? null;
}

// Reads the dental institution_id from platform_policies.
// Key: aicbl.institution_id — set by super_admin via /admin/policies.
// Required for quality_evidence_mappings.institution_id (NOT NULL).
async function resolveAicblInstitutionId(): Promise<string | null> {
  const supabase = createServiceRoleClient();

  const { data } = await supabase
    .from("platform_policies")
    .select("value")
    .eq("key", "aicbl.institution_id")
    .maybeSingle();

  return (data?.value as string) ?? null;
}

// case.completed → pde_engagement_events
// No direct portfolio table exists in MyJKKN's PDE. The engagement events
// table is the canonical log of "things a learner did" and already feeds
// the at-risk view. We write event_type='aicbl_case_completed' here.
export async function handleCaseCompleted(
  eventId: string,
  payload: CaseCompletedPayload
): Promise<{ pde_portfolio_id: string }> {
  const supabase = createServiceRoleClient();

  const learnerId = await resolveLearnerIdByRollNo(payload.student_roll_no);

  const { data, error } = await supabase
    .from("pde_engagement_events")
    .insert({
      // learner_id is nullable here — if the student isn't in MyJKKN yet,
      // we still record the event so it's queryable once they enrol.
      learner_id: learnerId,
      event_type: "aicbl_case_completed",
      metadata: {
        aicbl_event_id: eventId,
        session_id: payload.session_id,
        case_slug: payload.case_slug,
        case_title: payload.case_title,
        student_name: payload.student_name,
        student_roll_no: payload.student_roll_no,
        started_at: payload.started_at,
        completed_at: payload.completed_at,
        total_questions: payload.total_questions,
        questions_answered: payload.questions_answered,
        source: "aicbl",
      },
    })
    .select("id")
    .single();

  if (error) throw error;

  // aicbl_inbox_events.pde_portfolio_id reuses this column to store the
  // engagement event id — no separate portfolio table exists.
  return { pde_portfolio_id: data.id };
}

// osce.scored → pde_learner_capabilities (upsert) + quality_evidence_mappings
// Maps OSCE performance to the 'clinical_reasoning' capability slug.
// If no such capability exists yet, the insert is a no-op for capability
// linking but the evidence mapping still fires.
export async function handleOsceScored(
  eventId: string,
  payload: OsceScoredPayload
): Promise<{
  pde_capability_progress_id: string;
  evidence_mapping_id?: string;
}> {
  const supabase = createServiceRoleClient();

  const learnerId = await resolveLearnerIdByRollNo(payload.student_roll_no);

  // Resolve the capability UUID for 'clinical_reasoning'
  const { data: capability } = await supabase
    .from("pde_capabilities")
    .select("id")
    .eq("slug", "clinical_reasoning")
    .maybeSingle();

  let capabilityProgressId: string;

  if (capability && learnerId) {
    // Upsert: if the learner already has a record, only upgrade if new score
    // is higher (OSCE is a performance gate — keep the best score).
    const passed = payload.percentage >= 60;
    const newStatus = passed ? "demonstrated" : "in_progress";

    const { data: upserted, error: upsertError } = await supabase
      .from("pde_learner_capabilities")
      .upsert(
        {
          learner_id: learnerId,
          capability_id: capability.id,
          status: newStatus,
          demonstrated_at: passed ? new Date().toISOString() : null,
          demonstration_score: payload.percentage,
          demonstration_evidence: {
            aicbl_event_id: eventId,
            session_id: payload.session_id,
            case_slug: payload.case_slug,
            domain_scores: payload.domain_scores,
            total_score: payload.total_score,
            max_score: payload.max_score,
            source: "aicbl",
          },
        },
        { onConflict: "learner_id,capability_id" }
      )
      .select("id")
      .single();

    if (upsertError) throw upsertError;
    capabilityProgressId = upserted.id;
  } else {
    // Learner not in MyJKKN yet, or capability slug missing — log to
    // engagement events as a fallback record so the score isn't lost.
    const { data: fallback, error: fallbackError } = await supabase
      .from("pde_engagement_events")
      .insert({
        learner_id: learnerId,
        event_type: "aicbl_osce_scored",
        metadata: {
          aicbl_event_id: eventId,
          session_id: payload.session_id,
          case_slug: payload.case_slug,
          student_roll_no: payload.student_roll_no,
          percentage: payload.percentage,
          domain_scores: payload.domain_scores,
          source: "aicbl",
          note: "capability_slug_not_found_or_learner_unresolved",
        },
      })
      .select("id")
      .single();

    if (fallbackError) throw fallbackError;
    capabilityProgressId = fallback.id;
  }

  // DCI evidence mapping — only fires when score qualifies (≥ 60%)
  // Criterion 2.3 = clinical competency assessment in DCI inspection framework.
  // institution_id comes from platform_policies key aicbl.institution_id.
  let evidenceMappingId: string | undefined;

  if (payload.percentage >= 60) {
    const institutionId = await resolveAicblInstitutionId();

    if (institutionId) {
      const { data: evidenceRow, error: evidenceError } = await supabase
        .from("quality_evidence_mappings")
        .insert({
          source_table: "aicbl_inbox_events",
          source_id: eventId,
          institution_id: institutionId,
          body_code: "DCI",
          metric_code: "2.3",
          period_label: new Date().getFullYear().toString(),
          is_auto: true,
          metadata: {
            student_roll_no: payload.student_roll_no,
            student_name: payload.student_name,
            case_slug: payload.case_slug,
            percentage: payload.percentage,
            domain_scores: payload.domain_scores,
            session_id: payload.session_id,
            source: "aicbl",
          },
        })
        .select("id")
        .single();

      if (evidenceError) {
        // Unique constraint (source_table, source_id, body_code, metric_code)
        // fires on replay — not fatal, skip silently.
        if (evidenceError.code !== "23505") throw evidenceError;
      } else {
        evidenceMappingId = evidenceRow.id;
      }
    }
    // If institution_id is not configured in platform_policies, skip evidence
    // mapping rather than failing the event — the event is still processed.
  }

  return { pde_capability_progress_id: capabilityProgressId, evidence_mapping_id: evidenceMappingId };
}

// student.at_risk_flagged → pde_engagement_events
// MyJKKN derives at-risk from pde_at_risk_learners VIEW (built from
// pde_engagement_daily). There is no separate pde_at_risk table.
// We record the AICBL signal in engagement events for faculty visibility
// and so that /pde/engagement routes can surface it.
export async function handleAtRiskFlagged(
  eventId: string,
  payload: AtRiskPayload
): Promise<void> {
  const supabase = createServiceRoleClient();

  const learnerId = await resolveLearnerIdByRollNo(payload.student_roll_no);

  const { error } = await supabase.from("pde_engagement_events").insert({
    learner_id: learnerId,
    event_type: "aicbl_at_risk_flagged",
    metadata: {
      aicbl_event_id: eventId,
      student_name: payload.student_name,
      student_roll_no: payload.student_roll_no,
      consecutive_low_sessions: payload.consecutive_low_sessions,
      most_recent_session_id: payload.most_recent_session_id,
      weakest_domain: payload.weakest_domain,
      source: "aicbl",
    },
  });

  if (error) throw error;
}
