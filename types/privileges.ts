// ============================================================
// Privilege Types (Extensible Registry)
// ============================================================

export type PrivilegeCategory = 'academic' | 'financial' | 'facility' | 'other';

export interface PrivilegeType {
  id: string;
  institution_id: string;
  key: string;
  name: string;
  description: string | null;
  category: PrivilegeCategory;
  is_system: boolean;
  config_schema: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// Privilege Groups
// ============================================================

export type PrivilegeGroupStatus = 'active' | 'expired' | 'archived';

export interface PrivilegeGroup {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  reference_code: string;
  semester_id: string | null;
  status: PrivilegeGroupStatus;
  is_template: boolean;
  template_name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Relations (optional, populated via joins)
  privilege_types?: PrivilegeGroupType[];
  member_count?: number;
  creator?: { id: string; full_name: string };
}

export interface CreatePrivilegeGroupDto {
  institution_id: string;
  name: string;
  description?: string;
  reference_code: string;
  semester_id?: string;
  is_template?: boolean;
  template_name?: string;
  created_by: string;
  privilege_type_ids: string[]; // IDs of privilege_types to link
  type_configs?: Record<string, Record<string, unknown>>; // type_id -> config
}

export interface UpdatePrivilegeGroupDto {
  name?: string;
  description?: string;
  reference_code?: string;
  semester_id?: string;
  status?: PrivilegeGroupStatus;
  is_template?: boolean;
  template_name?: string;
  privilege_type_ids?: string[];
  type_configs?: Record<string, Record<string, unknown>>;
}

// ============================================================
// Privilege Group Types (M2M)
// ============================================================

export interface PrivilegeGroupType {
  id: string;
  group_id: string;
  type_id: string;
  config: Record<string, unknown>;
  // Relations
  privilege_type?: PrivilegeType;
}

// ============================================================
// Privilege Members
// ============================================================

export type PrivilegeMemberStatus = 'active' | 'under_review' | 'revoked';

export interface PrivilegeMember {
  id: string;
  group_id: string;
  learner_id: string;
  status: PrivilegeMemberStatus;
  start_date: string;
  end_date: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  review_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Relations
  learner?: {
    id: string;
    full_name: string;
    first_name: string;
    last_name: string;
    roll_number: string | null;
    student_photo_url: string | null;
    department_id: string | null;
  };
  group?: PrivilegeGroup;
}

export interface AddMemberDto {
  group_id: string;
  learner_id: string;
  start_date?: string;
  end_date?: string;
  created_by: string;
}

export interface BulkAddMembersDto {
  group_id: string;
  learner_ids: string[];
  start_date?: string;
  end_date?: string;
  created_by: string;
}

export interface UpdateMemberStatusDto {
  status: PrivilegeMemberStatus;
  revoke_reason?: string;
  review_notes?: string;
  revoked_by?: string;
}

// ============================================================
// Privilege Reviews
// ============================================================

export interface PrivilegeReview {
  id: string;
  group_id: string;
  reviewer_id: string;
  review_date: string;
  members_reviewed: number;
  members_kept: number;
  members_revoked: number;
  notes: string | null;
  created_at: string;
  // Relations
  reviewer?: { id: string; full_name: string };
}

export interface CreateReviewDto {
  group_id: string;
  reviewer_id: string;
  review_date?: string;
  notes?: string;
  member_decisions: {
    member_id: string;
    decision: 'keep' | 'under_review' | 'revoke';
    notes?: string;
    revoke_reason?: string;
  }[];
}

// ============================================================
// Progress Reports (V1.1)
// ============================================================

export interface PrivilegeProgressReport {
  id: string;
  member_id: string;
  report_month: string;
  app_url: string | null;
  github_url: string | null;
  description: string | null;
  screenshot_url: string | null;
  auto_signals: {
    last_commit?: string;
    app_live?: boolean;
    [key: string]: unknown;
  };
  submitted_at: string;
}

// ============================================================
// Filters
// ============================================================

export interface PrivilegeGroupFilters {
  institution_id?: string;
  status?: PrivilegeGroupStatus;
  semester_id?: string;
  is_template?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PrivilegeMemberFilters {
  group_id?: string;
  learner_id?: string;
  status?: PrivilegeMemberStatus;
  search?: string;
  page?: number;
  limit?: number;
}

// ============================================================
// Integration Types (used by attendance + marks)
// ============================================================

export interface ActivePrivilegeInfo {
  group_id: string;
  group_name: string;
  reference_code: string;
  group_status: PrivilegeGroupStatus;
  member_id: string;
  member_status: PrivilegeMemberStatus;
  start_date: string;
  end_date: string | null;
  privilege_types: {
    key: string;
    name: string;
    category: PrivilegeCategory;
    config: Record<string, unknown>;
  }[];
}
