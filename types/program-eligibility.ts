// Combined program eligibility — one row maps (institution, program, quota, fee band)
// to BOTH a room and a mess category. program_id === null => institution default;
// quota_id === null => any quota. Fee band is half-open [fee_min, fee_max) in rupees
// (either bound null => unbounded). effective_from is reserved (later PR).

export interface ProgramEligibility {
  id: string;
  institution_id: string;
  program_id: string | null;
  quota_id: string | null;
  fee_min: number | null;
  fee_max: number | null;
  room_category_id: string | null;
  mess_category_id: string | null;
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
  quota_name: string | null; // null => any quota
  room_category_name: string | null;
  mess_category_name: string | null;
}

export interface CreateProgramEligibilityDto {
  institution_id: string;
  program_id?: string | null;
  quota_id?: string | null;
  fee_min?: number | null;
  fee_max?: number | null;
  room_category_id?: string | null;
  mess_category_id?: string | null;
  is_monthly_mess_allowed?: boolean;
  is_active?: boolean;
  effective_from?: string | null;
}

export interface UpdateProgramEligibilityDto {
  is_active?: boolean;
  is_monthly_mess_allowed?: boolean;
  effective_from?: string | null;
}

export interface ProgramEligibilityFilters {
  institution_id: string;
  program_id?: string | null; // omit => all rows for the institution
  is_active?: boolean;
}
