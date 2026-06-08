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
  /** Beds in rooms covered by an active physical-room rule (auto-allocation is rule-driven). */
  available_beds: number;
  /** Does the block have any active physical-room eligibility rule? Drives the "set rules first" guard. */
  rules_set: boolean;
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

export type BillState = 'matched' | 'different_year' | 'untagged' | 'none';
export type CandidateStage = 'prerequisite' | 'eligibility' | 'ok';
export type CandidateVerdict = 'in' | 'out';

/** One row from fn_auto_allocate_candidates — a learner's per-condition verdict. */
export interface AllocationCandidate {
  learner_id: string;
  full_name: string;
  email: string | null;
  program_name: string | null;
  gender: string | null;
  has_profile: boolean;
  gender_ok: boolean;
  not_allocated: boolean;
  physical_rule_ok: boolean;
  academic_year_id: string | null;
  academic_year_name: string | null;
  academic_bill_count: number;
  current_year_bill_count: number;
  bill_other_year_name: string | null;
  current_year_fee: number | null;
  fee_resolved: boolean;
  fee_category_match: boolean;
  bill_state: BillState;
  stage: CandidateStage;
  verdict: CandidateVerdict;
  exclusion_reason: string | null;
}
