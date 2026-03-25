/**
 * Leave and OnDuty Application System Types
 *
 * This module contains all TypeScript types and interfaces for the
 * comprehensive leave/onduty management system with approval workflows
 * and automatic attendance integration.
 *
 * @module types/leave-onduty
 * @created 2026-01-28
 */

import { Database } from './supabase';

// =====================================================
// ENUMS
// =====================================================

export type LeaveOndutyCategory = 'leave' | 'onduty';
export type LeaveSubCategory = 'casual' | 'medical';
export type OndutySubCategory = 'event_participation' | 'club_activities';
export type PeriodType = 'fullday' | 'forenoon' | 'afternoon' | 'periodwise';
export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type FlowType = 'sequential' | 'parallel';
export type ApproverRole = 'faculty' | 'hod' | 'principal';

// =====================================================
// CORE INTERFACES
// =====================================================

/**
 * Leave/OnDuty Application
 * Main record for leave and onduty applications
 */
export interface LeaveOndutyApplication {
  id: string;
  learner_id: string;
  institution_id: string;
  department_id: string | null;
  semester_id: string | null;
  section_id: string | null;
  category: LeaveOndutyCategory;
  sub_category: string; // LeaveSubCategory | OndutySubCategory
  application_date: string; // ISO date
  start_date: string; // ISO date
  end_date: string; // ISO date
  period_type: PeriodType;
  selected_periods: string[]; // Period slot IDs from timetable
  reason: string;
  attachment_url: string | null;
  status: ApplicationStatus;
  current_step: number;
  created_at: string;
  updated_at: string;

  // Joined data (populated by services)
  learner?: {
    id: string;
    first_name: string;
    last_name: string;
    roll_number: string | null;
    register_number: string | null;
    student_email: string | null;
  };
  institution?: {
    id: string;
    name: string;
  };
  department?: {
    id: string;
    department_name: string;
  };
  semester?: {
    id: string;
    semester_name: string;
  };
  section?: {
    id: string;
    section_name: string;
  };
  approvals?: LeaveOndutyApproval[];
}

/**
 * Approval Flow Configuration
 * Defines approval workflow for applications
 */
export interface LeaveOndutyApprovalFlow {
  id: string;
  institution_id: string;
  degree_id: string | null;
  department_id: string | null;
  program_id: string | null;
  semester_id: string | null;
  category: LeaveOndutyCategory | 'all';
  sub_category: string | null;
  flow_type: FlowType;
  flow_steps: ApprovalFlowStep[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Joined data
  institution?: {
    id: string;
    name: string;
  };
  degree?: {
    id: string;
    degree_name: string;
  };
  department?: {
    id: string;
    department_name: string;
  };
  program?: {
    id: string;
    program_name: string;
  };
  semester?: {
    id: string;
    semester_name: string;
  };
  creator?: {
    id: string;
    full_name: string;
  };
}

/**
 * Approval Flow Step Definition
 * Defines a single step in approval workflow
 */
export interface ApprovalFlowStep {
  step_order: number;
  role_id: string; // Custom role ID from custom_roles table
  role_name: string; // Display name for the role
  approver_ids: string[]; // Array of user profile IDs who can approve
  is_required: boolean;
}

/**
 * Individual Approval Record
 * Tracks individual approver's action on an application
 */
export interface LeaveOndutyApproval {
  id: string;
  application_id: string;
  step_order: number;
  approver_id: string | null;
  approver_role: ApproverRole;
  status: ApprovalStatus;
  comments: string | null;
  action_taken_at: string | null;
  created_at: string;

  // Joined data
  approver?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
  };
  application?: LeaveOndutyApplication;
}

/**
 * Attendance Update Audit Record
 * Tracks changes made to attendance due to approved applications
 */
export interface AttendanceUpdateRecord {
  id: string;
  application_id: string;
  attendance_record_id: string;
  period_slot_id: string;
  student_id: string;
  old_status: string;
  new_status: string;
  updated_at: string;
  updated_by: string | null;

  // Joined data
  application?: LeaveOndutyApplication;
  updater?: {
    id: string;
    full_name: string;
  };
}

// =====================================================
// FORM DATA TYPES
// =====================================================

/**
 * Application Form Data
 * Used for creating new applications
 */
export interface ApplicationFormData {
  category: LeaveOndutyCategory;
  sub_category: string;
  start_date: string;
  end_date: string;
  period_type: PeriodType;
  selected_periods: string[];
  reason: string;
  attachment_file: File | null;
}

/**
 * Approval Action Data
 * Used for processing approvals
 */
export interface ApprovalActionData {
  application_id: string;
  approver_id: string;
  status: 'approved' | 'rejected';
  comments: string;
}

/**
 * Flow Creation Data
 * Used for creating new approval flows
 * All hierarchy fields are required for new flows
 */
export interface FlowCreationData {
  institution_id: string;
  degree_id: string;
  department_id: string;
  program_id: string;
  semester_id: string;
  category: LeaveOndutyCategory | 'all';
  sub_category: string | null;
  flow_type: FlowType;
  flow_steps: ApprovalFlowStep[];
}

// =====================================================
// FILTER & QUERY TYPES
// =====================================================

/**
 * Application Filters
 * Used for filtering application lists
 */
export interface ApplicationFilters {
  institution_id?: string;
  department_id?: string;
  semester_id?: string;
  section_id?: string;
  learner_id?: string;
  category?: LeaveOndutyCategory;
  sub_category?: string;
  status?: ApplicationStatus;
  start_date?: string;
  end_date?: string;
  search?: string; // Search by learner name/roll no
}

/**
 * Approval Filters
 * Used for filtering approvals dashboard
 */
export interface ApprovalFilters {
  approver_id?: string;
  institution_id?: string;
  department_id?: string;
  semester_id?: string;
  section_id?: string;
  status?: ApprovalStatus;
  category?: LeaveOndutyCategory;
  date_from?: string;
  date_to?: string;
}

/**
 * Flow Filters
 * Used for filtering approval flows
 */
export interface FlowFilters {
  institution_id?: string;
  department_id?: string;
  semester_id?: string;
  category?: LeaveOndutyCategory | 'all';
  is_active?: boolean;
}

// =====================================================
// VALIDATION TYPES
// =====================================================

/**
 * Validation Result
 * Generic validation result type
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: any;
}

/**
 * File Validation Requirements
 * Defines when file attachment is required
 */
export interface FileRequirements {
  required: boolean;
  reason: string;
  maxSize: number;
  allowedTypes: string[];
}

/**
 * Period Detection Result
 * Result of timetable-based period detection
 */
export interface PeriodDetectionResult {
  valid: boolean;
  periods: string[];
  error?: string;
  timetable?: any;
}

// =====================================================
// DASHBOARD & ANALYTICS TYPES
// =====================================================

/**
 * Application Statistics
 * Summary statistics for applications
 */
export interface ApplicationStatistics {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
  by_category: {
    leave: number;
    onduty: number;
  };
  by_sub_category: Record<string, number>;
  average_approval_time_hours: number;
}

/**
 * Approval Dashboard Metrics
 * Metrics for approval dashboard
 */
export interface ApprovalDashboardMetrics {
  pending_my_approval: number;
  pending_others: number;
  approved_today: number;
  rejected_today: number;
  average_turnaround_hours: number;
}

/**
 * Attendance Impact Summary
 * Summary of attendance changes from applications
 */
export interface AttendanceImpactSummary {
  total_updates: number;
  students_affected: number;
  periods_affected: number;
  by_status: {
    absent: number; // From leave applications
    onduty: number; // From onduty applications
  };
  date_range: {
    from: string;
    to: string;
  };
}

// =====================================================
// TIMETABLE INTEGRATION TYPES
// =====================================================

/**
 * Timetable Period Info
 * Information about a period from timetable
 */
export interface TimetablePeriod {
  slot_id: string;
  period_id: string;
  period_name: string;
  start_time: string;
  end_time: string;
  course_id: string | null;
  course_name: string | null;
  faculty_id: string | null;
  faculty_name: string | null;
}

/**
 * Available Date Info
 * Information about dates with timetables
 */
export interface AvailableDateInfo {
  date: string;
  has_timetable: boolean;
  total_periods: number;
  is_weekend: boolean;
  is_holiday: boolean;
}

/**
 * Period Selection Option
 * UI option for period selection
 */
export interface PeriodSelectionOption {
  value: string; // slot_id
  label: string; // "Period 1 (Math) - 9:00-10:00"
  period: TimetablePeriod;
  disabled: boolean;
}

// =====================================================
// REPORT TYPES
// =====================================================

/**
 * Leave Report Data
 * Data structure for leave/onduty reports
 */
export interface LeaveReportData {
  summary: {
    total_applications: number;
    approved: number;
    rejected: number;
    pending: number;
    most_common_reason: string;
    avg_days_per_application: number;
  };
  by_department: Array<{
    department_id: string;
    department_name: string;
    total: number;
    leave: number;
    onduty: number;
  }>;
  by_semester: Array<{
    semester_id: string;
    semester_name: string;
    total: number;
    leave: number;
    onduty: number;
  }>;
  by_section: Array<{
    section_id: string;
    section_name: string;
    total: number;
    leave: number;
    onduty: number;
  }>;
  trend_data: Array<{
    date: string;
    applications: number;
    leave: number;
    onduty: number;
  }>;
}

// =====================================================
// UTILITY TYPES
// =====================================================

/**
 * Approval Timeline Step
 * UI representation of approval progress
 */
export interface ApprovalTimelineStep {
  step_order: number;
  role: ApproverRole;
  description: string;
  approver_name: string | null;
  status: ApprovalStatus;
  comments: string | null;
  action_taken_at: string | null;
  is_current: boolean;
  is_required: boolean;
}

/**
 * Application Summary
 * Compact summary for lists and previews
 */
export interface ApplicationSummary {
  id: string;
  learner_name: string;
  learner_roll_no: string | null;
  category: LeaveOndutyCategory;
  sub_category: string;
  date_range: string; // "Jan 15 - Jan 17"
  days_count: number;
  status: ApplicationStatus;
  current_step: number;
  total_steps: number;
  created_at: string;
}

/**
 * Validation Rules
 * Configuration for validation rules
 */
export interface ValidationRules {
  dates: {
    maxBackdate: number; // days
    mustHaveTimetable: boolean;
    noOverlap: boolean;
  };
  attachment: {
    maxSize: number; // bytes
    allowedTypes: string[];
  };
  periods: {
    forenoonStart: string; // "09:00"
    forenoonEnd: string; // "13:00"
    afternoonStart: string; // "14:00"
    afternoonEnd: string; // "17:00"
  };
}

// =====================================================
// DEFAULT VALUES & CONSTANTS
// =====================================================

export const DEFAULT_VALIDATION_RULES: ValidationRules = {
  dates: {
    maxBackdate: 7,
    mustHaveTimetable: true,
    noOverlap: true,
  },
  attachment: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
  },
  periods: {
    forenoonStart: '09:00',
    forenoonEnd: '13:00',
    afternoonStart: '14:00',
    afternoonEnd: '17:00',
  },
};

export const LEAVE_SUB_CATEGORIES: { value: LeaveSubCategory; label: string }[] = [
  { value: 'casual', label: 'Casual Leave' },
  { value: 'medical', label: 'Medical Leave' },
];

export const ONDUTY_SUB_CATEGORIES: { value: OndutySubCategory; label: string }[] = [
  { value: 'event_participation', label: 'Event Participation' },
  { value: 'club_activities', label: 'Club Activities' },
];

export const PERIOD_TYPES: { value: PeriodType; label: string; description: string }[] = [
  { value: 'fullday', label: 'Full Day', description: 'All periods for the day' },
  { value: 'forenoon', label: 'Forenoon', description: 'Morning sessions (9 AM - 1 PM)' },
  { value: 'afternoon', label: 'Afternoon', description: 'Afternoon sessions (2 PM - 5 PM)' },
  { value: 'periodwise', label: 'Specific Periods', description: 'Select individual periods' },
];

export const APPLICATION_STATUS_COLORS: Record<ApplicationStatus, string> = {
  pending: 'yellow',
  approved: 'green',
  rejected: 'red',
  cancelled: 'gray',
};

export const APPROVAL_STATUS_COLORS: Record<ApprovalStatus, string> = {
  pending: 'yellow',
  approved: 'green',
  rejected: 'red',
};

export const APPROVER_ROLE_LABELS: Record<ApproverRole, string> = {
  faculty: 'Course Faculty',
  hod: 'Head of Department',
  principal: 'Principal',
};

// =====================================================
// TYPE GUARDS
// =====================================================

export function isLeaveSubCategory(value: string): value is LeaveSubCategory {
  return ['casual', 'medical'].includes(value);
}

export function isOndutySubCategory(value: string): value is OndutySubCategory {
  return ['event_participation', 'club_activities'].includes(value);
}

export function isPeriodType(value: string): value is PeriodType {
  return ['fullday', 'forenoon', 'afternoon', 'periodwise'].includes(value);
}

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return ['pending', 'approved', 'rejected', 'cancelled'].includes(value);
}

// =====================================================
// HELPER TYPES
// =====================================================

/**
 * Create Application Input
 * Type for service layer create method
 */
export type CreateApplicationInput = Omit<
  LeaveOndutyApplication,
  'id' | 'created_at' | 'updated_at' | 'application_date' | 'current_step'
>;

/**
 * Update Application Input
 * Type for service layer update method
 */
export type UpdateApplicationInput = Partial<
  Omit<LeaveOndutyApplication, 'id' | 'learner_id' | 'created_at' | 'updated_at'>
>;

/**
 * Create Flow Input
 * Type for service layer flow creation
 */
export type CreateFlowInput = Omit<
  LeaveOndutyApprovalFlow,
  'id' | 'created_at' | 'updated_at'
>;

/**
 * Update Flow Input
 * Type for service layer flow update
 */
export type UpdateFlowInput = Partial<
  Omit<LeaveOndutyApprovalFlow, 'id' | 'created_at' | 'updated_at'>
>;
