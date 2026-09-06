/**
 * HR Analytics Dashboard — C1 types.
 *
 * Cross-institution HR metrics: headcount trends, attrition heatmap,
 * department distribution, leave utilization.
 * Queries existing tables only: staff, hr_staff_details, hr_leave_balances,
 * institutions. No new DB tables needed.
 */

// =====================================================================================
// Headcount
// =====================================================================================

export interface HeadcountByInstitution {
  institution_id: string;
  institution_name: string;
  total: number;
  active: number;
  inactive: number;
}

export interface HeadcountTrend {
  month: string; // 'YYYY-MM'
  count: number;
  institution_name: string;
}

// =====================================================================================
// Attrition
// =====================================================================================

export interface AttritionData {
  institution_id: string;
  institution_name: string;
  joined: number;
  left: number;
  rate: number; // percentage 0–100
}

// =====================================================================================
// Department distribution
// =====================================================================================

export interface DepartmentDistribution {
  department: string;
  count: number;
  percentage: number;
}

// =====================================================================================
// Leave utilization
// =====================================================================================

export interface LeaveUtilizationByInstitution {
  institution_id: string;
  institution_name: string;
  total_allocated: number;
  total_used: number;
  utilization_pct: number;
}

// =====================================================================================
// Aggregate payload
// =====================================================================================

export type AnalyticsPeriod = '12m' | '6m' | '3m';

export interface HRAnalyticsFilters {
  institution_id?: string;
  period?: AnalyticsPeriod;
}

export interface HRAnalyticsSummary {
  total_staff: number;
  active_staff: number;
  inactive_staff: number;
  avg_tenure_months: number;
  overall_attrition_rate: number;
}

export interface HRAnalyticsPayload {
  summary: HRAnalyticsSummary;
  headcount_by_institution: HeadcountByInstitution[];
  headcount_trend: HeadcountTrend[];
  attrition: AttritionData[];
  department_distribution: DepartmentDistribution[];
  leave_utilization_by_institution: LeaveUtilizationByInstitution[];
  generated_at: string;
}
