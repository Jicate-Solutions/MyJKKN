// types/analytics.ts
import { z } from 'zod';

// Enums
export enum AnalyticsPeriod {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  LAST_7_DAYS = 'last_7_days',
  LAST_30_DAYS = 'last_30_days',
  LAST_90_DAYS = 'last_90_days',
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
  THIS_YEAR = 'this_year',
  CUSTOM = 'custom'
}

export enum ChartType {
  LINE = 'line',
  BAR = 'bar',
  PIE = 'pie',
  AREA = 'area',
  DONUT = 'donut'
}

// Interfaces
export interface AnalyticsFilters {
  period?: AnalyticsPeriod;
  start_date?: string;
  end_date?: string;
  institution_id?: string;
  department_id?: string;
  parent_category_id?: string;
  sub_category_id?: string;
  resource_id?: string;
}

export interface ResourceAnalytics {
  total_resources: number;
  active_resources: number;
  inactive_resources: number;
  under_maintenance: number;
  total_value: number;
  avg_utilization_rate: number;
  by_category: CategoryAnalytics[];
  by_institution: InstitutionAnalytics[];
  by_status: StatusAnalytics[];
  trend_data: TrendData[];
}

export interface CategoryAnalytics {
  category_id: string;
  category_name: string;
  resource_count: number;
  total_reservations: number;
  utilization_rate: number;
  total_value: number;
}

export interface InstitutionAnalytics {
  institution_id: string;
  institution_name: string;
  resource_count: number;
  total_reservations: number;
  utilization_rate: number;
  departments: DepartmentAnalytics[];
}

export interface DepartmentAnalytics {
  department_id: string;
  department_name: string;
  resource_count: number;
  total_reservations: number;
  utilization_rate: number;
}

export interface StatusAnalytics {
  status: string;
  count: number;
  percentage: number;
}

export interface TrendData {
  date: string;
  reservations: number;
  revenue: number;
  utilization: number;
}

export interface ReservationAnalytics {
  total_reservations: number;
  completed_reservations: number;
  cancelled_reservations: number;
  pending_reservations: number;
  no_show_count: number;
  avg_duration_hours: number;
  total_revenue: number;
  by_status: ReservationStatusAnalytics[];
  by_resource: ResourceReservationAnalytics[];
  by_time_slot: TimeSlotAnalytics[];
  trend_data: TrendData[];
}

export interface ReservationStatusAnalytics {
  status: string;
  count: number;
  percentage: number;
  revenue?: number;
}

export interface ResourceReservationAnalytics {
  resource_id: string;
  resource_name: string;
  reservation_count: number;
  total_hours: number;
  utilization_rate: number;
  revenue: number;
}

export interface TimeSlotAnalytics {
  hour: number;
  time_label: string;
  reservation_count: number;
  avg_duration: number;
}

export interface MaintenanceAnalytics {
  total_maintenance: number;
  scheduled_maintenance: number;
  completed_maintenance: number;
  overdue_maintenance: number;
  in_progress_maintenance?: number;
  total_cost: number;
  avg_cost_per_maintenance: number;
  by_type: MaintenanceTypeAnalytics[];
  by_priority: MaintenancePriorityAnalytics[];
  cost_trend: CostTrendData[];
}

export interface MaintenanceTypeAnalytics {
  maintenance_type: string;
  count: number;
  percentage: number;
}

export interface MaintenancePriorityAnalytics {
  priority: number;
  count: number;
  percentage: number;
}

export interface CostTrendData {
  period: string;
  cost: number;
  count: number;
}

export interface UserAnalytics {
  total_users: number;
  active_users: number;
  top_users: TopUserAnalytics[];
  reservation_by_user: UserReservationAnalytics[];
}

export interface TopUserAnalytics {
  user_id: string;
  user_name: string;
  reservation_count: number;
  total_hours: number;
  total_spent: number;
}

export interface UserReservationAnalytics {
  user_id: string;
  user_name: string;
  reservation_count: number;
}

export interface FinancialAnalytics {
  total_revenue: number;
  projected_revenue: number;
  total_expenses: number;
  net_profit: number;
  revenue_by_category: RevenueByCategoryAnalytics[];
  expense_by_type: ExpenseByTypeAnalytics[];
  financial_trend: FinancialTrendData[];
}

export interface RevenueByCategoryAnalytics {
  category_name: string;
  revenue: number;
  percentage: number;
}

export interface ExpenseByTypeAnalytics {
  expense_type: string;
  amount: number;
  percentage: number;
}

export interface FinancialTrendData {
  date: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface DashboardSummary {
  resources: ResourceAnalytics;
  reservations: ReservationAnalytics;
  maintenance: MaintenanceAnalytics;
  users: UserAnalytics;
  financial: FinancialAnalytics;
}

// Export Options
export interface ExportOptions {
  format: 'pdf' | 'excel' | 'csv';
  include_charts: boolean;
  filters: AnalyticsFilters;
}

// Zod Schemas
export const analyticsFiltersSchema = z.object({
  period: z.nativeEnum(AnalyticsPeriod).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  institution_id: z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  parent_category_id: z.string().uuid().optional(),
  sub_category_id: z.string().uuid().optional(),
  resource_id: z.string().uuid().optional()
});

export const exportOptionsSchema = z.object({
  format: z.enum(['pdf', 'excel', 'csv']),
  include_charts: z.boolean(),
  filters: analyticsFiltersSchema
});

// =====================================================
// Engagement Analytics Types
// Added: 2026-01-19
// =====================================================

// =====================================================
// Organizational Hierarchy Types
// =====================================================
export type OrganizationalLevel =
  | 'institution'
  | 'department'
  | 'program'
  | 'semester'
  | 'section';

export interface OrganizationalContext {
  level: OrganizationalLevel;
  id: string;
  name?: string;
}

// =====================================================
// Session Types
// =====================================================
export interface UserSession {
  id: string;
  session_id: string;
  user_id: string;
  login_at: string;
  logout_at?: string;
  duration_seconds?: number;
  is_active: boolean;
  role: string;
  institution_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  ip_address?: string;
  user_agent?: string;
  device_type?: 'mobile' | 'tablet' | 'desktop';
  actions_count: number;
  modules_accessed: string[];
  created_at: string;
  updated_at: string;
}

export interface SessionHistory {
  sessions: UserSession[];
  totalSessions: number;
  avgDurationMinutes: number;
  mostUsedDevice: 'mobile' | 'tablet' | 'desktop';
  uniqueModules: string[];
}

// =====================================================
// Daily Engagement Metrics Types
// =====================================================
export interface DailyEngagementMetric {
  id: string;
  metric_date: string;
  institution_id: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  role: string;
  total_logins: number;
  unique_users: number;
  total_sessions: number;
  avg_session_duration_minutes: number;
  total_active_time_hours: number;
  avg_modules_per_user: number;
  created_at: string;
  updated_at: string;
}

// =====================================================
// Student Engagement Score Types
// =====================================================
export type EngagementLevel = 'high' | 'medium' | 'low' | 'at_risk';

export type RiskFactor =
  | 'no_login_7d'
  | 'inactive_7d'
  | 'below_20_percentile'
  | 'low_session_duration'
  | 'limited_module_access';

export interface StudentEngagementScore {
  id: string;
  user_id: string;
  calculation_date: string;
  institution_id: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  logins_last_7_days: number;
  logins_last_30_days: number;
  avg_session_duration_minutes: number;
  total_time_spent_hours: number;
  modules_accessed_count: number;
  unique_modules_accessed: string[];
  last_login_at?: string;
  days_since_last_login?: number;
  section_avg_logins_7d: number;
  section_avg_duration: number;
  percentile_rank: number;
  engagement_level: EngagementLevel;
  is_at_risk: boolean;
  risk_factors: RiskFactor[];
  created_at: string;
  updated_at: string;
}

// =====================================================
// Student Engagement with Profile
// =====================================================
export interface StudentEngagement extends StudentEngagementScore {
  name: string;
  student_id: string;
  email?: string;
  section_name?: string;
  program_name?: string;
  department_name?: string;
}

// =====================================================
// Engagement Overview (Materialized View)
// =====================================================
export interface EngagementOverview {
  institution_id: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  latest_calculation_date: string;
  total_students: number;
  active_last_7d: number;
  at_risk_count: number;
  avg_logins_7d: number;
  avg_session_duration: number;
  avg_percentile_rank: number;
  high_engagement_count: number;
  medium_engagement_count: number;
  low_engagement_count: number;
  at_risk_engagement_count: number;
}

// =====================================================
// Request Types
// =====================================================
export interface EngagementMetricsRequest {
  level: OrganizationalLevel;
  id: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface StudentEngagementRequest {
  sectionId: string;
  includeAtRisk?: boolean;
}

export interface AtRiskRequest {
  level: OrganizationalLevel;
  id: string;
  minRiskFactors?: number;
}

export interface SectionComparisonRequest {
  semesterId: string;
}

export interface StudentDetailRequest {
  studentId: string;
}

// =====================================================
// Response Types
// =====================================================
export interface EngagementMetrics {
  // Summary metrics
  total_logins: number;
  unique_users: number;
  active_students_7d: number;
  active_students_30d: number;
  avg_session_duration_minutes: number;
  avg_logins_7d: number;
  avg_logins_30d: number;
  total_active_time_hours: number;
  avg_modules_per_user: number;

  // Engagement level counts
  high_engagement_count: number;
  medium_engagement_count: number;
  low_engagement_count: number;
  at_risk_count: number;

  // Trend data for charts
  trends: {
    date: string;
    total_logins: number;
    unique_users: number;
  }[];

  // Student list
  students: StudentEngagement[];

  // Optional comparison with previous period
  comparison?: {
    previous_period: {
      total_logins: number;
      unique_users: number;
    };
    percentage_change: {
      logins: number;
      users: number;
    };
  };
}

export interface AtRiskStudent extends StudentEngagement {
  contact_email?: string;
  contact_phone?: string;
}

export interface SectionComparison {
  section_id: string;
  section_name: string;
  total_students: number;
  active_last_7d: number;
  active_percentage: number;
  at_risk_count: number;
  at_risk_percentage: number;
  avg_logins_7d: number;
  avg_session_duration: number;
  engagement_score: number;
}

export interface StudentEngagementDetail {
  student: {
    id: string;
    name: string;
    email?: string;
    student_id: string;
    section_name?: string;
    program_name?: string;
  };
  currentScore: StudentEngagementScore;
  sessionHistory: SessionHistory;
  moduleUsage: {
    moduleName: string;
    accessCount: number;
    lastAccessedAt: string;
  }[];
  trendData: {
    date: string;
    logins: number;
    duration: number;
  }[];
}

// =====================================================
// Access Control Types
// =====================================================
export type AccessScopeType =
  | 'global'
  | 'institution'
  | 'department'
  | 'section';

export interface AccessScope {
  type: AccessScopeType;
  institutionIds?: string[];
  departmentIds?: string[];
  sectionIds?: string[];
}

// =====================================================
// Filter Types
// =====================================================
export interface EngagementFilters {
  level: OrganizationalLevel;
  entityId: string;
  dateFrom: Date;
  dateTo: Date;
  engagementLevels?: EngagementLevel[];
  riskOnly?: boolean;
}

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

export const DATE_RANGE_PRESETS: DateRange[] = [
  {
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    to: new Date(),
    label: 'Last 7 days'
  },
  {
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: new Date(),
    label: 'Last 30 days'
  },
  {
    from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    to: new Date(),
    label: 'Last 90 days'
  }
];

// =====================================================
// Chart Data Types
// =====================================================
export interface LoginTrendData {
  date: string;
  totalLogins: number;
  uniqueUsers: number;
  avgDuration: number;
}

export interface EngagementDistribution {
  level: EngagementLevel;
  count: number;
  percentage: number;
  color: string;
}

// =====================================================
// Module Names (for tracking)
// =====================================================
export const MODULE_NAMES = {
  // Academic
  ACADEMIC_TIMETABLES: 'academic/timetables',
  ACADEMIC_ATTENDANCE: 'academic/attendance',
  ACADEMIC_COURSES: 'academic/courses',
  ACADEMIC_STAFF_PLANNING: 'academic/staff-planning',
  ACADEMIC_PERIODS: 'academic/periods',

  // Billing
  BILLING_INVOICES: 'billing/invoices',
  BILLING_PAYMENTS: 'billing/payments',
  BILLING_RECEIPTS: 'billing/receipts',
  BILLING_REFUNDS: 'billing/refunds',
  BILLING_BILLS: 'billing/bills',

  // Students
  STUDENTS: 'students',
  STUDENT_PROFILE: 'students/profile',

  // Staff
  STAFF: 'staff',
  STAFF_PROFILE: 'staff/profile',

  // Admissions
  ADMISSIONS: 'admissions',

  // Resource Management
  RESOURCE_MANAGEMENT: 'resource-management',

  // Application Hub
  APPLICATION_HUB: 'application-hub',

  // Organization
  ORGANIZATION_INSTITUTIONS: 'organization/institutions',
  ORGANIZATION_DEPARTMENTS: 'organization/departments',
  ORGANIZATION_PROGRAMS: 'organization/programs',
  ORGANIZATION_SECTIONS: 'organization/sections',

  // Dashboard
  DASHBOARD: 'dashboard',

  // Other
  SETTINGS: 'settings',
  PROFILE: 'profile',
  BUG_REPORTS: 'bug-reports'
} as const;

export type ModuleName = (typeof MODULE_NAMES)[keyof typeof MODULE_NAMES];

// =====================================================
// Risk Factor Labels and Colors
// =====================================================
export const RISK_FACTOR_CONFIG: Record<
  RiskFactor,
  { label: string; color: string; bgColor: string; severity: 'high' | 'medium' | 'low' }
> = {
  no_login_7d: {
    label: 'No login in 7 days',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    severity: 'high'
  },
  inactive_7d: {
    label: 'Inactive 7+ days',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    severity: 'high'
  },
  below_20_percentile: {
    label: 'Bottom 20%',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    severity: 'medium'
  },
  low_session_duration: {
    label: 'Low engagement',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    severity: 'medium'
  },
  limited_module_access: {
    label: 'Limited access',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    severity: 'low'
  }
};

// =====================================================
// Engagement Level Colors
// =====================================================
export const ENGAGEMENT_LEVEL_CONFIG: Record<
  EngagementLevel,
  { label: string; color: string; bgColor: string }
> = {
  high: {
    label: 'High',
    color: 'text-green-700',
    bgColor: 'bg-green-100'
  },
  medium: {
    label: 'Medium',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100'
  },
  low: {
    label: 'Low',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100'
  },
  at_risk: {
    label: 'At Risk',
    color: 'text-red-700',
    bgColor: 'bg-red-100'
  }
};
