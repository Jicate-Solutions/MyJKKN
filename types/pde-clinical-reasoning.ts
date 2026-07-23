// types/pde-clinical-reasoning.ts
// AICBL → PDE Clinical Reasoning sprint, Agent C
// ----------------------------------------------------------------------------
// Types for the student-facing clinical case attempt experience.
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

export type ClinicalQuestionType = 'free_text_socratic' | 'mcq_warmup' | 'image_tag';

export type OsceDomain =
  | 'data_gathering'
  | 'hypothesis_generation'
  | 'management_planning'
  | 'patient_communication'
  | 'professionalism';

export interface ClinicalQuestionMetadata {
  q_number: number;
  osce_domain: OsceDomain;
  ground_truth: string;
  key_concepts: string[];
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
  metadata: ClinicalQuestionMetadata;
  expected_regions: ImageTagRegion[] | null;
}

// ============================================================================
// Case bundle returned from the server component
// ============================================================================

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
  attemptsUsed: number;
  attemptsCap: number; // policy-driven (default 5)
  bestSubmission: ClinicalSubmissionSummary | null;
  capReached: boolean;
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
