// ============================================
// LEARNER DASHBOARD TYPES
// ============================================
// Created: 2025-01-20
// Purpose: Type definitions for learners analytics dashboard
// ============================================

import { LifecycleStatus } from './learner-profile';

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
