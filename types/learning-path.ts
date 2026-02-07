// ============================================================================
// Learning Path Module Types
// Part of Personalization - Phase P3.1
// Personalized learning paths with competency targets and step tracking
// ============================================================================

// ============================================================================
// ENUMS
// ============================================================================

export type LearningPathStatus = 'active' | 'completed' | 'paused' | 'archived';

export type LearningPathStepType =
  | 'course'
  | 'project'
  | 'certification'
  | 'workshop'
  | 'self_study'
  | 'industry_engagement';

export type LearningPathStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

// ============================================================================
// CORE ENTITIES
// ============================================================================

/** Main learning path entry */
export interface LearningPath {
  id: string;
  institution_id: string;
  learner_id: string;
  title: string;
  description: string | null;
  target_role: string | null;
  target_industry: string | null;
  target_competencies: string[];
  current_progress: number; // 0-100
  status: LearningPathStatus;
  estimated_duration_weeks: number | null;
  start_date: string | null;
  target_completion_date: string | null;
  completed_at: string | null;
  created_by: string | null;
  is_ai_generated: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined fields
  steps?: LearningPathStep[];
}

/** Individual step in a learning path */
export interface LearningPathStep {
  id: string;
  path_id: string;
  step_number: number;
  title: string;
  description: string | null;
  step_type: LearningPathStepType;
  resource_id: string | null;
  resource_type: string | null;
  target_competencies: string[];
  estimated_hours: number | null;
  status: LearningPathStepStatus;
  started_at: string | null;
  completed_at: string | null;
  completion_evidence: string | null;
  score: number | null;
  mentor_notes: string | null;
  is_required: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// DTOs - CREATE / UPDATE
// ============================================================================

export interface CreateLearningPathInput {
  institution_id: string;
  learner_id: string;
  title: string;
  description?: string;
  target_role?: string;
  target_industry?: string;
  target_competencies?: string[];
  estimated_duration_weeks?: number;
  start_date?: string;
  target_completion_date?: string;
  is_ai_generated?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateLearningPathInput {
  title?: string;
  description?: string;
  target_role?: string;
  target_industry?: string;
  target_competencies?: string[];
  current_progress?: number;
  status?: LearningPathStatus;
  estimated_duration_weeks?: number;
  start_date?: string;
  target_completion_date?: string;
  completed_at?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateLearningPathStepInput {
  path_id: string;
  step_number: number;
  title: string;
  description?: string;
  step_type?: LearningPathStepType;
  resource_id?: string;
  resource_type?: string;
  target_competencies?: string[];
  estimated_hours?: number;
  is_required?: boolean;
}

export interface UpdateLearningPathStepInput {
  title?: string;
  description?: string;
  step_type?: LearningPathStepType;
  step_number?: number;
  resource_id?: string;
  resource_type?: string;
  target_competencies?: string[];
  estimated_hours?: number;
  status?: LearningPathStepStatus;
  started_at?: string;
  completed_at?: string;
  completion_evidence?: string;
  score?: number;
  mentor_notes?: string;
  is_required?: boolean;
}

// ============================================================================
// FILTERS
// ============================================================================

export interface LearningPathFilters {
  institution_id?: string;
  learner_id?: string;
  status?: LearningPathStatus | LearningPathStatus[];
  search?: string;
  is_ai_generated?: boolean;
  page?: number;
  limit?: number;
  sort_by?: 'title' | 'created_at' | 'current_progress' | 'updated_at';
  sort_order?: 'asc' | 'desc';
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface LearningPathListResponse {
  data: LearningPath[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

export const STEP_TYPE_LABELS: Record<LearningPathStepType, string> = {
  course: 'Course',
  project: 'Project',
  certification: 'Certification',
  workshop: 'Workshop',
  self_study: 'Self Study',
  industry_engagement: 'Industry Engagement',
};

export const STEP_TYPE_COLORS: Record<LearningPathStepType, string> = {
  course: 'bg-blue-100 text-blue-800',
  project: 'bg-purple-100 text-purple-800',
  certification: 'bg-amber-100 text-amber-800',
  workshop: 'bg-emerald-100 text-emerald-800',
  self_study: 'bg-slate-100 text-slate-800',
  industry_engagement: 'bg-rose-100 text-rose-800',
};

export const PATH_STATUS_LABELS: Record<LearningPathStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  paused: 'Paused',
  archived: 'Archived',
};

export const PATH_STATUS_COLORS: Record<LearningPathStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-blue-100 text-blue-800',
  paused: 'bg-amber-100 text-amber-800',
  archived: 'bg-slate-100 text-slate-800',
};

export const STEP_STATUS_LABELS: Record<LearningPathStepStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  skipped: 'Skipped',
};

export const STEP_STATUS_COLORS: Record<LearningPathStepStatus, string> = {
  pending: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  skipped: 'bg-amber-100 text-amber-700',
};
