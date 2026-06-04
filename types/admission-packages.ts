// ============================================================================
// Admission Packages — types (v2)
// ----------------------------------------------------------------------------
// A package defines eligibility dimensions (who it applies to) and contents
// (which room + mess category are bundled). Modelled after the fee-structure
// dimension approach: each FK dimension nullable = "any / not scoped".
//
// Changed from v1 (2026-05-29):
//   - Removed: total_price_inr (pricing no longer owned by package definition)
//   - Added: admission_year_id, degree_id, department_id, programme_id,
//            quota_id, gender, mess_category_id, package_type
//   - Added: admission_package_communities junction (multi-community scope)
//   - Retired: admission_package_program_eligibility junction — replaced by
//              direct programme_id FK (NULL = all programmes)
//
// The learner↔package link stays in learner_package_assignment.
// chosen_mess_category_id on that table acts as a per-learner override of the
// package's default mess_category_id.
// ============================================================================

export interface AdmissionPackage {
  id: string;
  institution_id: string;
  // ── eligibility dimensions (all nullable = "any / not scoped") ──────────
  admission_year_id: string | null;
  degree_id: string | null;
  department_id: string | null;
  /** NULL = all programmes in the institution. Replaces v1 junction table. */
  programme_id: string | null;
  quota_id: string | null;
  /** MALE | FEMALE | null (null = any gender) */
  gender: 'MALE' | 'FEMALE' | null;
  /**
   * Communities this package applies to (from admission_package_communities
   * junction). Empty array = applies to all communities. Always populated by
   * the read-side service queries.
   */
  community_category_ids: string[];
  // ── package contents ────────────────────────────────────────────────────
  name: string;
  description: string | null;
  room_category_id: string;
  /** Bundled mess category. NULL = not specified (learner override still applies). */
  mess_category_id: string | null;
  /** 'package' = bundled room+mess deal; 'non_package' = eligibility marker only */
  package_type: 'package' | 'non_package';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  // ── optional joined display fields (populated by service select embeds) ──
  room_category_name?: string | null;
  mess_category_name?: string | null;
  degree_name?: string | null;
  department_name?: string | null;
  programme_name?: string | null;
  admission_year_name?: string | null;
  quota_name?: string | null;
  /** Display names for community_category_ids (resolved by the list query). Empty = all communities. */
  community_category_names?: string[];
}

export interface CreateAdmissionPackageDto {
  institution_id: string;
  // eligibility dims
  admission_year_id?: string | null;
  degree_id?: string | null;
  department_id?: string | null;
  programme_id?: string | null;
  quota_id?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
  /** Community UUIDs from community_categories. Empty = all communities. */
  community_category_ids?: string[];
  // contents
  name: string;
  description?: string | null;
  room_category_id: string;
  mess_category_id?: string | null;
  package_type?: 'package' | 'non_package';
  is_active?: boolean;
}

export interface UpdateAdmissionPackageDto {
  // eligibility dims
  admission_year_id?: string | null;
  degree_id?: string | null;
  department_id?: string | null;
  programme_id?: string | null;
  quota_id?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
  community_category_ids?: string[];
  // contents
  name?: string;
  description?: string | null;
  room_category_id?: string;
  mess_category_id?: string | null;
  package_type?: 'package' | 'non_package';
  is_active?: boolean;
}

export interface AdmissionPackageFilters {
  institution_id?: string;
  admission_year_id?: string;
  degree_id?: string;
  department_id?: string;
  programme_id?: string;
  quota_id?: string;
  gender?: 'MALE' | 'FEMALE';
  package_type?: 'package' | 'non_package';
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

// ── community junction ──────────────────────────────────────────────────────
export interface AdmissionPackageCommunity {
  id: string;
  package_id: string;
  community_category_id: string;
  created_at: string;
  created_by: string | null;
}

// ── learner ↔ package assignment ────────────────────────────────────────────
export interface LearnerPackageAssignment {
  id: string;
  learner_id: string;
  package_id: string;
  hostel_year_id: string | null;
  /** Per-learner override of the package's default mess_category_id. */
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

// Resolved handoff shape consumed by the allocation flow.
export interface ResolvedLearnerPackage {
  assignment: LearnerPackageAssignment;
  pkg: AdmissionPackage;
  room_category_id: string;
  chosen_mess_category_id: string | null;
}
