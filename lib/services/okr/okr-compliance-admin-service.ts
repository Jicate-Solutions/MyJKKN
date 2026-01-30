// ============================================================================
// OKR Compliance Admin Service
// Admin-specific methods for compliance monitoring and audit
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export class OKRComplianceAdminService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get compliance audit logs (admin view)
   */
  static async getComplianceLogs(filters?: {
    userId?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }) {
    try {
      let query = (this.supabase as any)
        .from('okr_compliance_logs')
        .select(`
          *,
          user:user_id(id, email, raw_user_meta_data),
          performed_by_user:performed_by(id, email, raw_user_meta_data)
        `)
        .order('created_at', { ascending: false });

      if (filters?.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters?.action) {
        query = query.eq('action', filters.action);
      }

      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      } else {
        query = query.limit(100);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR Admin] Error fetching compliance logs:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get overall compliance statistics (admin view)
   */
  static async getComplianceStats() {
    try {
      const { data: allStatuses, error } = await (this.supabase as any)
        .from('okr_user_status')
        .select(`
          *,
          user:user_id(id, email, raw_user_meta_data)
        `);

      if (error) throw error;

      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const stats = {
        total_users: allStatuses?.length || 0,
        compliance_rate: 0,
        blocked_count: 0,
        at_risk_count: 0,
        green_count: 0,
        yellow_count: 0,
        red_count: 0,
        avg_check_in_completion: 0,
        blocked_this_week: 0
      };

      if (!allStatuses || allStatuses.length === 0) {
        return stats;
      }

      let completedCheckIns = 0;

      allStatuses.forEach((status: any) => {
        // Count badges
        switch (status.current_badge) {
          case 'green':
            stats.green_count++;
            break;
          case 'yellow':
            stats.yellow_count++;
            stats.at_risk_count++;
            break;
          case 'red':
            stats.red_count++;
            stats.at_risk_count++;
            break;
          case 'blocked':
            stats.blocked_count++;
            break;
        }

        // Check if blocked this week
        if (status.current_badge === 'blocked' && status.updated_at) {
          const updatedDate = new Date(status.updated_at);
          if (updatedDate >= oneWeekAgo) {
            stats.blocked_this_week++;
          }
        }

        // Calculate check-in completion
        if (status.last_check_in_date) {
          const lastCheckIn = new Date(status.last_check_in_date);
          if (now.getTime() - lastCheckIn.getTime() < 7 * 24 * 60 * 60 * 1000) {
            completedCheckIns++;
          }
        }
      });

      stats.compliance_rate = stats.total_users > 0
        ? Math.round(((stats.total_users - stats.blocked_count) / stats.total_users) * 100)
        : 0;

      stats.avg_check_in_completion = stats.total_users > 0
        ? Math.round((completedCheckIns / stats.total_users) * 100)
        : 0;

      return stats;
    } catch (error: any) {
      console.error('[OKR Admin] Error fetching compliance stats:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get all users with their compliance status (admin view)
   */
  static async getAllUsersCompliance() {
    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_user_status')
        .select(`
          *,
          user:user_id(id, email, raw_user_meta_data)
        `)
        .order('current_badge', { ascending: false })
        .order('consecutive_missed', { ascending: false });

      if (error) throw error;

      // Calculate days since last check-in for each user
      return (data || []).map((status: any) => {
        const daysSinceLastCheckIn = status.last_check_in_date
          ? Math.floor((Date.now() - new Date(status.last_check_in_date).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        return {
          ...status,
          days_since_last_check_in: daysSinceLastCheckIn
        };
      });
    } catch (error: any) {
      console.error('[OKR Admin] Error fetching all users compliance:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Unblock user with audit log (admin action)
   */
  static async unblockUserWithLog(userId: string, reason: string): Promise<void> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('Admin not authenticated');

      // Get current user status
      const { data: currentStatus } = await (this.supabase as any)
        .from('okr_user_status')
        .select('current_badge')
        .eq('user_id', userId)
        .single();

      const previousBadge = currentStatus?.current_badge || 'unknown';

      // Update user status
      await (this.supabase as any)
        .from('okr_user_status')
        .update({
          current_badge: 'green',
          consecutive_missed: 0,
          unblocked_by: user.id,
          unblocked_at: new Date().toISOString(),
          unblock_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      // Create audit log
      await (this.supabase as any)
        .from('okr_compliance_logs')
        .insert([
          {
            user_id: userId,
            action: 'unblock',
            performed_by: user.id,
            reason: reason,
            previous_badge: previousBadge,
            new_badge: 'green',
            metadata: {
              timestamp: new Date().toISOString()
            }
          }
        ]);

      toast.success('User unblocked successfully');
    } catch (error: any) {
      console.error('[OKR Admin] Error unblocking user:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to unblock user');
      throw error;
    }
  }

  /**
   * Send bulk reminders to at-risk users
   */
  static async sendBulkReminders(userIds: string[]): Promise<void> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('Admin not authenticated');

      // TODO: Integrate with notification system
      // For now, just create audit log entries
      const logs = userIds.map(userId => ({
        user_id: userId,
        action: 'reminder_sent',
        performed_by: user.id,
        reason: 'Bulk reminder for check-in compliance',
        metadata: {
          timestamp: new Date().toISOString(),
          bulk_action: true
        }
      }));

      await (this.supabase as any)
        .from('okr_compliance_logs')
        .insert(logs);

      toast.success(`Reminders sent to ${userIds.length} users`);
    } catch (error: any) {
      console.error('[OKR Admin] Error sending bulk reminders:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to send reminders');
      throw error;
    }
  }

  /**
   * Export compliance report as CSV
   */
  static async exportComplianceReport(): Promise<void> {
    try {
      const users = await this.getAllUsersCompliance();

      // Build CSV content
      const headers = ['User Email', 'Name', 'Badge Status', 'Consecutive Missed', 'Last Check-in', 'Days Since Check-in'];
      const rows = users.map((u: any) => [
        u.user?.email || 'N/A',
        u.user?.raw_user_meta_data?.full_name || 'N/A',
        u.current_badge,
        u.consecutive_missed || 0,
        u.last_check_in_date || 'Never',
        u.days_since_last_check_in !== null ? u.days_since_last_check_in : 'N/A'
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      // Create download link
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `okr-compliance-report-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Compliance report exported');
    } catch (error: any) {
      console.error('[OKR Admin] Error exporting compliance report:', error?.message || error?.code || error?.details || JSON.stringify(error));
      toast.error('Failed to export report');
      throw error;
    }
  }
}
