/**
 * AI Query System Types
 * Complete type definitions for the Context-Aware AI Query System
 */

// ============================================
// Core Message Types
// ============================================

export interface AIQueryMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  data?: QueryResultData;
  actions?: ActionDefinition[];
  timestamp: Date;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
}

export interface QueryResultData {
  type: 'table' | 'summary' | 'chart' | 'list';
  columns?: ColumnDefinition[];
  rows?: Record<string, any>[];
  summary?: string;
  chartData?: ChartData;
  metadata: ResultMetadata;
}

export interface ColumnDefinition {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'currency' | 'percentage';
  sortable?: boolean;
  filterable?: boolean;
  width?: number;
}

export interface ResultMetadata {
  total_count: number;
  returned_count: number;
  has_more: boolean;
  filters_applied: Record<string, any>;
  query_time_ms?: number;
  source_table?: string;
}

export interface ChartData {
  type: 'bar' | 'line' | 'pie' | 'doughnut';
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
  }[];
}

// ============================================
// Tool Definitions
// ============================================

export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  permission: string;
  tier: ActionTier;
  parameters: {
    type: 'object';
    properties: Record<string, ParameterDefinition>;
    required?: string[];
  };
}

export interface ParameterDefinition {
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  enum?: string[];
  format?: 'date' | 'uuid' | 'email';
  default?: any;
  items?: { type: string };
}

export type ToolCategory =
  | 'academic'
  | 'billing'
  | 'students'
  | 'staff'
  | 'admissions'
  | 'organization'
  | 'resources'
  | 'users'
  | 'notifications'
  | 'bug_reports'
  | 'dashboard'
  | 'applications'
  | 'context'
  | 'action';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: ToolResponse;
  status: 'pending' | 'executing' | 'completed' | 'failed';
}

export interface ToolResponse {
  success: boolean;
  data: any;
  metadata: ResultMetadata;
  actions_available: ActionDefinition[];
  error?: {
    code: string;
    message: string;
  };
}

// ============================================
// Action Types
// ============================================

export type ActionTier = 1 | 2 | 3 | 4;

export interface ActionDefinition {
  id: string;
  label: string;
  description?: string;
  tier: ActionTier;
  icon?: string;
  parameters_required?: string[];
  confirmation_message?: string;
  variant?: 'default' | 'destructive' | 'outline';
}

export interface ActionExecutionRequest {
  action_id: string;
  parameters: Record<string, any>;
  confirmation_token?: string;
  target_ids?: string[];
}

export interface ActionExecutionResult {
  success: boolean;
  message: string;
  affected_count?: number;
  details?: any;
  error?: {
    code: string;
    message: string;
  };
}

// ============================================
// User Context Types
// ============================================

export interface AIUserContext {
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_super_admin: boolean;
  institution_ids: string[];
  current_institution_id?: string;
  department_id?: string;
  permissions: string[];
  academic_context: AcademicContext;
}

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'principal'
  | 'hod'
  | 'faculty'
  | 'learner'
  | 'staff'
  | 'parent';

export interface AcademicContext {
  current_academic_year_id?: string;
  current_academic_year_name?: string;
  current_semester_id?: string;
  current_semester_name?: string;
  institution_name?: string;
  department_name?: string;
}

export interface DataScope {
  scope_type: 'all' | 'institution' | 'department' | 'section' | 'own';
  institution_ids?: string[];
  department_ids?: string[];
  section_ids?: string[];
  student_id?: string;
  staff_id?: string;
}

// ============================================
// Rate Limiting Types
// ============================================

export interface RateLimitConfig {
  queries_per_5_minutes: number;
  max_results_display: number;
  max_results_export: number;
  bulk_action_daily_limit: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset_at: Date;
  daily_bulk_remaining?: number;
}

// ============================================
// Query Log Types
// ============================================

export interface AIQueryLog {
  id: string;
  user_id: string;
  institution_id?: string;
  query_text: string;
  query_type: QueryType;
  tools_called: string[];
  response_time_ms: number;
  success: boolean;
  error_code?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

export type QueryType =
  | 'data_query'
  | 'action_request'
  | 'export_request'
  | 'analytics'
  | 'help';

// ============================================
// API Request/Response Types
// ============================================

export interface AIQueryRequest {
  message: string;
  conversation_id?: string;
  context_override?: Partial<AIUserContext>;
}

export interface AIQueryResponse {
  conversation_id: string;
  message: AIQueryMessage;
  suggestions?: string[];
  rate_limit: RateLimitResult;
}

export interface AIQueryStreamChunk {
  type: 'text' | 'tool_start' | 'tool_result' | 'action' | 'done' | 'error';
  content?: string;
  tool_call?: ToolCall;
  action?: ActionDefinition;
  error?: {
    code: string;
    message: string;
  };
}

// ============================================
// Permission Types
// ============================================

export interface ToolPermissionMapping {
  tool_name: string;
  permission: string;
  tier: ActionTier;
  requires_confirmation: boolean;
  max_batch_size?: number;
}

export const TOOL_PERMISSIONS: Record<string, string> = {
  // Academic
  get_attendance: 'academic.attendance.view',
  get_attendance_summary: 'academic.attendance.view',
  get_attendance_defaulters: 'academic.attendance.view',
  get_timetables: 'academic.timetables.view',
  get_timetable_slots: 'academic.timetables.view',
  get_periods: 'academic.periods.view',
  get_staff_plans: 'academic.staff_planning.view',
  get_courses: 'academic.courses.view',
  get_academic_years: 'academic.years.view',

  // Billing
  get_student_bills: 'billing.bills.view',
  get_bills_summary: 'billing.bills.view',
  get_fee_defaulters: 'billing.bills.view',
  get_invoices: 'billing.invoices.view',
  get_receipts: 'billing.receipts.view',
  get_discounts: 'billing.discounts.view',
  get_refunds: 'billing.refunds.view',
  get_billing_categories: 'billing.categories.view',
  get_payment_transactions: 'billing.payments.view',

  // Students
  get_students: 'students.view',
  get_student_details: 'students.view',
  get_students_by_status: 'students.view',
  get_students_by_section: 'students.view',
  get_student_onboarding_status: 'students.view',
  get_promotion_candidates: 'students.promotion.view',

  // Staff
  get_staff: 'staff.view',
  get_staff_details: 'staff.view',
  get_staff_by_department: 'staff.view',
  get_employment_categories: 'staff.categories.view',
  get_faculty_course_assignments: 'staff.view',

  // Admissions
  get_admissions: 'admissions.view',
  get_admission_by_status: 'admissions.view',
  get_admission_statistics: 'admissions.view',
  get_applications: 'admissions.view',

  // Organization
  get_institutions: 'organizations.institutions.view',
  get_degrees: 'organizations.degrees.view',
  get_departments: 'organizations.departments.view',
  get_programs: 'organizations.programs.view',
  get_semesters: 'organizations.semesters.view',
  get_sections: 'organizations.sections.view',
  get_hierarchy_summary: 'organizations.view',

  // Resources
  get_resources: 'resources.resources.view',
  get_resource_reservations: 'resources.reservations.view',
  get_resource_availability: 'resources.resources.view',
  get_pending_approvals: 'resources.approvals.view',
  get_resource_usage_logs: 'resources.analytics.view',
  get_maintenance_schedules: 'resources.maintenance.view',

  // Users
  get_users: 'users.view',
  get_user_roles: 'users.roles.view',
  get_custom_roles: 'roles.view',
  get_user_activity: 'users.activity.view',
  get_user_institution_access: 'users.access.view',

  // Notifications
  get_notifications: 'notifications.view',
  get_unread_notifications: 'notifications.view',
  get_push_subscriptions: 'notifications.view',

  // Bug Reports
  get_bug_reports: 'bug_reports.view',
  get_bug_report_details: 'bug_reports.view',
  get_my_bug_reports: 'bug_reports.view',

  // Dashboard
  get_dashboard_widgets: 'dashboard.view',
  get_kpi_summary: 'analytics.view',
  get_analytics_overview: 'analytics.view',

  // Applications
  get_applications_hub: 'applications.view',
  get_app_favorites: 'applications.view',

  // Actions - Tier 1
  export_csv: 'DYNAMIC', // Uses source module permission
  create_complaint: 'complaints.create',
  mark_notification_read: 'notifications.view',

  // Actions - Tier 2
  send_notification: 'notifications.send',
  send_sms: 'notifications.send',
  send_email: 'notifications.send',
  create_ticket: 'complaints.create',
  reserve_resource: 'resources.reserve',

  // Actions - Tier 3
  bulk_notification: 'notifications.bulk',
  bulk_sms: 'notifications.bulk',
  bulk_email: 'notifications.bulk',

  // Actions - Tier 4 (Blocked)
  delete_record: 'BLOCKED',
  financial_transaction: 'BLOCKED',
  modify_permissions: 'BLOCKED',
};

export const ACTION_TIERS: Record<string, ActionTier> = {
  export_csv: 1,
  create_complaint: 1,
  mark_notification_read: 1,
  send_notification: 2,
  send_sms: 2,
  send_email: 2,
  create_ticket: 2,
  reserve_resource: 2,
  bulk_notification: 3,
  bulk_sms: 3,
  bulk_email: 3,
  delete_record: 4,
  financial_transaction: 4,
  modify_permissions: 4,
};

// ============================================
// Error Types
// ============================================

export const AI_ERROR_MESSAGES = {
  UNAUTHORIZED: 'Please log in to continue.',
  FORBIDDEN: 'This information is only available to authorized personnel.',
  NOT_FOUND: 'No results found for your query.',
  RATE_LIMITED: 'Too many requests. Please wait a moment.',
  INVALID_QUERY: "I couldn't understand that query. Could you rephrase it?",
  SERVER_ERROR: 'Something went wrong. Please try again.',
  TOOL_NOT_FOUND: 'The requested operation is not available.',
  PERMISSION_DENIED: 'You do not have permission to perform this action.',
  BULK_LIMIT_EXCEEDED: 'Daily bulk action limit exceeded.',
  ACTION_BLOCKED: 'This action requires administrator access. Please contact your admin.',
} as const;

export type AIErrorCode = keyof typeof AI_ERROR_MESSAGES;

// ============================================
// Suggested Queries
// ============================================

export interface SuggestedQuery {
  text: string;
  category: ToolCategory;
  icon?: string;
}

export const DEFAULT_SUGGESTED_QUERIES: SuggestedQuery[] = [
  { text: 'Show students with attendance below 75%', category: 'academic', icon: 'Users' },
  { text: 'List fee defaulters in current semester', category: 'billing', icon: 'CreditCard' },
  { text: 'Show my timetable for this week', category: 'academic', icon: 'Calendar' },
  { text: 'Get department-wise student count', category: 'students', icon: 'BarChart' },
  { text: 'Show pending resource reservations', category: 'resources', icon: 'Clock' },
  { text: 'List unread notifications', category: 'notifications', icon: 'Bell' },
];

// ============================================
// Component Props Types
// ============================================

export interface AIQueryContainerProps {
  className?: string;
  defaultContext?: Partial<AIUserContext>;
}

export interface MessageThreadProps {
  messages: AIQueryMessage[];
  isLoading?: boolean;
  onActionClick?: (action: ActionDefinition, messageId: string) => void;
}

export interface QueryInputProps {
  onSubmit: (query: string) => void;
  disabled?: boolean;
  placeholder?: string;
  suggestions?: SuggestedQuery[];
}

export interface QueryResultTableProps {
  data: QueryResultData;
  onExport?: () => void;
  onRowClick?: (row: Record<string, any>) => void;
}

export interface ActionButtonsProps {
  actions: ActionDefinition[];
  onActionClick: (action: ActionDefinition) => void;
  disabled?: boolean;
}

export interface ActionConfirmModalProps {
  action: ActionDefinition;
  isOpen: boolean;
  onConfirm: (confirmationToken?: string) => void;
  onCancel: () => void;
  targetCount?: number;
}
