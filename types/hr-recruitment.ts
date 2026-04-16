/**
 * HR Recruitment Module — TypeScript Types (Phase 1A)
 *
 * Spec: specs/hr-recruitment-module-spec.md
 * Pattern: mirrors HRLeaveApplication shape from types/hr.ts
 *
 * Tables:
 *   - hr_recruitment_candidates       (main candidacy record)
 *   - hr_recruitment_candidate_packages (Salary negotiation, stricter RLS)
 *
 * Decisions locked: R1.1-R1.4, R2.1-R2.4, R3.1-R3.4, R4.1
 * Shadow-tenant pattern: jkknkb/MyJKKN/Architecture/shadow-tenant-pattern.md
 */

// Re-export the shared approval step shape (identical structure, same engine)
export type { LeaveApprovalStep as RecruitmentApprovalStep } from '@/types/hr';

// =====================================================================================
// Enum-style literal types
// =====================================================================================

export type CandidateStatus =
  | 'submitted'
  | 'pending_approval'
  | 'approved'
  | 'package_fixed'
  | 'offer_issued'
  | 'joined'
  | 'rejected'
  | 'withdrawn'
  | 'offer_rescinded'
  | 'no_show';

export type RoleCategory =
  | 'teaching_faculty'
  | 'medical'
  | 'non_teaching'
  | 'senior_leadership'
  | 'contract';

export type MonthlySalaryBand =
  | 'under_50k'
  | '50k_to_1L'
  | 'over_1L';

export type CandidateSource =
  | 'hr_submission'
  | 'principal_submission'
  | 'hod_submission'
  | 'internal_transfer'
  | 'learner_graduate'
  | 'public_careers_page'
  | 'email_ingest';

export type PackageStatus =
  | 'proposed'
  | 'approved'
  | 'countered'
  | 'rejected';

// =====================================================================================
// hr_recruitment_candidates
// =====================================================================================

export interface HRRecruitmentCandidate {
  id: string;
  hr_organization_id: string;
  institution_id: string | null;

  name: string;
  email: string;
  phone: string | null;
  cvviz_url: string;                    // R3.4: CV link mandatory

  role_category: RoleCategory;
  role_title: string;
  proposed_monthly_salary_band: MonthlySalaryBand | null;
  role_specific_details: Record<string, unknown>; // R1.3: flexible per-role data

  status: CandidateStatus;
  cancellation_reason: string | null;   // R2.1

  is_emergency: boolean;                // R3.2
  is_internal_transfer: boolean;        // R4.1
  source_staff_id: string | null;       // R4.1: FK when internal transfer
  source: CandidateSource;

  // Approval workflow (R1.4 — frozen snapshot pattern, mirrors HRLeaveApplication)
  approval_chain: import('@/types/hr').LeaveApprovalStep[] | null;
  current_step: number;
  final_approver_id: string | null;
  final_decided_at: string | null;
  rejection_reason: string | null;

  expected_joining_date: string | null;
  actual_joining_date: string | null;

  submitted_by: string;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

export interface HRRecruitmentCandidateInsert {
  hr_organization_id: string;
  institution_id?: string | null;

  name: string;
  email: string;
  phone?: string | null;
  cvviz_url: string;

  role_category: RoleCategory;
  role_title: string;
  proposed_monthly_salary_band?: MonthlySalaryBand | null;
  role_specific_details?: Record<string, unknown>;

  status?: CandidateStatus;
  is_emergency?: boolean;
  is_internal_transfer?: boolean;
  source_staff_id?: string | null;
  source?: CandidateSource;

  expected_joining_date?: string | null;
  submitted_by: string;

  // approval_chain is built by the service from hr_approval_flows — never sent by caller
}

export type HRRecruitmentCandidateUpdate = Partial<
  Pick<
    HRRecruitmentCandidate,
    | 'status'
    | 'cancellation_reason'
    | 'rejection_reason'
    | 'expected_joining_date'
    | 'actual_joining_date'
    | 'approval_chain'
    | 'current_step'
    | 'final_approver_id'
    | 'final_decided_at'
    | 'role_specific_details'
    | 'proposed_monthly_salary_band'
  >
>;

// =====================================================================================
// hr_recruitment_candidate_packages
// Learning #8 — Monthly Salary on separate table with stricter RLS
// =====================================================================================

export interface MonthlySalaryBreakdown {
  basic?: number;
  hra?: number;
  da?: number;
  pf_employer?: number;
  other_allowances?: number;
  gross?: number;
  [key: string]: number | undefined;
}

export interface HRRecruitmentCandidatePackage {
  id: string;
  candidate_id: string;
  hr_organization_id: string | null;

  proposed_by: string;
  proposed_monthly_salary: number;
  proposed_monthly_salary_breakdown: MonthlySalaryBreakdown | null;
  currency: string;

  is_counter_offer: boolean;            // true = Director counter to HR's proposal
  parent_package_id: string | null;     // for negotiation chain

  status: PackageStatus;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;

  created_at: string;
}

export interface HRRecruitmentCandidatePackageInsert {
  candidate_id: string;
  hr_organization_id?: string | null;
  proposed_by: string;
  proposed_monthly_salary: number;
  proposed_monthly_salary_breakdown?: MonthlySalaryBreakdown | null;
  currency?: string;
  is_counter_offer?: boolean;
  parent_package_id?: string | null;
  notes?: string | null;
}

// =====================================================================================
// Filters
// =====================================================================================

export interface CandidateFilters {
  hr_organization_id?: string;
  institution_id?: string;
  status?: CandidateStatus | CandidateStatus[];
  role_category?: RoleCategory;
  is_emergency?: boolean;
  source?: CandidateSource;
  search?: string;
  page?: number;
  pageSize?: number;
}

// =====================================================================================
// API response shapes
// =====================================================================================

export interface CandidateListResponse {
  data: HRRecruitmentCandidate[];
  metadata: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// =====================================================================================
// Display labels
// =====================================================================================

export const CANDIDATE_STATUS_LABELS: Record<CandidateStatus, string> = {
  submitted: 'Submitted',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  package_fixed: 'Package Fixed',
  offer_issued: 'Offer Issued',
  joined: 'Joined',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  offer_rescinded: 'Offer Rescinded',
  no_show: 'No Show',
};

export const ROLE_CATEGORY_LABELS: Record<RoleCategory, string> = {
  teaching_faculty: 'Senior Learner (Teaching Faculty)',
  medical: 'Medical / Clinical',
  non_teaching: 'Non-Teaching Staff',
  senior_leadership: 'Senior Leadership',
  contract: 'Contract / Temporary',
};

export const MONTHLY_SALARY_BAND_LABELS: Record<MonthlySalaryBand, string> = {
  under_50k: 'Under ₹50,000/mo',
  '50k_to_1L': '₹50,000–₹1,00,000/mo',
  over_1L: 'Over ₹1,00,000/mo',
};

export const CANDIDATE_SOURCE_LABELS: Record<CandidateSource, string> = {
  hr_submission: 'HR Incharge',
  principal_submission: 'Principal',
  hod_submission: 'HOD',
  internal_transfer: 'Internal Transfer',
  learner_graduate: 'Graduating Learner',
  public_careers_page: 'Public Career Page',
  email_ingest: 'Email (Auto-Ingest)',
};
