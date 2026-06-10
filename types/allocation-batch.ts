export type AllocationBatchStatus = 'pending_approval' | 'approved' | 'rejected';

export interface AllocationBatch {
  id: string;
  institution_id: string | null;
  block_id: string | null;
  category_id: string | null;
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

/** Rooms used + beds filled for one room category within a batch. */
export interface BatchCategoryBreakdown {
  category: string;
  rooms: number;
  beds: number;
}

export interface AllocationBatchRow extends AllocationBatch {
  category_name: string | null;
  institution_name: string | null;
  block_name: string | null;
  // Populated by getBatches (list) only — per-room-category rooms/beds in the batch.
  category_breakdown?: BatchCategoryBreakdown[];
  // Populated by getBatch (detail) only; the list (getBatches) omits them.
  block_total_capacity?: number | null;
  block_current_occupancy?: number | null;
}

export interface AllocatePreview {
  cohort_eligible: number;
  no_profile: number;
  already_allocated: number;
  /** All free student beds in the block (rule-covered OR rule-free — no-rule rooms are open to all served institutions). */
  available_beds: number;
  /** Does the block have any active physical-room eligibility rule? Informational only (no longer gates auto-allocation). */
  rules_set: boolean;
}

export interface ProposedAllocation {
  id: string;
  learner_name: string;
  learner_institution: string | null;
  learner_program: string | null;
  learner_semester: string | null;
  block_name: string | null;
  room_number: string | null;
  room_category: string | null;
  mess_category: string | null;
  bed_number: string | null;
  status: string;
}

/** One configured Program-Eligibility condition with per-condition verdicts for the learner.
 *  selected_room/selected_mess mark the winner-scope row(s) the resolvers actually applied. */
export interface EligibilityRuleExplain {
  program: string | null; // null = any program (institution default)
  quota: string | null; // null = any quota
  fee_min: number | null;
  fee_max: number | null;
  room_category: string | null;
  mess_category: string | null;
  program_ok: boolean;
  quota_ok: boolean;
  fee_ok: boolean;
  matched: boolean;
  selected_room: boolean;
  selected_mess: boolean;
}

/** One academic bill; `counted` = it produced the gating fee (current-AY, not cancelled/superseded). */
export interface BillExplain {
  description: string | null;
  amount: number;
  status: string | null;
  due_date: string;
  academic_year: string | null;
  counted: boolean;
}

/** Shape returned by fn_explain_allocation — why a resident was allocated to a room. */
export interface AllocationEligibilityExplain {
  allocation_id: string;
  room_number: string | null;
  status: string;
  learner: {
    institution: string | null;
    degree: string | null;
    department: string | null;
    program: string | null;
    semester: string | null;
    quota: string | null;
    academic_year: string | null;
    academic_fee: number | null;
    gender: string | null;
  };
  eligibility_rules: EligibilityRuleExplain[];
  bills: BillExplain[];
  category: {
    allocated_room_category: string | null;
    resolved_room_category: string | null;
    room_category_matched: boolean;
    resolved_mess_category: string | null;
    academic_year: string | null;
    academic_fee: number | null;
    gender: string | null;
    gender_ok: boolean;
  };
  physical: {
    institution_served: boolean;
    is_rule_covered: boolean;
    rule_matched: boolean;
    open_room: boolean;
    /** Cohort matches a reservation rule in another block — pinned to those rooms. */
    pinned_elsewhere?: boolean;
    pinned_blocks?: string | null;
    access_ok: boolean;
    covering_rules: Array<{
      rule_name: string;
      floor: number | null;
      matched: boolean;
      cohort: string | null;
      // Per-dimension condition-vs-learner comparison (null dim = "any").
      institution: string | null;
      institution_ok: boolean;
      degree: string | null;
      degree_ok: boolean;
      department: string | null;
      department_ok: boolean;
      program: string | null;
      program_ok: boolean;
      semester: string | null;
      semester_ok: boolean;
    }>;
  };
  bill: {
    current_year_bills: number;
    academic_bills: number;
  };
  error?: string;
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
  bed_available: boolean;
  academic_year_id: string | null;
  academic_year_name: string | null;
  academic_bill_count: number;
  current_year_bill_count: number;
  bill_other_year_name: string | null;
  current_year_fee: number | null;
  resolved_room_category_id: string | null;
  resolved_room_category_name: string | null;
  resolved_mess_category_id: string | null;
  resolved_mess_category_name: string | null;
  bill_state: BillState;
  stage: CandidateStage;
  verdict: CandidateVerdict;
  exclusion_reason: string | null;
}
