// ============================================================================
// OKR Compliance Service
// Handles blocking mechanism, escalation, and compliance tracking
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  OKRCompliance,
  OKRUserStatus,
  UserBadge,
  OKRObjective
} from '@/types/okr';
import {
  BadgeCalculator,
  BadgeCalculationResult,
  getCurrentWeek,
  isCheckInOverdue,
  getDaysUntilDeadline
} from './okr-badge-calculator';
import { sendNotification } from '@/lib/services/notification/notification-service';
import {
  NotificationType,
  NotificationCategory,
  NotificationPriority,
  NotificationChannel
} from '@/types/notification';

export class OKRComplianceService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get current user's compliance status
   */
  static async getMyComplianceStatus(): Promise<OKRUserStatus | null> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await (this.supabase as any)
        .from('okr_user_status')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error: any) {
      console.error('[OKR] Error fetching compliance status:', error?.message || error?.code || 'Unknown error');
      throw error;
    }
  }

  /**
   * Check if current user is blocked
   */
  static async isUserBlocked(): Promise<boolean> {
    try {
      const status = await this.getMyComplianceStatus();
      return status?.current_badge === 'blocked';
    } catch (error: any) {
      console.error('[OKR] Error checking blocked status:', error?.message || error?.code || error?.details || JSON.stringify(error));
      return false;
    }
  }

  /**
   * Get user's current badge
   */
  static async getUserBadge(): Promise<UserBadge> {
    try {
      const status = await this.getMyComplianceStatus();
      return status?.current_badge || 'green';
    } catch (error: any) {
      console.error('[OKR] Error fetching badge:', error?.message || error?.code || 'Unknown error');
      return 'green';
    }
  }

  /**
   * Get compliance record for a specific week
   */
  static async getWeeklyCompliance(
    userId: string,
    weekNumber: number,
    year: number
  ): Promise<OKRCompliance | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_compliance')
        .select('*')
        .eq('user_id', userId)
        .eq('week_number', weekNumber)
        .eq('year', year)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error: any) {
      console.error('[OKR] Error fetching weekly compliance:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get all blocked users for an institution
   */
  static async getBlockedUsers(institutionId: string): Promise<OKRUserStatus[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_user_status')
        .select(`
          *,
          user:auth.users!user_id(id, email, raw_user_meta_data)
        `)
        .eq('current_badge', 'blocked');

      if (error) throw error;

      // Filter by institution if needed (via user's institution_id)
      // This would require a join with staff or user profile table
      return data || [];
    } catch (error: any) {
      console.error('[OKR] Error fetching blocked users:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get users at risk (yellow badge)
   */
  static async getAtRiskUsers(institutionId: string): Promise<OKRUserStatus[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_user_status')
        .select(`
          *,
          user:auth.users!user_id(id, email, raw_user_meta_data)
        `)
        .in('current_badge', ['yellow', 'red']);

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR] Error fetching at-risk users:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Unblock a user (admin action)
   */
  static async unblockUser(userId: string, reason?: string): Promise<void> {
    try {
      // Get current week
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const diff = now.getTime() - start.getTime();
      const oneWeek = 604800000;
      const weekNumber = Math.ceil((diff + start.getDay() * 86400000) / oneWeek);
      const year = now.getFullYear();

      // Update user status
      await (this.supabase as any)
        .from('okr_user_status')
        .update({
          current_badge: 'yellow',
          consecutive_missed_weeks: 0,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      // Update compliance record
      await (this.supabase as any)
        .from('okr_compliance')
        .update({
          is_blocked: false,
          unblocked_at: new Date().toISOString(),
          grace_period_end: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
          ).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('week_number', weekNumber)
        .eq('year', year);

      toast.success('User unblocked successfully');
    } catch (error: any) {
      console.error('[OKR] Error unblocking user:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to unblock user');
      throw error;
    }
  }

  /**
   * Send escalation notification
   */
  static async sendEscalation(
    userId: string,
    escalateTo: string,
    message: string
  ): Promise<void> {
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const diff = now.getTime() - start.getTime();
      const oneWeek = 604800000;
      const weekNumber = Math.ceil((diff + start.getDay() * 86400000) / oneWeek);
      const year = now.getFullYear();

      await (this.supabase as any)
        .from('okr_compliance')
        .update({
          escalation_sent: true,
          escalation_date: new Date().toISOString(),
          escalation_to: escalateTo,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('week_number', weekNumber)
        .eq('year', year);

      // Send notification to the escalation target (non-blocking)
      try {
        await sendNotification({
          user_ids: [escalateTo],
          type: NotificationType.WARNING,
          category: NotificationCategory.SYSTEM,
          priority: NotificationPriority.HIGH,
          title: 'OKR Non-Compliance Escalation',
          message,
          metadata: { custom_data: { user_id: userId, action: 'okr_escalation' } },
          action_url: '/okr/compliance',
          action_label: 'View Compliance',
          channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL]
        });
      } catch (notifError: any) {
        // Notification failure should not break the escalation flow
        console.error('[OKR] Failed to send escalation notification:', notifError?.message || 'Unknown error');
      }

      toast.success('Escalation sent');
    } catch (error: any) {
      console.error('[OKR] Error sending escalation:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to send escalation');
      throw error;
    }
  }

  /**
   * Get compliance history for a user
   */
  static async getComplianceHistory(
    userId: string,
    limit = 12
  ): Promise<OKRCompliance[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_compliance')
        .select('*')
        .eq('user_id', userId)
        .order('year', { ascending: false })
        .order('week_number', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR] Error fetching compliance history:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get team compliance summary
   */
  static async getTeamComplianceSummary(managerId: string): Promise<{
    total: number;
    compliant: number;
    atRisk: number;
    blocked: number;
    pending: number;
  }> {
    try {
      // Get team members (users reporting to this manager)
      // This would typically come from a staff/org structure table
      const { data: teamStatuses, error } = await (this.supabase as any)
        .from('okr_user_status')
        .select('current_badge');

      if (error) throw error;

      const summary = {
        total: teamStatuses?.length || 0,
        compliant: 0,
        atRisk: 0,
        blocked: 0,
        pending: 0
      };

      teamStatuses?.forEach((status: OKRUserStatus) => {
        switch (status.current_badge) {
          case 'green':
            summary.compliant++;
            break;
          case 'yellow':
          case 'red':
            summary.atRisk++;
            break;
          case 'blocked':
            summary.blocked++;
            break;
        }
      });

      return summary;
    } catch (error: any) {
      console.error('[OKR] Error fetching team compliance:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Initialize or ensure user status record exists
   */
  static async ensureUserStatus(userId: string): Promise<OKRUserStatus> {
    try {
      const { data: existing } = await (this.supabase as any)
        .from('okr_user_status')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (existing) return existing;

      const { data, error } = await (this.supabase as any)
        .from('okr_user_status')
        .insert([
          {
            user_id: userId,
            current_badge: 'green',
            consecutive_on_track_weeks: 0,
            consecutive_missed_weeks: 0,
            total_objectives: 0,
            on_track_count: 0,
            at_risk_count: 0,
            behind_count: 0,
            blocked_count: 0
          }
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('[OKR] Error ensuring user status:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Calculate and update badge based on compliance and progress
   * Uses smart badge calculation considering time vs progress
   */
  static async recalculateBadge(userId: string): Promise<UserBadge> {
    try {
      // Get user's current status
      const userStatus = await this.getMyComplianceStatus();

      // Get user's active objectives with key results
      const { data: objectives, error: objError } = await (this.supabase as any)
        .from('okr_objectives')
        .select(`
          *,
          key_results:okr_key_results(*)
        `)
        .eq('owner_id', userId)
        .eq('status', 'active');

      if (objError) throw objError;

      // Get compliance history to count consecutive misses
      const history = await this.getComplianceHistory(userId, 4);
      let consecutiveMissed = 0;
      for (const record of history) {
        if (!record.check_in_completed) {
          consecutiveMissed++;
        } else {
          break;
        }
      }

      // Calculate badge using smart calculator
      const result = BadgeCalculator.calculate({
        lastCheckInDate: userStatus?.last_check_in_date
          ? new Date(userStatus.last_check_in_date)
          : null,
        objectives: objectives || [],
        consecutiveMissedWeeks: consecutiveMissed
      });

      // Update user status with new badge
      await (this.supabase as any)
        .from('okr_user_status')
        .update({
          current_badge: result.badge,
          consecutive_missed_weeks: consecutiveMissed,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      // Log badge change for audit
      if (userStatus && userStatus.current_badge !== result.badge) {
        await this.logBadgeChange(
          userId,
          userStatus.current_badge,
          result.badge,
          result.reason
        );
      }

      return result.badge;
    } catch (error: any) {
      console.error('[OKR] Error recalculating badge:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get detailed badge calculation for display
   */
  static async getBadgeCalculation(userId?: string): Promise<BadgeCalculationResult> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      const targetUserId = userId || user?.id;
      if (!targetUserId) throw new Error('User not authenticated');

      // Get user status
      const { data: userStatus } = await (this.supabase as any)
        .from('okr_user_status')
        .select('*')
        .eq('user_id', targetUserId)
        .single();

      // Get objectives
      const { data: objectives } = await (this.supabase as any)
        .from('okr_objectives')
        .select(`
          *,
          key_results:okr_key_results(*)
        `)
        .eq('owner_id', targetUserId)
        .eq('status', 'active');

      // Get consecutive missed weeks
      const history = await this.getComplianceHistory(targetUserId, 4);
      let consecutiveMissed = 0;
      for (const record of history) {
        if (!record.check_in_completed) {
          consecutiveMissed++;
        } else {
          break;
        }
      }

      return BadgeCalculator.calculate({
        lastCheckInDate: userStatus?.last_check_in_date
          ? new Date(userStatus.last_check_in_date)
          : null,
        objectives: objectives || [],
        consecutiveMissedWeeks: consecutiveMissed
      });
    } catch (error: any) {
      console.error('[OKR] Error getting badge calculation:', error?.message || error?.code || error?.details || JSON.stringify(error));
      // Return default on error
      return {
        badge: 'green',
        reason: 'Unable to calculate badge',
        details: {
          timeProgress: 0,
          actualProgress: 0,
          delta: 0,
          isCheckInOverdue: false,
          daysUntilDeadline: null
        }
      };
    }
  }

  /**
   * Log badge change for audit trail
   */
  private static async logBadgeChange(
    userId: string,
    previousBadge: UserBadge,
    newBadge: UserBadge,
    reason: string
  ): Promise<void> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      await (this.supabase as any)
        .from('okr_compliance_logs')
        .insert([{
          user_id: userId,
          action: 'badge_change',
          performed_by: user?.id || userId,
          reason,
          previous_badge: previousBadge,
          new_badge: newBadge,
          metadata: {
            timestamp: new Date().toISOString(),
            auto_calculated: true
          }
        }]);
    } catch (error: any) {
      // Don't throw - logging failure shouldn't break badge update
      console.error('[OKR] Error logging badge change:', error?.message || error?.code || error?.details || JSON.stringify(error));
    }
  }

  /**
   * Get current week information
   */
  static getCurrentWeek() {
    return getCurrentWeek();
  }

  /**
   * Check if user's check-in is overdue
   */
  static isCheckInOverdue(lastCheckIn: Date | null): boolean {
    return isCheckInOverdue(lastCheckIn);
  }

  /**
   * Get days until next check-in deadline
   */
  static getDaysUntilDeadline(): number {
    return getDaysUntilDeadline();
  }

  /**
   * Get badge display information
   */
  static getBadgeDisplayInfo(badge: UserBadge) {
    return BadgeCalculator.getDisplayInfo(badge);
  }
}
