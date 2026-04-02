// ================================================================================
// CASE (Graduation Tracker) Module Types
// Created: 2026-04-02
// Tables: case_tracks, case_track_courses, case_track_enrollments, case_batches,
//         case_learner_progress, case_alerts, case_graduation_requirements
// ================================================================================

// ── Enums ────────────────────────────────────────────────────────────────────

export type CASETrackType = 'ai_mastery' | 'human_excellence';

export type CASETrackEnrollmentStatus =
  | 'enrolled'
  | 'in_progress'
  | 'completed'
  | 'incomplete'
  | 'retry';

export type CASERiskLevel =
  | 'on_track'
  | 'at_risk'
  | 'critical'
  | 'overdue'
  | 'completed';

export type CASEBatchStatus =
  | 'planned'
  | 'open'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type CASEDeliveryFormat = 'spread' | 'moderate' | 'intensive';

export type CASEAlertType =
  | 'on_track_alert'
  | 'at_risk_alert'
  | 'critical_alert'
  | 'overdue_alert'
  | 'enforcement_90_days'
  | 'enforcement_60_days'
  | 'enforcement_30_days'
  | 'enforcement_25_days';

// ── Agency Index ─────────────────────────────────────────────────────────────

export interface AgencyDimensions {
  critical_thinking: number;
  problem_solving: number;
  creativity: number;
  collaboration: number;
  communication: number;
  digital_literacy: number;
}

// ── Entities ─────────────────────────────────────────────────────────────────

export interface CASETrack {
  id: string;
  track_code: string;
  track_name: string;
  track_type: CASETrackType;
  sequence_order: number;
  prerequisite_track_id: string | null;
  duration_hours: number;
  description: string | null;
  completion_attendance_threshold: number;
  completion_grader_threshold: number;
  completion_project_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CASETrackWithPrerequisite extends CASETrack {
  prerequisite_track?: CASETrack | null;
}

export interface CASETrackCourse {
  id: string;
  track_id: string;
  course_id: string;
  programme_id: string | null;
  institution_id: string | null;
  is_primary: boolean;
  created_at: string;
}

export interface CASETrackEnrollment {
  id: string;
  user_id: string;
  track_id: string;
  course_id: string | null;
  batch_id: string | null;
  enrolled_at: string;
  status: CASETrackEnrollmentStatus;
  attendance_percentage: number;
  grader_score_average: number;
  project_submitted: boolean;
  project_score: number | null;
  completion_gate_attendance: boolean;
  completion_gate_grader: boolean;
  completion_gate_project: boolean;
  completed_at: string | null;
  retry_count: number;
  previous_enrollment_id: string | null;
  placement_score: number | null;
  placement_start_week: number;
  placement_taken_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CASETrackEnrollmentWithTrack extends CASETrackEnrollment {
  case_tracks: CASETrack;
}

export interface CASEBatch {
  id: string;
  track_id: string;
  institution_id: string | null;
  batch_code: string | null;
  delivery_format: CASEDeliveryFormat;
  start_date: string | null;
  end_date: string | null;
  schedule_json: BatchSchedule | null;
  max_capacity: number;
  current_enrollment: number;
  facilitator_id: string | null;
  status: CASEBatchStatus;
  is_auto_suggested: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BatchSchedule {
  sessions: {
    day: string;
    period: string;
    time?: string;
  }[];
}

export interface CASELearnerProgress {
  id: string;
  user_id: string;
  programme_id: string;
  institution_id: string;
  admission_semester: number;
  current_semester: number;
  tracks_completed: number;
  total_hours_completed: number;
  graduation_ready: boolean;
  estimated_exam_date: string | null;
  risk_level: CASERiskLevel;
  last_alert_sent_at: string | null;
  agency_index: number;
  agency_dimensions: AgencyDimensions | null;
  created_at: string;
  updated_at: string;
}

export interface CASEAlert {
  id: string;
  user_id: string;
  alert_type: string;
  message: string;
  sent_via: string[];
  sent_at: string;
  read_at: string | null;
  coordinator_id: string | null;
  created_at: string;
}

export interface CASEGraduationRequirement {
  id: string;
  programme_id: string;
  institution_id: string;
  total_tracks_required: number;
  total_hours_required: number;
  programme_duration_semesters: number;
  enforcement_days_before_exam: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── View Types (from case_risk_calculator, case_graduation_readiness) ─────────

export interface CASERiskCalculation {
  user_id: string;
  programme_id: string;
  institution_id: string;
  current_semester: number;
  tracks_completed: number;
  graduation_ready: boolean;
  estimated_exam_date: string | null;
  risk_level: CASERiskLevel;
  agency_index: number;
  programme_duration_semesters: number;
  semesters_remaining: number;
  tracks_remaining: number;
  tracks_per_semester_needed: number;
  calculated_risk_level: CASERiskLevel;
}

export interface CASEGraduationReadiness {
  institution_name: string;
  institution_id: string;
  programme_name: string;
  programme_id: string;
  current_semester: number;
  total_learners: number;
  graduation_ready_count: number;
  readiness_percentage: number;
  at_risk_count: number;
  critical_count: number;
  overdue_count: number;
  avg_tracks_completed: number;
  avg_hours_completed: number;
}

// ── Filters ──────────────────────────────────────────────────────────────────

export interface CASEBatchFilters {
  track_id?: string;
  institution_id?: string;
  status?: CASEBatchStatus;
  page?: number;
  limit?: number;
}

export interface CASEAlertFilters {
  user_id?: string;
  alert_type?: string;
  unread_only?: boolean;
  page?: number;
  limit?: number;
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateCASEBatchInput {
  track_id: string;
  institution_id: string;
  batch_code?: string;
  delivery_format?: CASEDeliveryFormat;
  start_date: string;
  end_date: string;
  schedule_json?: BatchSchedule;
  max_capacity?: number;
  facilitator_id?: string;
}

export interface UpdateCASEBatchInput extends Partial<Omit<CreateCASEBatchInput, 'track_id'>> {
  status?: CASEBatchStatus;
  current_enrollment?: number;
}

export interface UpdateCASETrackInput {
  track_name?: string;
  description?: string;
  completion_attendance_threshold?: number;
  completion_grader_threshold?: number;
  completion_project_required?: boolean;
  is_active?: boolean;
}

export interface SubmitPlacementInput {
  user_id: string;
  track_id: string;
  answers: { question_id: string; selected_answer: string }[];
}

export interface PlacementResult {
  score: number;
  start_week: number;
  total_questions: number;
  correct_count: number;
}

// ── Placement Test Types ─────────────────────────────────────────────────────

export interface PlacementQuestion {
  id: string;
  track_code: string;
  question: string;
  options: { label: string; value: string }[];
  correct_answer: string;
  difficulty: 'basic' | 'intermediate' | 'advanced';
}

// ── Analytics Types ──────────────────────────────────────────────────────────

export interface TrackCompletionStats {
  track_id: string;
  track_code: string;
  track_name: string;
  track_type: CASETrackType;
  total_enrolled: number;
  completed_count: number;
  in_progress_count: number;
  completion_rate: number;
  avg_attendance: number;
  avg_grader_score: number;
}

export interface RiskDistribution {
  on_track: number;
  at_risk: number;
  critical: number;
  overdue: number;
  completed: number;
  total: number;
}

export interface AtRiskLearner {
  user_id: string;
  user_name: string;
  user_email: string;
  programme_name: string;
  current_semester: number;
  tracks_completed: number;
  tracks_remaining: number;
  risk_level: CASERiskLevel;
  semesters_remaining: number;
  tracks_per_semester_needed: number;
  last_alert_sent_at: string | null;
}

export interface CASEDashboardStats {
  total_learners: number;
  graduation_ready_count: number;
  at_risk_count: number;
  critical_count: number;
  overdue_count: number;
  avg_tracks_completed: number;
  avg_hours_completed: number;
  track_completion_rates: TrackCompletionStats[];
}
