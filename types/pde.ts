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
