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
}
