// types/admission-workflow-config.ts
// TypeScript types for institution-specific admission workflow configurations

export interface AdmissionWorkflowConfig {
  id: string;
  institution_id: string;
  config_name: string;
  academic_year: string;

  // Stage configuration
  active_stages: string[];
  stage_configs: Record<string, StageConfig>;

  // Assessment
  has_entrance_exam: boolean;
  entrance_exam_type: string | null;
  has_gd_pi: boolean;
  has_merit_list: boolean;
  merit_criteria: MeritCriteria;

  // Quota
  has_government_quota: boolean;
  government_quota_percentage: number;
  has_management_quota: boolean;
  has_nri_quota: boolean;
  quota_config: Record<string, number>;

  // Documents
  required_documents: string[];

  // Communication
  default_templates: Record<string, string>;

  // SLA
  sla_config: SLAConfig;

  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StageConfig {
  enabled?: boolean;
  label?: string;
  required_fields?: string[];
  min_percentage?: number;
  age_verification?: boolean;
  types?: string[];
  required_documents?: string[];
}

export interface MeritCriteria {
  weightage?: Record<string, number>;
  cutoff?: Record<string, number>;
}

export interface SLAConfig {
  first_contact_hours?: number;
  document_verification_hours?: number;
  offer_validity_days?: number;
  token_payment_days?: number;
}

// Daily admission pivot row — from fn_seat_analytics_daily_pivot RPC.
// Powers the Daily Pivot sub-tab inside Seat Analytics.
export interface SeatPivotRow {
  institution_id: string;
  institution_name: string;
  program_id: string;
  program_short: string;        // e.g. "CSE", "MBA", "ECE-SH"
  program_name: string;
  course_short: string;         // e.g. "B.E - CSE", "MBA"
  stream: string;               // e.g. "ENGINEERING"
  level: string;                // "UG" | "PG" | ""
  is_lateral: boolean;
  study_year: string;           // "I YEAR" | "II YEAR"
  group_label: string;          // e.g. "UG ENGINEERING - I YEAR"
  group_sort_key: string;
  intake: number;
  filled: number;
  balance: number;
  fill_percentage: number;
  daily_counts: Record<string, number>; // { "2026-03-25": 2, "2026-03-28": 1, ... }
}

// Group dashboard types
// Updated 2026-04-28: source is now fn_group_dashboard_overview RPC. Counts are
// admission-year-scoped. `applied` & `enrolled` semantics changed:
//   applied  = learners_profiles.lifecycle_status IN ('admitted','pending','approved','account','waitlisted')
//   enrolled = learners_profiles.lifecycle_status = 'active'
// (previously these read admission_leads.funnel_stage, which never advances
//  past 'application_started' in production — hence the always-zero bug.)
export interface InstitutionAdmissionSummary {
  institution_id: string;
  institution_name: string;
  total_leads: number;
  active_crm_leads: number;
  lost_leads: number;
  applied: number;
  enrolled: number;
  rejected: number;
  total_seats: number;
  filled_seats: number;
  fill_percentage: number;
}

export interface GroupDashboardData {
  institutions: InstitutionAdmissionSummary[];
  totals: {
    total_leads: number;
    total_applied: number;
    total_enrolled: number;
    total_rejected: number;
    total_seats: number;
    overall_fill_percentage: number;
  };
}

// Seat analytics — from get_seat_analytics RPC
export interface SeatAnalyticsRow {
  institution_id: string;
  institution_name: string;
  degree_id: string;
  degree_name: string;
  department_id: string;
  department_name: string;
  program_id: string;
  program_name: string;
  admission_year_id: string;
  admission_year_name: string;
  program_start_year: number;
  program_end_year: number;
  total_seats: number;
  filled_seats: number;
  balance_seats: number;
  fill_percentage: number;
  last_filled_at: string | null;
}

// Source analytics — from get_source_analytics RPC
export interface SourceAnalyticsRow {
  institution_id: string;
  institution_name: string;
  source: string | null;
  referral_type: string | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
  lead_count: number;
  enrolled_count: number;
  conversion_rate: number;
  last_enrolled_at: string | null;
}

// Geography analytics — from get_geography_analytics RPC
export interface GeographyAnalyticsRow {
  institution_id: string;
  institution_name: string;
  state: string | null;
  district: string | null;
  taluk: string | null;
  active_learners: number;
}

// Institution comparison — derived from seat + source data
export interface InstitutionComparisonRow {
  institution_id: string;
  institution_name: string;
  total_seats: number;
  filled_seats: number;
  fill_percentage: number;
  total_leads: number;
  enrolled_count: number;
  conversion_rate: number;
  top_source: string | null;
  top_district: string | null;
  active_learners: number;
}


// Default stage definitions
export const ALL_ADMISSION_STAGES: { id: string; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'application_started', label: 'Application Started' },
  { id: 'application_submitted', label: 'Application Submitted' },
  { id: 'documents_pending', label: 'Documents Pending' },
  { id: 'documents_verified', label: 'Documents Verified' },
  { id: 'offer_sent', label: 'Offer Sent' },
  { id: 'offer_accepted', label: 'Offer Accepted' },
  { id: 'token_paid', label: 'Token Paid' },
  { id: 'enrolled', label: 'Enrolled' },
];

export const COMMON_DOCUMENTS = [
  'photo',
  'id_proof',
  'marksheet_10th',
  'marksheet_12th',
  'transfer_certificate',
  'community_certificate',
  'neet_scorecard',
  'birth_certificate',
  'previous_report_card',
  'address_proof',
  'migration_certificate',
  'gap_certificate',
  'income_certificate',
];
