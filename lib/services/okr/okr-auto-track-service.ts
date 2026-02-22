// ============================================================================
// OKR Auto-Track Service
// Handles automatic KR value sync from existing MyJKKN modules
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { OKRAutoTrackSource, OKRAvailableKPI } from '@/types/okr';

export class OKRAutoTrackService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get available auto-track sources
   */
  static async getAvailableSources(): Promise<OKRAutoTrackSource[]> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('okr_auto_track_sources')
        .select('*')
        .eq('is_active', true)
        .order('source_module', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR] Error fetching auto-track sources:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Get available KPIs for linking to Key Results
   */
  static async getAvailableKPIs(): Promise<OKRAvailableKPI[]> {
    try {
      const sources = await this.getAvailableSources();
      return sources.map((source) => ({
        source_module: source.source_module,
        metric_name: source.metric_name,
        metric_key: source.metric_key,
        description: source.description,
        default_unit: source.default_unit
      }));
    } catch (error: any) {
      console.error('[OKR] Error fetching available KPIs:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Sync a single auto-tracked Key Result
   */
  static async syncKeyResult(keyResultId: string): Promise<number | null> {
    try {
      // Get the key result with its auto-track config
      const { data: kr, error: krError } = await (this.supabase as any)
        .from('okr_key_results')
        .select('*')
        .eq('id', keyResultId)
        .eq('data_source', 'auto')
        .single();

      if (krError) throw krError;
      if (!kr || !kr.auto_source_module || !kr.auto_source_query) {
        return null;
      }

      // Execute the auto-track query
      const newValue = await this.executeAutoTrackQuery(
        kr.auto_source_module,
        kr.auto_source_query,
        kr.auto_source_config
      );

      if (newValue === null) return null;

      // Update the KR with new value
      await (this.supabase as any)
        .from('okr_key_results')
        .update({
          current_value: newValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', keyResultId);

      return newValue;
    } catch (error: any) {
      console.error('[OKR] Error syncing key result:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Sync all auto-tracked Key Results for active objectives
   */
  static async syncAllAutoTracked(): Promise<{
    synced: number;
    failed: number;
    errors: string[];
  }> {
    const result = {
      synced: 0,
      failed: 0,
      errors: [] as string[]
    };

    try {
      // Get all auto-tracked KRs for active objectives
      const { data: keyResults, error } = await (this.supabase as any)
        .from('okr_key_results')
        .select(`
          *,
          objective:okr_objectives!inner(id, status)
        `)
        .eq('data_source', 'auto')
        .eq('objective.status', 'active');

      if (error) throw error;
      if (!keyResults || keyResults.length === 0) return result;

      // Process each KR
      for (const kr of keyResults) {
        try {
          const newValue = await this.syncKeyResult(kr.id);
          if (newValue !== null) {
            result.synced++;
          }
        } catch (err) {
          result.failed++;
          result.errors.push(`KR ${kr.id}: ${(err as Error).message}`);
        }
      }

      return result;
    } catch (error: any) {
      console.error('[OKR] Error in sync all:', error?.message || error?.code || error?.details || JSON.stringify(error));
      throw error;
    }
  }

  /**
   * Execute an auto-track query against MyJKKN data
   */
  private static async executeAutoTrackQuery(
    sourceModule: string,
    queryKey: string,
    config?: Record<string, unknown>
  ): Promise<number | null> {
    try {
      // Map of query handlers by module
      const handlers: Record<string, () => Promise<number | null>> = {
        // Learners module
        'learners.total_active': async () => {
          const { count } = await (this.supabase as any)
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);
          return count || 0;
        },

        'learners.attendance_rate': async () => {
          const { data } = await (this.supabase as any)
            .from('daily_attendance')
            .select('is_present')
            .gte('date', this.getDateRangeStart(config))
            .lte('date', this.getDateRangeEnd(config));

          if (!data || data.length === 0) return 0;
          const presentCount = data.filter((d: any) => d.is_present).length;
          return data.length > 0 ? Math.round((presentCount / data.length) * 100) : 0;
        },

        'learners.enrollment_count': async () => {
          const { count } = await (this.supabase as any)
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true)
            .eq('institution_id', config?.institution_id);
          return count || 0;
        },

        // Academic module
        'academic.courses_active': async () => {
          const { count } = await (this.supabase as any)
            .from('courses')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);
          return count || 0;
        },

        'academic.avg_grade': async () => {
          const { data } = await (this.supabase as any)
            .from('lti_grades')
            .select('score_percentage')
            .gte('created_at', this.getDateRangeStart(config));

          if (!data || data.length === 0) return 0;
          const avg =
            data.reduce((sum: number, g: any) => sum + (g.score_percentage || 0), 0) /
            data.length;
          return Math.round(avg * 100) / 100;
        },

        // Applications module
        'applications.total_received': async () => {
          const { count } = await (this.supabase as any)
            .from('applications')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', this.getDateRangeStart(config));
          return count || 0;
        },

        'applications.conversion_rate': async () => {
          const { data: apps } = await (this.supabase as any)
            .from('applications')
            .select('status')
            .gte('created_at', this.getDateRangeStart(config));

          if (!apps || apps.length === 0) return 0;
          const enrolled = apps.filter((a: any) => a.status === 'enrolled').length;
          return Math.round((enrolled / apps.length) * 100);
        },

        // Billing module
        'billing.collection_rate': async () => {
          const { data } = await (this.supabase as any)
            .from('billing_student_bills')
            .select('total_amount, balance_amount')
            .gte('created_at', this.getDateRangeStart(config));

          if (!data || data.length === 0) return 0;
          const totalBilled = data.reduce(
            (sum: number, b: any) => sum + (b.total_amount || 0),
            0
          );
          const totalCollected = data.reduce(
            (sum: number, b: any) =>
              sum + ((b.total_amount || 0) - (b.balance_amount || 0)),
            0
          );
          return totalBilled > 0
            ? Math.round((totalCollected / totalBilled) * 100)
            : 0;
        },

        'billing.revenue_total': async () => {
          const { data } = await (this.supabase as any)
            .from('billing_receipts')
            .select('payment_amount')
            .gte('created_at', this.getDateRangeStart(config));

          return data?.reduce((sum: number, r: any) => sum + (r.payment_amount || 0), 0) || 0;
        },

        // Staff module
        'staff.total_active': async () => {
          const { count } = await (this.supabase as any)
            .from('staff')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);
          return count || 0;
        },

        'staff.retention_rate': async () => {
          const yearAgo = new Date();
          yearAgo.setFullYear(yearAgo.getFullYear() - 1);

          const { data: startCount } = await (this.supabase as any)
            .from('staff')
            .select('*', { count: 'exact', head: true })
            .lte('created_at', yearAgo.toISOString());

          const { data: leftCount } = await (this.supabase as any)
            .from('staff')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', false)
            .gte('updated_at', yearAgo.toISOString());

          const start = startCount?.count || 0;
          const left = leftCount?.count || 0;
          return start > 0 ? Math.round(((start - left) / start) * 100) : 100;
        },

        // Resource Management module
        'resources.utilization_rate': async () => {
          const { data } = await (this.supabase as any)
            .from('resource_bookings')
            .select('duration_hours, resource:resources(capacity_hours)')
            .gte('booking_date', this.getDateRangeStart(config));

          if (!data || data.length === 0) return 0;
          const usedHours = data.reduce(
            (sum: number, b: any) => sum + (b.duration_hours || 0),
            0
          );
          const capacityHours = data.reduce(
            (sum: number, b: any) => sum + (b.resource?.capacity_hours || 8),
            0
          );
          return capacityHours > 0
            ? Math.round((usedHours / capacityHours) * 100)
            : 0;
        }
      };

      // Build the handler key
      const handlerKey = `${sourceModule}.${queryKey}`;
      const handler = handlers[handlerKey];

      if (!handler) {
        console.warn(`[OKR] No handler for auto-track: ${handlerKey}`);
        return null;
      }

      return await handler();
    } catch (error: any) {
      console.error('[OKR] Error executing auto-track query:', error?.message || error?.code || error?.details || JSON.stringify(error));
      return null;
    }
  }

  /**
   * Get date range start from config or default to start of year
   */
  private static getDateRangeStart(config?: Record<string, unknown>): string {
    if (config?.start_date) {
      return config.start_date as string;
    }
    const now = new Date();
    return new Date(now.getFullYear(), 0, 1).toISOString();
  }

  /**
   * Get date range end from config or default to now
   */
  private static getDateRangeEnd(config?: Record<string, unknown>): string {
    if (config?.end_date) {
      return config.end_date as string;
    }
    return new Date().toISOString();
  }

  /**
   * Get sync status for a Key Result
   */
  static async getSyncStatus(keyResultId: string): Promise<{
    lastSynced: string | null;
    isStale: boolean;
    refreshFrequency: string;
  }> {
    try {
      const { data: kr } = await (this.supabase as any)
        .from('okr_key_results')
        .select('updated_at, auto_source_module')
        .eq('id', keyResultId)
        .single();

      if (!kr) {
        return { lastSynced: null, isStale: true, refreshFrequency: 'unknown' };
      }

      // Get refresh frequency from source config
      const { data: source } = await (this.supabase as any)
        .from('okr_auto_track_sources')
        .select('refresh_frequency')
        .eq('source_module', kr.auto_source_module)
        .single();

      const frequency = source?.refresh_frequency || 'daily';
      const lastSynced = kr.updated_at;

      // Calculate if stale based on frequency
      let isStale = false;
      const now = new Date();
      const lastUpdate = new Date(lastSynced);
      const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);

      switch (frequency) {
        case 'realtime':
          isStale = hoursSinceUpdate > 0.25; // 15 minutes
          break;
        case 'hourly':
          isStale = hoursSinceUpdate > 1;
          break;
        case 'daily':
          isStale = hoursSinceUpdate > 24;
          break;
        case 'weekly':
          isStale = hoursSinceUpdate > 168;
          break;
      }

      return {
        lastSynced,
        isStale,
        refreshFrequency: frequency
      };
    } catch (error: any) {
      console.error('[OKR] Error getting sync status:', error?.message || error?.code || error?.details || JSON.stringify(error));
      return { lastSynced: null, isStale: true, refreshFrequency: 'unknown' };
    }
  }
}
