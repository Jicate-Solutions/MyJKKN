// Activity log types for comprehensive audit trail system

export interface UserActivityLog {
  id: string;
  user_id: string;
  action_type: string;
  resource_type?: string;
  resource_id?: string;
  resource_name?: string;
  description: string;
  ip_address?: string;
  user_agent?: string;
  request_url?: string;
  request_method?: string;
  status_code?: number;
  metadata?: Record<string, any>;
  session_id?: string;
  institution_id?: string;
  created_at: string;
}

export interface UserActivityLogWithUser extends UserActivityLog {
  profiles: {
    id: string;
    full_name?: string;
    email: string;
    role: string;
  } | null;
  institutions?: {
    id: string;
    name: string;
  } | null;
}

export interface ActivityLogFilters {
  user_id?: string;
  action_type?: string;
  resource_type?: string;
  resource_id?: string;
  institution_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  ip_address?: string;
  status_code?: number;
  session_id?: string;
}

export interface ActivityLogsPaginatedResponse {
  data: UserActivityLogWithUser[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateActivityLogRequest {
  user_id: string;
  action_type: string;
  resource_type?: string;
  resource_id?: string;
  resource_name?: string;
  description: string;
  ip_address?: string;
  user_agent?: string;
  request_url?: string;
  request_method?: string;
  status_code?: number;
  metadata?: Record<string, any>;
  session_id?: string;
  institution_id?: string;
}

// Activity statistics types
export interface ActivityStats {
  activity_date: string;
  total_activities: number;
  unique_users: number;
  unique_sessions: number;
  action_type: string;
  resource_type?: string;
  activity_hour: number;
}

export interface ActivityDashboardMetrics {
  totalActivities: number;
  uniqueUsers: number;
  uniqueSessions: number;
  avgActivitiesPerUser: number;
  mostActiveUser: string;
  topActions: Array<{
    action_type: string;
    count: number;
    percentage: number;
  }>;
  topResources: Array<{
    resource_type: string;
    count: number;
    percentage: number;
  }>;
  activityTrend: Array<{
    date: string;
    count: number;
  }>;
  hourlyDistribution: Array<{
    hour: number;
    count: number;
  }>;
  institutionBreakdown: Array<{
    institution_name: string;
    count: number;
    percentage: number;
  }>;
}

// Common activity types
export const ACTIVITY_TYPES = {
  // Authentication
  LOGIN: 'login',
  LOGOUT: 'logout',
  PASSWORD_CHANGE: 'password_change',
  PASSWORD_RESET: 'password_reset',

  // CRUD Operations
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  VIEW: 'view',
  LIST: 'list',

  // File Operations
  UPLOAD: 'upload',
  DOWNLOAD: 'download',
  DELETE_FILE: 'delete_file',

  // User Management
  USER_CREATE: 'user_create',
  USER_UPDATE: 'user_update',
  USER_DELETE: 'user_delete',
  ROLE_ASSIGN: 'role_assign',
  PERMISSIONS_UPDATE: 'permissions_update',

  // Academic Operations
  STUDENT_ENROLL: 'student_enroll',
  COURSE_ASSIGN: 'course_assign',
  GRADE_UPDATE: 'grade_update',

  // Billing Operations
  PAYMENT_PROCESS: 'payment_process',
  INVOICE_GENERATE: 'invoice_generate',
  DISCOUNT_APPLY: 'discount_apply',
  REFUND_PROCESS: 'refund_process',

  // System Operations
  SYSTEM_CONFIG: 'system_config',
  BACKUP_CREATE: 'backup_create',
  MAINTENANCE: 'maintenance',

  // API Operations
  API_REQUEST: 'api_request',
  API_ERROR: 'api_error',

  // Export/Import
  EXPORT: 'export',
  IMPORT: 'import',

  // Security
  SECURITY_VIOLATION: 'security_violation',
  UNAUTHORIZED_ACCESS: 'unauthorized_access',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity'
} as const;

// Resource types
export const RESOURCE_TYPES = {
  USER: 'user',
  STUDENT: 'student',
  STAFF: 'staff',
  INSTITUTION: 'institution',
  COURSE: 'course',
  PROGRAM: 'program',
  DEPARTMENT: 'department',
  DEGREE: 'degree',
  SEMESTER: 'semester',
  SECTION: 'section',
  ADMISSION: 'admission',
  APPLICATION: 'application',
  BILL: 'bill',
  RECEIPT: 'receipt',
  INVOICE: 'invoice',
  DISCOUNT: 'discount',
  REFUND: 'refund',
  ROLE: 'role',
  PERMISSION: 'permission',
  RESOURCE: 'resource',
  DIGITAL_RESOURCE: 'digital_resource',
  RESERVATION: 'reservation',
  TIMETABLE: 'timetable',
  PERIOD: 'period',
  ACADEMIC_YEAR: 'academic_year',
  CATEGORY: 'category',
  API_KEY: 'api_key',
  PROFILE: 'profile',
  AUTH: 'auth'
} as const;

// Activity severity levels
export const ACTIVITY_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
} as const;

// Status codes for classification
export const STATUS_CODE_CATEGORIES = {
  SUCCESS: [200, 201, 202, 204],
  CLIENT_ERROR: [400, 401, 403, 404, 422],
  SERVER_ERROR: [500, 502, 503, 504],
  REDIRECT: [301, 302, 304]
} as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[keyof typeof ACTIVITY_TYPES];
export type ResourceType = (typeof RESOURCE_TYPES)[keyof typeof RESOURCE_TYPES];
export type ActivitySeverity =
  (typeof ACTIVITY_SEVERITY)[keyof typeof ACTIVITY_SEVERITY];

// Export filters and sorting options
export interface ActivityExportOptions {
  format: 'csv' | 'xlsx' | 'json';
  filters?: ActivityLogFilters;
  columns?: string[];
  dateRange: {
    from: string;
    to: string;
  };
}

export interface ActivityLogSort {
  field: 'created_at' | 'action_type' | 'user_id' | 'resource_type';
  direction: 'asc' | 'desc';
}

// Real-time activity feed types
export interface ActivityFeedItem {
  id: string;
  user_name: string;
  action_type: string;
  resource_type?: string;
  resource_name?: string;
  description: string;
  created_at: string;
  severity: ActivitySeverity;
  icon: string;
  color: string;
}

// Activity search and analytics
export interface ActivitySearchParams {
  query: string;
  filters?: ActivityLogFilters;
  sort?: ActivityLogSort;
  page?: number;
  limit?: number;
}

export interface ActivityAnalytics {
  period: 'day' | 'week' | 'month' | 'year';
  data: {
    totalActivities: number;
    growthRate: number;
    comparisonPeriod: {
      totalActivities: number;
      growthRate: number;
    };
    topUsers: Array<{
      user_id: string;
      user_name: string;
      activity_count: number;
    }>;
    errorRate: number;
    averageSessionDuration: number;
  };
}
