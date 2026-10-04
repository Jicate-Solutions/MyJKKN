// types/pde-clinical-reasoning.ts
// AICBL → PDE Clinical Reasoning sprint, Agent C
// ----------------------------------------------------------------------------
// Types for the learner-facing clinical case attempt experience.
// Follows the spec at specs/aicbl-as-pde-clinical-reasoning-2026-05-21.md.
//
// Spec-vs-reality notes:
//   - pde_assessments has NO `slug` column. We treat the assessment `id`
//     (UUID) as the URL identifier — passed through as `caseSlug` in the
//     route segment. Backwards-compatible if `slug` is added later.
//   - vac_lessons.case_scenario carries the patient JSON (per A5 migration).
//   - pde_assessment_questions.metadata carries clinical Q metadata
//     (ground_truth, key_concepts, osce_domain, q_number) per A3 migration.
//   - pde_submissions has NO `metadata` column. We persist AI feedback +
//     domain scores inside `evidence_urls` (JSONB) under a documented shape,
//     keeping schema unchanged.

// ============================================================================
// Patient scenario (vac_lessons.case_scenario JSONB)
// ============================================================================

export interface ClinicalCaseHabitHistory {
  type: string;
  duration_years: number;
  frequency: string;
  quantity: string;
  current_status: string;
}

export interface ClinicalCaseScenario {
  patient_name: string;
  age: number;
  gender: string;
  occupation?: string;
  chief_complaint: string;
  hopi: string;
  medical_history: string;
  habit_history: ClinicalCaseHabitHistory;
  additional_clinical_details: string;
  image_url?: string;
}

// ============================================================================
// Question variants (pde_assessment_questions)
// ============================================================================

export type ClinicalQuestionType =
  | 'free_text_socratic'
  | 'mcq_warmup'
  | 'image_tag'
  | 'multi_select'
  | 'matching'
  | 'sequencing';

export type OsceDomain =
  | 'data_gathering'
  | 'hypothesis_generation'
  | 'management_planning'
  | 'patient_communication'
  | 'professionalism';

/** One left-hand item of a `matching` question, with its own option list. */
export interface ClinicalMatchPair {
  id: string;
  left: string;
  options: string[];
}

/** One step of a `sequencing` question, as displayed (not in answer order). */
export interface ClinicalSequenceItem {
  id: string;
  text: string;
}

export interface ClinicalQuestionMetadata {
  q_number: number;
  osce_domain: OsceDomain;
  /** Absent on the wire during an attempt — fn_pde_get_case_questions strips it. */
  ground_truth: string;
  /** Absent on the wire during an attempt — fn_pde_get_case_questions strips it. */
  key_concepts: string[];
  /**
   * `multi_select` only. Also stripped during an attempt: it names the tempting
   * wrong option, so it would give the set away. Released at review.
   */
  exclusion_rationale?: string;
  /** `matching` only. Ships to the browser WITHOUT the correct option. */
  match_pairs?: ClinicalMatchPair[];
  /** `sequencing` only. Ships in display order; the true order is the key. */
  sequence_items?: ClinicalSequenceItem[];
}

export interface MCQWarmupOption {
  id: string;
  text: string;
  is_correct?: boolean; // omitted on the wire; resolved server-side
}

export interface ImageTagRegion {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tolerance_px: number;
}

export interface ClinicalQuestion {
  id: string;
  assessment_id: string;
  question_type: ClinicalQuestionType;
  question_text: string;
  question_media_url: string | null;
  options: MCQWarmupOption[] | null;
  correct_answer: string | null;
  order_index: number;
  /** Owning stage, or null on a flat (unstaged) case. */
  stage_id: string | null;
  metadata: ClinicalQuestionMetadata;
  expected_regions: ImageTagRegion[] | null;
}

// ============================================================================
// Stages (fn_pde_get_case_stages)
// ============================================================================

/**
 * A stage as the LEARNER sees it.
 *
 * While `is_unlocked` is false, `title`, `scenario_text` and `image_url` all
 * come back null. That is not an oversight in the payload — the database
 * withholds them. A later stage's narrative states the earlier stage's answer
 * ("The patient is confirmed to have Pemphigus Vulgaris"), and even a title can
 * give it away, so nothing but the position is released until the gate opens.
 */
export interface ClinicalStageView {
  id: string;
  stage_order: number;
  is_unlocked: boolean;
  is_passed: boolean;
  score_pct: number | null;
  threshold_pct: number;
  title: string | null;
  scenario_text: string | null;
  image_url: string | null;
}

/** What fn_pde_submit_stage returns after marking a stage server-side. */
export interface ClinicalStageResult {
  stage_id: string;
  attempt_number: number;
  score_pct: number | null;
  threshold_pct: number;
  passed: boolean;
  scored_count: number;
  question_count: number;
  has_next_stage: boolean;
  next_unlocked: boolean;
}

// ============================================================================
// Case bundle returned from the server component
// ============================================================================

/**
 * The clinical-case pass mark when the policy row cannot be read: 80 since
 * 2026-09-18 (Director) — see
 * supabase/migrations/20260918140400_clinical_reasoning_pass_mark_80.sql.
 *
 * It lives in this types module because BOTH sides need the same number and
 * this file imports nothing server-only: the scoring route falls back to it
 * when the RPC fails, and the attempt page's client hands it to the provisional
 * `passed` stamp when the bundle carries no resolved value. Defining it twice
 * is how the old literal 60 survived in the client after the server moved on.
 */
export const DEFAULT_CLINICAL_PASSING_THRESHOLD_PCT = 80;

export interface ClinicalCaseBundle {
  assessment: {
    id: string;
    title: string;
    description: string | null;
    course_id: string;
    lesson_id: string | null;
    version: number;
    time_limit_minutes: number | null;
  };
  scenario: ClinicalCaseScenario;
  questions: ClinicalQuestion[];
  /** Empty array = flat case = pre-stages behaviour, unchanged. */
  stages: ClinicalStageView[];
  attemptsUsed: number;
  attemptsCap: number; // policy-driven (default 5)
  bestSubmission: ClinicalSubmissionSummary | null;
  capReached: boolean;
  /**
   * True only when a notice about this learner being capped provably exists for
   * their Senior Learner. Optional, and absence means no, on purpose: the cap
   * screen may only claim someone was told when that is confirmed, so anything
   * other than `true` falls back to the ask-them wording.
   */
  facultyNotified?: boolean;
  /**
   * clinical_reasoning.scoring.passing_threshold_pct, resolved server-side and
   * handed to the client so the provisional `passed` stamp on a new attempt is
   * decided by the policy rather than by a literal. Optional only so older
   * bundles still type-check; absent falls back to
   * DEFAULT_CLINICAL_PASSING_THRESHOLD_PCT, never to the old 60.
   */
  passingThresholdPct?: number;
  learnerProfileId: string; // profiles.id (auth.uid())
}

export interface ClinicalSubmissionSummary {
  id: string;
  attempt_number: number;
  completed_at: string | null;
  auto_score: number | null;
  final_score: number | null;
  passed: boolean | null;
}

// ============================================================================
// Click point for image_tag answers
// ============================================================================

export interface ImageTagClickPoint {
  x: number;
  y: number;
  /** natural image width at the time of click — for resolution-independent scoring */
  imgWidth: number;
  imgHeight: number;
}

// ============================================================================
// Coach API contract — POST /api/pde/coach
// ----------------------------------------------------------------------------
// Spec deviation, locked 2026-05-23 against jicate/main reality:
//   Spec line 300 said body = { learnerId, assessmentId, questionId, answer }.
//   Reality: Agent B kept the existing route signature
//     { learnerId, contextType, contextId, message }
//   and intends to extend PDEService.sendCoachMessage for
//   contextType==='clinical_case' (lib/services/pde-coach-clinical-reasoning.ts
//   exposes generateClinicalReasoningFeedback({ learnerId, assessmentId,
//   questionId, answer })).
//
//   To stay compatible with both the existing route (`message` carries the
//   answer) and the new service (needs questionId), we send a SUPERSET body:
//     { learnerId, contextType:'clinical_case', contextId: <assessmentId>,
//       message: <answer>, questionId: <pde_assessment_questions.id> }
//   Agent B's route extension can pluck questionId when present.
//   Tagged [blocked-by-B] until the route reads questionId.
// ============================================================================

export interface CoachRequestBody {
  learnerId: string;
  contextType: 'clinical_case';
  contextId: string; // assessmentId
  message: string;   // answer text
  questionId: string;
}

export interface CoachResponseBody {
  feedback?: string; // new clinical-case shape (Agent B target)
  data?: {
    // legacy/placeholder shape — accepted as fallback so dev still flows
    userMessage?: { content?: string };
    coachReply?: { content?: string };
  };
  conversation_id?: string;
  tokens_used?: number;
}

export interface CoachErrorBody {
  error: string;
  retryable?: boolean;
  code?: 'CAP_REACHED' | 'AI_FAILURE' | 'INVALID_INPUT' | 'NOT_FOUND' | 'INTERNAL';
}

// ============================================================================
// Submission answer envelope (one row per question, stored in pde_submissions.answers JSONB)
// ============================================================================

export interface ClinicalAnswerEnvelope {
  question_id: string;
  question_type: ClinicalQuestionType;
  answer_text?: string; // free_text_socratic
  selected_option_id?: string; // mcq_warmup
  is_correct?: boolean; // mcq_warmup auto-graded
  click_point?: ImageTagClickPoint; // image_tag
  coach_feedback?: string; // free_text_socratic — Socratic reply
  region_score?: number; // image_tag — 0..100 from /api/pde/clinical-reasoning/score
  /** multi_select — the option ids the learner ticked. */
  selected_option_ids?: string[];
  /** matching — { [match_pair.id]: chosen option text }. */
  match_selections?: Record<string, string>;
  /** sequencing — item ids in the order the learner arranged them. */
  sequence_order?: string[];
  /**
   * multi_select / matching / sequencing — 0..100 from fn_pde_mark_clinical_answer.
   * Partial credit, so these are NOT simply right or wrong.
   */
  partial_score?: number;
  submitted_at: string; // ISO
}

// ============================================================================
// pde_submissions.evidence_urls envelope (we treat it as a structured payload)
// ============================================================================

export interface ClinicalEvidenceEnvelope {
  type: 'clinical_case_attempt';
  osce_score?: number | null;
  domain_scores?: Partial<Record<OsceDomain, number>>;
  coach_messages?: Array<{
    question_id: string;
    feedback: string;
    timestamp: string;
  }>;
}
