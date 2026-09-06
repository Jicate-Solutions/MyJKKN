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
  exam_family: string | null;  // 2026-07-04 govt-job-readiness: config-key tag (tnpsc/rrb/banking/ssc/police); NULL = not a govt-exam type
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
  shared_syllabus_pct: number | null;  // 2026-07-04 govt-job-readiness (Option A): descriptive % label of shared syllabus; no logic derives grouping from it
  domain_topics: string | null;        // 2026-07-04 govt-job-readiness (Option A): free-text domain-specific topics label
  trainer_name: string | null;     // BUG-004076 — trainer / facilitator name (display snapshot / external name)
  trainer_staff_id: string | null; // FK to staff(id) when trainer is internal MyJKKN staff; NULL = external/vendor
  certificate_template_url: string | null;
  target_department_id: string | null;  // BUG-004073 — cohort binding: target department
  academic_year_label: string | null;   // BUG-004073 — cohort binding: batch / academic year
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  // Joined
  training_type?: CdcTrainingType | null;
  institution?: { id: string; name: string } | null;
  target_department?: { id: string; department_name: string } | null;  // BUG-004073
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
  // BUG-004201: provenance of attendance_pct — manual entry vs auto-computed from
  // the academic attendance master over the programme window.
  attendance_source?: 'manual' | 'auto_window' | null;
  attendance_synced_at?: string | null;
  attendance_basis?: { records_total?: number; records_present?: number; window_start?: string; window_end?: string } | null;
  certificate_url: string | null;
  certificate_issued_at: string | null;
  notes: string | null;
  // Cohort Core (Phase 4): nullable link to the cohort spine membership mirror.
  // Best-effort, populated forward by TrainingService.addEnrollment; the
  // enrollment row itself stays the authoritative roster. See migration
  // 20260731090000_cdc_training_demote_to_cohort_core.sql.
  cohort_membership_id?: string | null;
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
// SEMESTER SCHEDULE — cdc_training_semester_schedules (BUG-004200)
// Per-semester schedule/hours for a programme. One row per (programme, semester).
// ═══════════════════════════════════════════════════════════════════════════

export interface CdcTrainingSemesterSchedule {
  id: string;
  programme_id: string;
  semester_label: string;          // free-form, e.g. 'Semester 1'
  total_hours: number | null;
  start_date: string | null;       // ISO date
  end_date: string | null;         // ISO date
  trainer_name: string | null;     // display snapshot of internal trainer, or external trainer name
  trainer_staff_id: string | null; // FK to staff(id) when trainer is internal MyJKKN staff; NULL = external/vendor
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
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
  trainer_name?: string | null;    // BUG-004076 — trainer / facilitator name (display snapshot / external name)
  trainer_staff_id?: string | null; // FK to staff(id) when trainer is internal MyJKKN staff; NULL = external/vendor
  certificate_template_url?: string | null;
  target_department_id?: string | null;  // BUG-004073 — cohort binding: target department
  academic_year_label?: string | null;   // BUG-004073 — cohort binding: batch / academic year
}

export type UpdateTrainingProgrammeDto = Partial<CreateTrainingProgrammeDto>;

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

export interface CreateSemesterScheduleDto {
  programme_id: string;
  semester_label: string;
  total_hours?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  trainer_name?: string | null;
  trainer_staff_id?: string | null; // FK to staff(id) for internal trainer; NULL = external/vendor
  notes?: string | null;
  sort_order?: number;
}

export interface UpdateSemesterScheduleDto {
  semester_label?: string;
  total_hours?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  trainer_name?: string | null;
  trainer_staff_id?: string | null; // FK to staff(id) for internal trainer; NULL = external/vendor
  notes?: string | null;
  sort_order?: number;
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
