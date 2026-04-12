export interface PushSubscription {
  id: string;
  user_id: string;
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  url?: string;
  icon?: string;
  created_by?: string;
  sent_at: string;
  target_institution_id?: string;
  target_department_id?: string;
  target_program_id?: string;
  target_semester?: number;
  target_section?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface UserNotification {
  id: string;
  user_id: string;
  notification_id: string;
  read_at?: string;
  created_at: string;
  notification?: Notification;
}

export interface NotificationTargeting {
  institution_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  target_roles?: string[];
  audience_ids?: string[];
}

// ==================== SAVED AUDIENCES ====================

export type AudienceQueryType = 'built_in' | 'sql';

export type BuiltInAudienceName =
  | 'all_active_users'
  | 'all_students'
  | 'all_faculty'
  | 'all_hods'
  | 'hostel_residents'
  | 'bus_commuters'
  | 'work_pulse_laggards';

export const VALID_BUILT_IN_AUDIENCE_NAMES: readonly BuiltInAudienceName[] = [
  'all_active_users',
  'all_students',
  'all_faculty',
  'all_hods',
  'hostel_residents',
  'bus_commuters',
  'work_pulse_laggards'
] as const;

export interface AudienceQueryParamsBuiltIn {
  name: BuiltInAudienceName;
}

export interface AudienceQueryParamsSql {
  sql: string;
}

export type AudienceQueryParams =
  | AudienceQueryParamsBuiltIn
  | AudienceQueryParamsSql;

export interface NotificationAudience {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  query_type: AudienceQueryType;
  query_params: AudienceQueryParams;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAudienceRequest {
  name: string;
  description?: string | null;
  icon?: string | null;
  query_type: AudienceQueryType;
  query_params: AudienceQueryParams;
}

export interface AudiencePreviewResponse {
  audience_id: string;
  name: string;
  count: number;
  preview_users: AudiencePreviewUser[];
}

export interface AudiencePreviewUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  institution_id: string | null;
  institution_name: string | null;
}

export interface SavedAudience {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  query_type: 'sql' | 'built_in';
  query_params: { name?: string; sql?: string };
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ResolvedAudience {
  audience_id: string;
  name: string;
  user_ids: string[];
  count: number;
}

export interface NotificationAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface CreateNotificationRequest {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  category?: string;
  expires_at?: string;
  metadata?: {
    attachments?: NotificationAttachment[];
    verification_question?: VerificationQuestion;
  };
  targeting: NotificationTargeting;
  requires_acknowledgment?: boolean;
  acknowledgment_deadline_hours?: number;
}

export interface NotificationStats {
  total_sent: number;
  total_read: number;
  read_percentage: number;
  target_users: number;
}

// ==================== ACKNOWLEDGMENT SYSTEM ====================

export interface AcknowledgmentStatus {
  notification_id: string;
  title: string;
  requires_acknowledgment: boolean;
  acknowledgment_deadline_hours: number;
  sent_at: string;
  total_recipients: number;
  acknowledged_count: number;
  pending_count: number;
  overdue_count: number;
  acknowledgment_rate: number;
  recipients: AcknowledgmentRecipient[];
}

export interface AcknowledgmentRecipient {
  user_id: string;
  email: string;
  name: string;
  role: string;
  institution_name?: string;
  acknowledged_at: string | null;
  read_at: string | null;
  is_overdue: boolean;
  escalation_level: number;
}

export interface UnacknowledgedNotification {
  id: string;
  notification_id: string;
  title: string;
  body: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: string;
  url?: string;
  created_by_name?: string;
  sent_at: string;
  deadline_at: string;
  is_overdue: boolean;
  metadata?: {
    attachments?: NotificationAttachment[];
    verification_question?: VerificationQuestion;
    [key: string]: any;
  };
}

// ==================== VERIFICATION QUESTION ====================

export interface VerificationQuestion {
  question: string;
  options: string[];       // 3 options (A, B, C)
  correct_index: number;   // 0, 1, or 2
}
