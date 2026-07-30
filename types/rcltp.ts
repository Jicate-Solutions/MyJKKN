/**
 * EKSAQ RCLTP — TypeScript data-layer types (Phase B)
 * ============================================================================
 * Reading Comprehension Learning & Teaching Proficiency module.
 *
 * GROUND TRUTH: supabase/migrations/20260614000000_rcltp_phase_a_foundation.sql
 * Every interface below is derived column-by-column from that migration.
 * Nullability rule applied verbatim: a column is `T | null` UNLESS it is a
 * PRIMARY KEY or carries `NOT NULL` in the DDL. Columns with a DEFAULT *and*
 * NOT NULL are non-null (`T`); a DEFAULT alone does not make a column non-null.
 *
 * v1 is English-only. `language` is a real column (default 'en') so other
 * languages are data, not a schema change — services default it to 'en'.
 *
 * The generated `Database` type in types/supabase.ts does NOT yet include the
 * rcltp_ tables (regenerate after Phase A lands in the typegen source). Until
 * then, services cast the Supabase client to `any` for `.from('rcltp_*')`
 * (the established MyJKKN convention — see lib/services/favorites-service.ts).
 * These hand-written types are the typed contract the rest of the app uses.
 * ============================================================================
 */

import type { Json } from '@/types/supabase';

// ---------------------------------------------------------------------------
// 1. ENUM UNION TYPES (mirror the 10 Postgres enums, exact values + order)
// ---------------------------------------------------------------------------

/** rcltp_band — the fixed proficiency ladder (cutoffs live in rcltp_band_config). */
export type RcltpBand =
  | 'emergent'
  | 'transitional'
  | 'proficient'
  | 'super_proficient';

/** rcltp_dimension — what a score/band measures. */
export type RcltpDimension =
  | 'reading'
  | 'comprehension'
  | 'overall'
  | 'vocabulary';

/** rcltp_assessment_type — baseline vs one of 6 cycles vs practice. */
export type RcltpAssessmentType = 'baseline' | 'cycle' | 'practice';

/** rcltp_assessment_status — lifecycle of one sitting. */
export type RcltpAssessmentStatus =
  | 'scheduled'
  | 'in_progress'
  | 'recorded'
  | 'queued_for_scoring'
  | 'scored'
  | 'needs_review'
  | 'published'
  | 'not_attempted';

/** rcltp_passage_source — provenance of a passage. */
export type RcltpPassageSource = 'curated' | 'ai_generated' | 'teacher_uploaded';

/** rcltp_passage_status — passage approval state. */
export type RcltpPassageStatus = 'draft' | 'approved' | 'retired';

/** rcltp_sync_status — offline-capture upload state for recordings. */
export type RcltpSyncStatus = 'local' | 'queued' | 'uploaded';

/** rcltp_scoring_status — voice-scoring state for a recording. */
export type RcltpScoringStatus =
  | 'pending'
  | 'scored'
  | 'low_confidence_review'
  | 'overridden';

/** rcltp_schedule_status — cycle window state (system proposes, teacher confirms). */
export type RcltpScheduleStatus = 'proposed' | 'confirmed' | 'open' | 'closed';

/** rcltp_practice_status — weekly adaptive-practice assignment state. */
export type RcltpPracticeStatus =
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'missed';

/** rcltp_content_level — v2 5-tier content-complexity ladder (within grade). Fixed pedagogical ladder. */
export type RcltpContentLevel =
  | 'letters'
  | 'words'
  | 'sentences'
  | 'paragraphs'
  | 'analytical';

// ---------------------------------------------------------------------------
// 2. ROW INTERFACES (one per table — what a SELECT * returns)
// ---------------------------------------------------------------------------

/** rcltp_passages — reading passage bank. institution_id NULL = global/shared library. */
export interface RcltpPassage {
  id: string;
  institution_id: string | null;
  language: string;
  grade_level: number | null;
  title: string;
  body: string;
  source: RcltpPassageSource;
  word_count: number | null;
  difficulty: number | null;
  content_level: RcltpContentLevel | null;
  status: RcltpPassageStatus;
  ai_meta: Json | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/** rcltp_part_b_questions — comprehension questions, each tagged to a competency. */
export interface RcltpPartBQuestion {
  id: string;
  passage_id: string;
  institution_id: string | null;
  competency_id: string | null;
  question_text: string;
  question_type: string;
  options: Json | null;
  correct_answer: string | null;
  max_score: number;
  order_index: number;
  is_active: boolean;
  // v2 review-state (reuses the passage source/status enums): AI-generated
  // questions land source='ai_generated', status='draft'; a teacher approves.
  source: RcltpPassageSource;
  status: RcltpPassageStatus;
  ai_meta: Json | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// ---------------------------------------------------------------------------
// 2a. AI-generated question metadata — the typed shape of
//     rcltp_part_b_questions.ai_meta for an AI-drafted question. WRITTEN by
//     lib/services/rcltp/question-generation-service.ts (2-pass generate +
//     answer-key check) and RENDERED by the Part-B review console. The row's
//     `ai_meta` column stays `Json | null` (manual questions have null / an
//     arbitrary shape), so the console casts to this when a question is
//     source='ai_generated'. Every field is optional so a partial/legacy
//     ai_meta degrades gracefully in the UI.
// ---------------------------------------------------------------------------

/** Marzano's New Taxonomy level a question targets (locked decision #2). */
export type RcltpMarzanoLevel =
  | 'retrieval'
  | 'comprehension'
  | 'analysis'
  | 'knowledge_utilization';

/** Second-pass answer-key check verdict (locked decision #5). */
export type RcltpKeyCheckVerdict = 'agree' | 'disagree' | 'ambiguous' | 'unchecked';

/** One question's answer-key check result. */
export interface RcltpQuestionKeyCheck {
  index: number;
  verdict: RcltpKeyCheckVerdict;
  note?: string;
}

/**
 * The AI's frozen original — kept verbatim so a Senior Learner's edit is a
 * measurable "what changed" signal, the self-improving-loop input (decision #8).
 */
export interface RcltpQuestionAiDraft {
  question_text: string;
  question_type: string;
  options: string[] | null;
  correct_answer: string;
}

/** Parsed shape of rcltp_part_b_questions.ai_meta for an AI-generated question. */
export interface RcltpQuestionAiMeta {
  marzano_level?: RcltpMarzanoLevel;
  is_stretch?: boolean;
  rationale?: string;
  checker?: RcltpQuestionKeyCheck;
  ai_draft?: RcltpQuestionAiDraft;
  generated_by_model?: string;
  coverage_note?: string;
  generated_via?: string;
}

// ---------------------------------------------------------------------------
// 2b. Review-queue priority + weekly spot-check (locked decisions #5 and #7).
//     Both are served by SECURITY DEFINER RPCs; see migration
//     20260725080000_rcltp_batch_approve_and_spotcheck.sql.
// ---------------------------------------------------------------------------

/**
 * One passage's place in the "most-needed-first" review queue, from
 * fn_rcltp_passage_review_priority. `priority_rank` is computed server-side so
 * the ordering rule lives in exactly one place — the console sorts by it and
 * never re-implements the comparator.
 *
 * next_scheduled_at is null until assessment scheduling is in use; the ranking
 * then falls through to at_risk_count, which is the live signal today.
 */
export interface RcltpPassageReviewPriority {
  passage_id: string;
  draft_count: number;
  ai_agreed_count: number;
  attention_count: number;
  at_risk_count: number;
  next_scheduled_at: string | null;
  priority_rank: number;
}

/** Outcome a Senior Learner records against a sampled item. */
export type RcltpSpotcheckStatus = 'pending' | 'confirmed' | 'flagged';

/** One item in this week's anti-rubber-stamp sample (fn_rcltp_spotcheck_week). */
export interface RcltpReviewSpotcheck {
  id: string;
  question_id: string;
  question_text: string;
  correct_answer: string | null;
  passage_id: string | null;
  passage_title: string | null;
  week_start: string;
  status: RcltpSpotcheckStatus;
  note: string | null;
  resolved_at: string | null;
}

/** rcltp_assessments — one assessment sitting (Part A voice + Part B comprehension). */
export interface RcltpAssessment {
  id: string;
  institution_id: string;
  learner_id: string;
  academic_year_id: string | null;
  section_id: string | null;
  grade_level: number | null;
  language: string;
  assessment_type: RcltpAssessmentType;
  cycle_no: number | null;
  passage_id: string | null;
  status: RcltpAssessmentStatus;
  proctored: boolean;
  administered_by: string | null;
  attempt_no: number;
  is_official: boolean;
  scheduled_start: string | null;
  scheduled_end: string | null;
  opened_at: string | null;
  submitted_at: string | null;
  scored_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/**
 * rcltp_part_a_recordings — Read & Record voice + scores.
 * expression_score / modulation_score are nullable until prosody scoring lands.
 * audio_path is a Storage path, NOT a URL.
 */
export interface RcltpPartARecording {
  id: string;
  assessment_id: string;
  institution_id: string;
  audio_path: string | null;
  sync_status: RcltpSyncStatus;
  scoring_status: RcltpScoringStatus;
  engine: string | null;
  engine_response: Json | null;
  accuracy_score: number | null;
  fluency_score: number | null;
  completeness_score: number | null;
  pron_score: number | null;
  wpm: number | null;
  expression_score: number | null;
  modulation_score: number | null;
  chunking_flags: Json | null;
  confidence: number | null;
  reviewed_by: string | null;
  review_status: string | null;
  purge_after: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/** rcltp_part_b_responses — a learner's answer to one Part B question. */
export interface RcltpPartBResponse {
  id: string;
  assessment_id: string;
  question_id: string;
  institution_id: string;
  competency_id: string | null;
  response: string | null;
  is_correct: boolean | null;
  score: number | null;
  auto_graded: boolean;
  created_at: string;
  updated_at: string;
}

/** rcltp_assessment_results — composite per-sitting result (the 67→85 prev-vs-current). */
export interface RcltpAssessmentResult {
  id: string;
  assessment_id: string;
  institution_id: string;
  learner_id: string;
  reading_band: RcltpBand | null;
  comprehension_band: RcltpBand | null;
  overall_band: RcltpBand | null;
  reading_score: number | null;
  comprehension_score: number | null;
  overall_score: number | null;
  previous_overall_score: number | null;
  created_at: string;
  updated_at: string;
}

/** rcltp_band_config — per-tenant band score cutoffs (CRUDable). */
export interface RcltpBandConfig {
  id: string;
  institution_id: string;
  dimension: RcltpDimension;
  band: RcltpBand;
  min_score: number;
  max_score: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/** rcltp_student_journey — current band per dimension + progression log (UNIQUE learner+dimension). */
export interface RcltpStudentJourney {
  id: string;
  institution_id: string;
  learner_id: string;
  dimension: RcltpDimension;
  current_band: RcltpBand | null;
  /** v2 (E3): continuously-nudged SERVED content level — distinct from current_band (official, cycle-changed). */
  served_content_level: RcltpContentLevel | null;
  since: string | null;
  exercises_completed: number;
  progression_log: Json | null;
  created_at: string;
  updated_at: string;
}

/** rcltp_practice_assignments — weekly adaptive practice (5/3/1 by band). */
export interface RcltpPracticeAssignment {
  id: string;
  institution_id: string;
  learner_id: string;
  week_of: string;
  exercises_assigned: number;
  exercises_completed: number;
  status: RcltpPracticeStatus;
  created_at: string;
  updated_at: string;
}

/** rcltp_passage_exposure — no-repeat ledger (UNIQUE learner+passage). seen_at only; no updated_at. */
export interface RcltpPassageExposure {
  id: string;
  learner_id: string;
  institution_id: string;
  passage_id: string;
  assessment_id: string | null;
  seen_at: string;
}

/** rcltp_vbb_words — VBB vocabulary list. institution_id NULL = global/shared library. */
export interface RcltpVbbWord {
  id: string;
  institution_id: string | null;
  language: string;
  word: string;
  stage: string | null;
  difficulty_rank: number | null;
  definition: string | null;
  context_example: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/** rcltp_vbb_progress — per-student VBB progress per week/stage. */
export interface RcltpVbbProgress {
  id: string;
  institution_id: string;
  learner_id: string;
  stage: string | null;
  score: number | null;
  completion_rate: number | null;
  week_of: string | null;
  created_at: string;
  updated_at: string;
}

/** rcltp_assessment_schedule — 6 cycles/year (UNIQUE institution+year+cycle). */
export interface RcltpAssessmentSchedule {
  id: string;
  institution_id: string;
  academic_year_id: string;
  cycle_no: number;
  window_start: string | null;
  window_end: string | null;
  status: RcltpScheduleStatus;
  proposed_by_system: boolean;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// 2b. v2 "Adaptive Reading" — gamification rows (D5/E2). Earned badges + streaks
//     are SERVER-AWARDED ONLY (fn_rcltp_award_badge / fn_rcltp_update_streak);
//     there are no client write helpers for them (see gamification-service).
// ---------------------------------------------------------------------------

/** rcltp_badges — badge catalog. institution_id NULL = global/shared; admin-CRUDable. */
export interface RcltpBadge {
  id: string;
  institution_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  category: string | null;
  points: number;
  criteria: Json | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/** rcltp_learner_badges — earned badges (UNIQUE learner+badge). Server-awarded only. */
export interface RcltpLearnerBadge {
  id: string;
  learner_id: string;
  badge_id: string;
  institution_id: string | null;
  earned_at: string;
  evidence: string | null;
}

/** rcltp_streaks — per-learner streak (UNIQUE learner+streak_type). Server-updated only. */
export interface RcltpStreak {
  id: string;
  learner_id: string;
  institution_id: string | null;
  streak_type: string;
  current_streak: number;
  longest_streak: number;
  last_logged_date: string | null;
  total_days_logged: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// 3. PAGINATION + LIST RESPONSE (matches MyJKKN convention: {data, metadata})
// ---------------------------------------------------------------------------

export interface RcltpPaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface RcltpListResponse<T> {
  data: T[];
  metadata: RcltpPaginationMetadata;
}

/** Common pagination inputs every filter type extends. */
export interface RcltpPaginationFilters {
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// 4. FILTER TYPES (read-side query inputs, per domain)
// ---------------------------------------------------------------------------

export interface RcltpPassageFilters extends RcltpPaginationFilters {
  /** When set, returns this institution's rows AND global (institution_id NULL) rows. */
  institution_id?: string;
  language?: string;
  grade_level?: number;
  content_level?: RcltpContentLevel;
  status?: RcltpPassageStatus;
  source?: RcltpPassageSource;
  is_active?: boolean;
  search?: string;
}

export interface RcltpPartBQuestionFilters extends RcltpPaginationFilters {
  passage_id?: string;
  institution_id?: string;
  competency_id?: string;
  is_active?: boolean;
  status?: RcltpPassageStatus;
  source?: RcltpPassageSource;
}

export interface RcltpAssessmentFilters extends RcltpPaginationFilters {
  institution_id?: string;
  learner_id?: string;
  academic_year_id?: string;
  section_id?: string;
  status?: RcltpAssessmentStatus;
  assessment_type?: RcltpAssessmentType;
  cycle_no?: number;
  is_official?: boolean;
}

export interface RcltpPartARecordingFilters extends RcltpPaginationFilters {
  assessment_id?: string;
  institution_id?: string;
  scoring_status?: RcltpScoringStatus;
  sync_status?: RcltpSyncStatus;
}

export interface RcltpPartBResponseFilters extends RcltpPaginationFilters {
  assessment_id?: string;
  question_id?: string;
  institution_id?: string;
}

export interface RcltpResultFilters extends RcltpPaginationFilters {
  institution_id?: string;
  learner_id?: string;
  assessment_id?: string;
}

export interface RcltpBandConfigFilters extends RcltpPaginationFilters {
  institution_id?: string;
  dimension?: RcltpDimension;
  band?: RcltpBand;
  is_active?: boolean;
}

export interface RcltpStudentJourneyFilters extends RcltpPaginationFilters {
  institution_id?: string;
  learner_id?: string;
  dimension?: RcltpDimension;
}

export interface RcltpPracticeAssignmentFilters extends RcltpPaginationFilters {
  institution_id?: string;
  learner_id?: string;
  week_of?: string;
  status?: RcltpPracticeStatus;
}

export interface RcltpPassageExposureFilters extends RcltpPaginationFilters {
  institution_id?: string;
  learner_id?: string;
  passage_id?: string;
}

export interface RcltpVbbWordFilters extends RcltpPaginationFilters {
  /** When set, returns this institution's rows AND global (institution_id NULL) rows. */
  institution_id?: string;
  language?: string;
  stage?: string;
  is_active?: boolean;
  search?: string;
}

export interface RcltpVbbProgressFilters extends RcltpPaginationFilters {
  institution_id?: string;
  learner_id?: string;
  stage?: string;
  week_of?: string;
}

export interface RcltpScheduleFilters extends RcltpPaginationFilters {
  institution_id?: string;
  academic_year_id?: string;
  cycle_no?: number;
  status?: RcltpScheduleStatus;
}

// ---------------------------------------------------------------------------
// 5. WRITE DTOs — ONLY for the staff/admin client-write surface.
//    (Per migration §6 RLS: students have NO write policy anywhere. Every
//    student-affecting write goes through a server-side service-role API
//    route, so there are deliberately NO student-write DTOs here.)
// ---------------------------------------------------------------------------

// 5.1 Passage bank (staff with rcltp.config.manage; global rows = admin only)
export interface CreateRcltpPassageDto {
  institution_id?: string | null;
  language?: string;
  grade_level?: number | null;
  title: string;
  body: string;
  source?: RcltpPassageSource;
  word_count?: number | null;
  difficulty?: number | null;
  content_level?: RcltpContentLevel | null;
  status?: RcltpPassageStatus;
  ai_meta?: Json | null;
  is_active?: boolean;
  // Who added the passage. Director decision 7 (2026-07-28) tells THIS person
  // when their material is in a language the overnight helper cannot draft for,
  // so the column has to be populated at insert — it has no DB default and no
  // trigger fills it. Optional here because RcltpPassagesService.createPassage
  // supplies the signed-in user when the caller does not; a caller that has no
  // session (or a server-side importer) leaves it null and the notice correctly
  // falls back to the school head.
  created_by?: string | null;
}
export type UpdateRcltpPassageDto = Partial<CreateRcltpPassageDto>;

// 5.2 Comprehension questions (staff with rcltp.config.manage)
export interface CreateRcltpPartBQuestionDto {
  passage_id: string;
  institution_id?: string | null;
  competency_id?: string | null;
  question_text: string;
  question_type: string;
  options?: Json | null;
  correct_answer?: string | null;
  max_score?: number;
  order_index?: number;
  is_active?: boolean;
  // C1 fix (content-safety): the AI-generate path MUST be able to set draft +
  // ai_generated so a generated question does NOT inherit the table's `status`
  // DEFAULT 'approved' and silently skip human review. Manual authoring may omit
  // these (defaults: source 'curated', status 'approved').
  source?: RcltpPassageSource;
  status?: RcltpPassageStatus;
  ai_meta?: Json | null;
}
export type UpdateRcltpPartBQuestionDto = Partial<CreateRcltpPartBQuestionDto>;

// 5.3 Band cutoffs (staff with rcltp.config.manage)
export interface CreateRcltpBandConfigDto {
  institution_id: string;
  dimension: RcltpDimension;
  band: RcltpBand;
  min_score: number;
  max_score: number;
  is_system?: boolean;
  is_active?: boolean;
}
export type UpdateRcltpBandConfigDto = Partial<
  Omit<CreateRcltpBandConfigDto, 'institution_id'>
>;

// 5.4 VBB words (staff with rcltp.config.manage; global rows = admin only)
export interface CreateRcltpVbbWordDto {
  institution_id?: string | null;
  language?: string;
  word: string;
  stage?: string | null;
  difficulty_rank?: number | null;
  definition?: string | null;
  context_example?: string | null;
  is_active?: boolean;
}
export type UpdateRcltpVbbWordDto = Partial<CreateRcltpVbbWordDto>;

// 5.5 Assessment created by staff ("open assessment for class" — rcltp.assessment.manage).
//     Student start/submit transitions are server-side only (see service stubs).
export interface CreateRcltpAssessmentDto {
  institution_id: string;
  learner_id: string;
  academic_year_id?: string | null;
  section_id?: string | null;
  grade_level?: number | null;
  language?: string;
  assessment_type?: RcltpAssessmentType;
  cycle_no?: number | null;
  passage_id?: string | null;
  status?: RcltpAssessmentStatus;
  proctored?: boolean;
  administered_by?: string | null;
}
export type UpdateRcltpAssessmentDto = Partial<
  Omit<CreateRcltpAssessmentDto, 'institution_id' | 'learner_id'>
>;

// 5.6 Recording review (reviewer with rcltp.review may UPDATE review fields, not INSERT).
export interface UpdateRcltpRecordingReviewDto {
  scoring_status?: RcltpScoringStatus;
  review_status?: string | null;
  reviewed_by?: string | null;
  accuracy_score?: number | null;
  fluency_score?: number | null;
  completeness_score?: number | null;
  pron_score?: number | null;
  wpm?: number | null;
  expression_score?: number | null;
  modulation_score?: number | null;
  chunking_flags?: Json | null;
  confidence?: number | null;
}

// 5.7 Assessment schedule (staff with rcltp.assessment.manage propose/confirm windows).
export interface CreateRcltpScheduleDto {
  institution_id: string;
  academic_year_id: string;
  cycle_no: number;
  window_start?: string | null;
  window_end?: string | null;
  status?: RcltpScheduleStatus;
  proposed_by_system?: boolean;
  confirmed_by?: string | null;
}
export type UpdateRcltpScheduleDto = Partial<
  Omit<CreateRcltpScheduleDto, 'institution_id' | 'academic_year_id' | 'cycle_no'>
>;

// ---------------------------------------------------------------------------
// 6. v2 "Adaptive Reading" — filters + write DTOs
//    (Earned-badge/streak rows have NO write DTO — server-awarded only.)
// ---------------------------------------------------------------------------

export interface RcltpBadgeFilters extends RcltpPaginationFilters {
  /** When set, returns this institution's rows AND global (institution_id NULL) rows. */
  institution_id?: string;
  category?: string;
  is_active?: boolean;
  search?: string;
}

export interface RcltpLearnerBadgeFilters extends RcltpPaginationFilters {
  institution_id?: string;
  learner_id?: string;
  badge_id?: string;
}

export interface RcltpStreakFilters extends RcltpPaginationFilters {
  institution_id?: string;
  learner_id?: string;
  streak_type?: string;
}

// 6.1 Badge catalog (staff with rcltp.reward.config; global rows = admin only)
export interface CreateRcltpBadgeDto {
  institution_id?: string | null;
  slug: string;
  name: string;
  description?: string | null;
  icon_url?: string | null;
  category?: string | null;
  points?: number;
  criteria?: Json | null;
  is_active?: boolean;
}
export type UpdateRcltpBadgeDto = Partial<Omit<CreateRcltpBadgeDto, 'slug'>>;

// 6.2 Question review (D6): staff with rcltp.question.approve promotes an
//     AI-generated question (status 'draft' -> 'approved'/'retired') + stamps reviewer.
export interface UpdateRcltpQuestionReviewDto {
  status?: RcltpPassageStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  ai_meta?: Json | null;
}

// ---------------------------------------------------------------------------
// 7. SCHOOL-HEAD (PRINCIPAL) DASHBOARD — fn_rcltp_school_dashboard RPC (Phase 4e)
//    Read-only aggregate for /rcltp/principal. Every array below is EMPTY until
//    EKSAQ scoring produces rcltp_assessment_results rows. `provisional` is
//    always `true` today (no validated composite-score formula exists yet) —
//    callers MUST render a "Provisional — pending EKSAQ validation" banner
//    whenever any array is non-empty. Shape is hand-written (not generated)
//    per the file-header convention above: the RPC is not in types/supabase.ts.
// ---------------------------------------------------------------------------

/** One row of `bandDistribution` — learner count per proficiency band. */
export interface RcltpBandDistRow {
  band: RcltpBand;
  count: number;
}

/** One row of `cycleProgress` — average overall score per assessment cycle. */
export interface RcltpCycleRow {
  cycle: number;
  avgOverall: number;
  count: number;
}

/** One row of `atRisk` — a learner flagged for additional reading support. */
export interface RcltpAtRiskRow {
  learnerId: string;
  name: string;
  roll: string;
  band: RcltpBand;
  overall: number;
  reason: 'low_band' | 'regression' | 'other';
}

/** One row of `sectionComparison` — average overall score per class/section. */
export interface RcltpSectionRow {
  sectionId: string;
  section: string;
  grade: number;
  avgOverall: number;
  count: number;
}

/** Full return shape of `fn_rcltp_school_dashboard(p_institution_id)`. */
export interface RcltpSchoolDashboard {
  provisional: boolean;
  totals: {
    scoredSittings: number;
    learners: number;
  };
  bandDistribution: RcltpBandDistRow[];
  cycleProgress: RcltpCycleRow[];
  atRisk: RcltpAtRiskRow[];
  sectionComparison: RcltpSectionRow[];
}

// ---------------------------------------------------------------------------
// Remedial-plan draft loop — the AI-drafted, Senior-Learner-approved remedial
// reading plan for an at-risk learner (shared by the server generator and the
// client review UI; keep the shape single-sourced here).
// ---------------------------------------------------------------------------

/** One focus area — a comprehension skill to strengthen, tied to the learner's data. */
export interface RcltpRemedialFocusArea {
  area: string;
  why: string;
}

/** One remedial activity a Senior Learner runs one-on-one with the learner. */
export interface RcltpRemedialActivity {
  title: string;
  detail: string;
  cadence: string;
}

/** The plan content stored in `ai_draft` (and, once edited, `edited_content`). */
export interface RcltpRemedialPlanDraft {
  summary: string;
  focus_areas: RcltpRemedialFocusArea[];
  activities: RcltpRemedialActivity[];
  target_band: string;
}

export type RcltpRemedialPlanStatus = 'queued' | 'draft' | 'approved' | 'archived';

/** One `rcltp_remedial_plans` row. */
export interface RcltpRemedialPlan {
  id: string;
  institution_id: string;
  learner_id: string;
  assessment_id: string | null;
  cycle_no: number | null;
  trigger_reason: 'low_band' | 'regression';
  band_at_trigger: string | null;
  overall_at_trigger: number | null;
  ai_draft: RcltpRemedialPlanDraft | null;
  ai_model: string | null;
  ai_generated_at: string | null;
  edited_content: RcltpRemedialPlanDraft | null;
  status: RcltpRemedialPlanStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}
