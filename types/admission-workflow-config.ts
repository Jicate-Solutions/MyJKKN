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
  filled: number;               // admitted-or-beyond (admitted/active/graduated/account)
  reserved: number;             // point-in-time count of reserved learners
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
  /**
   * Organisation entity type from institutions.entity_type
   * (e.g. 'institution' | 'school' | 'company' | 'admin_office').
   * Added 2026-06-17 so the Group Dashboard overview can split the
   * breakdown into per-entity-type sections. The service only returns
   * 'institution' + 'school' rows for the overview.
   */
  entity_type: string;
  total_leads: number;
  active_crm_leads: number;
  lost_leads: number;
  /** @deprecated 2026-05-20 — funnel_stage-based; use admitted_count below. */
  applied: number;
  /** @deprecated 2026-05-20 — funnel_stage-based; use admitted_count below. */
  enrolled: number;
  /** @deprecated 2026-05-20 — funnel_stage-based; use rejected_lifecycle_count below. */
  rejected: number;
  total_seats: number;
  filled_seats: number;
  /**
   * Lead-space "filled" — admission_leads.funnel_stage = 'enrolled'.
   * Added 2026-05-17 (E4 of dynamic-admission-statuses). Equal to filled_seats
   * during the rollout window; kept as a distinct field so consumers can
   * migrate off the legacy name.
   */
  enrolled_leads: number;
  /**
   * Learner-space "filled" — learners_profiles.lifecycle_status matches an
   * admission_statuses row with scope='learner' AND is_seat_filled=true.
   * Added 2026-05-17 (E4). Gap vs enrolled_leads = drop-off pursuit list.
   */
  seat_filled_learners: number;
  fill_percentage: number;
  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle-status-based counts (added 2026-05-20 with workflow realignment).
  // Sourced from learners_profiles.lifecycle_status, scoped by the same
  // admission_year / program_start_year filter the leads side uses.
  // ─────────────────────────────────────────────────────────────────────────
  enquiry_count: number;
  enquiry_submitted_count: number;
  account_count: number;
  reserved_count: number;
  /** Admitted KPI = lifecycle_status IN ('admitted', 'active') per workflow spec. */
  admitted_count: number;
  rejected_lifecycle_count: number;
}

export interface GroupDashboardData {
  institutions: InstitutionAdmissionSummary[];
  totals: {
    total_leads: number;
    /** @deprecated 2026-05-20 — funnel_stage-based; use total_admitted below. */
    total_applied: number;
    /** @deprecated 2026-05-20 — funnel_stage-based; use total_admitted below. */
    total_enrolled: number;
    /** @deprecated 2026-05-20 — funnel_stage-based; use total_rejected_lifecycle below. */
    total_rejected: number;
    total_seats: number;
    /**
     * Sum of filled_seats across institutions — counts learners with
     * lifecycle_status IN ('admitted','active','graduated','account').
     * Use this for Fill Rate, not total_enrolled (which is just 'active').
     */
    total_filled: number;
    /** Sum of enrolled_leads across institutions (lead-space). */
    total_enrolled_leads: number;
    /** Sum of seat_filled_learners across institutions (learner-space). */
    total_seat_filled_learners: number;
    overall_fill_percentage: number;
    // ───────────────────────────────────────────────────────────────────────
    // Lifecycle-status-based totals (added 2026-05-20). PRIMARY source for
    // the dashboard's top KPI strip going forward.
    // ───────────────────────────────────────────────────────────────────────
    total_enquiry: number;
    total_enquiry_submitted: number;
    total_account: number;
    total_reserved: number;
    /** Admitted KPI = sum of lifecycle_status IN ('admitted', 'active'). */
    total_admitted: number;
    total_rejected_lifecycle: number;
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
  filled_seats: number;          // admitted-or-beyond (admitted/active/graduated/account)
  reserved_seats: number;        // point-in-time count of reserved learners
  balance_seats: number;
  fill_percentage: number;
  last_filled_at: string | null;
}

// Source analytics — from fn_source_analytics RPC.
// Updated 2026-04-28: dropped academic_year_id / academic_year_name (legacy
// from the old academic-year-FK design); RPC now takes p_admission_year integer.
export interface SourceAnalyticsRow {
  institution_id: string;
  institution_name: string;
  source: string | null;
  referral_type: string | null;
  lead_count: number;
  enrolled_count: number;
  conversion_rate: number;
  last_enrolled_at: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Admitted-by-source drill-down — from fn_admitted_source_breakdown /
// fn_admitted_source_counts (2026-08-13).
//
// These are PROFILE-anchored, unlike SourceAnalyticsRow above which is
// LEAD-anchored. That difference is the whole point: the drill-down total
// equals the "Admitted" KPI by construction, so clicking a KPI of 1,515 can
// never land on a list of 551. Learners with no lead row carry source === null
// and are bucketed under DIRECT_SOURCE_KEY.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Sentinel for "admitted learner with no lead row" — i.e. a direct admission
 * that never entered the leads pipeline, and therefore has no source.
 * Used as a URL query value, so it must stay URL-safe and never collide with a
 * real `admission_leads.source` enum value.
 */
export const DIRECT_SOURCE_KEY = '__direct__' as const;

export interface AdmittedSourceRow {
  learner_id: string;
  full_name: string | null;
  application_id: string | null;
  roll_number: string | null;
  /**
   * Learner's own mobile, falling back to the originating lead's phone when the
   * profile column is blank. Populated for every admitted/active learner today.
   */
  student_mobile: string | null;
  father_mobile: string | null;
  mother_mobile: string | null;
  institution_id: string;
  institution_name: string;
  program_name: string | null;
  /** null => direct admission (no lead row). */
  source: string | null;
  referral_type: string | null;
  referred_by_name: string | null;
  /**
   * Best-effort admission timestamp: COALESCE(status-history 'admitted' event,
   * activated_at). NULL for ~65% of learners because neither is recorded —
   * deliberately NOT backfilled from created_at, which would present a
   * profile-creation date as an admission date. Render as '—' when null.
   */
  admitted_at: string | null;
  created_at: string | null;
}

export interface AdmittedSourceCount {
  /** A real source value, or DIRECT_SOURCE_KEY for the no-lead bucket. */
  source: string;
  admits: number;
}

export interface AdmittedSourcePage {
  rows: AdmittedSourceRow[];
  /** Total matching the current filter, before pagination. */
  totalCount: number;
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
