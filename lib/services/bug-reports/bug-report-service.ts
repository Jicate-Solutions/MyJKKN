import { getSupabaseClient } from '@/lib/supabase/client';
import {
  BugReport,
  BugReportLeaderboardEntry,
  BugReportStatus,
  DetailedBugReport
} from '@/types/bugs';
import { dataURLtoFile } from '@/lib/utils/file-converters'; // Assuming this utility is created

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
    console.log('[BUG_REPORT_SERVICE] Creating bug report with payload:', {
      page_url: payload.page_url,
      description: payload.description?.substring(0, 100) + '...',
      has_screenshot: !!payload.screenshot_data_url,
      console_logs_count: payload.console_logs?.length || 0,
      metadata: payload.metadata
    });

    const supabase = this.getSupabase();

    try {
      // Check authentication first
      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser();

      if (authError) {
        console.error('[BUG_REPORT_SERVICE] Auth error:', authError);
        throw new Error(`Authentication failed: ${authError.message}`);
      }

      if (!user) {
        console.error('[BUG_REPORT_SERVICE] No authenticated user found');
        throw new Error('User must be authenticated to create a bug report.');
      }

      console.log('[BUG_REPORT_SERVICE] Authenticated user:', user.id);

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

      console.log(
        '[BUG_REPORT_SERVICE] Inserting initial report:',
        initialReport
      );

      const { data: newReport, error: insertError } = await supabase
        .from('bug_reports')
        .insert(initialReport)
        .select()
        .single();

      if (insertError) {
        console.error('[BUG_REPORT_SERVICE] Insert error:', insertError);
        throw new Error(`Failed to insert bug report: ${insertError.message}`);
      }

      if (!newReport) {
        console.error('[BUG_REPORT_SERVICE] No report returned from insert');
        throw new Error('Failed to create bug report - no data returned.');
      }

      console.log('[BUG_REPORT_SERVICE] Report created with ID:', newReport.id);

      // 2. If a screenshot is provided, upload it and update the report
      if (payload.screenshot_data_url) {
        console.log('[BUG_REPORT_SERVICE] Processing screenshot upload');

        try {
          const screenshotFile = dataURLtoFile(
            payload.screenshot_data_url,
            'screenshot.png'
          );
          const filePath = `${newReport.id}/screenshot.png`;

          console.log(
            '[BUG_REPORT_SERVICE] Uploading screenshot to:',
            filePath
          );

          const { error: uploadError } = await supabase.storage
            .from(BUG_REPORTS_BUCKET)
            .upload(filePath, screenshotFile, {
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            console.error(
              '[BUG_REPORT_SERVICE] Screenshot upload error:',
              uploadError
            );
            // Don't fail the whole operation, just log the error
            console.warn('[BUG_REPORT_SERVICE] Continuing without screenshot');
          } else {
            console.log(
              '[BUG_REPORT_SERVICE] Screenshot uploaded successfully'
            );

            const { data: urlData } = supabase.storage
              .from(BUG_REPORTS_BUCKET)
              .getPublicUrl(filePath);

            console.log(
              '[BUG_REPORT_SERVICE] Screenshot URL:',
              urlData.publicUrl
            );

            const { data: updatedReport, error: updateError } = await supabase
              .from('bug_reports')
              .update({ screenshot_url: urlData.publicUrl })
              .eq('id', newReport.id)
              .select()
              .single();

            if (updateError) {
              console.error('[BUG_REPORT_SERVICE] Update error:', updateError);
              // Don't fail the whole operation, return the original report
              console.warn(
                '[BUG_REPORT_SERVICE] Returning report without screenshot URL'
              );
            } else {
              console.log(
                '[BUG_REPORT_SERVICE] Report updated with screenshot URL'
              );
              return updatedReport;
            }
          }
        } catch (screenshotError) {
          console.error(
            '[BUG_REPORT_SERVICE] Screenshot processing error:',
            screenshotError
          );
          // Continue without screenshot
        }
      }

      console.log('[BUG_REPORT_SERVICE] Returning final report:', newReport.id);
      return newReport;
    } catch (error) {
      console.error('[BUG_REPORT_SERVICE] Error creating bug report:', error);
      throw error;
    }
  }

  static async getBugReportById(
    reportId: string
  ): Promise<DetailedBugReport | null> {
    const supabase = this.getSupabase(true); // Use admin client
    try {
      const { data, error } = await supabase
        .from('bug_reports')
        .select(
          `
          *,
          reporter:profiles (
            full_name,
            email
          )
        `
        )
        .eq('id', reportId)
        .single();

      if (error) throw error;

      // The select query nests the profile data under the 'reporter' alias.
      // The casting is to ensure the nested structure matches our DetailedBugReport type.
      return data as DetailedBugReport | null;
    } catch (error) {
      console.error(`Error fetching bug report by ID ${reportId}:`, error);
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
      console.error('Error fetching user bug reports:', error);
      throw error;
    }
  }

  // Admin methods would require an admin client
  static async getBugReports(filters: {
    status?: BugReportStatus;
    page?: number;
    limit?: number;
  }): Promise<{ data: BugReport[]; count: number }> {
    const supabase = this.getSupabase(true); // Use admin client
    try {
      let query = supabase.from('bug_reports').select('*', { count: 'exact' });

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      const page = filters.page || 1;
      const limit = filters.limit || 10;
      query = query.range((page - 1) * limit, page * limit - 1);

      query = query.order('created_at', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;

      return { data: data || [], count: count || 0 };
    } catch (error) {
      console.error('Error fetching bug reports:', error);
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
      console.error('Error updating bug report status:', error);
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
      console.error('Error fetching leaderboard:', error);
      throw error;
    }
  }
}
