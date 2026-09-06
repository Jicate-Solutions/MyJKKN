// Combined program eligibility — one row maps (institution, program, quota, fee band)
// to BOTH a room and a mess category. program_id === null => institution default;
// quota_ids === null => any quota (an empty selection stores null). Fee band is half-open [fee_min, fee_max) in rupees
// (either bound null => unbounded). effective_from is reserved (later PR).

export interface ProgramEligibility {
  id: string;
  institution_id: string;
  program_id: string | null;
  quota_ids: string[] | null;
  fee_min: number | null;
  fee_max: number | null;
  room_category_id: string | null;
  mess_category_id: string | null;
  hostel_type: string; // 'boys' | 'girls' | 'both' — which gender(s) the band applies to
  is_monthly_mess_allowed: boolean;
  is_active: boolean;
  effective_from: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// Joined / display shape used by the data table (resolves names for UI).
export interface ProgramEligibilityRow extends ProgramEligibility {
  institution_name: string | null;
  program_name: string | null; // null => institution default
  quota_names: string[]; // [] => any quota; aligned 1:1 with quota_ids
  room_category_name: string | null;
  mess_category_name: string | null;
}

export interface CreateProgramEligibilityDto {
  institution_id: string;
  program_id?: string | null;
  quota_ids?: string[] | null;
  fee_min?: number | null;
  fee_max?: number | null;
  room_category_id?: string | null;
  mess_category_id?: string | null;
  hostel_type?: string; // 'boys' | 'girls' | 'both' (default 'both')
  is_monthly_mess_allowed?: boolean;
  is_active?: boolean;
  effective_from?: string | null;
}

export interface UpdateProgramEligibilityDto {
  // Scope / quota / fee band / categories are editable (institution stays fixed —
  // delete & recreate to move tenant). All optional; only the keys sent are updated.
  program_id?: string | null;
  quota_ids?: string[] | null;
  fee_min?: number | null;
  fee_max?: number | null;
  room_category_id?: string | null;
  mess_category_id?: string | null;
  hostel_type?: string; // 'boys' | 'girls' | 'both'
  is_active?: boolean;
  is_monthly_mess_allowed?: boolean;
  effective_from?: string | null;
}

export interface ProgramEligibilityFilters {
  institution_id: string;
  program_id?: string | null; // omit => all rows for the institution
  is_active?: boolean;
}

// One row of the sync dry-run (fn_preview_hostel_fee_categories) — what the
// fee-condition sync WOULD do to each active hostel learner, with the matched
// condition. 'no_academic_bill' learners are shown but skipped by the sync.
export interface CategorySyncPreviewRow {
  learner_id: string;
  learner_name: string | null;
  roll_number: string | null;
  institution_name: string | null;
  program_name: string | null;
  semester_name: string | null;
  quota_name: string | null;
  gender: string | null;
  /** Admission-year anchored academic fee the band was matched against. */
  band_fee: number | null;
  /** Which academic year that fee was read from. */
  band_academic_year_name: string | null;
  has_academic_bill: boolean;
  is_allocated: boolean;
  reason:
    | 'band_match'
    | 'classic_default_fee_unknown'
    | 'classic_default_no_band'
    | 'no_academic_bill';
  current_room: string | null;
  new_room: string | null;
  current_mess: string | null;
  new_mess: string | null;
  will_change: boolean;
}
