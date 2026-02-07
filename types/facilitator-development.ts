// ============================================================================
// Facilitator Development Module Types
// Part of TQM - Phase 4.2
// Track staff development journey from teacher to facilitator
// ============================================================================

// ============================================================================
// ENUMS
// ============================================================================

export type DevelopmentStage = 'teacher' | 'transitioning' | 'facilitator' | 'master_facilitator';
export type DevelopmentStatus = 'active' | 'paused' | 'completed';
export type ImmersionStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

// ============================================================================
// STAGE LABELS & COLORS
// ============================================================================

export const STAGE_LABELS: Record<DevelopmentStage, string> = {
  teacher: 'Teacher',
  transitioning: 'Transitioning',
  facilitator: 'Facilitator',
  master_facilitator: 'Master Facilitator'
};

export const STAGE_COLORS: Record<DevelopmentStage, string> = {
  teacher: 'bg-gray-100 text-gray-800',
  transitioning: 'bg-amber-100 text-amber-800',
  facilitator: 'bg-blue-100 text-blue-800',
  master_facilitator: 'bg-emerald-100 text-emerald-800'
};

export const DEVELOPMENT_STATUS_LABELS: Record<DevelopmentStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed'
};

export const DEVELOPMENT_STATUS_COLORS: Record<DevelopmentStatus, string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-blue-100 text-blue-800'
};

export const IMMERSION_STATUS_LABELS: Record<ImmersionStatus, string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

export const IMMERSION_STATUS_COLORS: Record<ImmersionStatus, string> = {
  planned: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
};

// ============================================================================
// CORE ENTITIES
// ============================================================================

/** Certification entry in JSONB */
export interface Certification {
  name: string;
  issuer: string;
  date: string;
  url?: string;
}

/** Development plan goals/milestones in JSONB */
export interface DevelopmentPlan {
  goals?: string[];
  milestones?: {
    title: string;
    target_date?: string;
    completed?: boolean;
    completed_date?: string;
  }[];
  timeline?: string;
  notes?: string;
}

/** Main facilitator development record */
export interface FacilitatorDevelopment {
  id: string;
  institution_id: string;
  staff_id: string;
  current_stage: DevelopmentStage;
  target_stage: DevelopmentStage | null;
  development_plan: DevelopmentPlan;
  competencies_acquired: string[];
  certifications: Certification[];
  workshops_attended: number;
  workshops_facilitated: number;
  peer_observations_done: number;
  peer_observations_received: number;
  student_feedback_average: number | null;
  industry_exposure_hours: number;
  outcome_score: number | null;
  mentor_id: string | null;
  mentor_notes: string | null;
  started_at: string;
  stage_updated_at: string | null;
  completed_at: string | null;
  status: DevelopmentStatus;
  created_at: string;
  updated_at: string;
  // Joined fields (populated by service)
  immersions?: FacilitatorIndustryImmersion[];
  staff?: { id: string; name: string; email: string };
  mentor?: { id: string; name: string; email: string };
}

/** Industry immersion record */
export interface FacilitatorIndustryImmersion {
  id: string;
  development_id: string;
  company_name: string;
  industry: string | null;
  role_title: string | null;
  duration_days: number;
  start_date: string;
  end_date: string | null;
  objectives: string[];
  learnings: string | null;
  skills_acquired: string[];
  industry_contacts_made: number;
  relevance_to_curriculum: string | null;
  evidence_url: string | null;
  rating: number | null;
  supervisor_name: string | null;
  supervisor_feedback: string | null;
  status: ImmersionStatus;
  created_at: string;
  updated_at: string;
  // Joined fields
  development?: FacilitatorDevelopment;
}

// ============================================================================
// DTOs - CREATE / UPDATE
// ============================================================================

export interface CreateFacilitatorDevelopmentInput {
  institution_id: string;
  staff_id: string;
  current_stage?: DevelopmentStage;
  target_stage?: DevelopmentStage;
  development_plan?: DevelopmentPlan;
  competencies_acquired?: string[];
  certifications?: Certification[];
  mentor_id?: string;
  mentor_notes?: string;
  status?: DevelopmentStatus;
}

export interface UpdateFacilitatorDevelopmentInput {
  current_stage?: DevelopmentStage;
  target_stage?: DevelopmentStage;
  development_plan?: DevelopmentPlan;
  competencies_acquired?: string[];
  certifications?: Certification[];
  workshops_attended?: number;
  workshops_facilitated?: number;
  peer_observations_done?: number;
  peer_observations_received?: number;
  student_feedback_average?: number;
  industry_exposure_hours?: number;
  outcome_score?: number;
  mentor_id?: string | null;
  mentor_notes?: string;
  status?: DevelopmentStatus;
  stage_updated_at?: string;
  completed_at?: string;
}

export interface CreateImmersionInput {
  development_id: string;
  company_name: string;
  industry?: string;
  role_title?: string;
  duration_days: number;
  start_date: string;
  end_date?: string;
  objectives?: string[];
  learnings?: string;
  skills_acquired?: string[];
  industry_contacts_made?: number;
  relevance_to_curriculum?: string;
  evidence_url?: string;
  rating?: number;
  supervisor_name?: string;
  supervisor_feedback?: string;
  status?: ImmersionStatus;
}

export interface UpdateImmersionInput {
  company_name?: string;
  industry?: string;
  role_title?: string;
  duration_days?: number;
  start_date?: string;
  end_date?: string;
  objectives?: string[];
  learnings?: string;
  skills_acquired?: string[];
  industry_contacts_made?: number;
  relevance_to_curriculum?: string;
  evidence_url?: string;
  rating?: number;
  supervisor_name?: string;
  supervisor_feedback?: string;
  status?: ImmersionStatus;
}

// ============================================================================
// FILTERS
// ============================================================================

export interface FacilitatorDevelopmentFilters {
  institution_id?: string;
  staff_id?: string;
  current_stage?: DevelopmentStage | DevelopmentStage[];
  status?: DevelopmentStatus;
  mentor_id?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: 'created_at' | 'outcome_score' | 'current_stage' | 'started_at';
  sort_order?: 'asc' | 'desc';
}

export interface ImmersionFilters {
  development_id?: string;
  status?: ImmersionStatus | ImmersionStatus[];
  industry?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort_by?: 'start_date' | 'created_at' | 'duration_days';
  sort_order?: 'asc' | 'desc';
}

// ============================================================================
// DASHBOARD / ANALYTICS
// ============================================================================

export interface FacilitatorDevelopmentStats {
  total_records: number;
  by_stage: Record<DevelopmentStage, number>;
  by_status: Record<DevelopmentStatus, number>;
  active_count: number;
  completed_count: number;
  avg_outcome_score: number;
  total_immersions: number;
  total_industry_hours: number;
  avg_workshops_attended: number;
  avg_peer_observations: number;
}

// ============================================================================
// RESPONSE / UTILITY TYPES
// ============================================================================

/** Paginated list response */
export interface FacilitatorListResponse<T> {
  data: T[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
