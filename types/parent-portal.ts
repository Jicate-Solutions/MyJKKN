// types/parent-portal.ts

import type { NPSSurvey } from './stakeholder-nps';

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type ParentRelationship = 'father' | 'mother' | 'guardian' | 'other';
export type CommunicationType = 'announcement' | 'message' | 'alert';
export type CommunicationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ActivityType =
  | 'login'
  | 'view_dashboard'
  | 'view_attendance'
  | 'view_fees'
  | 'view_grades'
  | 'read_message'
  | 'submit_survey'
  | 'logout';

export const RELATIONSHIP_LABELS: Record<ParentRelationship, string> = {
  father: 'Father',
  mother: 'Mother',
  guardian: 'Guardian',
  other: 'Other',
};

export const COMMUNICATION_TYPE_LABELS: Record<CommunicationType, string> = {
  announcement: 'Announcement',
  message: 'Message',
  alert: 'Alert',
};

export const PRIORITY_LABELS: Record<CommunicationPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

// ============================================================================
// CORE INTERFACES
// ============================================================================

export interface ParentProfile {
  id: string;
  user_id: string; // References auth.users(id)
  institution_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  relationship: ParentRelationship | null;
  avatar_url: string | null;
  is_verified: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;

  // Joined data
  institution?: {
    id: string;
    name: string;
    logo_url: string | null;
  };
}

export interface ParentLearnerLink {
  id: string;
  parent_id: string;
  learner_id: string;
  relationship: ParentRelationship;
  is_primary: boolean;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;

  // Joined data
  learner?: LearnerBasicInfo;
  parent?: ParentProfile;
}

export interface LearnerBasicInfo {
  id: string;
  name: string;
  enrollment_number: string;
  photo_url: string | null;
  program_id: string;
  section_id: string | null;
  semester_id: string | null;

  // Joined data
  program?: {
    id: string;
    name: string;
    code: string;
  };
  section?: {
    id: string;
    name: string;
  };
  semester?: {
    id: string;
    name: string;
  };
}

export interface ParentCommunication {
  id: string;
  institution_id: string;
  parent_access_id: string | null; // DB column is parent_access_id, not parent_id
  learner_id: string;
  communication_type: CommunicationType; // DB column is communication_type, not type
  subject: string;
  content: string;
  // NOTE: DB has no priority column - priority is not stored
  read_at: string | null;
  sent_by: string | null; // DB column is sent_by, not sender_id
  attachments: CommunicationAttachment[]; // DB stores as JSONB
  created_at: string;
  updated_at: string;

  // Joined data
  sender?: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
  learner?: LearnerBasicInfo;
}

export interface CommunicationAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface ParentActivityLog {
  id: string;
  parent_id: string;
  activity_type: ActivityType;
  description: string;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ============================================================================
// DASHBOARD DATA
// ============================================================================

export interface LearnerAttendanceSummary {
  total_days: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  leave_days: number;
  attendance_percentage: number;
  last_30_days: {
    date: string;
    status: 'present' | 'absent' | 'late' | 'leave';
  }[];
}

export interface LearnerFeeSummary {
  total_billed: number;
  total_paid: number;
  total_pending: number;
  total_overdue: number;
  next_due_date: string | null;
  next_due_amount: number;
  recent_payments: {
    id: string;
    amount: number;
    date: string;
    receipt_number: string;
  }[];
}

export interface LearnerGradeSummary {
  current_gpa: number | null;
  current_cgpa: number | null;
  recent_grades: {
    course_name: string;
    grade: string;
    credits: number;
    date: string;
  }[];
}

export interface LearnerDashboardData {
  learner: LearnerBasicInfo;
  link: ParentLearnerLink;
  attendance: LearnerAttendanceSummary;
  fees: LearnerFeeSummary;
  grades: LearnerGradeSummary;
  upcoming_events: {
    id: string;
    title: string;
    date: string;
    type: string;
  }[];
}

export interface ParentDashboardData {
  parent: ParentProfile;
  learners: LearnerDashboardData[];
  unread_messages: number;
  pending_surveys: NPSSurvey[];
  recent_activities: ParentActivityLog[];
}

// ============================================================================
// OTP AUTHENTICATION
// ============================================================================

export interface OTPRequest {
  phone: string;
  institution_id: string;
}

export interface OTPVerification {
  phone: string;
  otp: string;
  institution_id: string;
}

export interface OTPResponse {
  success: boolean;
  message: string;
  expires_at?: string;
}

export interface ParentAuthResult {
  success: boolean;
  parent?: ParentProfile;
  token?: string;
  message: string;
}

// ============================================================================
// DTOs FOR CRUD OPERATIONS
// ============================================================================

export interface CreateParentProfileDto {
  user_id: string;
  institution_id: string;
  name: string;
  phone?: string;
  email?: string;
  relationship?: ParentRelationship;
}

export interface UpdateParentProfileDto {
  name?: string;
  phone?: string;
  email?: string;
  relationship?: ParentRelationship;
  avatar_url?: string;
}

export interface LinkLearnerDto {
  parent_id: string;
  learner_id: string;
  relationship: ParentRelationship;
  is_primary?: boolean;
}

export interface CreateCommunicationDto {
  institution_id: string;
  parent_access_id?: string; // DB column is parent_access_id
  learner_id: string;
  communication_type: CommunicationType; // DB column is communication_type
  subject: string;
  content: string;
  // NOTE: DB has no priority column - do not include
  sent_by?: string; // DB column is sent_by
  attachments?: CommunicationAttachment[];
}

export interface LogActivityDto {
  parent_id: string;
  activity_type: ActivityType;
  description: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
}

// ============================================================================
// FILTER TYPES
// ============================================================================

export interface ParentProfileFilters {
  institution_id: string; // REQUIRED for security - prevents cross-institution access
  search?: string;
  is_verified?: boolean;
  relationship?: ParentRelationship;
  page?: number;
  limit?: number;
}

export interface CommunicationFilters {
  institution_id: string; // REQUIRED for security - prevents cross-institution access
  parent_id?: string;
  learner_id?: string;
  type?: CommunicationType;
  priority?: CommunicationPriority;
  is_read?: boolean;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

export interface ActivityLogFilters {
  parent_id?: string;
  activity_type?: ActivityType;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

// ============================================================================
// REGISTRATION FLOW
// ============================================================================

export interface ParentRegistrationData {
  phone: string;
  name: string;
  email?: string;
  relationship: ParentRelationship;
  learner_enrollment_number: string;
  institution_id: string;
}

export interface RegistrationResult {
  success: boolean;
  message: string;
  parent_id?: string;
  requires_verification?: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getRelationshipLabel(relationship: ParentRelationship | null): string {
  if (!relationship) return 'Parent';
  return RELATIONSHIP_LABELS[relationship] || 'Parent';
}

export function getCommunicationTypeLabel(type: CommunicationType): string {
  return COMMUNICATION_TYPE_LABELS[type] || type;
}

export function getPriorityLabel(priority: CommunicationPriority): string {
  return PRIORITY_LABELS[priority] || priority;
}

export function getPriorityColor(priority: CommunicationPriority): string {
  const colors: Record<CommunicationPriority, string> = {
    low: 'text-gray-500 bg-gray-100',
    normal: 'text-blue-500 bg-blue-100',
    high: 'text-orange-500 bg-orange-100',
    urgent: 'text-red-500 bg-red-100',
  };
  return colors[priority] || colors.normal;
}

export function formatAttendancePercentage(percentage: number): string {
  return `${percentage.toFixed(1)}%`;
}

export function getAttendanceColor(percentage: number): string {
  if (percentage >= 90) return 'text-green-600';
  if (percentage >= 75) return 'text-yellow-600';
  return 'text-red-600';
}

// ============================================================================
// PARENT PORTAL ACCESS (Admin Management)
// ============================================================================

export type AccessRelationship = 'parent' | 'guardian' | 'sponsor';
export type AccessLevel = 'view' | 'interact';
export type AdminCommunicationType = 'general' | 'academic' | 'attendance' | 'financial' | 'emergency';
export type AdminCommunicationPriority = 'low' | 'normal' | 'high' | 'urgent';

export const ACCESS_RELATIONSHIP_LABELS: Record<AccessRelationship, string> = {
  parent: 'Parent',
  guardian: 'Guardian',
  sponsor: 'Sponsor',
};

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  view: 'View Only',
  interact: 'Interactive',
};

export const ADMIN_COMM_TYPE_LABELS: Record<AdminCommunicationType, string> = {
  general: 'General',
  academic: 'Academic',
  attendance: 'Attendance',
  financial: 'Financial',
  emergency: 'Emergency',
};

export const ADMIN_COMM_PRIORITY_LABELS: Record<AdminCommunicationPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  push: boolean;
}

export interface ParentPortalAccess {
  id: string;
  institution_id: string;
  learner_id: string;
  parent_name: string;
  parent_email: string | null;
  parent_phone: string | null;
  relationship: AccessRelationship;
  access_code: string;
  access_level: AccessLevel;
  is_active: boolean;
  last_access: string | null; // DB column is last_access, not last_login_at
  access_count: number; // DB column is access_count, not login_count
  notification_preferences: NotificationPreferences;
  created_at: string;
  updated_at: string;
}

export interface CreateParentAccessDto {
  institution_id: string;
  learner_id: string;
  parent_name: string;
  parent_email?: string;
  parent_phone?: string;
  relationship?: AccessRelationship;
  access_level?: AccessLevel;
  notification_preferences?: Partial<NotificationPreferences>;
}

export interface UpdateParentAccessDto {
  parent_name?: string;
  parent_email?: string;
  parent_phone?: string;
  relationship?: AccessRelationship;
  access_level?: AccessLevel;
  is_active?: boolean;
  notification_preferences?: Partial<NotificationPreferences>;
}

export interface ParentAccessFilters {
  institution_id: string;
  search?: string;
  is_active?: boolean;
  relationship?: AccessRelationship;
  learner_id?: string;
  page?: number;
  limit?: number;
}

export interface ParentAccessListResponse {
  data: ParentPortalAccess[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ParentAccessStats {
  total_access_records: number;
  active_count: number;
  inactive_count: number;
  by_relationship: Record<AccessRelationship, number>;
  by_access_level: Record<AccessLevel, number>;
  recently_active: number;
}

// Communication status helpers
export type CommunicationStatus = 'sent' | 'read' | 'acknowledged' | 'responded';

export function getCommunicationStatus(comm: ParentCommunication): CommunicationStatus {
  if (comm.read_at) return 'read';
  return 'sent';
}

export function getCommunicationStatusColor(status: CommunicationStatus): string {
  const colors: Record<CommunicationStatus, string> = {
    sent: 'text-gray-500 bg-gray-100',
    read: 'text-blue-500 bg-blue-100',
    acknowledged: 'text-green-500 bg-green-100',
    responded: 'text-purple-500 bg-purple-100',
  };
  return colors[status] || colors.sent;
}

export function getAdminCommPriorityColor(priority: AdminCommunicationPriority): string {
  const colors: Record<AdminCommunicationPriority, string> = {
    low: 'text-gray-500 bg-gray-100',
    normal: 'text-blue-500 bg-blue-100',
    high: 'text-orange-500 bg-orange-100',
    urgent: 'text-red-500 bg-red-100',
  };
  return colors[priority] || colors.normal;
}
