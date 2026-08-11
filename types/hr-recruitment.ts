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

export type JobType = 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance';
export type EmployerType = 'government' | 'private' | 'public_sector' | 'non_profit' | 'educational';
export type EducationLevel = 'high_school' | 'diploma' | 'bachelors' | 'masters' | 'phd' | 'any';
export type SalaryDuration = 'per_hour' | 'per_day' | 'per_month' | 'per_year';
export type SkillProficiency = 'basic' | 'intermediate' | 'pro' | 'expert';
export type SkillType = 'required' | 'nice_to_have';

export interface JobSkill {
  name: string;
  type: SkillType;
  proficiency: SkillProficiency;
}

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
  proposed_monthly_salary: number | null;   // optional — package may be proposed without a figure
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
  proposed_monthly_salary?: number | null;
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
  /**
   * Approver-inbox view: restrict to candidates whose approval_chain[current_step]
   * targets `approver_id`. Required to be paired with `approver_id`.
   */
  pending_for_me?: boolean;
  /** UUID of the approver whose inbox we're computing. Required when `pending_for_me=true`. */
  approver_id?: string;
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
  teaching_faculty: 'Learning Facilitator (Teaching Faculty)',
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
  skills?: JobSkill[];
  experience?: string;
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

  // Extended fields (added 2026-06-27)
  job_code: string | null;
  job_type: JobType | null;
  industry: string | null;
  employer_type: EmployerType | null;
  country: string | null;
  state: string | null;
  city: string | null;
  zip_code: string | null;
  education_level: EducationLevel | null;
  min_experience_years: number | null;
  max_experience_years: number | null;
  salary_currency: string;
  salary_duration: SalaryDuration;
  display_salary: boolean;

  status: JobStatus;
  is_public: boolean;

  posted_at: string | null;
  closes_at: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRRecruitmentJobInsert {
  /**
   * Optional: when omitted, a DB trigger (hr_recruitment_jobs_fill_org)
   * derives it from institution_id (1:1 via hr_organizations.institution_id).
   */
  hr_organization_id?: string | null;
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
  // Extended fields
  job_code?: string | null;
  job_type?: JobType | null;
  industry?: string | null;
  employer_type?: EmployerType | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  zip_code?: string | null;
  education_level?: EducationLevel | null;
  min_experience_years?: number | null;
  max_experience_years?: number | null;
  salary_currency?: string;
  salary_duration?: SalaryDuration;
  display_salary?: boolean;
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
    | 'job_code'
    | 'job_type'
    | 'industry'
    | 'employer_type'
    | 'country'
    | 'state'
    | 'city'
    | 'zip_code'
    | 'education_level'
    | 'min_experience_years'
    | 'max_experience_years'
    | 'salary_currency'
    | 'salary_duration'
    | 'display_salary'
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
  /** Whitelisted column name; falls back to created_at. */
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  full_time: 'Full Time',
  part_time: 'Part Time',
  contract: 'Contract',
  internship: 'Internship',
  freelance: 'Freelance',
};

export const EMPLOYER_TYPE_LABELS: Record<EmployerType, string> = {
  government: 'Government',
  private: 'Private',
  public_sector: 'Public Sector',
  non_profit: 'Non-Profit / Trust',
  educational: 'Educational Institution',
};

export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = {
  high_school: 'High School',
  diploma: 'Diploma',
  bachelors: "Bachelor's",
  masters: "Master's",
  phd: 'Ph.D.',
  any: 'Any',
};

export const SALARY_DURATION_LABELS: Record<SalaryDuration, string> = {
  per_hour: 'Per Hour',
  per_day: 'Per Day',
  per_month: 'Per Month',
  per_year: 'Per Year',
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

// =====================================================================================
// Job Applications — self-service candidate applications linked to a job posting
// Added: 2026-06-27 (replaces CVViz-URL-based submit flow)
// =====================================================================================

export type JobApplicationStatus = 'pending' | 'reviewed' | 'shortlisted' | 'rejected' | 'promoted';

export const JOB_APPLICATION_STATUS_LABELS: Record<JobApplicationStatus, string> = {
  pending: 'Pending Review',
  reviewed: 'Reviewed',
  shortlisted: 'Shortlisted',
  rejected: 'Rejected',
  promoted: 'In Approval Pipeline',
};

export interface HRJobApplication {
  id: string;
  job_id: string;
  institution_id: string | null;

  first_name: string;
  last_name: string;
  email: string;
  phone: string;

  current_job_title: string | null;
  current_company: string | null;
  current_job_duration_months: number | null;
  experience_months: number;
  qualification: string;
  worked_cities: string[];

  resume_url: string;
  resume_filename: string;
  resume_size_bytes: number | null;
  drive_file_id: string | null;

  status: JobApplicationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;

  applicant_user_id: string | null;
  /** Set when a shortlisted application is promoted into the approval pipeline. */
  promoted_candidate_id: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

/** Free-form discussion thread on a recruitment candidate (hr_recruitment_candidate_comments). */
export interface HRRecruitmentCandidateComment {
  id: string;
  candidate_id: string;
  hr_organization_id: string;
  commenter_id: string;
  comment: string;
  parent_comment_id: string | null;
  created_at: string;
  updated_at: string;
  /** Joined commenter display info (profiles embed). */
  commenter?: { full_name: string | null; email: string | null } | null;
}

export interface HRJobApplicationInsert {
  job_id: string;
  institution_id?: string | null;

  first_name: string;
  last_name: string;
  email: string;
  phone: string;

  current_job_title?: string | null;
  current_company?: string | null;
  current_job_duration_months?: number | null;
  experience_months: number;
  qualification: string;
  worked_cities?: string[];

  resume_url: string;
  resume_filename: string;
  resume_size_bytes?: number | null;
  drive_file_id?: string | null;
}

// -------------------------------------------------------------------------------------
// Purging a rejected applicant (super-admin only, 2026-08-05)
// -------------------------------------------------------------------------------------

/** Which rejection the purged record was sitting in when it was erased. */
export type PurgeStage = 'screening_rejected' | 'pipeline_rejected';

/**
 * Result of fn_purge_rejected_recruitment_applicant. `drive_files` lists the resumes
 * the API route still has to delete from Google Drive; each carries the
 * hr_recruitment_purge_log row to clear once the file is confirmed gone.
 */
export interface PurgeRejectedApplicantResult {
  applications_deleted: number;
  candidate_deleted: boolean;
  candidate_id: string | null;
  drive_files: Array<{ log_id: string; drive_file_id: string }>;
  stage: PurgeStage;
}

/** What the DELETE routes report back to the UI after a purge. */
export interface PurgeRejectedApplicantResponse extends PurgeRejectedApplicantResult {
  /** Resume files confirmed deleted from Drive. */
  resumes_deleted: number;
  /** Resume files Drive refused to delete — logged for a later sweep. */
  resumes_failed: number;
}

// =====================================================================================
// Approvals workspace (job-centric approvals module, 2026-07-06)
// =====================================================================================

/** Free-form job-level discussion thread (hr_recruitment_job_notes). */
export interface HRRecruitmentJobNote {
  id: string;
  job_id: string;
  hr_organization_id: string;
  author_id: string;
  note: string;
  created_at: string;
  updated_at: string;
  /** Joined author display info (profiles embed). */
  author?: { full_name: string | null; email: string | null } | null;
}

/**
 * One row of the job-first approvals overview: a job plus its pipeline counts.
 * Application counts come from hr_job_applications (FK link); candidate counts
 * come from hr_recruitment_candidates via the soft role_specific_details->>job_id
 * link stamped at promote-time.
 */
export interface ApprovalsJobOverviewRow {
  job: HRRecruitmentJob;
  applications_total: number;
  applications_pending: number;
  applications_reviewed: number;
  applications_shortlisted: number;
  applications_rejected: number;
  applications_promoted: number;
  /** Linked candidates currently in the approval chain (submitted | pending_approval). */
  in_approval: number;
  /** Linked candidates past approval (approved | package_fixed | offer_issued). */
  approved: number;
  joined: number;
  /** Candidates whose CURRENT approval step is routed to the viewing user. */
  awaiting_me: number;
}

// =====================================================================================
// Dynamic approval flows (2026-07-06)
// =====================================================================================

export type ApprovalStepType = 'review' | 'final';

/** One step template inside hr_approval_flows.steps (recruitment_approval flows). */
export interface ApprovalFlowStepTemplate {
  chain_order: number;
  /** custom_roles.role_key the step routes to (matched case-insensitively). */
  approver_role: string;
  /** Pinned specific approver — takes precedence over role matching when set. */
  approver_user_id?: string | null;
  /** Display name snapshot for the pinned user (avoids per-render lookups). */
  approver_name?: string | null;
  step_type?: ApprovalStepType;
  interview_required?: boolean;
  escalate_after_hours?: number;
}

/** hr_approval_flows row as used by the recruitment flow builder. */
export interface HRApprovalFlow {
  id: string;
  flow_name: string;
  flow_for: string;
  conditions: Record<string, string> | null;
  steps: ApprovalFlowStepTemplate[];
  is_active: boolean;
  hr_organization_id: string;
}

/** Payload for the final-approval → staff onboarding form. */
export interface OnboardToStaffPayload {
  first_name: string;
  last_name: string;
  gender: string;
  date_of_birth: string;      // yyyy-mm-dd
  marital_status: string;
  email: string;
  phone: string;
  date_of_joining: string;    // yyyy-mm-dd
  designation: string;
  category_id: string;        // staff category FK
  institution_id: string;
  department_id?: string | null;
  institution_email?: string | null;
}

/** Aggregates for the per-job Analytics tab. */
export interface JobAnalytics {
  applications_total: number;
  by_application_status: Record<JobApplicationStatus, number>;
  by_candidate_status: Partial<Record<CandidateStatus, number>>;
  /** Applications submitted by a logged-in account vs anonymous careers-page. */
  source_split: { with_account: number; anonymous: number };
  /** Mean days from application submit to first screening decision. */
  avg_days_to_screen: number | null;
  /** Mean days a promoted candidate spent (or has spent) in the approval chain. */
  avg_days_in_approval: number | null;
}

export const SCORECARD_RECOMMENDATION_LABELS: Record<ScorecardRecommendation, string> = {
  strong_hire: 'Strong Hire',
  hire: 'Hire',
  neutral: 'Neutral',
  no_hire: 'No Hire',
  strong_no_hire: 'Strong No-Hire',
};
