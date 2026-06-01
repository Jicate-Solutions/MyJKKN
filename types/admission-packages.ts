// ============================================================================
// Admission Packages — types
// ----------------------------------------------------------------------------
// A package bundles a (Classic) room category for a single flat price.
//   - Admission module owns the PRICE (total_price_inr); Campus Living owns the
//     CONTENTS (which categories are bundled). (decisions 12, 14)
//   - Every package's room component is a Classic-tier category; Premium is
//     never bundled — it is always an opt-in upgrade. (decision 13)
//   - Mess choice is decoupled: the learner picks a mess category separately at
//     admission, stored on the learner↔package assignment. (decision 15)
// The learner↔package link lives in its own table (learner_package_assignment),
// deliberately NOT a column on learners_profiles, to avoid colliding with the
// in-flight learner-schema rework.
// ============================================================================

export interface AdmissionPackage {
  id: string;
  institution_id: string;
  hostel_year_id: string | null;
  name: string;
  description: string | null;
  total_price_inr: number;
  room_category_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  // optional joined display fields (populated by select with embeds)
  room_category_name?: string | null;
  hostel_year_name?: string | null;
  // derived program-availability summary for the list view (populated by
  // getPackages via the embedded eligibility rows). available_to_all = a
  // program_id=null row exists with no specific overrides.
  available_to_all_programs?: boolean;
  restricted_program_count?: number;
}

export interface CreateAdmissionPackageDto {
  institution_id: string;
  hostel_year_id?: string | null;
  name: string;
  description?: string | null;
  total_price_inr: number;
  room_category_id: string;
  is_active?: boolean;
}

export interface UpdateAdmissionPackageDto {
  hostel_year_id?: string | null;
  name?: string;
  description?: string | null;
  total_price_inr?: number;
  room_category_id?: string;
  is_active?: boolean;
}

export interface AdmissionPackageFilters {
  institution_id?: string;
  hostel_year_id?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AdmissionPackageListResponse {
  data: AdmissionPackage[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ── per-program availability ────────────────────────────────────────────────
// A row with program_id = null means "available to all programs in the
// institution"; a concrete program_id scopes availability to that program.
export interface AdmissionPackageProgramEligibility {
  id: string;
  package_id: string;
  program_id: string | null;
  created_at: string;
  created_by: string | null;
}

export interface CreatePackageProgramEligibilityDto {
  package_id: string;
  program_id?: string | null;
}

// ── learner ↔ package assignment ──────────────────────────────────────────
export interface LearnerPackageAssignment {
  id: string;
  learner_id: string;
  package_id: string;
  hostel_year_id: string | null;
  chosen_mess_category_id: string | null;
  assigned_at: string;
  created_by: string | null;
}

export interface CreateLearnerPackageAssignmentDto {
  learner_id: string;
  package_id: string;
  hostel_year_id?: string | null;
  chosen_mess_category_id?: string | null;
}

// Resolved handoff shape consumed by the allocation flow: a learner's assigned
// package + the bundled room category + their separately-chosen mess.
export interface ResolvedLearnerPackage {
  assignment: LearnerPackageAssignment;
  pkg: AdmissionPackage;
  room_category_id: string;
  chosen_mess_category_id: string | null;
}
