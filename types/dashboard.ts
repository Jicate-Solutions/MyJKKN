// Dashboard personalization types

export interface DashboardWidgetType {
  id: string;
  widget_key: string;
  widget_name: string;
  description: string | null;
  category: 'kpi' | 'chart' | 'table' | 'feed';
  data_source: string;
  default_config: Record<string, any>;
  permissions_required: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DashboardConfiguration {
  id: string;
  user_id: string;
  configuration_name: string;
  is_default: boolean;
  layout_config: DashboardWidget[];
  created_at: string;
  updated_at: string;
}

export interface DashboardWidget {
  id: string;
  configuration_id: string;
  widget_type_id: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  widget_config: Record<string, any>;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  widget_type?: DashboardWidgetType;
}

export interface WidgetData {
  value: number | string;
  label?: string;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
    period: string;
  };
  chartData?: any[];
  tableData?: any[];
  additionalInfo?: Record<string, any>;
  customData?: Record<string, any>;
}

export interface CreateDashboardConfigurationDto {
  configuration_name: string;
  is_default?: boolean;
  layout_config?: DashboardWidget[];
}

export interface UpdateDashboardConfigurationDto {
  configuration_name?: string;
  is_default?: boolean;
  layout_config?: DashboardWidget[];
}

export interface CreateDashboardWidgetDto {
  widget_type_id: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  widget_config?: Record<string, any>;
  is_visible?: boolean;
  sort_order?: number;
}

export interface UpdateDashboardWidgetDto {
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  widget_config?: Record<string, any>;
  is_visible?: boolean;
  sort_order?: number;
}

export interface DashboardMetrics {
  // User metrics
  totalUsers: number;
  activeUsers: number;
  usersByRole: { name: string; count: number }[];
  usersByStatus: { name: string; value: number; fill: string }[];
  recentUsers: any[];

  // Academic metrics
  totalStudents: number;
  studentsByInstitution: { name: string; count: number }[];
  academicYears: any[];

  // Organization metrics
  totalInstitutions: number;
  institutionsByType: { name: string; count: number }[];
  totalCourses: number;
  totalDepartments: number;

  // Staff metrics
  totalStaff: number;
  staffByCategory: { name: string; count: number }[];

  // Billing metrics
  totalRevenue: number;
  invoiceStatus: { name: string; value: number; fill: string }[];
  paymentTrends: { name: string; value: number }[];
  pendingRefunds: any[];

  // Application metrics
  totalApplications: number;
  applicationStatus: { name: string; value: number; fill: string }[];
  recentApplications: any[];

  // Resource metrics
  resourceUtilization: { name: string; value: number }[];
  resourceRequests: { pending: number; approved: number };
  popularResources: any[];

  // Activity metrics
  recentActivity: any[];
  loginAnalytics: any[];
}

export interface WidgetConfigOptions {
  showTrend?: boolean;
  timeframe?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  chartType?: 'bar' | 'line' | 'pie' | 'area' | 'funnel' | 'heatmap';
  showPercentage?: boolean;
  showLegend?: boolean;
  showAvatar?: boolean;
  limit?: number;
  showInstitutionNames?: boolean;
  showCurrent?: boolean;
  showUtilization?: boolean;
  showProgress?: boolean;
  showActiveOnly?: boolean;
  groupByType?: boolean;
  showRecentlyAdded?: boolean;
  showByInstitution?: boolean;
  currency?: string;
  showAmounts?: boolean;
  showSavings?: boolean;
  showCounts?: boolean;
  showConversion?: boolean;
  showByCategory?: boolean;
  showOverload?: boolean;
  showBoth?: boolean;
  showPending?: boolean;
  showApproved?: boolean;
  showUsageCount?: boolean;
  showUptime?: boolean;
  showErrors?: boolean;
  showUser?: boolean;
}

export interface DashboardLayoutItem {
  i: string; // widget id
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  static?: boolean;
}

export interface DashboardFilters {
  search?: string;
  category?: string;
  dataSource?: string;
  isActive?: boolean;
}

export interface DashboardListResponse {
  data: DashboardConfiguration[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
