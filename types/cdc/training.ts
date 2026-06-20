// types/cdc/training.ts
// Types for CDC Training Programmes (Unnati / MRB / Springboard / etc.)

// ═══════════════════════════════════════════════════════════════════════════
// MASTER TABLE — cdc_training_types
// ═══════════════════════════════════════════════════════════════════════════

export interface CdcTrainingType {
  id: string;
  config_key: string;          // e.g. 'unnati', 'mrb', 'springboard', 'corporate', 'aicte'
  display_name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  default_total_hours: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRAINING PROGRAMME — cdc_training_programmes
// ═══════════════════════════════════════════════════════════════════════════

export type TrainingProgrammeStatus = 'planned' | 'ongoing' | 'completed' | 'cancelled';

export interface CdcTrainingProgramme {
  id: string;
  name: string;
  training_type_id: string | null;
  description: string | null;
  institution_id: string | null;   // NULL = cross-college
  total_hours: number | null;
  start_date: string | null;       // ISO date
  end_date: string | null;         // ISO date
  status: TrainingProgrammeStatus;
  external_provider: string | null;
  trainer_name: string | null;     // BUG-004076 — trainer / facilitator name
  certificate_template_url: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  // Joined
  training_type?: CdcTrainingType | null;
  institution?: { id: string; name: string } | null;
  enrollment_count?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENROLLMENT — cdc_training_enrollments
// ═══════════════════════════════════════════════════════════════════════════

export type EnrollmentStatus = 'enrolled' | 'in_progress' | 'completed' | 'dropped';

export interface CdcTrainingEnrollment {
  id: string;
  programme_id: string;
  learner_id: string;
  enrolled_at: string;
  status: EnrollmentStatus;
  attendance_pct: number | null;
  certificate_url: string | null;
  certificate_issued_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  learner?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    roll_number?: string | null;
    institution?: { id: string; name: string } | null;
  } | null;
  programme?: CdcTrainingProgramme | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// DTOs
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateTrainingProgrammeDto {
  name: string;
  training_type_id?: string | null;
  description?: string | null;
  institution_id?: string | null;
  total_hours?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: TrainingProgrammeStatus;
  external_provider?: string | null;
  trainer_name?: string | null;    // BUG-004076 — trainer / facilitator name
  certificate_template_url?: string | null;
}

export interface UpdateTrainingProgrammeDto extends Partial<CreateTrainingProgrammeDto> {}

export interface CreateEnrollmentDto {
  programme_id: string;
  learner_id: string;
  status?: EnrollmentStatus;
  notes?: string | null;
}

export interface UpdateEnrollmentDto {
  status?: EnrollmentStatus;
  attendance_pct?: number | null;
  certificate_url?: string | null;
  certificate_issued_at?: string | null;
  notes?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════════════════════════════

export interface TrainingProgrammeFilters {
  search?: string;
  training_type_id?: string;
  status?: TrainingProgrammeStatus;
  institution_id?: string;
  date_from?: string;
  date_to?: string;
}

export interface EnrollmentFilters {
  programme_id?: string;
  learner_id?: string;
  status?: EnrollmentStatus;
}
