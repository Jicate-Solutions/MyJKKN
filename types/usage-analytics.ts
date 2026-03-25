// ============================================
// USAGE ANALYTICS TYPES - MyJKKN Lifecycle
// ============================================
// Created: 2026-02-06
// Purpose: Types for cross-institution lifecycle analytics dashboard
// ============================================

import type { ModuleName } from './analytics';

// =====================================================
// Core Event Types
// =====================================================

export type UsageEventType =
  | 'page_visit'
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'login'
  | 'logout';

export type TrackingSource = 'middleware' | 'explicit' | 'backfill';

export interface UsageEvent {
  id: string;
  user_id: string;
  session_id: string | null;
  event_type: UsageEventType;
  module: string;
  feature: string | null;
  resource_type: string | null;
  weight: number;
  institution_id: string | null;
  department_id: string | null;
  role: string | null;
  request_method: string | null;
  source: TrackingSource;
  metadata: Record<string, unknown>;
  created_at: string;
}

// =====================================================
// Aggregation Types
// =====================================================

export interface ModuleUsageDaily {
  id: string;
  metric_date: string;
  institution_id: string;
  module: string;
  event_count: number;
  unique_users: number;
  weighted_score: number;
  by_role: Record<string, number>;
  by_event_type: Record<string, number>;
}

// =====================================================
// Dashboard Response Types
// =====================================================

export interface LifecycleKPIs {
  active_users_24h: number;
  active_users_7d: number;
  active_users_period: number;
  total_actions_24h: number;
  total_actions_7d: number;
  total_actions_period: number;
  modules_used: number;
  total_modules: number;
  period_days: number; // how many days the selected period covers
  health_score: number | null;
  health_grade: string | null;
  trends: {
    active_users_change: number; // percentage change vs previous period
    actions_change: number;
    modules_change: number;
  };
}

export interface ModuleBreakdown {
  module: string;
  module_label: string;
  event_count: number;
  visit_count: number;
  crud_count: number;
  export_count: number;
  weighted_score: number;
  unique_users: number;
  last_used: string | null;
  by_role: Record<string, number>;
  by_event_type: Record<string, number>;
  trend: number[]; // last 7 days weighted scores for sparkline
}

export interface EventTypeDistribution {
  event_type: UsageEventType;
  count: number;
  percentage: number;
}

export interface DailyTrend {
  date: string;
  weighted_score: number;
  unique_users: number;
  event_count: number;
  crud_count: number;
  export_count: number;
}

export interface ActiveRole {
  role: string;
  user_count: number;
  action_count: number;
}

export interface DormantInstitutionAlert {
  institution_id: string;
  institution_name: string;
  last_activity: string | null;
  dormant_days: number;
  status: DormantStatus;
}

export interface LifecycleDashboardResponse {
  kpis: LifecycleKPIs;
  daily_trends: DailyTrend[];
  module_breakdown: ModuleBreakdown[];
  event_distribution: EventTypeDistribution[];
  active_roles: ActiveRole[];
  dormant_alerts: DormantInstitutionAlert[];
}

// =====================================================
// Health Score Types (Phase 2)
// =====================================================

export interface InstitutionHealthScore {
  id: string;
  score_date: string;
  institution_id: string;
  institution_name?: string;
  active_user_pct: number;
  module_breadth_score: number;
  action_depth_score: number;
  consistency_score: number;
  feature_maturity_score: number;
  health_score: number;
  health_grade: HealthGrade;
  metadata: Record<string, unknown>;
}

export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export const HEALTH_GRADE_CONFIG: Record<
  HealthGrade,
  { label: string; color: string; bgColor: string; min: number; max: number }
> = {
  A: { label: 'Excellent', color: 'text-green-700', bgColor: 'bg-green-100', min: 80, max: 100 },
  B: { label: 'Good', color: 'text-blue-700', bgColor: 'bg-blue-100', min: 60, max: 79 },
  C: { label: 'Fair', color: 'text-yellow-700', bgColor: 'bg-yellow-100', min: 40, max: 59 },
  D: { label: 'Poor', color: 'text-orange-700', bgColor: 'bg-orange-100', min: 20, max: 39 },
  F: { label: 'Critical', color: 'text-red-700', bgColor: 'bg-red-100', min: 0, max: 19 },
};

// =====================================================
// Institution Comparison Types (Phase 2)
// =====================================================

export interface InstitutionComparison {
  institution_id: string;
  institution_name: string;
  health_score: number;
  health_grade: HealthGrade;
  active_users: number;
  total_users: number;
  actions_30d: number;
  top_module: string;
  top_module_label: string;
  last_activity: string | null;
  dormant_days: number | null;
  status: 'active' | 'amber' | 'orange' | 'red';
}

export type DormantStatus = 'active' | 'amber' | 'orange' | 'red';

export const DORMANT_CONFIG: Record<
  DormantStatus,
  { label: string; color: string; bgColor: string; borderColor: string; minDays: number }
> = {
  active: { label: 'Active', color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200', minDays: 0 },
  amber: { label: '7-14 days inactive', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', minDays: 7 },
  orange: { label: '15-30 days inactive', color: 'text-orange-700', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', minDays: 15 },
  red: { label: '30+ days inactive', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200', minDays: 30 },
};

// =====================================================
// Report Types (Phase 2)
// =====================================================

export type ReportType =
  | 'usage_summary'
  | 'module_adoption'
  | 'user_engagement'
  | 'institution_comparison'
  | 'feature_utilization'
  | 'dormant_analysis';

export type ReportFormat = 'pdf' | 'excel' | 'csv';

export interface ReportConfig {
  type: ReportType;
  format: ReportFormat;
  date_from: string;
  date_to: string;
  institution_id?: string;
  sections?: string[];
}

export interface ReportDefinition {
  type: ReportType;
  title: string;
  description: string;
  icon: string;
  superAdminOnly: boolean;
}

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    type: 'usage_summary',
    title: 'Usage Summary',
    description: 'Overall platform usage for selected period',
    icon: 'BarChart3',
    superAdminOnly: false,
  },
  {
    type: 'module_adoption',
    title: 'Module Adoption',
    description: 'Which modules are most/least used',
    icon: 'Layers',
    superAdminOnly: false,
  },
  {
    type: 'user_engagement',
    title: 'User Engagement',
    description: 'Active vs inactive breakdown by role',
    icon: 'Users',
    superAdminOnly: false,
  },
  {
    type: 'institution_comparison',
    title: 'Institution Comparison',
    description: 'Cross-institution scorecard',
    icon: 'Building2',
    superAdminOnly: true,
  },
  {
    type: 'feature_utilization',
    title: 'Feature Utilization',
    description: 'Sub-module detail with weighted scores',
    icon: 'Zap',
    superAdminOnly: false,
  },
  {
    type: 'dormant_analysis',
    title: 'Dormant Analysis',
    description: 'Institutions/modules with no recent activity',
    icon: 'AlertTriangle',
    superAdminOnly: true,
  },
];

// =====================================================
// Feature Usage Types (Phase 3)
// =====================================================

export interface FeatureUsageSummary {
  summary_date: string;
  institution_id: string;
  module: string;
  feature: string;
  usage_count: number;
  unique_users: number;
}

// =====================================================
// Filter Types
// =====================================================

export interface LifecycleFilters {
  institution_id?: string;
  department_id?: string;
  date_from: string;
  date_to: string;
  module?: string;
  role?: string;
}

export interface DateRangePreset {
  label: string;
  days: number;
}

export const LIFECYCLE_DATE_PRESETS: DateRangePreset[] = [
  { label: 'Today', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

// =====================================================
// Event Weight Configuration
// =====================================================

export const EVENT_WEIGHTS: Record<UsageEventType, number> = {
  page_visit: 1,
  view: 2,
  create: 5,
  update: 5,
  delete: 5,
  export: 3,
  login: 1,
  logout: 1,
};

// =====================================================
// Module Label Mapping
// =====================================================

export const MODULE_LABELS: Record<string, string> = {
  'academic/timetables': 'Timetables',
  'academic/attendance': 'Attendance',
  'academic/courses': 'Courses',
  'academic/staff-planning': 'Staff Planning',
  'academic/periods': 'Periods',
  'billing/invoices': 'Invoices',
  'billing/payments': 'Payments',
  'billing/receipts': 'Receipts',
  'billing/refunds': 'Refunds',
  'billing/bills': 'Bills',
  'students': 'Students',
  'students/profile': 'Student Profile',
  'staff': 'Staff',
  'staff/profile': 'Staff Profile',
  'admissions': 'Admissions',
  'resource-management': 'Resource Management',
  'application-hub': 'Application Hub',
  'organization/institutions': 'Institutions',
  'organization/departments': 'Departments',
  'organization/programs': 'Programs',
  'organization/sections': 'Sections',
  'dashboard': 'Dashboard',
  'settings': 'Settings',
  'profile': 'Profile',
  'bug-reports': 'Bug Reports',
};

// =====================================================
// Tracking Request Types
// =====================================================

export interface TrackFeatureParams {
  userId: string;
  module: string;
  feature: string;
  eventType: UsageEventType;
  institutionId?: string;
  departmentId?: string;
  role?: string;
  sessionId?: string;
  resourceType?: string;
  metadata?: Record<string, unknown>;
}

export interface TrackEventFromMiddleware {
  url: string;
  method: string;
  userId: string;
  institutionId?: string;
  departmentId?: string;
  role?: string;
  sessionId?: string;
}

// =====================================================
// User Stats Types (Login Analytics)
// =====================================================

export interface UserStatsSummary {
  total_registered_users: number;
  active_users_in_period: number;
  new_users_in_period: number;
  avg_logins_per_user: number;
  avg_session_duration_minutes: number;
  most_active_role: string;
  inactive_users_count: number;
}

export interface RoleDistribution {
  role: string;
  total_count: number;
  active_count: number;
  percentage: number;
}

export interface LoginTrendDay {
  date: string;
  total_logins: number;
  unique_users: number;
}

export interface LoginFrequencyBucket {
  bucket: string; // "1", "2-5", "6-10", "11-20", "21+"
  user_count: number;
}

export interface TopUser {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  login_count: number;
  last_login: string;
  avg_session_minutes: number;
  institution_name?: string;
  department_name?: string;
}

export interface DepartmentLoginStats {
  department_id: string;
  department_name: string;
  total_users: number;
  active_users: number;
  total_logins: number;
  avg_logins_per_user: number;
}

export interface UserStatsResponse {
  summary: UserStatsSummary;
  role_distribution: RoleDistribution[];
  login_trends: LoginTrendDay[];
  login_frequency: LoginFrequencyBucket[];
  top_users: TopUser[];
  department_breakdown: DepartmentLoginStats[];
}
