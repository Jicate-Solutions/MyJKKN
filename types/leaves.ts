// types/leaves.ts
// Institution Leave Management Types
// Created: 2025-12-16
//
// Access Control: Uses profiles.institution_id (NOT user_institution_access)

// =====================================================
// ENUMS AND CONSTANTS
// =====================================================

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LeaveScopeLevel = 'institution' | 'department' | 'semester' | 'section';
export type ApprovalAction = 'approved' | 'rejected' | 'pending';

export const LEAVE_STATUS_OPTIONS: { value: LeaveStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' }
];

export const LEAVE_SCOPE_OPTIONS: { value: LeaveScopeLevel; label: string; description: string }[] = [
  { value: 'institution', label: 'Institution-wide', description: 'Applies to entire institution' },
  { value: 'department', label: 'Department', description: 'Applies to selected departments' },
  { value: 'semester', label: 'Semester', description: 'Applies to selected semesters' },
  { value: 'section', label: 'Section', description: 'Applies to selected sections' }
];

// Default leave type colors
export const LEAVE_TYPE_COLORS = {
  GAZETTED: '#EF4444', // Red
  STUDY: '#3B82F6',    // Blue
  EMERGENCY: '#F59E0B', // Amber
  EXAM: '#8B5CF6',     // Purple
  CUSTOM: '#6B7280'    // Gray
} as const;

// =====================================================
// LEAVE TYPE INTERFACES
// =====================================================

export interface LeaveType {
  id: string;
  institution_id: string;
  leave_type_code: string;
  leave_type_name: string;
  description?: string;
  color_code: string;
  requires_approval: boolean;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;

  // Relations
  institution?: {
    id: string;
    name: string;
  };
  created_by_profile?: {
    id: string;
    full_name?: string;
  };
}

export interface CreateLeaveTypeDto {
  institution_id: string;
  leave_type_code: string;
  leave_type_name: string;
  description?: string;
  color_code: string;
  requires_approval?: boolean;
  is_active?: boolean;
  created_by?: string;
}

export interface UpdateLeaveTypeDto {
  leave_type_code?: string;
  leave_type_name?: string;
  description?: string;
  color_code?: string;
  requires_approval?: boolean;
  is_active?: boolean;
}

export interface LeaveTypeFilters {
  institution_id?: string;
  search?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface LeaveTypeListResponse {
  data: LeaveType[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// =====================================================
// INSTITUTION LEAVE INTERFACES
// =====================================================

export interface RecurrencePattern {
  type: 'yearly' | 'monthly';
  month?: number; // 1-12 for yearly recurrence
  day?: number;   // Day of month
}

export interface InstitutionLeave {
  id: string;
  institution_id: string;
  leave_type_id: string;

  // Leave details
  leave_name: string;
  description?: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD

  // Scope configuration
  scope_level: LeaveScopeLevel;
  department_ids: string[];
  semester_ids: string[];
  section_ids: string[];

  // Status and workflow
  status: LeaveStatus;
  requested_by: string;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;

  // Metadata
  is_recurring: boolean;
  recurrence_pattern?: RecurrencePattern;
  academic_year_id?: string;

  created_at: string;
  updated_at: string;

  // Relations
  leave_type?: LeaveType;
  institution?: {
    id: string;
    name: string;
  };
  requested_by_profile?: {
    id: string;
    full_name?: string;
    email?: string;
  };
  approved_by_profile?: {
    id: string;
    full_name?: string;
  };
  academic_year?: {
    id: string;
    academic_year_name: string;
  };
  departments?: Array<{
    id: string;
    department_name: string;
  }>;
  semesters?: Array<{
    id: string;
    semester_name: string;
  }>;
  sections?: Array<{
    id: string;
    section_name: string;
  }>;
  approvals?: LeaveApproval[];
}

export interface CreateLeaveDto {
  institution_id: string;
  leave_type_id: string;
  leave_name: string;
  description?: string;
  start_date: string;
  end_date: string;
  scope_level: LeaveScopeLevel;
  department_ids?: string[];
  semester_ids?: string[];
  section_ids?: string[];
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern;
  academic_year_id?: string;
  requested_by: string;
}

export interface UpdateLeaveDto {
  leave_type_id?: string;
  leave_name?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  scope_level?: LeaveScopeLevel;
  department_ids?: string[];
  semester_ids?: string[];
  section_ids?: string[];
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern;
  academic_year_id?: string;
  status?: LeaveStatus;
  rejection_reason?: string;
}

export interface LeaveFilters {
  institution_id?: string;
  leave_type_id?: string;
  status?: LeaveStatus;
  scope_level?: LeaveScopeLevel;
  department_id?: string;
  semester_id?: string;
  section_id?: string;
  start_date?: string;
  end_date?: string;
  academic_year_id?: string;
  requested_by?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface LeaveListResponse {
  data: InstitutionLeave[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// =====================================================
// APPROVAL CHAIN INTERFACES
// =====================================================

export interface LeaveApprovalChain {
  id: string;
  institution_id: string;
  leave_type_id?: string;
  scope_level: LeaveScopeLevel;

  // Chain configuration
  chain_order: number;
  approver_role: string; // 'hod', 'principal', 'admin', or custom role ID
  approver_scope?: string; // 'same_department', 'any', or specific ID

  // Conditions
  is_required: boolean;
  can_skip_if_approved_by_higher: boolean;

  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Relations
  leave_type?: LeaveType;
  institution?: {
    id: string;
    name: string;
    short_name?: string;
  };
}

export interface CreateApprovalChainDto {
  institution_id: string;
  leave_type_id?: string;
  scope_level: LeaveScopeLevel;
  chain_order: number;
  approver_role: string;
  approver_scope?: string;
  is_required?: boolean;
  can_skip_if_approved_by_higher?: boolean;
  is_active?: boolean;
}

export interface UpdateApprovalChainDto {
  chain_order?: number;
  approver_role?: string;
  approver_scope?: string;
  is_required?: boolean;
  can_skip_if_approved_by_higher?: boolean;
  is_active?: boolean;
}

// =====================================================
// LEAVE APPROVAL INTERFACES
// =====================================================

export interface LeaveApproval {
  id: string;
  leave_id: string;
  approval_chain_id?: string;

  // Approval details
  approver_id: string;
  action: ApprovalAction;
  comments?: string;

  acted_at?: string;
  created_at: string;
  updated_at: string;

  // Relations
  leave?: InstitutionLeave;
  approval_chain?: LeaveApprovalChain;
  approver?: {
    id: string;
    full_name?: string;
    email?: string;
  };
}

export interface ProcessApprovalDto {
  leave_id: string;
  approver_id: string;
  action: 'approved' | 'rejected';
  comments?: string;
}

export interface PendingApproval {
  leave: InstitutionLeave;
  approval_chain: LeaveApprovalChain;
  current_step: number;
  total_steps: number;
}

// =====================================================
// CALENDAR INTERFACES
// =====================================================

export interface CalendarLeave {
  leave_id: string;
  leave_name: string;
  leave_type_name: string;
  color_code: string;
  start_date: string;
  end_date: string;
  scope_level: LeaveScopeLevel;
  status: LeaveStatus;
}

export interface CalendarDayInfo {
  date: string;
  leaves: CalendarLeave[];
  is_blocked: boolean;
  is_weekend: boolean;
}

export interface LeaveCalendarFilters {
  institution_id: string;
  year: number;
  month: number;
  department_id?: string;
  semester_id?: string;
  section_id?: string;
}

export interface MonthlyCalendarData {
  year: number;
  month: number;
  days: CalendarDayInfo[];
  total_working_days: number;
  total_leave_days: number;
}

// =====================================================
// ATTENDANCE INTEGRATION INTERFACES
// =====================================================

export interface LeaveBlockInfo {
  is_blocked: boolean;
  leave_id?: string;
  leave_name?: string;
  leave_type_name?: string;
  color_code?: string;
}

export interface AttendanceLeaveCheck {
  institution_id: string;
  date: string;
  department_id?: string;
  semester_id?: string;
  section_id?: string;
}

export interface AttendanceLeaveResult {
  allowed: boolean;
  reason?: string;
  leave?: LeaveBlockInfo;
}

// =====================================================
// SEARCH CONTEXT
// =====================================================

export interface LeaveSearchContext {
  institution_id: string | null;
  academic_year_id: string | null;
  leave_type_id: string | null;
  status: LeaveStatus | null;
  scope_level: LeaveScopeLevel | null;
  department_id: string | null;
  semester_id: string | null;
  section_id: string | null;
  start_date: string | null;
  end_date: string | null;
}

// =====================================================
// STATISTICS AND ANALYTICS
// =====================================================

export interface LeaveStatistics {
  total_leaves: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  cancelled_count: number;
  leaves_by_type: Array<{
    leave_type_id: string;
    leave_type_name: string;
    count: number;
  }>;
  leaves_by_scope: Array<{
    scope_level: LeaveScopeLevel;
    count: number;
  }>;
  upcoming_leaves: InstitutionLeave[];
}

// =====================================================
// FORM VALIDATION SCHEMAS (for reference)
// =====================================================
// Note: Actual Zod schemas will be in the component files

export interface LeaveFormData {
  leave_type_id: string;
  leave_name: string;
  description?: string;
  start_date: Date;
  end_date: Date;
  scope_level: LeaveScopeLevel;
  department_ids?: string[];
  semester_ids?: string[];
  section_ids?: string[];
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern;
  academic_year_id?: string;
}

export interface LeaveTypeFormData {
  leave_type_code: string;
  leave_type_name: string;
  description?: string;
  color_code: string;
  requires_approval: boolean;
  is_active: boolean;
}
