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

// =====================================================================================
// Phase 3 — Cvviz-sunset scope (Jobs + Interviews + Scorecards)
// Spec: specs/hr-recruitment-module-spec.md
// Added: 2026-04-16
// =====================================================================================

// ---- Phase 3 enum-style literals ----------------------------------------------------

export type JobStatus =
  | 'draft'
  | 'open'
  | 'on_hold'
  | 'closed'
  | 'filled';

export type InterviewStatus =
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

export type InterviewMode =
  | 'in_person'
  | 'phone'
  | 'video'
  | 'walk_in';

export type ScorecardRecommendation =
  | 'strong_hire'
  | 'hire'
  | 'neutral'
  | 'no_hire'
  | 'strong_no_hire';

// =====================================================================================
// hr_recruitment_jobs
// =====================================================================================

export interface JobRequirements {
  qualifications?: string[];
  experience?: string;
  skills?: string[];
  [key: string]: unknown;
}

export interface HRRecruitmentJob {
  id: string;
  hr_organization_id: string;
  institution_id: string | null;

  title: string;
  role_category: RoleCategory;
  description: string | null;
  requirements: JobRequirements;

  min_monthly_salary: number | null;
  max_monthly_salary: number | null;

  positions_open: number;
  positions_filled: number;

  department_id: string | null;

  status: JobStatus;
  is_public: boolean;

  posted_at: string | null;
  closes_at: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRRecruitmentJobInsert {
  hr_organization_id: string;
  institution_id?: string | null;
  title: string;
  role_category: RoleCategory;
  description?: string | null;
  requirements?: JobRequirements;
  min_monthly_salary?: number | null;
  max_monthly_salary?: number | null;
  positions_open?: number;
  positions_filled?: number;
  department_id?: string | null;
  status?: JobStatus;
  is_public?: boolean;
  posted_at?: string | null;
  closes_at?: string | null;
  created_by?: string | null;
}

export type HRRecruitmentJobUpdate = Partial<
  Pick<
    HRRecruitmentJob,
    | 'title'
    | 'role_category'
    | 'description'
    | 'requirements'
    | 'min_monthly_salary'
    | 'max_monthly_salary'
    | 'positions_open'
    | 'positions_filled'
    | 'department_id'
    | 'status'
    | 'is_public'
    | 'posted_at'
    | 'closes_at'
  >
>;

export interface JobFilters {
  hr_organization_id?: string;
  institution_id?: string;
  status?: JobStatus | JobStatus[];
  role_category?: RoleCategory;
  department_id?: string;
  is_public?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface JobListResponse {
  data: HRRecruitmentJob[];
  metadata: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// =====================================================================================
// hr_recruitment_interviews
// =====================================================================================

export interface HRRecruitmentInterview {
  id: string;
  candidate_id: string;
  job_id: string | null;

  round_number: number;
  round_name: string | null;

  scheduled_at: string;
  duration_minutes: number;
  mode: InterviewMode;
  location_or_link: string | null;

  panel_member_ids: string[];

  status: InterviewStatus;
  rescheduled_from_id: string | null;
  outcome_summary: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRRecruitmentInterviewInsert {
  candidate_id: string;
  job_id?: string | null;
  round_number?: number;
  round_name?: string | null;
  scheduled_at: string;
  duration_minutes?: number;
  mode: InterviewMode;
  location_or_link?: string | null;
  panel_member_ids: string[];
  status?: InterviewStatus;
  rescheduled_from_id?: string | null;
  outcome_summary?: string | null;
  created_by?: string | null;
}

export type HRRecruitmentInterviewUpdate = Partial<
  Pick<
    HRRecruitmentInterview,
    | 'round_number'
    | 'round_name'
    | 'scheduled_at'
    | 'duration_minutes'
    | 'mode'
    | 'location_or_link'
    | 'panel_member_ids'
    | 'status'
    | 'outcome_summary'
  >
>;

export interface InterviewFilters {
  candidate_id?: string;
  job_id?: string;
  status?: InterviewStatus | InterviewStatus[];
  panel_member_id?: string;       // filter to interviews where user is on the panel
  from_date?: string;
  to_date?: string;
  page?: number;
  pageSize?: number;
}

export interface InterviewListResponse {
  data: HRRecruitmentInterview[];
  metadata: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// =====================================================================================
// hr_recruitment_scorecards (stricter RLS — Learning #8)
// Submit-once per interviewer per interview.
// =====================================================================================

export interface HRRecruitmentScorecard {
  id: string;
  interview_id: string;
  interviewer_id: string;

  rating_overall: number;              // 1-5 (required)
  rating_technical: number | null;     // 1-5 or null
  rating_communication: number | null; // 1-5 or null
  rating_culture_fit: number | null;   // 1-5 or null

  strengths: string | null;
  concerns: string | null;

  recommendation: ScorecardRecommendation;

  submitted_at: string;
  created_at: string;
}

export interface HRRecruitmentScorecardInsert {
  interview_id: string;
  interviewer_id: string;
  rating_overall: number;
  rating_technical?: number | null;
  rating_communication?: number | null;
  rating_culture_fit?: number | null;
  strengths?: string | null;
  concerns?: string | null;
  recommendation: ScorecardRecommendation;
}

// =====================================================================================
// Phase 3 display labels
// =====================================================================================

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  on_hold: 'On Hold',
  closed: 'Closed',
  filled: 'Filled',
};

export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
  rescheduled: 'Rescheduled',
};

export const INTERVIEW_MODE_LABELS: Record<InterviewMode, string> = {
  in_person: 'In-Person',
  phone: 'Phone',
  video: 'Video Call',
  walk_in: 'Walk-In',
};

export const SCORECARD_RECOMMENDATION_LABELS: Record<ScorecardRecommendation, string> = {
  strong_hire: 'Strong Hire',
  hire: 'Hire',
  neutral: 'Neutral',
  no_hire: 'No Hire',
  strong_no_hire: 'Strong No-Hire',
};
