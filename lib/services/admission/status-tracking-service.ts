// lib/services/admission/status-tracking-service.ts
// Service for admission application status tracking page

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export interface ApplicationStatusEntry {
  id: string;
  institution_id: string;
  lead_id: string;
  application_number: string;
  status: string;
  form_data: Record<string, any>;
  current_step: number | null;
  total_steps: number | null;
  completion_percentage: number | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined lead data
  lead_name?: string;
  lead_email?: string;
  lead_phone?: string;
  lead_program?: string;
}

export interface StatusPipelineStats {
  total: number;
  draft: number;
  submitted: number;
  under_review: number;
  approved: number;
  rejected: number;
  enrolled: number;
}

export interface StatusFilters {
  institutionId: string;
  status?: string;
  search?: string;
  programId?: string;
  page?: number;
  limit?: number;
}

// ============================================================================
// SERVICE
// ============================================================================

export class StatusTrackingService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get applications with lead info for status tracking
   */
  static async getApplications(
    filters: StatusFilters
  ): Promise<{ applications: ApplicationStatusEntry[]; total: number }> {
    let query = (this.supabase as any)
      .from('admission_applications')
      .select(
        `
        id, institution_id, lead_id, application_number, status,
        form_data, current_step, total_steps, completion_percentage,
        submitted_at, reviewed_at, review_notes, created_at, updated_at,
        lead:admission_leads!lead_id(full_name, email, phone, interested_programs)
      `,
        { count: 'exact' }
      )
      .eq('institution_id', filters.institutionId)
      .order('updated_at', { ascending: false });

    if (filters.status && filters.status !== 'all' && filters.status !== '_all') {
      query = query.eq('status', filters.status);
    }

    if (filters.search) {
      const s = filters.search.replace(/[%_\\]/g, '\\$&');
      query = query.ilike('application_number', `%${s}%`);
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error('[admission/status-tracking] Error fetching applications:', error);
      throw new Error('Failed to fetch applications');
    }

    const applications: ApplicationStatusEntry[] = (data || []).map(
      (app: any) => ({
        ...app,
        lead_name: app.lead?.full_name || app.form_data?.full_name || 'Unknown',
        lead_email: app.lead?.email || app.form_data?.email || '',
        lead_phone: app.lead?.phone || app.form_data?.phone || '',
        lead_program:
          app.lead?.interested_programs?.join(', ') ||
          app.form_data?.program ||
          '',
        lead: undefined, // Remove nested object
      })
    );

    return {
      applications,
      total: count || 0,
    };
  }

  /**
   * Get pipeline stats (counts by status)
   */
  static async getPipelineStats(
    institutionId: string
  ): Promise<StatusPipelineStats> {
    const { data, error } = await (this.supabase as any)
      .from('admission_applications')
      .select('status')
      .eq('institution_id', institutionId);

    if (error) {
      console.error('[admission/status-tracking] Error fetching pipeline stats:', error);
      return {
        total: 0,
        draft: 0,
        submitted: 0,
        under_review: 0,
        approved: 0,
        rejected: 0,
        enrolled: 0,
      };
    }

    const apps = data || [];
    const counts: Record<string, number> = {};
    for (const app of apps) {
      counts[app.status] = (counts[app.status] || 0) + 1;
    }

    return {
      total: apps.length,
      draft: counts['draft'] || 0,
      submitted: counts['submitted'] || 0,
      under_review: counts['under_review'] || 0,
      approved: counts['approved'] || 0,
      rejected: counts['rejected'] || 0,
      enrolled: counts['enrolled'] || 0,
    };
  }

  /**
   * Get recent activity log from campaign logs
   */
  static async getRecentActivity(
    institutionId: string,
    limit: number = 20
  ): Promise<
    Array<{
      id: string;
      action: string;
      lead_id: string;
      step_type: string;
      created_at: string;
    }>
  > {
    const { data, error } = await (this.supabase as any)
      .from('admission_campaign_logs')
      .select('id, action, lead_id, step_type, created_at')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[admission/status-tracking] Error fetching activity:', error);
      return [];
    }

    return data || [];
  }
}
