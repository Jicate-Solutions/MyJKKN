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

  // Lifecycle filtering
  lifecycleStatuses?: LifecycleStatus[];

  // Profile filtering
  isProfileComplete?: boolean;

  // Demographics
  gender?: 'male' | 'female' | 'other';

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
  program_name: string | null;
  semester_name: string | null;
  section_name: string | null;
  academic_year_name: string | null;
}

/**
 * Incomplete Profiles Response
 * Paginated response for incomplete profiles API
 */
export interface IncompleteProfilesResponse {
  profiles: IncompleteProfileDetail[];
  total: number;
  limit: number;
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
