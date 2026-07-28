// types/pde.ts
// PDE Phase 1: Assessment Engine + Engagement Tracking + Certificates
// Follows pattern from types/vac.ts

// ============================================
// Assessment Types
// ============================================

export type AssessmentType = 'quiz' | 'demonstration' | 'peer_review' | 'portfolio_entry';
export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'fill_blank' | 'matching' | 'ordering' | 'demonstration_prompt' | 'reflection';
export type FinksDimension = 'foundational_knowledge' | 'application' | 'integration' | 'human_dimension' | 'caring' | 'learning_how_to_learn';
export type Difficulty = 'foundation' | 'standard' | 'advanced';

export interface MCQOption {
  text: string;
  is_correct: boolean;
  feedback?: string;
}

export interface PDEAssessment {
  id: string;
  lesson_id: string | null;
  course_id: string;
  title: string;
  description: string | null;
  assessment_type: AssessmentType;
  time_limit_minutes: number | null;
  max_attempts: number;
  pass_threshold: number;
  shuffle_questions: boolean;
  show_correct_after: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PDEAssessmentQuestion {
  id: string;
  assessment_id: string;
  question_type: QuestionType;
  question_text: string;
  question_media_url: string | null;
  options: MCQOption[] | null;
  correct_answer: string | null;
  points: number;
  explanation: string | null;
  finks_dimension: FinksDimension | null;
  difficulty: Difficulty | null;
  order_index: number;
  created_at: string;
}

export interface SubmissionAnswer {
  question_id: string;
  selected_answer: string;
  is_correct: boolean;
  points_earned: number;
}

export interface PeerScore {
  reviewer_id: string;
  rubric_scores: Record<string, number>;
  feedback: string;
  timestamp: string;
}

export interface PDESubmission {
  id: string;
  assessment_id: string;
  learner_id: string;
  attempt_number: number;
  started_at: string;
  completed_at: string | null;
  answers: SubmissionAnswer[] | null;
  auto_score: number | null;
  evidence_urls: Array<{ type: string; url: string; description: string }> | null;
  reflection: string | null;
  peer_scores: PeerScore[] | null;
  peer_avg_score: number | null;
  faculty_score: number | null;
  faculty_feedback: string | null;
  faculty_reviewer_id: string | null;
  final_score: number | null;
  passed: boolean | null;
  time_spent_seconds: number | null;
  created_at: string;
}

// ============================================
// Engagement Types
// ============================================

export type EngagementEventType =
  | 'lesson_view' | 'lesson_complete'
  | 'exercise_start' | 'exercise_submit'
  | 'assessment_start' | 'assessment_submit'
  | 'discussion_post' | 'discussion_reply'
  | 'peer_review_given' | 'peer_review_received'
  | 'ai_prompt_used' | 'ai_output_modified' | 'ai_output_accepted_blindly'
  | 'certificate_earned' | 'video_play' | 'video_complete'
  | 'resource_download';

export interface PDEEngagementEvent {
  id: string;
  learner_id: string;
  event_type: EngagementEventType;
  course_id: string | null;
  lesson_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PDEEngagementDaily {
  id: string;
  learner_id: string;
  course_id: string;
  date: string;
  lessons_viewed: number;
  lessons_completed: number;
  exercises_attempted: number;
  assessments_taken: number;
  assessment_avg_score: number | null;
  time_spent_minutes: number;
  discussion_posts: number;
  ai_prompts_used: number;
  ai_outputs_modified: number;
  ai_outputs_accepted_blind: number;
  streak_days: number;
}

export type RiskLevel = 'critical' | 'warning' | 'struggling' | 'on_track';

export interface PDEAtRiskLearner {
  learner_id: string;
  course_id: string;
  full_name: string;
  email: string;
  last_active_date: string;
  days_inactive: number;
  avg_score: number | null;
  total_time: number;
  total_lessons_completed: number;
  risk_level: RiskLevel;
  /**
   * True whenever the learner is averaging below the pass mark — independent of
   * `risk_level`, which is a single-branch CASE where inactivity outranks score
   * and would otherwise hide a failing learner behind a 'warning' band.
   */
  is_low_scoring: boolean;
  /** False when the learner has completed no assessments, so "healthy" and "no evidence" are distinguishable. */
  has_assessment_scores: boolean;
}

/**
 * Per-learner rollup of `pde_at_risk_log` (view `pde_at_risk_history`), written
 * by /api/cron/pde-at-risk-flag. The live `pde_at_risk_learners` view answers
 * "who is at risk right now"; this answers "since when, and for how long".
 */
export interface PDEAtRiskHistory {
  learner_id: string;
  institution_id: string;
  first_flagged_at: string;
  last_flagged_at: string;
  first_flag_date: string;
  last_flag_date: string;
  flag_count: number;
  days_since_first_flag: number;
  is_currently_flagged: boolean;
  worst_risk_level: RiskLevel;
}

// ============================================
// Certificate Types
// ============================================

export type CertificateType = 'course_completion' | 'quest_completion' | 'capability_mastery' | 'principal_readiness';

export interface PDECertificate {
  id: string;
  learner_id: string;
  course_id: string;
  certificate_number: string;
  certificate_type: CertificateType;
  issued_at: string;
  final_score: number | null;
  completion_hours: number | null;
  finks_profile: Record<string, number> | null;
  agency_index: number | null;
  capabilities_demonstrated: string[] | null;
  verification_url: string | null;
  pdf_url: string | null;
  metadata: Record<string, unknown>;
  // Joined fields from API (learner + course info)
  learner_name?: string;
  course_name?: string;
  course_code?: string;
  [key: string]: unknown;
}

// ============================================
// Form / Input Types
// ============================================

export interface CreateAssessmentInput {
  lesson_id?: string;
  course_id: string;
  title: string;
  description?: string;
  assessment_type: AssessmentType;
  time_limit_minutes?: number;
  max_attempts?: number;
  pass_threshold?: number;
  shuffle_questions?: boolean;
  show_correct_after?: boolean;
}

export interface CreateQuestionInput {
  question_type: QuestionType;
  question_text: string;
  question_media_url?: string;
  options?: MCQOption[];
  correct_answer?: string;
  points?: number;
  explanation?: string;
  finks_dimension?: FinksDimension;
  difficulty?: Difficulty;
  order_index?: number;
}

export interface StartAttemptInput {
  assessment_id: string;
  learner_id: string;
}

export interface SubmitAnswersInput {
  submission_id: string;
  answers: SubmissionAnswer[];
  time_spent_seconds: number;
}

export interface LogEngagementInput {
  learner_id: string;
  event_type: EngagementEventType;
  course_id?: string;
  lesson_id?: string;
  metadata?: Record<string, unknown>;
}

export interface GenerateCertificateInput {
  learner_id: string;
  course_id: string;
  final_score: number;
  completion_hours: number;
  finks_profile?: Record<string, number>;
}

// ============================================
// Response Types
// ============================================

export interface AssessmentWithQuestions extends PDEAssessment {
  questions: PDEAssessmentQuestion[];
}

export interface SubmissionWithDetails extends PDESubmission {
  assessment?: PDEAssessment;
  learner_name?: string;
}

export interface EngagementSummary {
  total_events: number;
  total_time_minutes: number;
  lessons_completed: number;
  assessments_passed: number;
  current_streak: number;
  engagement_score: number;
}

export interface AssessmentResults {
  submission: PDESubmission;
  questions: PDEAssessmentQuestion[];
  total_points: number;
  earned_points: number;
  percentage: number;
  passed: boolean;
  finks_breakdown: Record<FinksDimension, { earned: number; total: number }>;
}

// ============================================
// Phase 2: Quest Board Types
// ============================================

export type QuestType = 'solo' | 'team' | 'cross_dept' | 'community' | 'industry';
export type QuestDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type QuestSourceType = 'solutions_dept' | 'jicate_client' | 'nif' | 'industry' | 'community' | 'faculty' | 'learner';
export type QuestStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'archived';
export type QuestEnrollmentStatus = 'active' | 'completed' | 'abandoned' | 'paused';
export type QuestEnrollmentRole = 'lead' | 'member' | 'reviewer';
export type QuestSubmissionType = 'milestone' | 'final';

export interface RequiredCapability {
  capability_id: string;
  min_level: number;
}

export interface QuestFeedbackEntry {
  reviewer: string;
  feedback: string;
  timestamp: string;
}

export interface PDEQuest {
  id: string;
  title: string;
  description: string;
  problem_statement: string;
  quest_type: QuestType;
  difficulty: QuestDifficulty | null;
  source_type: QuestSourceType | null;
  source_department: string | null;
  source_contact: string | null;
  required_capabilities: RequiredCapability[] | null;
  estimated_hours: number | null;
  max_team_size: number;
  reputation_points: number;
  badges: string[] | null;
  solutions_hub_eligible: boolean;
  nif_eligible: boolean;
  deliverable_description: string;
  deliverable_rubric: Record<string, unknown> | null;
  status: QuestStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PDEQuestEnrollment {
  id: string;
  quest_id: string;
  learner_id: string;
  team_id: string | null;
  role: QuestEnrollmentRole | null;
  started_at: string;
  completed_at: string | null;
  status: QuestEnrollmentStatus;
}

export interface PDEQuestSubmission {
  id: string;
  quest_id: string;
  learner_id: string;
  team_id: string | null;
  submission_type: QuestSubmissionType | null;
  title: string;
  description: string | null;
  evidence_urls: Array<{ type: string; url: string; description?: string }> | null;
  reflection: string | null;
  peer_scores: Record<string, unknown> | null;
  faculty_score: number | null;
  auto_score: number | null;
  final_score: number | null;
  passed: boolean | null;
  feedback: QuestFeedbackEntry[] | null;
  created_at: string;
}

// ============================================
// Phase 2: Capability Tree Types
// ============================================

export type CapabilityCategory =
  | 'ai_fluency' | 'domain_ai' | 'cross_functional' | 'production'
  | 'human_presence' | 'principal' | 'technical' | 'professional';

export type CapabilityStatus = 'locked' | 'available' | 'in_progress' | 'demonstrated' | 'mastered';

export type EvidenceType = 'code' | 'presentation' | 'reflection' | 'peer_testimony';

export interface PDECapability {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: CapabilityCategory;
  level: number; // 1-5
  lesson_ids: string[] | null;
  prerequisite_ids: string[] | null;
  demonstration_rubric: Record<string, unknown> | null;
  evidence_types: EvidenceType[] | null;
  finks_dimension: string | null;
  estimated_hours: number | null;
  is_core: boolean;
  created_at: string;
  // Tier 2 Item 5 — capability versioning (added 2026-05-19)
  version?: number;
  valid_until?: string | null;
  superseded_by?: string | null;
}

export interface PDELearnerCapability {
  id: string;
  learner_id: string;
  capability_id: string;
  status: CapabilityStatus;
  demonstrated_at: string | null;
  demonstration_evidence: Record<string, unknown> | null;
  demonstration_score: number | null;
  mastered_at: string | null;
  mastery_quest_id: string | null;
  // Joined
  capability?: PDECapability;
}

// ============================================
// Phase 2: Build Arena Types
// ============================================

export interface AIInteraction {
  prompt: string;
  response: string;
  modified: boolean;
  accepted_blind: boolean;
  timestamp: string;
}

export interface BuildArtifact {
  type: string;
  url: string;
  description: string;
  version?: number;
}

export interface PDEBuildSession {
  id: string;
  learner_id: string;
  quest_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  ai_interactions: AIInteraction[] | null;
  ai_prompts_count: number;
  ai_outputs_modified: number;
  ai_outputs_blind: number;
  artifacts: BuildArtifact[] | null;
  notes: string | null;
  created_at: string;
}

// ============================================
// Phase 2: Discussion Channel Types
// ============================================

export type ChannelType = 'quest' | 'capability' | 'course' | 'showcase' | 'help';
export type MessageType = 'text' | 'code' | 'image' | 'link' | 'achievement' | 'help_request';

export interface PDEChannel {
  id: string;
  channel_type: ChannelType;
  reference_id: string | null;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface PDEMessage {
  id: string;
  channel_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  message_type: MessageType;
  reactions: Record<string, string[]>; // {emoji: [user_ids]}
  is_pinned: boolean;
  is_answer: boolean;
  created_at: string;
  // Joined
  author_name?: string;
  author_avatar?: string;
}

// ============================================
// Phase 2: Reputation System Types
// ============================================

export type ReputationLevel = 'apprentice' | 'practitioner' | 'expert' | 'principal' | 'mentor';
export type BadgeCategory = 'capability' | 'quest' | 'social' | 'streak' | 'special';

export interface PDEReputation {
  id: string;
  learner_id: string;
  total_points: number;
  level: ReputationLevel;
  quest_points: number;
  capability_points: number;
  social_points: number;
  consistency_points: number;
  quests_completed: number;
  capabilities_demonstrated: number;
  peer_reviews_given: number;
  peer_reviews_helpful: number;
  help_given_count: number;
  current_streak: number;
  longest_streak: number;
  updated_at: string;
  // Joined
  learner_name?: string;
  learner_avatar?: string;
}

export interface PDEBadge {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon_url: string | null;
  category: BadgeCategory | null;
  points: number;
  criteria: Record<string, unknown> | null;
}

export interface PDELearnerBadge {
  id: string;
  learner_id: string;
  badge_id: string;
  earned_at: string;
  evidence: string | null;
  // Joined
  badge?: PDEBadge;
}

// ============================================
// Phase 2: Form / Input Types
// ============================================

export interface CreateQuestInput {
  title: string;
  description: string;
  problem_statement: string;
  quest_type: QuestType;
  difficulty?: QuestDifficulty;
  source_type?: QuestSourceType;
  source_department?: string;
  source_contact?: string;
  required_capabilities?: RequiredCapability[];
  estimated_hours?: number;
  max_team_size?: number;
  reputation_points?: number;
  badges?: string[];
  solutions_hub_eligible?: boolean;
  nif_eligible?: boolean;
  deliverable_description: string;
  deliverable_rubric?: Record<string, unknown>;
  status?: QuestStatus;
  created_by?: string;
}

export interface UpdateQuestInput {
  title?: string;
  description?: string;
  problem_statement?: string;
  quest_type?: QuestType;
  difficulty?: QuestDifficulty;
  source_type?: QuestSourceType;
  source_department?: string;
  source_contact?: string;
  required_capabilities?: RequiredCapability[];
  estimated_hours?: number;
  max_team_size?: number;
  reputation_points?: number;
  badges?: string[];
  solutions_hub_eligible?: boolean;
  nif_eligible?: boolean;
  deliverable_description?: string;
  deliverable_rubric?: Record<string, unknown>;
  status?: QuestStatus;
}

export interface CreateQuestSubmissionInput {
  quest_id: string;
  learner_id: string;
  team_id?: string;
  submission_type: QuestSubmissionType;
  title: string;
  description?: string;
  evidence_urls?: Array<{ type: string; url: string; description?: string }>;
  reflection?: string;
}

export interface CreateCapabilityInput {
  name: string;
  slug: string;
  description: string;
  category: CapabilityCategory;
  level: number;
  lesson_ids?: string[];
  prerequisite_ids?: string[];
  demonstration_rubric?: Record<string, unknown>;
  evidence_types?: EvidenceType[];
  finks_dimension?: string;
  estimated_hours?: number;
  is_core?: boolean;
}

export interface DemonstrateCapabilityInput {
  demonstration_evidence: Record<string, unknown>;
  demonstration_score?: number;
}

export interface StartBuildSessionInput {
  learner_id: string;
  quest_id: string;
}

export interface EndBuildSessionInput {
  artifacts?: BuildArtifact[];
  notes?: string;
  duration_minutes?: number;
}

export interface LogAIInteractionInput {
  prompt: string;
  response: string;
  modified: boolean;
  accepted_blind?: boolean;
}

export interface CreateChannelInput {
  channel_type: ChannelType;
  reference_id?: string;
  name: string;
}

export interface PostMessageInput {
  channel_id: string;
  author_id: string;
  content: string;
  message_type?: MessageType;
  parent_id?: string;
}

export interface AddReputationPointsInput {
  learner_id: string;
  points: number;
  category: 'quest' | 'capability' | 'social' | 'consistency';
}

export interface AwardBadgeInput {
  learner_id: string;
  badge_id: string;
  evidence?: string;
}

// ============================================
// Phase 2: Response / Composite Types
// ============================================

export interface QuestWithEnrollments extends PDEQuest {
  enrollments: PDEQuestEnrollment[];
  enrollment_count: number;
}

export interface CapabilityWithProgress extends PDECapability {
  learner_status?: CapabilityStatus;
  demonstrated_at?: string | null;
}

export interface LeaderboardEntry extends PDEReputation {
  rank: number;
  learner_name: string;
  badges_count: number;
}

export interface QuestFilters {
  quest_type?: QuestType;
  difficulty?: QuestDifficulty;
  status?: QuestStatus;
  source_type?: QuestSourceType;
}

// ============================================
// Phase 3: AI Coach Types
// ============================================

export type CoachingStyle = 'scaffolding' | 'guided' | 'challenging' | 'socratic' | 'peer';
export type CoachContextType = 'lesson' | 'quest' | 'build' | 'reflection';

export interface CoachMessage {
  role: 'learner' | 'coach';
  content: string;
  timestamp: string;
}

export interface PDECoachConversation {
  id: string;
  learner_id: string;
  context_type: CoachContextType;
  context_id: string | null;
  messages: CoachMessage[];
  coaching_style: CoachingStyle;
  tokens_used: number;
  created_at: string;
  updated_at: string;
}

export interface SendCoachMessageInput {
  learner_id: string;
  context_type: CoachContextType;
  context_id: string;
  message: string;
}

export interface CoachMessageResponse {
  reply: string;
  conversation_id: string;
}

// ============================================
// Phase 3: Agency Index Types
// ============================================

export type AgencyLevel = 'dependent' | 'directed' | 'independent' | 'self_directed' | 'principal';

export interface PDEAgencyIndex {
  id: string;
  learner_id: string;
  course_id: string;
  assessment_date: string;
  initiative: number;
  self_direction: number;
  tool_mastery: number;
  critical_evaluation: number;
  ethical_judgment: number;
  overall: number;
  level: AgencyLevel;
  evidence: Record<string, unknown>;
  created_at: string;
}

// ============================================
// Phase 4: Clinical Reasoning (AICBL→PDE port)
// ============================================

export type ClinicalCaseStatus = 'draft' | 'published' | 'archived';
export type ClinicalQuestionType = 'free_text_socratic' | 'mcq_warmup' | 'image_tag';
export type OSCEDomain =
  | 'data_gathering'
  | 'hypothesis_generation'
  | 'management_planning'
  | 'patient_communication'
  | 'professionalism';

export interface ClinicalCaseScenario {
  patient_name: string;
  age: number;
  gender: string;
  occupation?: string;
  chief_complaint: string;
  hopi: string;
  medical_history?: string;
  habit_history?: {
    type: string;
    duration_years?: number;
    frequency?: string;
    quantity?: string;
    current_status?: string;
  };
  additional_clinical_details?: string;
  image_url?: string;
}

export interface DomainWeights {
  data_gathering: number;
  hypothesis_generation: number;
  management_planning: number;
  patient_communication: number;
  professionalism: number;
}

export interface ClinicalCaseMetadata {
  domain_weights: DomainWeights;
  discipline?: string;
  source?: string;
}

export interface ImageTagRegion {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tolerance_px?: number;
  reasoning?: string;
}

/**
 * A de-identified clinical image copied from the PMS bridge into the
 * pde-clinical-images bucket. These are CANDIDATES — the builder requires
 * faculty to confirm no burned-in identifiers before one can be attached
 * (default-deny; see specs/pde-image-bridge-design-2026-07-21.md).
 */
export interface ImportedPmsImage {
  url: string;
  kind: string;
  taken_at?: string;
  seq: number;
}

export interface ClinicalQuestionMetadata {
  q_number: number;
  osce_domain: OSCEDomain;
  ground_truth: string;
  key_concepts: string[];
}

export interface ClinicalCase {
  id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  description: string | null;
  assessment_type: 'clinical_case';
  status: ClinicalCaseStatus;
  version: number;
  metadata: ClinicalCaseMetadata;
  is_active: boolean;
  pass_threshold: number;
  time_limit_minutes: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined from lesson
  case_scenario?: ClinicalCaseScenario;
  // Joined from join queries
  institution_id?: string | null;
  course_code?: string;
  course_name?: string;
  question_count?: number;
}

export interface ClinicalCaseQuestion {
  id: string;
  assessment_id: string;
  question_type: ClinicalQuestionType;
  question_text: string;
  question_media_url: string | null;
  options: MCQOption[] | null;
  correct_answer: string | null;
  expected_regions: ImageTagRegion[] | null;
  points: number;
  order_index: number;
  metadata: ClinicalQuestionMetadata;
  created_at: string;
}

export interface ClinicalCaseWithQuestions extends ClinicalCase {
  questions: ClinicalCaseQuestion[];
}

export interface CreateClinicalCaseInput {
  course_id: string;
  title: string;
  description?: string;
  case_scenario: ClinicalCaseScenario;
  metadata: ClinicalCaseMetadata;
  time_limit_minutes?: number | null;
  pass_threshold?: number;
  questions: CreateClinicalQuestionInput[];
}

export interface CreateClinicalQuestionInput {
  question_type: ClinicalQuestionType;
  question_text: string;
  question_media_url?: string | null;
  options?: MCQOption[] | null;
  correct_answer?: string | null;
  expected_regions?: ImageTagRegion[] | null;
  points?: number;
  order_index?: number;
  metadata: ClinicalQuestionMetadata;
}

export interface UpdateClinicalCaseInput {
  title?: string;
  description?: string;
  case_scenario?: ClinicalCaseScenario;
  metadata?: Partial<ClinicalCaseMetadata>;
  time_limit_minutes?: number | null;
  pass_threshold?: number;
  status?: ClinicalCaseStatus;
  questions?: CreateClinicalQuestionInput[];
}

export interface ClinicalCaseListFilters {
  status?: ClinicalCaseStatus | 'all';
  course_id?: string;
  institution_id?: string;
}

// Per-student transcript drill
export interface ClinicalCaseSubmissionTranscript {
  submission_id: string;
  learner_id: string;
  learner_name: string;
  learner_roll_number?: string;
  attempt_number: number;
  started_at: string;
  completed_at: string | null;
  auto_score: number | null;
  final_score: number | null;
  passed: boolean | null;
  assessment_version: number;
  answers: Array<{
    question_id: string;
    question_text: string;
    question_type: ClinicalQuestionType;
    question_order: number;
    osce_domain: OSCEDomain;
    learner_answer: string;
    ai_feedback?: string | null;
    domain_score?: number | null;
  }>;
  per_domain_scores?: Record<OSCEDomain, number>;
}

// Cohort analytics
export interface ClinicalCaseCohortStats {
  case_id: string;
  case_title: string;
  total_attempts: number;
  unique_learners: number;
  average_score: number | null;
  pass_rate: number | null;
  attempt_distribution: Array<{ attempt_number: number; count: number }>;
  per_domain_average?: Record<OSCEDomain, number>;
  students: Array<{
    learner_id: string;
    learner_name: string;
    roll_number?: string;
    attempts_used: number;
    best_score: number | null;
    passed: boolean | null;
    last_attempt_at: string | null;
    granted_extra: number;
  }>;
}

export interface GrantAttemptsInput {
  case_id: string;
  learner_id: string;
  attempts_granted: number;
  reason: string;
}

export interface PdeAttemptGrant {
  id: string;
  case_id: string;
  learner_id: string;
  attempts_granted: number;
  reason: string;
  granted_by: string;
  created_at: string;
}
