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
