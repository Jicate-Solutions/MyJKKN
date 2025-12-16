import { getSupabaseClient } from '@/lib/supabase/client';
import {
  BugReport,
  BugReportLeaderboardEntry,
  BugReportStatus,
  DetailedBugReport,
  BugReportMessage,
  BugReportParticipant,
  BugReportFilters
} from '@/types/bugs';
import { dataURLtoFile } from '@/lib/utils/file-converters'; // Assuming this utility is created
import { logger } from '@/lib/utils/enhanced-logger';

const BUG_REPORTS_BUCKET = 'bug-reports';

export interface CreateBugReportPayload {
  page_url: string;
  description: string;
  screenshot_data_url?: string;
  console_logs?: any[];
  metadata?: object;
}

export class BugReportService {
  private static getSupabase(admin = false) {
    return getSupabaseClient({ admin });
  }

  static async createBugReport(
    payload: CreateBugReportPayload
  ): Promise<BugReport> {
    const supabase = this.getSupabase();

    try {
      // Check authentication first
      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser();

      if (authError) {
        logger.error('bug-reports', 'Auth error', authError);
        throw new Error(`Authentication failed: ${authError.message}`);
      }

      if (!user) {
        logger.error('bug-reports', 'No authenticated user found');
        throw new Error('User must be authenticated to create a bug report.');
      }

      // 1. Insert initial report data to get an ID
      const initialReport: Omit<
        BugReport,
        'id' | 'display_id' | 'created_at' | 'status'
      > = {
        reporter_user_id: user.id,
        page_url: payload.page_url,
        description: payload.description,
        console_logs: payload.console_logs,
        metadata: payload.metadata
      };

      const { data: newReport, error: insertError } = await supabase
        .from('bug_reports')
        .insert(initialReport)
        .select()
        .single();

      if (insertError) {
        logger.error('bug-reports', 'Insert error', insertError);
        throw new Error(`Failed to insert bug report: ${insertError.message}`);
      }

      if (!newReport) {
        logger.error('bug-reports', 'No report returned from insert');
        throw new Error('Failed to create bug report - no data returned.');
      }

      // 2. If a screenshot is provided, upload it and update the report
      if (payload.screenshot_data_url) {
        try {
          const screenshotFile = dataURLtoFile(
            payload.screenshot_data_url,
            'screenshot.png'
          );
          const filePath = `${newReport.id}/screenshot.png`;

          const { error: uploadError } = await supabase.storage
            .from(BUG_REPORTS_BUCKET)
            .upload(filePath, screenshotFile, {
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            logger.error('bug-reports', 'Screenshot upload error', uploadError);
            // Don't fail the whole operation, just log the error
            logger.warn('bug-reports', 'Continuing without screenshot');
          } else {
            const { data: urlData } = supabase.storage
              .from(BUG_REPORTS_BUCKET)
              .getPublicUrl(filePath);

            const { data: updatedReport, error: updateError } = await supabase
              .from('bug_reports')
              .update({ screenshot_url: urlData.publicUrl })
              .eq('id', newReport.id)
              .select()
              .single();

            if (updateError) {
              logger.error('bug-reports', 'Update error', updateError);
              // Don't fail the whole operation, return the original report
              logger.warn('bug-reports', 'Returning report without screenshot URL');
            } else {
              return updatedReport;
            }
          }
        } catch (screenshotError) {
          logger.error('bug-reports', 'Screenshot processing error', screenshotError);
          // Continue without screenshot
        }
      }

      return newReport;
    } catch (error) {
      logger.error('bug-reports', 'Error creating bug report', error);
      throw error;
    }
  }

  static async getBugReportById(
    reportId: string
  ): Promise<DetailedBugReport | null> {
    const supabase = this.getSupabase(true); // Use admin client
    try {
      const { data, error } = await supabase
        .from('bug_reports_with_details')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) throw error;

      if (data) {
        // Transform the data to match DetailedBugReport interface
        const transformedData: DetailedBugReport = {
          ...data,
          reporter: data.reporter_name
            ? {
                id: data.reporter_user_id,
                full_name: data.reporter_name,
                email: data.reporter_email
              }
            : null
        };
        return transformedData;
      }

      return null;
    } catch (error) {
      logger.error('bug-reports', `Error fetching bug report by ID ${reportId}`, error);
      throw error;
    }
  }

  static async getMyBugReports(): Promise<BugReport[]> {
    const supabase = this.getSupabase();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('bug_reports')
        .select('*')
        .eq('reporter_user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('bug-reports', 'Error fetching user bug reports', error);
      throw error;
    }
  }

  // Admin methods would require an admin client
  static async getBugReports(
    filters: BugReportFilters
  ): Promise<{ data: BugReport[]; count: number }> {
    const supabase = this.getSupabase(true); // Use admin client
    try {
      let query = supabase
        .from('bug_reports_with_details')
        .select('*', { count: 'exact' });

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      const page = filters.page || 1;
      const limit = filters.limit || 10;
      query = query.range((page - 1) * limit, page * limit - 1);

      query = query.order('created_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;

      return { data: data || [], count: count || 0 };
    } catch (error) {
      logger.error('bug-reports', 'Error fetching bug reports', error);
      throw error;
    }
  }

  static async updateBugReportStatus(
    reportId: string,
    status: BugReportStatus
  ): Promise<BugReport> {
    const supabase = this.getSupabase(true); // Use admin client
    try {
      const updateData: Partial<BugReport> = { status };
      if (status === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('bug_reports')
        .update(updateData)
        .eq('id', reportId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('bug-reports', 'Error updating bug report status', error);
      throw error;
    }
  }

  static async getLeaderboard(): Promise<BugReportLeaderboardEntry[]> {
    const supabase = this.getSupabase();
    try {
      const { data, error } = await supabase
        .from('bug_reporters_leaderboard')
        .select('*')
        .limit(100);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('bug-reports', 'Error fetching leaderboard', error);
      throw error;
    }
  }

  // Chat functionality
  static async getBugReportMessages(
    reportId: string
  ): Promise<BugReportMessage[]> {
    const supabase = this.getSupabase(true);
    try {
      const { data, error } = await supabase
        .from('bug_report_messages')
        .select(
          `
          *,
          sender:profiles!sender_user_id (
            id,
            full_name,
            email,
            role
          )
        `
        )
        .eq('bug_report_id', reportId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('bug-reports', 'Error fetching bug report messages', error);
      throw error;
    }
  }

  static async sendBugReportMessage(payload: {
    bug_report_id: string;
    message_text: string;
    is_internal?: boolean;
    reply_to_message_id?: string;
  }): Promise<BugReportMessage> {
    const supabase = this.getSupabase();
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('User must be authenticated to send a message.');
      }

      const { data, error } = await supabase
        .from('bug_report_messages')
        .insert({
          ...payload,
          sender_user_id: user.id
        })
        .select(
          `
          *,
          sender:profiles!sender_user_id (
            id,
            full_name,
            email,
            role
          )
        `
        )
        .single();

      if (error) throw error;

      // Add user as participant if not already
      await this.addBugReportParticipant(payload.bug_report_id, user.id);

      // Send notification to other participants
      try {
        await fetch(`/api/bug-reports/${payload.bug_report_id}/messages/notifications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messageId: data.id,
            senderId: user.id
          })
        });
      } catch (notificationError) {
        logger.error('bug-reports', 'Failed to send notification', notificationError);
        // Don't fail the message sending if notification fails
      }

      return data;
    } catch (error) {
      logger.error('bug-reports', 'Error sending bug report message', error);
      throw error;
    }
  }

  static async getBugReportParticipants(
    reportId: string
  ): Promise<BugReportParticipant[]> {
    const supabase = this.getSupabase(true);
    try {
      const { data, error } = await supabase
        .from('bug_report_participants')
        .select(
          `
          *,
          user:profiles!user_id (
            id,
            full_name,
            email,
            role
          )
        `
        )
        .eq('bug_report_id', reportId)
        .eq('is_active', true);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('bug-reports', 'Error fetching bug report participants', error);
      throw error;
    }
  }

  static async addBugReportParticipant(
    reportId: string,
    userId: string,
    role?: string
  ): Promise<void> {
    const supabase = this.getSupabase(true);
    try {
      // Check if participant already exists
      const { data: existing } = await supabase
        .from('bug_report_participants')
        .select('id')
        .eq('bug_report_id', reportId)
        .eq('user_id', userId)
        .single();

      if (!existing) {
        const { error } = await supabase
          .from('bug_report_participants')
          .insert({
            bug_report_id: reportId,
            user_id: userId,
            role: role || 'participant',
            can_view_internal: false,
            is_active: true,
            joined_at: new Date().toISOString()
          });

        if (error) throw error;
      }
    } catch (error) {
      logger.error('bug-reports', 'Error adding bug report participant', error);
      // Don't throw error as this is not critical
    }
  }

  static async getInstitutions(): Promise<{ id: string; name: string }[]> {
    const supabase = this.getSupabase();
    try {
      const { data, error } = await supabase
        .from('institutions')
        .select('id, name')
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('bug-reports', 'Error fetching institutions', error);
      throw error;
    }
  }

  static async getDepartments(
    institutionId?: string
  ): Promise<{ id: string; name: string }[]> {
    const supabase = this.getSupabase();
    try {
      let query = supabase
        .from('departments')
        .select('id, department_name')
        .order('department_name');

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data.map((d) => ({ id: d.id, name: d.department_name })) || [];
    } catch (error) {
      logger.error('bug-reports', 'Error fetching departments', error);
      throw error;
    }
  }

  // Message read confirmation methods
  static async markMessagesAsRead(
    reportId: string,
    messageIds?: string[],
    markAllAsRead?: boolean
  ): Promise<{ success: boolean; markedCount: number }> {
    try {
      const response = await fetch(`/api/bug-reports/${reportId}/messages/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageIds,
          markAllAsRead
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Failed to mark messages as read`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return {
        success: data.success,
        markedCount: data.markedCount || 0
      };
    } catch (error) {
      logger.error('bug-reports', 'Error marking messages as read', error);
      throw error;
    }
  }

  static async getMessageReadStatus(
    reportId: string,
    messageId?: string
  ): Promise<any> {
    try {
      const url = messageId
        ? `/api/bug-reports/${reportId}/messages/read?messageId=${messageId}`
        : `/api/bug-reports/${reportId}/messages/read`;

      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `HTTP ${response.status}`;

        if (response.status === 403) {
          logger.warn('bug-reports', 'Access denied to bug report read status', { errorMessage });
          // Return default values instead of throwing
          return messageId ? [] : { unreadCount: 0 };
        }

        throw new Error(`Failed to get read status: ${errorMessage}`);
      }

      const data = await response.json();
      return messageId ? data.readBy : { unreadCount: data.unreadCount };
    } catch (error) {
      logger.error('bug-reports', 'Error getting message read status', error);

      // If it's a network error or 403, return safe defaults
      if (error instanceof Error && (
        error.message.includes('403') ||
        error.message.includes('Failed to fetch')
      )) {
        return messageId ? [] : { unreadCount: 0 };
      }

      throw error;
    }
  }

  static async getUnreadMessageCount(reportId: string): Promise<number> {
    try {
      const result = await this.getMessageReadStatus(reportId);
      return result.unreadCount || 0;
    } catch (error) {
      logger.error('bug-reports', 'Error getting unread count', error);
      // If it's a 403 error (access denied), return 0 instead of throwing
      if (error instanceof Error && error.message.includes('403')) {
        return 0;
      }
      // For other errors, still return 0 but log more details
      return 0;
    }
  }
}
