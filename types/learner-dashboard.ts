// ============================================
// LEARNER DASHBOARD TYPES
// ============================================
// Created: 2025-01-20
// Purpose: Type definitions for learners analytics dashboard
// ============================================

import { LifecycleStatus } from './learner-profile';

// Re-export LifecycleStatus for convenience
export type { LifecycleStatus };

/**
 * Dashboard Filters
 * All filters for the learners analytics dashboard
 */
export interface LearnerDashboardFilters {
  // Institution filtering (super admin can see all)
  institutionIds?: string[];

  // Academic hierarchy
  academicYearId?: string;
  degreeId?: string;
  departmentId?: string;
  programId?: string;
  semesterId?: string;
  sectionId?: string;

  // Admission cohort, as a CALENDAR YEAR (2026) — never an admission_years row
  // id. That table is institution-scoped: production holds ELEVEN separate
  // "2026" rows, one per college, so an id would silently narrow an
  // "All Institutions" dashboard to a single institution. The service fans the
  // year out to every row id the caller may read.
  // See lib/utils/admission-year-filter.ts, which the Learners Profiles list
  // and its export already share.
  admissionYear?: number;

  // Resolved from `admissionYear` ONCE per request by
  // LearnerProfileService.getDashboardStats, then read by applyDashboardFilters
  // and passed to the analytics RPCs. Not a client input — the API routes never
  // parse it from the query string.
  admissionYearIds?: string[];

  // Lifecycle filtering
  lifecycleStatuses?: LifecycleStatus[];

  // Profile filtering
  isProfileComplete?: boolean;

  // Demographics
  //
  // Title Case is the stored canon on learners_profiles — enforced by
  // learners_profiles_gender_check and trg_normalize_gender_learners_profiles.
  // This union was lower case, so every value the dashboard could produce
  // missed on the `=` comparison in the service and in the distribution RPCs
  // and the whole dashboard went to zero. Matching GENDER_OPTIONS on the
  // Learners Profiles filter bar keeps the two panels on one vocabulary.
  gender?: 'Male' | 'Female' | 'Other';

  // Date range
  dateRange?: {
    from: Date;
    to: Date;
  };

  // Days filters
  daysSinceEnquiry?: number; // e.g., 7, 30, 90
  daysSinceLastUpdate?: number;
}

/**
 * Status Count
 * Count of learners by lifecycle status
 */
export interface StatusCount {
  status: LifecycleStatus;
  count: number;
  percentage: number;
}

/**
 * Distribution Item
 * Generic distribution data structure
 */
export interface DistributionItem {
  id: string;
  name: string;
  count: number;
  percentage: number;
}

/**
 * Time Series Data Point
 * Data point for time-based charts
 */
export interface TimeSeriesDataPoint {
  date: string; // ISO date string
  count: number;
  label?: string; // Optional formatted label
}

/**
 * Conversion Metrics
 * Metrics for tracking enquiry-to-active conversion
 */
export interface ConversionMetrics {
  totalEnquiries: number;
  convertedToActive: number;
  conversionRate: number; // Percentage
  averageTimeToActivation: number; // Days
  dropOffAtPending: number;
  dropOffAtApproved: number;
}

/**
 * Profile Completion Stats
 * Statistics about profile completion
 */
export interface ProfileCompletionStats {
  totalProfiles: number;
  completeProfiles: number;
  incompleteProfiles: number;
  completionRate: number; // Percentage
  awaitingActivation: number; // Complete but not active yet

  // Breakdown by required fields
  missingCollegeEmail: number;
  missingAcademicYear: number;
  missingSemester: number;
  missingSection: number;

  // Completion tiers (by percentage)
  excellent: number;   // 100% complete
  good: number;        // 80-99% complete
  needsWork: number;   // 50-79% complete
  critical: number;    // <50% complete
}

/**
 * Incomplete Profile Detail
 * Individual learner profile with missing field details
 */
export interface IncompleteProfileDetail {
  id: string;
  first_name: string;
  last_name: string;
  college_email: string | null;
  lifecycle_status: LifecycleStatus;
  roll_number: string | null;
  application_id: string | null;
  created_at: string;
  missingFields: string[];
  // Flat, comma-joined mirror of missingFields. The shared DataTable constrains
  // its row type to a record of primitives (ExportableData), so the array can
  // not be the only carrier of this information — the exporter reads this.
  missing_fields_label: string;
  program_name: string | null;
  semester_name: string | null;
  section_name: string | null;
  academic_year_name: string | null;
  admission_year_name: string | null;
  is_profile_complete: boolean | null;
}

/**
 * Sentinel filter value meaning "the field is NOT SET on the profile".
 * Used by the academic-year / admission-year / semester / section filters so a
 * single dropdown can select either a concrete value or the absence of one.
 */
export const PROFILE_FIELD_MISSING = 'MISSING' as const;

/**
 * The lifecycle statuses the Profile Completion drill-down reports on.
 *
 * 2026-08-20: the drill-down used to carry NO lifecycle predicate, so it listed
 * every label in the enum. Of 752 incomplete profiles on production, 498 were
 * people nobody chases from this tab — 390 `enquiry_submitted` (self-filled
 * forms awaiting officer verification, incomplete BY DEFINITION), 59
 * `rejected`, 41 `enquiry`, plus a handful of `approved`,
 * `withdrawal_pending`, `waitlisted` and `inactive` rows. They buried the
 * 254 learners actually moving through onboarding.
 *
 * The set is the onboarding corridor: account -> reserved -> admitted -> active.
 * Deliberately NOT the same five as `/learners/profiles`
 * (LIFECYCLE_TAB_STATUSES): that page is an enrolled roster and excludes
 * `account`, whereas completion chasing STARTS at `account` and ends at
 * `active` — an inactive / exited / graduated learner's blank fields are
 * history, not a task.
 */
export const PROFILE_COMPLETION_LIFECYCLE_STATUSES: LifecycleStatus[] = [
  'account',
  'reserved',
  'admitted',
  'active',
];

/** Profile-completion scope for the drill-down table. */
export type ProfileCompletionScope = 'incomplete' | 'complete' | 'all';

/** Presence filter for fields whose values can not be enumerated (email). */
export type FieldPresence = 'missing' | 'present';

/**
 * The fields whose absence makes a profile incomplete — the same set the
 * "Missing Fields" column badges are built from. Keyed by DB column so the
 * filter maps straight to a NULL/blank test server-side.
 *
 * 2026-08-20: `gender` added. Note it is free text where the other four are a
 * uuid or an email, so "missing" for gender is NULL **or** the empty string —
 * production holds zero NULL genders and twelve `''`, so an IS NULL-only test
 * would be a filter that can never match. See REQUIRED_FIELDS in
 * app/api/learners/analytics/incomplete-profiles/route.ts.
 */
export type ProfileRequiredField =
  | 'college_email'
  | 'academic_year_id'
  | 'semester_id'
  | 'section_id'
  | 'gender';

/**
 * Display labels for the completeness-defining fields. The first four are in
 * funnel order, matching the Profile Completion Funnel card above the table;
 * gender is appended because it has no funnel step of its own.
 */
export const PROFILE_REQUIRED_FIELD_LABELS: Record<ProfileRequiredField, string> = {
  college_email: 'College Email',
  academic_year_id: 'Academic Year',
  semester_id: 'Semester',
  section_id: 'Section',
  gender: 'Gender',
};

/**
 * Fields the "Missing Field" filter can target: the required four PLUS
 * admission year. Admission year is deliberately outside
 * ProfileRequiredField — a profile with no admission year still counts as
 * complete — but "who has no admission year?" is a question worth asking, so
 * it is filterable even though it never produces a Missing Fields badge.
 */
export type ProfileMissingFieldFilter = ProfileRequiredField | 'admission_year_id';

/** Display labels for the Missing Field filter, in funnel order. */
export const PROFILE_MISSING_FIELD_LABELS: Record<ProfileMissingFieldFilter, string> = {
  college_email: 'College Email',
  academic_year_id: 'Academic Year',
  admission_year_id: 'Admission Year',
  semester_id: 'Semester',
  section_id: 'Section',
  gender: 'Gender',
};

/**
 * Incomplete Profiles Filters
 * Server-side filters for the profile-completion drill-down table.
 * The four `*Id` filters accept a UUID or PROFILE_FIELD_MISSING.
 */
export interface IncompleteProfilesFilters {
  institutionIds?: string[];
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  /** Defaults to 'incomplete' — the table's historical population. */
  completion?: ProfileCompletionScope;
  /** Narrow to profiles missing this specific field. */
  missingField?: ProfileMissingFieldFilter;
  collegeEmail?: FieldPresence;
  academicYearId?: string;
  admissionYearId?: string;
  /** Organisational hierarchy: institution > department > program > semester > section. */
  departmentId?: string;
  programId?: string;
  semesterId?: string;
  sectionId?: string;
}

/**
 * Incomplete Profiles Response
 * Paginated response for incomplete profiles API
 */
export interface IncompleteProfilesResponse {
  profiles: IncompleteProfileDetail[];
  /** Total rows matching the filters across ALL pages (exact DB count). */
  total: number;
  limit: number;
  page: number;
  totalPages: number;
}

/** A single dropdown entry for the drill-down filter bar. */
export interface ProfileFilterOption {
  value: string;
  label: string;
}

/**
 * Year dropdown options for the drill-down table. Only the two year lists come
 * from the API — the organisational levels (institution > department > program
 * > semester > section) are a client-side cascade built from the existing org
 * services, so each level's options depend on the level above it.
 */
export interface IncompleteProfileFilterOptions {
  academicYears: ProfileFilterOption[];
  admissionYears: ProfileFilterOption[];
}

/**
 * Trend Metrics
 * Metrics showing trends over time
 */
export interface TrendMetrics {
  current: number;
  previous: number;
  change: number; // Percentage change
  trend: 'up' | 'down' | 'stable';
}

/**
 * Main Dashboard Stats
 * Complete statistics returned by the dashboard API
 */
export interface LearnerDashboardStats {
  // ============================================
  // OVERVIEW COUNTS
  // ============================================
  totalCount: number;
  enquiriesCount: number;
  pendingCount: number;
  approvedCount: number;
  activeCount: number;
  inactiveCount: number;
  graduatedCount: number;
  exitedCount: number;

  // ============================================
  // PROFILE COMPLETION
  // ============================================
  profileCompletion: ProfileCompletionStats;

  // ============================================
  // TRENDS (with comparison)
  // ============================================
  newEnquiries7Days: TrendMetrics;
  newEnquiries30Days: TrendMetrics;
  activations7Days: TrendMetrics;
  activations30Days: TrendMetrics;

  // ============================================
  // CONVERSION METRICS
  // ============================================
  conversion: ConversionMetrics;

  // ============================================
  // DISTRIBUTIONS
  // ============================================
  byStatus: StatusCount[];
  byInstitution: DistributionItem[];
  byDepartment: DistributionItem[];
  byProgram: DistributionItem[];
  bySemester: DistributionItem[];
  bySection: DistributionItem[];
  byGender: DistributionItem[];
  byAcademicYear: DistributionItem[];

  // ============================================
  // HIERARCHICAL ORGANIZATIONAL DATA
  // ============================================
  hierarchicalInstitutions: HierarchicalInstitution[];

  // ============================================
  // GEOGRAPHIC DISTRIBUTIONS
  // ============================================
  byState: DistributionItem[];
  byDistrict: DistributionItem[];

  // ============================================
  // DEMOGRAPHIC DISTRIBUTIONS
  // ============================================
  byAge: DistributionItem[];
  byReligion: DistributionItem[];
  byCommunity: DistributionItem[];
  byEntryType: DistributionItem[];
  byAccommodationType: DistributionItem[];
  byLearnerType: DistributionItem[];

  // ============================================
  // PROFILE COMPLETION TIERS
  // ============================================
  profileCompletionTiers: {
    excellent: number; // 100% complete
    good: number; // 80-99% complete
    needsWork: number; // 50-79% complete
    critical: number; // <50% complete
  };

  // ============================================
  // TIME SERIES (for charts)
  // ============================================
  enquiriesByDate: TimeSeriesDataPoint[];
  activationsByDate: TimeSeriesDataPoint[];
  graduationsByDate: TimeSeriesDataPoint[];

  // ============================================
  // METADATA
  // ============================================
  generatedAt: string; // ISO timestamp
  filters: LearnerDashboardFilters;
}

/**
 * Dashboard Quick Filter Preset
 * Predefined filter combinations
 */
export type QuickFilterPreset =
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'current_academic_year'
  | 'all_active'
  | 'awaiting_activation'
  | 'incomplete_profiles'
  | 'recent_enquiries';

/**
 * Hierarchical Section Data
 * Represents sections within a semester
 */
export interface HierarchicalSection {
  id: string;
  name: string;
  count: number;
}

/**
 * Hierarchical Semester Data
 * Represents semesters within a program with nested sections
 */
export interface HierarchicalSemester {
  id: string;
  name: string;
  count: number;
  sections: HierarchicalSection[];
}

/**
 * Hierarchical Program Data
 * Represents programs within a department with nested semesters
 */
export interface HierarchicalProgram {
  id: string;
  name: string;
  count: number;
  semesters: HierarchicalSemester[];
}

/**
 * Hierarchical Department Data
 * Represents departments within a degree with nested programs
 */
export interface HierarchicalDepartment {
  id: string;
  name: string;
  count: number;
  programs: HierarchicalProgram[];
}

/**
 * Hierarchical Degree Data
 * Represents degrees within an institution with nested departments
 */
export interface HierarchicalDegree {
  id: string;
  name: string;
  count: number;
  departments: HierarchicalDepartment[];
}

/**
 * Hierarchical Institution Data
 * Top-level institution with complete hierarchy
 */
export interface HierarchicalInstitution {
  id: string;
  name: string;
  count: number;
  degrees: HierarchicalDegree[];
}

/**
 * Dashboard Export Options
 * Configuration for exporting dashboard data
 */
export interface DashboardExportOptions {
  format: 'csv' | 'excel' | 'pdf';
  includeCharts: boolean;
  sections: Array<
    | 'overview'
    | 'trends'
    | 'distributions'
    | 'profiles'
    | 'conversion'
  >;
}

// ============================================
// CHANGE REQUEST ANALYTICS
// ============================================

/** Institution-wise change request breakdown */
export interface InstitutionChangeRequestStats {
  institution_id: string;
  institution_name: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  approval_rate: number; // percentage
}

/** Change Request Analytics (for dashboard tab) */
export interface ChangeRequestAnalytics {
  // Summary KPIs
  totalRequests: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  approvalRate: number; // percentage of approved / (approved + rejected)

  // Timing
  averageReviewTimeHours: number; // avg hours between submitted_at → reviewed_at

  // Institution-wise breakdown
  byInstitution: InstitutionChangeRequestStats[];

  // Top changed fields (which fields students most commonly want to change)
  topChangedFields: { field: string; count: number; percentage: number }[];

  // Trends - requests submitted over time (last 30 days)
  requestsByDate: { date: string; count: number }[];

  // Status distribution (for pie chart)
  byStatus: { status: string; count: number; percentage: number }[];
}
