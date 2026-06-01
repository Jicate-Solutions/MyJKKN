export type AllocationBatchStatus = 'pending_approval' | 'approved' | 'rejected';

export interface AllocationBatch {
  id: string;
  institution_id: string | null;
  block_id: string | null;
  category_id: string;
  hostel_year_id: string | null;
  academic_year_id: string | null;
  status: AllocationBatchStatus;
  allocated_count: number;
  skipped_count: number;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AllocationBatchRow extends AllocationBatch {
  category_name: string | null;
  institution_name: string | null;
  block_name: string | null;
  // Populated by getBatch (detail) only; the list (getBatches) omits them.
  block_total_capacity?: number | null;
  block_current_occupancy?: number | null;
}

export interface AllocatePreview {
  cohort_eligible: number;
  no_profile: number;
  already_allocated: number;
  available_beds: number;
}

export interface ProposedAllocation {
  id: string;
  learner_name: string;
  learner_institution: string | null;
  learner_program: string | null;
  block_name: string | null;
  room_number: string | null;
  bed_number: string | null;
  status: string;
}

export interface AutoCategoryOption {
  id: string;
  name: string;
  type: string;
}

export interface AcademicYearOption {
  id: string;
  label: string;
}
