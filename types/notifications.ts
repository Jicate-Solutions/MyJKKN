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
  metadata?: { attachments?: NotificationAttachment[] };
  targeting: NotificationTargeting;
  requires_acknowledgment?: boolean;
  acknowledgment_deadline_hours?: number;
  action_type?: ActionType;
  action_config?: ActionConfig;
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
    [key: string]: any;
  };
}

// ==================== ACTION REQUIRED SYSTEM ====================

export type ActionType = 'urgent' | 'tracked';
export type ResponseType = 'text' | 'file' | 'form' | 'link';

export interface FormItem {
  id: string;
  title: string;
  description?: string;
}

export interface ActionConfig {
  response_type: ResponseType;
  form_items?: FormItem[];
  link_url?: string;
  min_text_length?: number;
  max_file_size_mb?: number;
  allowed_file_types?: string[];
  escalation_chain?: string[];
}

export interface ActionResponse {
  id: string;
  notification_id: string;
  user_id: string;
  response_type: ResponseType;
  text_response?: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  form_response?: Record<string, boolean>;
  link_confirmed?: boolean;
  submitted_at: string;
  created_at: string;
}

export interface ExtensionRequest {
  id: string;
  notification_id: string;
  user_id: string;
  reason: string;
  requested_deadline: string;
  status: 'pending' | 'approved' | 'denied';
  reviewed_by?: string;
  reviewed_at?: string;
  review_note?: string;
  created_at: string;
}

export interface PendingAction {
  id: string;
  notification_id: string;
  title: string;
  body: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: string;
  action_type: ActionType;
  action_config: ActionConfig;
  acknowledgment_deadline_hours: number;
  sent_at: string;
  created_by_name: string;
  deadline_at: string;
  is_overdue: boolean;
  has_responded: boolean;
  extension_request?: {
    status: 'pending' | 'approved' | 'denied';
    requested_deadline: string;
  };
  metadata?: {
    attachments?: NotificationAttachment[];
    [key: string]: any;
  };
}
