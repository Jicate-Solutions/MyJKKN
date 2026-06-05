// Per-program eligibility matrix — institution default + per-program override.
// program_id === null => institution default (applies to all programs in the
// institution); a concrete program_id overrides for that program.
// effective_from is reserved for forward-only restriction semantics (later PR).

// ─── Room category eligibility ────────────────────────────────────────────
export interface ProgramRoomEligibility {
  id: string;
  institution_id: string;
  program_id: string | null;
  room_category_id: string;
  is_active: boolean;
  effective_from: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// Joined / display shape used by the data table (resolves names for UI).
export interface ProgramRoomEligibilityRow extends ProgramRoomEligibility {
  institution_name: string | null;
  program_name: string | null; // null => institution default
  room_category_name: string | null;
}

export interface CreateProgramRoomEligibilityDto {
  institution_id: string;
  program_id?: string | null;
  room_category_id: string;
  is_active?: boolean;
  effective_from?: string | null;
}

export interface UpdateProgramRoomEligibilityDto {
  is_active?: boolean;
  effective_from?: string | null;
}

// ─── Mess category eligibility (+ per-program monthly flag) ─────────────────
export interface ProgramMessEligibility {
  id: string;
  institution_id: string;
  program_id: string | null;
  mess_category_id: string;
  is_monthly_mess_allowed: boolean;
  is_active: boolean;
  effective_from: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface ProgramMessEligibilityRow extends ProgramMessEligibility {
  institution_name: string | null;
  program_name: string | null; // null => institution default
  mess_category_name: string | null;
}

export interface CreateProgramMessEligibilityDto {
  institution_id: string;
  program_id?: string | null;
  mess_category_id: string;
  is_monthly_mess_allowed?: boolean;
  is_active?: boolean;
  effective_from?: string | null;
}

export interface UpdateProgramMessEligibilityDto {
  is_monthly_mess_allowed?: boolean;
  is_active?: boolean;
  effective_from?: string | null;
}

// ─── Shared filter shape ────────────────────────────────────────────────────
export interface ProgramEligibilityFilters {
  institution_id: string;
  program_id?: string | null; // omit => all rows for the institution
  is_active?: boolean;
}
