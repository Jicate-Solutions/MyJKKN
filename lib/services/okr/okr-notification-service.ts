// ============================================================================
// OKR Notification Service
// Handles all OKR-related notifications including reminders, warnings, and celebrations
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  OKRObjective,
  OKRKeyResult,
  OKRUserStatus,
  OKRCheckIn,
  UserBadge,
  MilestoneType
} from '@/types/okr';

// ============================================================================
// Types
// ============================================================================

export type OKRNotificationType =
  | 'weekly_reminder'        // Friday 9 AM - Time to check-in
  | 'deadline_warning'       // Sunday 3 PM - 2 hours left
  | 'overdue_alert'          // Monday 9 AM - Check-in overdue
  | 'manager_escalation'     // Team member blocked
  | 'milestone_celebration'  // 50%, 75%, 100% milestone
  | 'badge_change'           // Green -> Yellow, etc.
  | 'blocker_resolved'       // Your blocker was resolved
  | 'dependency_update'      // Dependency status changed
  | 'kr_auto_updated';       // Auto-tracked KR updated

export interface OKRNotificationPayload {
  type: OKRNotificationType;
  user_id: string;
  title: string;
  body: string;
  url?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  metadata?: Record<string, any>;
}

export interface OKRNotificationTemplate {
  type: OKRNotificationType;
  title_template: string;
  body_template: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

// ============================================================================
// Notification Templates
// ============================================================================

const NOTIFICATION_TEMPLATES: Record<OKRNotificationType, OKRNotificationTemplate> = {
  weekly_reminder: {
    type: 'weekly_reminder',
    title_template: 'Time for your weekly OKR check-in!',
    body_template: 'Hey {{name}}, it\'s Friday! Take a few minutes to update your OKR progress for Week {{week}}.',
    priority: 'normal'
  },
  deadline_warning: {
    type: 'deadline_warning',
    title_template: 'Only 2 hours left to complete your check-in!',
    body_template: '{{name}}, your weekly check-in is due at 5 PM today. Don\'t let your streak break!',
    priority: 'high'
  },
  overdue_alert: {
    type: 'overdue_alert',
    title_template: 'Your OKR check-in is overdue',
    body_template: '{{name}}, you missed your check-in for Week {{week}}. Complete it now to avoid being blocked.',
    priority: 'urgent'
  },
  manager_escalation: {
    type: 'manager_escalation',
    title_template: 'Team Member OKR Non-Compliance',
    body_template: '{{member_name}} has been blocked for OKR non-compliance. Please review and take action.',
    priority: 'high'
  },
  milestone_celebration: {
    type: 'milestone_celebration',
    title_template: 'Congratulations! Milestone Achieved!',
    body_template: 'You\'ve hit {{milestone}}% on "{{okr_title}}"! Keep up the great work!',
    priority: 'normal'
  },
  badge_change: {
    type: 'badge_change',
    title_template: 'Your OKR Status Changed',
    body_template: 'Your OKR status changed from {{old_badge}} to {{new_badge}}. {{action_message}}',
    priority: 'high'
  },
  blocker_resolved: {
    type: 'blocker_resolved',
    title_template: 'Your Blocker Was Resolved!',
    body_template: 'Good news! The blocker for "{{okr_title}}" has been resolved by {{resolved_by}}.',
    priority: 'normal'
  },
  dependency_update: {
    type: 'dependency_update',
    title_template: 'Dependency Status Update',
    body_template: 'The dependency "{{dependency_title}}" for your OKR is now {{status}}.',
    priority: 'normal'
  },
  kr_auto_updated: {
    type: 'kr_auto_updated',
    title_template: 'Key Result Auto-Updated',
    body_template: 'Your Key Result "{{kr_title}}" was automatically updated from {{old_value}} to {{new_value}}.',
    priority: 'low'
  }
};

// ============================================================================
// Service Class
// ============================================================================

export class OKRNotificationService {
  private static supabase = createClientSupabaseClient();

  // ============================================================================
  // Core Notification Methods
  // ============================================================================

  /**
   * Create and send an OKR notification
   */
  static async sendNotification(payload: OKRNotificationPayload): Promise<void> {
    try {
      // Create notification in notifications table
      const { data: notification, error: notificationError } = await (this.supabase as any)
        .from('notifications')
        .insert({
          title: payload.title,
          body: payload.body,
          url: payload.url || '/okr',
          priority: payload.priority,
          category: 'okr',
          icon: 'target',
          metadata: {
            okr_notification_type: payload.type,
            ...payload.metadata
          },
          sent_at: new Date().toISOString()
        })
        .select()
        .single();

      if (notificationError) {
        console.error('[OKR Notification] Failed to create notification:', notificationError?.message || notificationError?.code || notificationError?.details || JSON.stringify(notificationError));
        throw notificationError;
      }

      // Link notification to user
      const { error: userNotificationError } = await (this.supabase as any)
        .from('user_notifications')
        .insert({
          user_id: payload.user_id,
          notification_id: notification.id
        });

      if (userNotificationError) {
        console.error('[OKR Notification] Failed to link notification to user:', userNotificationError?.message || userNotificationError?.code || userNotificationError?.details || JSON.stringify(userNotificationError));
        throw userNotificationError;
      }

    } catch (error: any) {
      console.error('[OKR Notification] Error sending notification:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Send notification using template
   */
  static async sendFromTemplate(
    type: OKRNotificationType,
    userId: string,
    variables: Record<string, string>,
    url?: string,
    additionalMetadata?: Record<string, any>
  ): Promise<void> {
    const template = NOTIFICATION_TEMPLATES[type];
    if (!template) {
      throw new Error(`Unknown notification type: ${type}`);
    }

    let title = template.title_template;
    let body = template.body_template;

    // Replace variables in templates
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      title = title.replace(regex, value);
      body = body.replace(regex, value);
    });

    await this.sendNotification({
      type,
      user_id: userId,
      title,
      body,
      url: url || '/okr',
      priority: template.priority,
      metadata: {
        template_type: type,
        variables,
        ...additionalMetadata
      }
    });
  }

  // ============================================================================
  // Scheduled Notification Methods (for cron jobs)
  // ============================================================================

  /**
   * Send weekly reminders to all users (Friday 9 AM)
   * Returns count of notifications sent
   */
  static async sendWeeklyReminders(supabaseAdmin: any): Promise<number> {
    try {
      const now = new Date();
      const weekNumber = this.getWeekNumber(now);
      const year = now.getFullYear();

      // Get all users who haven't completed check-in this week
      const { data: usersWithoutCheckIn, error } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .not('role', 'eq', 'student'); // Exclude students if they have different OKR flow

      if (error) throw error;

      // Get already completed check-ins for this week
      const { data: completedCheckIns } = await supabaseAdmin
        .from('okr_check_ins')
        .select('user_id')
        .eq('week_number', weekNumber)
        .eq('year', year)
        .eq('is_completed', true);

      const completedUserIds = new Set(completedCheckIns?.map((c: any) => c.user_id) || []);

      // Filter out users who have completed
      const usersToNotify = usersWithoutCheckIn?.filter(
        (user: any) => !completedUserIds.has(user.id)
      ) || [];

      let sentCount = 0;

      for (const user of usersToNotify) {
        try {
          // Create notification directly with admin client
          const { data: notification, error: notifError } = await supabaseAdmin
            .from('notifications')
            .insert({
              title: 'Time for your weekly OKR check-in!',
              body: `Hey ${user.full_name || 'there'}, it's Friday! Take a few minutes to update your OKR progress for Week ${weekNumber}.`,
              url: '/okr/check-in',
              priority: 'normal',
              category: 'okr',
              icon: 'target',
              metadata: {
                okr_notification_type: 'weekly_reminder',
                week_number: weekNumber,
                year: year
              },
              sent_at: new Date().toISOString()
            })
            .select()
            .single();

          if (notifError) {
            console.error(`[OKR] Failed to create notification for ${user.email}:`, notifError?.message || notifError?.code || notifError?.details || JSON.stringify(notifError));
            continue;
          }

          await supabaseAdmin
            .from('user_notifications')
            .insert({
              user_id: user.id,
              notification_id: notification.id
            });

          sentCount++;
        } catch (e: any) {
          console.error(`[OKR] Error notifying user ${user.email}:`, e?.message || e?.code || e?.details || JSON.stringify(e));
        }
      }

      return sentCount;
    } catch (error: any) {
      console.error('[OKR] Error sending weekly reminders:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Send deadline warnings (Sunday 3 PM - 2 hours before 5 PM deadline)
   */
  static async sendDeadlineWarnings(supabaseAdmin: any): Promise<number> {
    try {
      const now = new Date();
      const weekNumber = this.getWeekNumber(now);
      const year = now.getFullYear();

      // Get users who haven't completed check-in this week
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .not('role', 'eq', 'student');

      const { data: completedCheckIns } = await supabaseAdmin
        .from('okr_check_ins')
        .select('user_id')
        .eq('week_number', weekNumber)
        .eq('year', year)
        .eq('is_completed', true);

      const completedUserIds = new Set(completedCheckIns?.map((c: any) => c.user_id) || []);

      const usersToNotify = profiles?.filter(
        (user: any) => !completedUserIds.has(user.id)
      ) || [];

      let sentCount = 0;

      for (const user of usersToNotify) {
        try {
          const { data: notification } = await supabaseAdmin
            .from('notifications')
            .insert({
              title: 'Only 2 hours left to complete your check-in!',
              body: `${user.full_name || 'Hey'}, your weekly check-in is due at 5 PM today. Don't let your streak break!`,
              url: '/okr/check-in',
              priority: 'high',
              category: 'okr',
              icon: 'alert-triangle',
              metadata: {
                okr_notification_type: 'deadline_warning',
                week_number: weekNumber,
                year: year
              },
              sent_at: new Date().toISOString()
            })
            .select()
            .single();

          if (notification) {
            await supabaseAdmin
              .from('user_notifications')
              .insert({
                user_id: user.id,
                notification_id: notification.id
              });
            sentCount++;
          }
        } catch (e: any) {
          console.error(`[OKR] Error sending deadline warning to ${user.email}:`, e?.message || e?.code || e?.details || JSON.stringify(e));
        }
      }

      return sentCount;
    } catch (error: any) {
      console.error('[OKR] Error sending deadline warnings:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Send overdue alerts and escalations (Monday 9 AM)
   */
  static async sendOverdueAlertsAndEscalations(supabaseAdmin: any): Promise<{
    overdueAlerts: number;
    escalations: number;
  }> {
    try {
      const now = new Date();
      // Get previous week number (since we're on Monday, check last week)
      const lastWeek = new Date(now);
      lastWeek.setDate(lastWeek.getDate() - 1);
      const weekNumber = this.getWeekNumber(lastWeek);
      const year = lastWeek.getFullYear();

      // Get all profiles with their managers
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, institution_id, department_id');

      // Get completed check-ins for last week
      const { data: completedCheckIns } = await supabaseAdmin
        .from('okr_check_ins')
        .select('user_id')
        .eq('week_number', weekNumber)
        .eq('year', year)
        .eq('is_completed', true);

      const completedUserIds = new Set(completedCheckIns?.map((c: any) => c.user_id) || []);

      // Get user statuses to check for blocked users
      const { data: userStatuses } = await supabaseAdmin
        .from('okr_user_status')
        .select('user_id, current_badge, consecutive_missed_weeks');

      const userStatusMap = new Map<string, { user_id: string; current_badge: string; consecutive_missed_weeks: number }>(
        userStatuses?.map((s: any) => [s.user_id, s]) || []
      );

      let overdueAlerts = 0;
      let escalations = 0;

      for (const user of profiles || []) {
        if (completedUserIds.has(user.id)) continue;

        const status = userStatusMap.get(user.id);
        const consecutiveMissed = (status?.consecutive_missed_weeks ?? 0) + 1;

        try {
          // Send overdue alert to user
          const { data: notification } = await supabaseAdmin
            .from('notifications')
            .insert({
              title: 'Your OKR check-in is overdue',
              body: `${user.full_name || 'Hey'}, you missed your check-in for Week ${weekNumber}. ${consecutiveMissed >= 3 ? 'You are now BLOCKED from certain features.' : 'Complete it now to avoid being blocked.'}`,
              url: '/okr/check-in',
              priority: 'urgent',
              category: 'okr',
              icon: 'x-circle',
              metadata: {
                okr_notification_type: 'overdue_alert',
                week_number: weekNumber,
                year: year,
                consecutive_missed: consecutiveMissed
              },
              sent_at: new Date().toISOString()
            })
            .select()
            .single();

          if (notification) {
            await supabaseAdmin
              .from('user_notifications')
              .insert({
                user_id: user.id,
                notification_id: notification.id
              });
            overdueAlerts++;
          }

          // Update user status
          await supabaseAdmin
            .from('okr_user_status')
            .upsert({
              user_id: user.id,
              consecutive_missed_weeks: consecutiveMissed,
              current_badge: consecutiveMissed >= 3 ? 'blocked' : consecutiveMissed >= 2 ? 'red' : 'yellow',
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id'
            });

          // Create overdue check-in record
          await supabaseAdmin
            .from('okr_check_ins')
            .upsert({
              user_id: user.id,
              week_number: weekNumber,
              year: year,
              due_date: this.getWeekEndDate(weekNumber, year),
              is_completed: false,
              is_overdue: true,
              days_overdue: 1
            }, {
              onConflict: 'user_id,week_number,year'
            });

          // Send escalation if blocked
          if (consecutiveMissed >= 3) {
            // Find HOD/Manager to escalate to
            const { data: managers } = await supabaseAdmin
              .from('staff')
              .select('profile_id, email, name')
              .eq('department_id', user.department_id)
              .eq('role', 'hod')
              .limit(1);

            if (managers && managers.length > 0) {
              const manager = managers[0];

              const { data: escNotification } = await supabaseAdmin
                .from('notifications')
                .insert({
                  title: 'Team Member OKR Non-Compliance',
                  body: `${user.full_name || user.email} has been blocked for OKR non-compliance (${consecutiveMissed} consecutive missed check-ins). Please review and take action.`,
                  url: `/okr/team?user=${user.id}`,
                  priority: 'high',
                  category: 'okr',
                  icon: 'alert-octagon',
                  metadata: {
                    okr_notification_type: 'manager_escalation',
                    blocked_user_id: user.id,
                    blocked_user_name: user.full_name,
                    consecutive_missed: consecutiveMissed
                  },
                  sent_at: new Date().toISOString()
                })
                .select()
                .single();

              if (escNotification && manager.profile_id) {
                await supabaseAdmin
                  .from('user_notifications')
                  .insert({
                    user_id: manager.profile_id,
                    notification_id: escNotification.id
                  });
                escalations++;
              }
            }
          }
        } catch (e: any) {
          console.error(`[OKR] Error processing overdue for ${user.email}:`, e?.message || e?.code || e?.details || JSON.stringify(e));
        }
      }

      return { overdueAlerts, escalations };
    } catch (error: any) {
      console.error('[OKR] Error sending overdue alerts:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  // ============================================================================
  // Event-Based Notification Methods
  // ============================================================================

  /**
   * Send milestone celebration notification
   */
  static async notifyMilestone(
    userId: string,
    milestoneType: MilestoneType,
    okrTitle: string,
    objectiveId?: string,
    keyResultId?: string
  ): Promise<void> {
    const milestonePercentages: Record<MilestoneType, string> = {
      '50_percent': '50',
      '75_percent': '75',
      '100_percent': '100',
      'exceeded': '100+'
    };

    const celebrationEmojis: Record<MilestoneType, string> = {
      '50_percent': 'Halfway there!',
      '75_percent': 'Almost there!',
      '100_percent': 'You did it!',
      'exceeded': 'Overachiever!'
    };

    await this.sendFromTemplate(
      'milestone_celebration',
      userId,
      {
        milestone: milestonePercentages[milestoneType],
        okr_title: okrTitle,
        celebration: celebrationEmojis[milestoneType]
      },
      objectiveId ? `/okr/objectives/${objectiveId}` : '/okr',
      {
        objective_id: objectiveId,
        key_result_id: keyResultId,
        milestone_type: milestoneType
      }
    );
  }

  /**
   * Send badge change notification
   */
  static async notifyBadgeChange(
    userId: string,
    oldBadge: UserBadge,
    newBadge: UserBadge,
    userName?: string
  ): Promise<void> {
    const badgeLabels: Record<UserBadge, string> = {
      green: 'Green (On Track)',
      yellow: 'Yellow (At Risk)',
      red: 'Red (Behind)',
      blocked: 'Blocked'
    };

    const actionMessages: Record<UserBadge, string> = {
      green: 'Great job staying on track!',
      yellow: 'Complete your check-in soon to get back on track.',
      red: 'You need to complete your check-in immediately!',
      blocked: 'Contact your manager to get unblocked.'
    };

    // Determine if it's an improvement or degradation
    const badgeOrder = { green: 0, yellow: 1, red: 2, blocked: 3 };
    const isImprovement = badgeOrder[newBadge] < badgeOrder[oldBadge];

    await this.sendFromTemplate(
      'badge_change',
      userId,
      {
        name: userName || 'User',
        old_badge: badgeLabels[oldBadge],
        new_badge: badgeLabels[newBadge],
        action_message: actionMessages[newBadge]
      },
      '/okr',
      {
        old_badge: oldBadge,
        new_badge: newBadge,
        is_improvement: isImprovement
      }
    );
  }

  /**
   * Send blocker resolved notification
   */
  static async notifyBlockerResolved(
    userId: string,
    okrTitle: string,
    resolvedBy: string,
    objectiveId?: string
  ): Promise<void> {
    await this.sendFromTemplate(
      'blocker_resolved',
      userId,
      {
        okr_title: okrTitle,
        resolved_by: resolvedBy
      },
      objectiveId ? `/okr/objectives/${objectiveId}` : '/okr',
      {
        objective_id: objectiveId
      }
    );
  }

  /**
   * Send dependency update notification
   */
  static async notifyDependencyUpdate(
    userId: string,
    dependencyTitle: string,
    status: string,
    objectiveId?: string
  ): Promise<void> {
    await this.sendFromTemplate(
      'dependency_update',
      userId,
      {
        dependency_title: dependencyTitle,
        status: status
      },
      objectiveId ? `/okr/objectives/${objectiveId}` : '/okr',
      {
        objective_id: objectiveId
      }
    );
  }

  /**
   * Send auto-updated KR notification
   */
  static async notifyKRAutoUpdated(
    userId: string,
    krTitle: string,
    oldValue: number,
    newValue: number,
    unit: string,
    objectiveId?: string,
    keyResultId?: string
  ): Promise<void> {
    await this.sendFromTemplate(
      'kr_auto_updated',
      userId,
      {
        kr_title: krTitle,
        old_value: `${oldValue} ${unit}`,
        new_value: `${newValue} ${unit}`
      },
      objectiveId ? `/okr/objectives/${objectiveId}` : '/okr',
      {
        objective_id: objectiveId,
        key_result_id: keyResultId,
        old_value: oldValue,
        new_value: newValue
      }
    );
  }

  // ============================================================================
  // User Notification Retrieval
  // ============================================================================

  /**
   * Get OKR notifications for current user
   */
  static async getMyOKRNotifications(limit = 10): Promise<any[]> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await (this.supabase as any)
        .from('user_notifications')
        .select(`
          id,
          read_at,
          created_at,
          notification:notifications!inner(
            id,
            title,
            body,
            url,
            icon,
            priority,
            category,
            metadata,
            sent_at
          )
        `)
        .eq('user_id', user.id)
        .eq('notification.category', 'okr')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR Notification] Error fetching notifications:', error?.message || error?.code || error?.details || JSON.stringify(error));
      return [];
    }
  }

  /**
   * Get unread OKR notification count
   */
  static async getUnreadOKRCount(): Promise<number> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) return 0;

      const { data, error } = await (this.supabase as any)
        .from('user_notifications')
        .select(`
          id,
          notification:notifications!inner(category)
        `, { count: 'exact' })
        .eq('user_id', user.id)
        .eq('notification.category', 'okr')
        .is('read_at', null);

      if (error) throw error;
      return data?.length || 0;
    } catch (error: any) {
      console.error('[OKR Notification] Error getting unread count:', error?.message || error?.code || error?.details || JSON.stringify(error));
      return 0;
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Get ISO week number
   */
  private static getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  /**
   * Get the end date (Sunday) of a given week
   */
  private static getWeekEndDate(weekNumber: number, year: number): string {
    const simple = new Date(year, 0, 1 + (weekNumber - 1) * 7);
    const dow = simple.getDay();
    const sundayDate = new Date(simple);
    if (dow <= 4) {
      sundayDate.setDate(simple.getDate() - simple.getDay() + 7);
    } else {
      sundayDate.setDate(simple.getDate() + 7 - simple.getDay() + 7);
    }
    return sundayDate.toISOString().split('T')[0];
  }
}
