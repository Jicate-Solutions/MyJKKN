// lib/services/solutions/notifications-service.ts
// CRUD operations for sh_notifications

import { BaseService, type BaseListResponse } from '../base-service';
import type { Notification, NotificationType, PaginationParams } from './types';

// ============================================
// TYPES
// ============================================

export interface NotificationFilters extends PaginationParams {
  user_id?: string;
  type?: NotificationType;
  read?: boolean;
}

export interface CreateNotificationInput {
  user_id: string;
  type: NotificationType;
  title: string;
  message?: string;
  link?: string;
}

// ============================================
// SERVICE CLASS
// ============================================

export class NotificationsService extends BaseService {
  /**
   * Get all notifications with optional filters
   */
  static async getNotifications(
    filters?: NotificationFilters
  ): Promise<BaseListResponse<Notification>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = (this.supabase as any).from('sh_notifications')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.user_id) {
      query = query.eq('user_id', filters.user_id);
    }

    if (filters?.type) {
      query = query.eq('type', filters.type);
    }

    if (filters?.read !== undefined) {
      query = query.eq('read', filters.read);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch notifications: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as Notification[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get unread notifications for a user
   */
  static async getUnreadNotifications(limit: number = 50): Promise<Notification[]> {
    const { data, error } = await (this.supabase as any).from('sh_notifications')
      .select('*')
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to fetch unread notifications: ${error.message}`);
    return data as Notification[];
  }

  /**
   * Get unread notification count
   */
  static async getUnreadCount(): Promise<number> {
    const { count, error } = await (this.supabase as any).from('sh_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('read', false);

    if (error) throw new Error(`Failed to get unread count: ${error.message}`);
    return count || 0;
  }

  /**
   * Get a single notification by ID
   */
  static async getNotificationById(id: string): Promise<Notification | null> {
    const { data, error } = await (this.supabase as any).from('sh_notifications')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch notification: ${error.message}`);
    }

    return data as Notification;
  }

  /**
   * Create a new notification
   */
  static async createNotification(input: CreateNotificationInput): Promise<Notification> {
    const { data, error } = await (this.supabase as any).from('sh_notifications')
      .insert({
        user_id: input.user_id,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link,
        read: false,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create notification: ${error.message}`);
    return data as Notification;
  }

  /**
   * Create notifications for multiple users
   */
  static async createNotificationForUsers(
    userIds: string[],
    notification: Omit<CreateNotificationInput, 'user_id'>
  ): Promise<Notification[]> {
    const notifications = userIds.map((userId) => ({
      user_id: userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      link: notification.link,
      read: false,
    }));

    const { data, error } = await (this.supabase as any).from('sh_notifications')
      .insert(notifications)
      .select();

    if (error) throw new Error(`Failed to create notifications: ${error.message}`);
    return data as Notification[];
  }

  /**
   * Mark a notification as read
   */
  static async markAsRead(id: string): Promise<Notification> {
    const { data, error } = await (this.supabase as any).from('sh_notifications')
      .update({ read: true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to mark notification as read: ${error.message}`);
    return data as Notification;
  }

  /**
   * Mark all notifications as read
   */
  static async markAllAsRead(): Promise<void> {
    const { error } = await (this.supabase as any).from('sh_notifications')
      .update({ read: true })
      .eq('read', false);

    if (error) throw new Error(`Failed to mark all notifications as read: ${error.message}`);
  }

  /**
   * Delete a notification
   */
  static async deleteNotification(id: string): Promise<void> {
    const { error } = await (this.supabase as any).from('sh_notifications').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete notification: ${error.message}`);
  }

  /**
   * Delete old read notifications
   */
  static async deleteOldNotifications(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const { data, error } = await (this.supabase as any).from('sh_notifications')
      .delete()
      .eq('read', true)
      .lt('created_at', cutoffDate.toISOString())
      .select('id');

    if (error) throw new Error(`Failed to delete old notifications: ${error.message}`);
    return data?.length || 0;
  }

  // ============================================
  // TRIGGER NOTIFICATIONS
  // ============================================

  /**
   * Notify when payment is received
   */
  static async notifyPaymentReceived(paymentId: string): Promise<void> {
    const { data: payment, error: paymentError } = await (this.supabase as any).from('sh_payments')
      .select(
        `
        id,
        amount,
        phase:sh_solution_phases(
          id,
          title,
          created_by,
          solution:sh_solutions(id, title, solution_code, created_by)
        ),
        program:sh_training_programs(
          id,
          solution:sh_solutions(id, title, solution_code, created_by)
        ),
        order:sh_content_orders(
          id,
          solution:sh_solutions(id, title, solution_code, created_by)
        )
      `
      )
      .eq('id', paymentId)
      .single();

    if (paymentError || !payment) return;

    let solution: { id: string; title: string; created_by?: string } | null = null;

    if (payment.phase) {
      const phase = Array.isArray(payment.phase) ? payment.phase[0] : payment.phase;
      solution = Array.isArray(phase?.solution) ? phase.solution[0] : phase?.solution;
    } else if (payment.program) {
      const program = Array.isArray(payment.program) ? payment.program[0] : payment.program;
      solution = Array.isArray(program?.solution) ? program.solution[0] : program?.solution;
    } else if (payment.order) {
      const order = Array.isArray(payment.order) ? payment.order[0] : payment.order;
      solution = Array.isArray(order?.solution) ? order.solution[0] : order?.solution;
    }

    if (!solution) return;

    const userIdsToNotify: Set<string> = new Set();
    if (solution.created_by) {
      userIdsToNotify.add(solution.created_by);
    }

    if (userIdsToNotify.size === 0) return;

    const amount = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(Number(payment.amount));

    await this.createNotificationForUsers(Array.from(userIdsToNotify), {
      type: 'payment',
      title: 'Payment Received',
      message: `Payment of ${amount} received for ${solution.title}`,
      link: `/solutions/${solution.id}`,
    });
  }

  /**
   * Notify when deliverable status changes
   */
  static async notifyDeliverableStatus(
    deliverableId: string,
    status: 'approved' | 'revision'
  ): Promise<void> {
    const { data: deliverable, error } = await (this.supabase as any).from('sh_content_deliverables')
      .select(
        `
        id,
        title,
        order:sh_content_orders(
          id,
          solution:sh_solutions(id, title)
        )
      `
      )
      .eq('id', deliverableId)
      .single();

    if (error || !deliverable) return;

    // Get assigned learners
    const { data: assignments } = await (this.supabase as any).from('sh_production_assignments')
      .select(
        `
        id,
        learner:sh_production_learners(id, user_id, name)
      `
      )
      .eq('deliverable_id', deliverableId);

    const userIdsToNotify: Set<string> = new Set();

    if (assignments) {
      for (const assignment of assignments) {
        const learner = Array.isArray(assignment.learner)
          ? assignment.learner[0]
          : assignment.learner;
        if (learner?.user_id) {
          userIdsToNotify.add(learner.user_id);
        }
      }
    }

    if (userIdsToNotify.size === 0) return;

    const order = Array.isArray(deliverable.order) ? deliverable.order[0] : deliverable.order;
    const solution = Array.isArray(order?.solution) ? order.solution[0] : order?.solution;

    const statusLabels: Record<string, { title: string; action: string }> = {
      approved: { title: 'Deliverable Approved', action: 'approved' },
      rejected: { title: 'Deliverable Rejected', action: 'rejected' },
      revision: { title: 'Revision Requested', action: 'needs revision' },
    };

    const { title, action } = statusLabels[status] || statusLabels.revision;

    await this.createNotificationForUsers(Array.from(userIdsToNotify), {
      type: 'approval',
      title,
      message: `Your deliverable "${deliverable.title}" was ${action}`,
      link: solution ? `/solutions/${solution.id}` : undefined,
    });
  }

  /**
   * Notify when assignment is approved
   */
  static async notifyAssignmentApproved(
    assignmentType: 'builder' | 'cohort',
    assignmentId: string
  ): Promise<void> {
    if (assignmentType === 'builder') {
      const { data: assignment, error } = await (this.supabase as any).from('sh_builder_assignments')
        .select(
          `
          id,
          builder:sh_builders(id, name, user_id),
          phase:sh_solution_phases(
            id,
            title,
            solution:sh_solutions(id, title, solution_code)
          )
        `
        )
        .eq('id', assignmentId)
        .single();

      if (error || !assignment) return;

      const builder = Array.isArray(assignment.builder)
        ? assignment.builder[0]
        : assignment.builder;
      const phase = Array.isArray(assignment.phase) ? assignment.phase[0] : assignment.phase;
      const solution = Array.isArray(phase?.solution) ? phase.solution[0] : phase?.solution;

      if (!builder?.user_id) return;

      await this.createNotification({
        user_id: builder.user_id,
        type: 'assignment',
        title: 'Assignment Approved',
        message: `Your assignment to ${phase?.title || 'phase'} has been approved`,
        link: solution ? `/builder-portal/assignments` : undefined,
      });
    }
  }

  /**
   * Notify when MoU is expiring
   */
  static async notifyMouExpiring(mouId: string, daysUntilExpiry: number): Promise<void> {
    const { data: mou, error } = await (this.supabase as any).from('sh_solution_mous')
      .select(
        `
        id,
        mou_number,
        created_by,
        solution:sh_solutions(id, title, solution_code, created_by)
      `
      )
      .eq('id', mouId)
      .single();

    if (error || !mou) return;

    const userIdsToNotify: Set<string> = new Set();

    if (mou.created_by) {
      userIdsToNotify.add(mou.created_by);
    }

    const solution = Array.isArray(mou.solution) ? mou.solution[0] : mou.solution;
    if (solution?.created_by) {
      userIdsToNotify.add(solution.created_by);
    }

    if (userIdsToNotify.size === 0) return;

    const solutionTitle = solution?.title || solution?.solution_code || mou.mou_number;

    await this.createNotificationForUsers(Array.from(userIdsToNotify), {
      type: 'deadline',
      title: 'MoU Expiring Soon',
      message: `MoU for ${solutionTitle} expires in ${daysUntilExpiry} days`,
      link: solution ? `/solutions/${solution.id}` : undefined,
    });
  }
}

// Export singleton instance methods
export const notificationsService = {
  getNotifications: NotificationsService.getNotifications.bind(NotificationsService),
  getUnreadNotifications: NotificationsService.getUnreadNotifications.bind(NotificationsService),
  getUnreadCount: NotificationsService.getUnreadCount.bind(NotificationsService),
  getNotificationById: NotificationsService.getNotificationById.bind(NotificationsService),
  createNotification: NotificationsService.createNotification.bind(NotificationsService),
  createNotificationForUsers: NotificationsService.createNotificationForUsers.bind(NotificationsService),
  markAsRead: NotificationsService.markAsRead.bind(NotificationsService),
  markAllAsRead: NotificationsService.markAllAsRead.bind(NotificationsService),
  deleteNotification: NotificationsService.deleteNotification.bind(NotificationsService),
  deleteOldNotifications: NotificationsService.deleteOldNotifications.bind(NotificationsService),
  notifyPaymentReceived: NotificationsService.notifyPaymentReceived.bind(NotificationsService),
  notifyDeliverableStatus: NotificationsService.notifyDeliverableStatus.bind(NotificationsService),
  notifyAssignmentApproved: NotificationsService.notifyAssignmentApproved.bind(NotificationsService),
  notifyMouExpiring: NotificationsService.notifyMouExpiring.bind(NotificationsService),
};
