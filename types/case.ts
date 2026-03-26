// types/case.ts
// CASE Graduation Tracker types

export type CaseTrackType = 'ai_mastery' | 'human_excellence';
export type CaseTrackCode = 'AI-1' | 'AI-2' | 'AI-3' | 'AI-4' | 'H-1' | 'H-2';
export type CaseRiskLevel = 'on_track' | 'at_risk' | 'critical' | 'overdue' | 'completed';
export type CaseEnrollmentStatus = 'enrolled' | 'in_progress' | 'completed' | 'incomplete' | 'retry';
export type CaseBatchStatus = 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type CaseDeliveryFormat = 'spread' | 'moderate' | 'intensive' | 'custom';
export type CaseAlertType = 'welcome' | 'track_available' | 'behind_schedule' | '90_day' | '60_day' | '30_day' | '25_day_hard' | 'completed';

export interface CaseTrack {
  id: string;
  track_code: CaseTrackCode;
  track_name: string;
  track_type: CaseTrackType;
  sequence_order: number;
  prerequisite_track_id: string | null;
  duration_hours: number;
  description: string | null;
  completion_attendance_threshold: number;
  completion_grader_threshold: number;
  completion_project_required: boolean;
  is_active: boolean;
}

export interface CaseLearnerProgress {
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
  risk_level: CaseRiskLevel;
}

export interface CaseTrackEnrollment {
  id: string;
  user_id: string;
  track_id: string;
  course_id: string | null;
  batch_id: string | null;
  status: CaseEnrollmentStatus;
  attendance_percentage: number;
  grader_score_average: number;
  project_submitted: boolean;
  project_score: number | null;
  completion_gate_attendance: boolean;
  completion_gate_grader: boolean;
  completion_gate_project: boolean;
  completed_at: string | null;
  retry_count: number;
  // Joined fields
  track?: CaseTrack;
}

export interface CaseBatch {
  id: string;
  track_id: string;
  institution_id: string;
  batch_code: string;
  delivery_format: CaseDeliveryFormat;
  start_date: string;
  end_date: string;
  schedule_json: Record<string, unknown> | null;
  max_capacity: number;
  current_enrollment: number;
  status: CaseBatchStatus;
  // Joined
  track?: CaseTrack;
}

export interface CaseRiskCalculation {
  user_id: string;
  programme_id: string;
  institution_id: string;
  current_semester: number;
  tracks_completed: number;
  programme_duration_semesters: number;
  semesters_remaining: number;
  tracks_remaining: number;
  tracks_per_semester_needed: number;
  days_to_exam: number | null;
  calculated_risk_level: CaseRiskLevel;
}

export interface CaseGraduationReadiness {
  institution_name: string;
  program_name: string;
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

// Dashboard composite type
export interface CaseLearnerDashboard {
  progress: CaseLearnerProgress;
  enrollments: CaseTrackEnrollment[];
  tracks: CaseTrack[];
  risk: CaseRiskCalculation | null;
  next_available_tracks: CaseTrack[];
}

// Coordinator at-risk view
export interface CaseAtRiskLearner {
  user_id: string;
  user_name: string;
  user_email: string;
  programme_name: string;
  institution_name: string;
  tracks_completed: number;
  tracks_remaining: number;
  semesters_remaining: number;
  days_to_exam: number | null;
  risk_level: CaseRiskLevel;
  tracks_per_semester_needed: number;
}
