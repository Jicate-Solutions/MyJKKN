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
  semester?: number;
  section?: string;
}

export interface CreateNotificationRequest {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  category?: string;
  expires_at?: string;
  targeting: NotificationTargeting;
}

export interface NotificationStats {
  total_sent: number;
  total_read: number;
  read_percentage: number;
  target_users: number;
}
