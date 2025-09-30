// types/notification.ts

import { z } from 'zod';

// ==================== ENUMS ====================

export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  REMINDER = 'reminder'
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push'
}

export enum NotificationCategory {
  RESERVATION = 'reservation',
  APPROVAL = 'approval',
  MAINTENANCE = 'maintenance',
  RESOURCE = 'resource',
  SYSTEM = 'system'
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum NotificationStatus {
  UNREAD = 'unread',
  READ = 'read',
  ARCHIVED = 'archived'
}

// ==================== INTERFACES ====================

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  status: NotificationStatus;
  title: string;
  message: string;
  metadata?: NotificationMetadata;
  action_url?: string;
  action_label?: string;
  channels: NotificationChannel[];
  is_read: boolean;
  is_archived: boolean;
  read_at?: string;
  archived_at?: string;
  created_at: string;
  updated_at: string;

  // Relations
  user?: any;
}

export interface NotificationMetadata {
  resource_id?: string;
  resource_name?: string;
  reservation_id?: string;
  approval_id?: string;
  maintenance_id?: string;
  reference_id?: string;
  reference_type?: string;
  custom_data?: Record<string, any>;
}

export interface NotificationPreference {
  id: string;
  user_id: string;
  category: NotificationCategory;
  channels: NotificationChannel[];
  enabled: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  created_at: string;
  updated_at: string;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  category: NotificationCategory;
  type: NotificationType;
  title_template: string;
  message_template: string;
  default_channels: NotificationChannel[];
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ==================== DTOs ====================

export interface CreateNotificationDto {
  user_id: string;
  type: NotificationType;
  category: NotificationCategory;
  priority?: NotificationPriority;
  title: string;
  message: string;
  metadata?: NotificationMetadata;
  action_url?: string;
  action_label?: string;
  channels?: NotificationChannel[];
}

export interface UpdateNotificationDto {
  status?: NotificationStatus;
  is_read?: boolean;
  is_archived?: boolean;
}

export interface BulkUpdateNotificationDto {
  notification_ids: string[];
  status?: NotificationStatus;
  is_read?: boolean;
  is_archived?: boolean;
}

export interface CreateNotificationPreferenceDto {
  user_id: string;
  category: NotificationCategory;
  channels: NotificationChannel[];
  enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
}

export interface UpdateNotificationPreferenceDto {
  channels?: NotificationChannel[];
  enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
}

export interface SendNotificationDto {
  template_name?: string;
  user_ids: string[];
  type: NotificationType;
  category: NotificationCategory;
  priority?: NotificationPriority;
  title: string;
  message: string;
  metadata?: NotificationMetadata;
  action_url?: string;
  action_label?: string;
  channels?: NotificationChannel[];
  variables?: Record<string, string>;
}

// ==================== FILTERS ====================

export interface NotificationFilters {
  user_id?: string;
  type?: NotificationType;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  status?: NotificationStatus;
  is_read?: boolean;
  is_archived?: boolean;
  search?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

// ==================== STATISTICS ====================

export interface NotificationStats {
  total_notifications: number;
  unread_count: number;
  read_count: number;
  archived_count: number;
  by_category: {
    category: NotificationCategory;
    count: number;
  }[];
  by_type: {
    type: NotificationType;
    count: number;
  }[];
  by_priority: {
    priority: NotificationPriority;
    count: number;
  }[];
}

// ==================== ZOD SCHEMAS ====================

export const createNotificationSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  type: z.nativeEnum(NotificationType),
  category: z.nativeEnum(NotificationCategory),
  priority: z.nativeEnum(NotificationPriority).optional(),
  title: z.string().min(3, 'Title must be at least 3 characters'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
  metadata: z
    .object({
      resource_id: z.string().uuid().optional(),
      resource_name: z.string().optional(),
      reservation_id: z.string().uuid().optional(),
      approval_id: z.string().uuid().optional(),
      maintenance_id: z.string().uuid().optional(),
      reference_id: z.string().optional(),
      reference_type: z.string().optional(),
      custom_data: z.record(z.any()).optional()
    })
    .optional(),
  action_url: z.string().optional(),
  action_label: z.string().optional(),
  channels: z.array(z.nativeEnum(NotificationChannel)).optional()
});

export const notificationPreferenceSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  category: z.nativeEnum(NotificationCategory),
  channels: z
    .array(z.nativeEnum(NotificationChannel))
    .min(1, 'At least one channel is required'),
  enabled: z.boolean().optional(),
  quiet_hours_start: z.string().optional(),
  quiet_hours_end: z.string().optional()
});

export const sendNotificationSchema = z.object({
  template_name: z.string().optional(),
  user_ids: z.array(z.string().uuid()).min(1, 'At least one user is required'),
  type: z.nativeEnum(NotificationType),
  category: z.nativeEnum(NotificationCategory),
  priority: z.nativeEnum(NotificationPriority).optional(),
  title: z.string().min(3, 'Title must be at least 3 characters'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
  metadata: z
    .object({
      resource_id: z.string().uuid().optional(),
      resource_name: z.string().optional(),
      reservation_id: z.string().uuid().optional(),
      approval_id: z.string().uuid().optional(),
      maintenance_id: z.string().uuid().optional(),
      reference_id: z.string().optional(),
      reference_type: z.string().optional(),
      custom_data: z.record(z.any()).optional()
    })
    .optional(),
  action_url: z.string().optional(),
  action_label: z.string().optional(),
  channels: z.array(z.nativeEnum(NotificationChannel)).optional(),
  variables: z.record(z.string()).optional()
});
