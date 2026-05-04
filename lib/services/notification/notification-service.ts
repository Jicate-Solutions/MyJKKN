// lib/services/notification/notification-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';

const supabase = createClientSupabaseClient();
import type {
  Notification,
  NotificationFilters,
  CreateNotificationDto,
  UpdateNotificationDto,
  BulkUpdateNotificationDto,
  NotificationStats,
  NotificationPreference,
  CreateNotificationPreferenceDto,
  UpdateNotificationPreferenceDto,
  SendNotificationDto
} from '@/types/notification';
import {
  NotificationChannel,
  NotificationType,
  NotificationCategory,
  NotificationPriority,
  NotificationStatus
} from '@/types/notification';

// ==================== NOTIFICATION CRUD ====================

export async function getNotifications(
  filters: NotificationFilters = {}
): Promise<Notification[]> {
  let query = supabase
    .from('user_notifications')
    .select(
      `
      *,
      notification:notifications!user_notifications_notification_id_fkey(
        id,
        title,
        body,
        url,
        action_config,
        icon,
        category,
        priority,
        metadata,
        created_at
      ),
      user:profiles!user_notifications_user_id_fkey(id, full_name, email)
    `
    )
    .order('created_at', { ascending: false });

  if (filters.user_id) {
    query = query.eq('user_id', filters.user_id);
  }

  if (filters.is_read !== undefined) {
    if (filters.is_read) {
      query = query.not('read_at', 'is', null);
    } else {
      query = query.is('read_at', null);
    }
  }

  if (filters.from_date) {
    query = query.gte('created_at', filters.from_date);
  }

  if (filters.to_date) {
    query = query.lte('created_at', filters.to_date);
  }

  // Use range() for pagination — it handles both offset and limit in one call.
  // Using both .limit() and .range() causes PostgREST to apply limit first,
  // then range on the limited set, which can cut off newer notifications.
  if (filters.offset !== undefined || filters.limit !== undefined) {
    const start = filters.offset || 0;
    const end = start + (filters.limit || 20) - 1;
    query = query.range(start, end);
  }

  const { data, error } = await query;

  if (error) throw error;

  // Map the nested Supabase result to the flat Notification interface
  // DB returns: { user_id, notification_id, read_at, notification: { title, body, ... } }
  // UI expects: { title, message, is_read, is_archived, ... }
  return (
    (data || []).map((row: any) => {
      const n = row.notification || {};
      return {
        id: row.id,
        user_id: row.user_id,
        notification_id: row.notification_id,
        title: n.title || '',
        message: n.body || '',
        type: n.metadata?.type || 'info',
        category: n.category || 'system',
        priority: n.priority || 'normal',
        status: row.read_at ? 'read' : 'unread',
        is_read: !!row.read_at,
        is_archived: false,
        read_at: row.read_at,
        // Dashboard work-item digests (cron-generated) write the destination
        // URL into action_config.url, NOT notifications.url. Read both so
        // every notification with any kind of routing target reaches the UI.
        // Bug found 2026-05-04: dashboard:* digests had url=null on every
        // row; clicks marked-as-read but never navigated.
        action_url: n.url || n.action_config?.url || undefined,
        metadata: n.metadata,
        channels: ['in_app'],
        created_at: row.created_at,
        updated_at: row.created_at,
        user: row.user
      } as Notification;
    }) || []
  );
}

export async function getNotification(
  id: string
): Promise<Notification | null> {
  const { data, error } = await supabase
    .from('user_notifications')
    .select(
      `
      *,
      notification:notifications!user_notifications_notification_id_fkey(
        id,
        title,
        body,
        url,
        action_config,
        icon,
        category,
        priority,
        metadata,
        created_at
      ),
      user:profiles!user_notifications_user_id_fkey(id, full_name, email)
    `
    )
    .eq('id', id)
    .single();

  if (error) throw error;
  if (!data) return null;

  const row = data as any;
  const n = row.notification || {};
  return {
    id: row.id,
    user_id: row.user_id,
    notification_id: row.notification_id,
    title: n.title || '',
    message: n.body || '',
    type: n.metadata?.type || 'info',
    category: n.category || 'system',
    priority: n.priority || 'normal',
    status: row.read_at ? 'read' : 'unread',
    is_read: !!row.read_at,
    is_archived: false,
    read_at: row.read_at,
    // Same fallback as getNotifications — read URL from action_config when
    // notifications.url is null (cron-generated dashboard digests).
    action_url: n.url || n.action_config?.url || undefined,
    metadata: n.metadata,
    channels: ['in_app'],
    created_at: row.created_at,
    updated_at: row.created_at,
    user: row.user
  } as Notification;
}

export async function createNotification(
  dto: CreateNotificationDto
): Promise<Notification> {
  const notificationData = {
    ...dto,
    priority: dto.priority || NotificationPriority.NORMAL,
    channels: dto.channels || [NotificationChannel.IN_APP],
    status: NotificationStatus.UNREAD,
    is_read: false,
    is_archived: false
  };

  const { data, error } = await supabase
    .from('notifications')
    .insert(notificationData as any)
    .select()
    .single();

  if (error) throw error;

  const notification = data as unknown as Notification;

  // TODO: Send to external channels (email, SMS, push) based on channels array
  await sendToChannels(notification);

  return notification;
}

export async function updateNotification(
  id: string,
  dto: UpdateNotificationDto
): Promise<Notification> {
  const updateData: any = { ...dto };

  if (dto.is_read === true && !updateData.read_at) {
    updateData.read_at = new Date().toISOString();
  }

  if (dto.is_archived === true && !updateData.archived_at) {
    updateData.archived_at = new Date().toISOString();
  }

  const { data, error } = await (supabase
    .from('notifications') as any)
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await (supabase as any).from('notifications').delete().eq('id', id);

  if (error) throw error;
}

// ==================== BULK OPERATIONS ====================

export async function bulkUpdateNotifications(
  dto: BulkUpdateNotificationDto
): Promise<void> {
  const updateData: any = {};

  if (dto.status) updateData.status = dto.status;
  if (dto.is_read !== undefined) {
    updateData.is_read = dto.is_read;
    if (dto.is_read === true) {
      updateData.read_at = new Date().toISOString();
    }
  }
  if (dto.is_archived !== undefined) {
    updateData.is_archived = dto.is_archived;
    if (dto.is_archived === true) {
      updateData.archived_at = new Date().toISOString();
    }
  }

  const { error } = await (supabase
    .from('notifications') as any)
    .update(updateData)
    .in('id', dto.notification_ids);

  if (error) throw error;
}

export async function markAsRead(notificationId: string): Promise<void> {
  const { error } = await (supabase
    .from('user_notifications') as any)
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);

  if (error) throw error;
}

export async function markAllAsRead(userId: string): Promise<void> {
  const { error } = await (supabase
    .from('user_notifications') as any)
    .update({
      read_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) throw error;
}

export async function archiveNotification(
  notificationId: string
): Promise<void> {
  await updateNotification(notificationId, {
    is_archived: true,
    status: NotificationStatus.ARCHIVED
  });
}

export async function deleteAllRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('user_notifications')
    .delete()
    .eq('user_id', userId)
    .not('read_at', 'is', null);

  if (error) throw error;
}

// ==================== STATISTICS ====================

export async function getNotificationStats(
  userId: string
): Promise<NotificationStats> {
  const { data: userNotifications, error } = await supabase
    .from('user_notifications')
    .select('read_at, notification:notifications!user_notifications_notification_id_fkey(category, priority)')
    .eq('user_id', userId);

  if (error) throw error;

  const stats: NotificationStats = {
    total_notifications: userNotifications?.length || 0,
    unread_count:
      userNotifications?.filter((n: any) => !n.read_at).length || 0,
    read_count: userNotifications?.filter((n: any) => n.read_at).length || 0,
    archived_count: 0,
    by_category: [],
    by_type: [],
    by_priority: []
  };

  // Group by category
  const categoryMap = new Map<string, number>();
  userNotifications?.forEach((n: any) => {
    if (n.notification?.category) {
      categoryMap.set(n.notification.category, (categoryMap.get(n.notification.category) || 0) + 1);
    }
  });
  stats.by_category = Array.from(categoryMap.entries()).map(
    ([category, count]) => ({
      category: category as NotificationCategory,
      count
    })
  );

  // Group by priority
  const priorityMap = new Map<string, number>();
  userNotifications?.forEach((n: any) => {
    if (n.notification?.priority) {
      priorityMap.set(n.notification.priority, (priorityMap.get(n.notification.priority) || 0) + 1);
    }
  });
  stats.by_priority = Array.from(priorityMap.entries()).map(
    ([priority, count]) => ({
      priority: priority as NotificationPriority,
      count
    })
  );

  return stats;
}

// ==================== PREFERENCES ====================

export async function getUserPreferences(
  userId: string
): Promise<NotificationPreference[]> {
  const { data, error } = await (supabase
    .from('notification_preferences' as any) as any)
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;
  return (data as unknown as NotificationPreference[]) || [];
}

export async function createPreference(
  dto: CreateNotificationPreferenceDto
): Promise<NotificationPreference> {
  const { data, error } = await (supabase
    .from('notification_preferences' as any) as any)
    .insert({
      ...dto,
      enabled: dto.enabled !== undefined ? dto.enabled : true
    })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as NotificationPreference;
}

export async function updatePreference(
  id: string,
  dto: UpdateNotificationPreferenceDto
): Promise<NotificationPreference> {
  const { data, error } = await (supabase
    .from('notification_preferences' as any) as any)
    .update(dto)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as NotificationPreference;
}

export async function deletePreference(id: string): Promise<void> {
  const { error } = await (supabase
    .from('notification_preferences' as any) as any)
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ==================== SEND NOTIFICATIONS ====================

export async function sendNotification(
  dto: SendNotificationDto
): Promise<Notification[]> {
  const notifications: Notification[] = [];

  for (const userId of dto.user_ids) {
    // Check user preferences
    const preferences = await getUserPreferences(userId);
    const categoryPref = preferences.find((p) => p.category === dto.category);

    // Skip if disabled
    if (categoryPref && !categoryPref.enabled) continue;

    // Check quiet hours
    if (categoryPref && isInQuietHours(categoryPref)) continue;

    // Determine channels
    const channels = dto.channels ||
      categoryPref?.channels || [NotificationChannel.IN_APP];

    // Render template if provided
    let title = dto.title;
    let message = dto.message;

    if (dto.template_name && dto.variables) {
      const rendered = await renderTemplate(
        dto.template_name,
        dto.variables,
        dto
      );
      title = rendered.title;
      message = rendered.message;
    }

    // Create notification
    const notification = await createNotification({
      user_id: userId,
      type: dto.type,
      category: dto.category,
      priority: dto.priority || NotificationPriority.NORMAL,
      title,
      message,
      metadata: dto.metadata,
      action_url: dto.action_url,
      action_label: dto.action_label,
      channels
    });

    notifications.push(notification);
  }

  return notifications;
}

// ==================== HELPER FUNCTIONS ====================

async function sendToChannels(notification: Notification): Promise<void> {
  // TODO: Implement actual channel sending
  for (const channel of notification.channels) {
    switch (channel) {
      case NotificationChannel.EMAIL:
        // await sendEmail(notification);
        console.log('Email notification sent:', notification.id);
        break;
      case NotificationChannel.SMS:
        // await sendSMS(notification);
        console.log('SMS notification sent:', notification.id);
        break;
      case NotificationChannel.PUSH:
        // await sendPush(notification);
        console.log('Push notification sent:', notification.id);
        break;
      case NotificationChannel.IN_APP:
        // Already stored in database
        break;
    }
  }
}

function isInQuietHours(preference: NotificationPreference): boolean {
  if (!preference.quiet_hours_start || !preference.quiet_hours_end) {
    return false;
  }

  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  const [startHour, startMin] = preference.quiet_hours_start
    .split(':')
    .map(Number);
  const [endHour, endMin] = preference.quiet_hours_end.split(':').map(Number);

  const quietStart = startHour * 60 + startMin;
  const quietEnd = endHour * 60 + endMin;

  if (quietStart < quietEnd) {
    return currentTime >= quietStart && currentTime <= quietEnd;
  } else {
    // Crosses midnight
    return currentTime >= quietStart || currentTime <= quietEnd;
  }
}

async function renderTemplate(
  templateName: string,
  variables: Record<string, string>,
  dto: SendNotificationDto
): Promise<{ title: string; message: string }> {
  // TODO: Fetch template from database and render with variables
  // For now, just use the provided title/message
  let title = dto.title;
  let message = dto.message;

  // Simple variable replacement
  Object.entries(variables).forEach(([key, value]) => {
    title = title.replace(new RegExp(`{{${key}}}`, 'g'), value);
    message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
  });

  return { title, message };
}

// ==================== ADMIN/MANAGE NOTIFICATIONS ====================

export async function getNotificationsManage(params: {
  page: number;
  limit: number;
  search: string;
  sort_by: string;
  sort_order: string;
}): Promise<{
  success: boolean;
  data: import('@/types/notification').NotificationWithStats[];
  pagination: {
    page: number;
    limit: number;
    total_pages: number;
    total_items: number;
  };
}> {
  const searchParams = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    search: params.search || '',
    sort_by: params.sort_by || 'created_at',
    sort_order: params.sort_order || 'desc'
  });

  const response = await fetch(
    `/api/notifications/manage?${searchParams.toString()}`
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch notifications');
  }

  return response.json();
}

// ==================== PRE-BUILT NOTIFICATION CREATORS ====================

export async function notifyReservationApproved(
  userId: string,
  resourceName: string,
  reservationId: string
): Promise<Notification> {
  return await createNotification({
    user_id: userId,
    type: NotificationType.SUCCESS,
    category: NotificationCategory.RESERVATION,
    priority: NotificationPriority.NORMAL,
    title: 'Reservation Approved',
    message: `Your reservation for "${resourceName}" has been approved!`,
    metadata: {
      reservation_id: reservationId,
      resource_name: resourceName
    },
    action_url: `/resource-management/reservations/${reservationId}`,
    action_label: 'View Details',
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL]
  });
}

export async function notifyReservationRejected(
  userId: string,
  resourceName: string,
  reservationId: string,
  reason?: string
): Promise<Notification> {
  return await createNotification({
    user_id: userId,
    type: NotificationType.ERROR,
    category: NotificationCategory.RESERVATION,
    priority: NotificationPriority.HIGH,
    title: 'Reservation Rejected',
    message: `Your reservation for "${resourceName}" has been rejected. ${
      reason ? `Reason: ${reason}` : ''
    }`,
    metadata: {
      reservation_id: reservationId,
      resource_name: resourceName
    },
    action_url: `/resource-management/reservations/${reservationId}`,
    action_label: 'View Details',
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL]
  });
}

export async function notifyMaintenanceScheduled(
  userId: string,
  resourceName: string,
  scheduledDate: string,
  maintenanceId: string
): Promise<Notification> {
  return await createNotification({
    user_id: userId,
    type: NotificationType.INFO,
    category: NotificationCategory.MAINTENANCE,
    priority: NotificationPriority.NORMAL,
    title: 'Maintenance Scheduled',
    message: `Maintenance for "${resourceName}" is scheduled for ${new Date(
      scheduledDate
    ).toLocaleDateString()}.`,
    metadata: {
      maintenance_id: maintenanceId,
      resource_name: resourceName
    },
    action_url: `/resource-management/maintenance/${maintenanceId}`,
    action_label: 'View Details',
    channels: [NotificationChannel.IN_APP]
  });
}

export async function notifyMaintenanceReminder(
  userId: string,
  resourceName: string,
  scheduledDate: string,
  maintenanceId: string
): Promise<Notification> {
  return await createNotification({
    user_id: userId,
    type: NotificationType.REMINDER,
    category: NotificationCategory.MAINTENANCE,
    priority: NotificationPriority.HIGH,
    title: 'Maintenance Reminder',
    message: `Reminder: Maintenance for "${resourceName}" is due on ${new Date(
      scheduledDate
    ).toLocaleDateString()}.`,
    metadata: {
      maintenance_id: maintenanceId,
      resource_name: resourceName
    },
    action_url: `/resource-management/maintenance/${maintenanceId}`,
    action_label: 'View Details',
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL]
  });
}

export async function notifyApprovalPending(
  userId: string,
  resourceName: string,
  requesterName: string,
  reservationId: string
): Promise<Notification> {
  return await createNotification({
    user_id: userId,
    type: NotificationType.WARNING,
    category: NotificationCategory.APPROVAL,
    priority: NotificationPriority.HIGH,
    title: 'Approval Required',
    message: `${requesterName} has requested to reserve "${resourceName}". Your approval is required.`,
    metadata: {
      reservation_id: reservationId,
      resource_name: resourceName
    },
    action_url: `/resource-management/reservations/approvals`,
    action_label: 'Review Request',
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL]
  });
}
