// lib/services/billing/copq/billing-copq-service.ts
// Service layer for Billing COPQ operations

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  BillingCOPQIncident,
  COPQFilters,
  COPQListResponse,
  COPQSummary,
  COPQDashboard,
  COPQIcebergData,
  COPQCategory,
  CreateCOPQIncidentDto,
  UpdateCOPQIncidentDto
} from '@/types/billing-copq';
import { COPQ_CATEGORY_LABELS } from '@/types/billing-copq';

export class BillingCOPQService {
  private static supabase: any = createClientSupabaseClient();

  /**
   * Log a new COPQ incident
   */
  static async logIncident(
    incident: CreateCOPQIncidentDto
  ): Promise<BillingCOPQIncident> {
    try {
      // Get current user for reported_by
      const {
        data: { user }
      } = await this.supabase.auth.getUser();

      const { data, error } = await this.supabase
        .from('billing_copq_incidents')
        .insert({
          ...incident,
          reported_by: user?.id || null
        })
        .select('*')
        .single();

      if (error) throw error;
      return data as unknown as BillingCOPQIncident;
    } catch (error) {
      console.error('[billing/copq] Error logging incident:', error);
      // SECURITY: Don't expose internal error details
      throw new Error('Failed to log COPQ incident');
    }
  }

  /**
   * Get a single COPQ incident by ID
   */
  static async getIncident(id: string, institutionId?: string): Promise<BillingCOPQIncident> {
    try {
      let query = this.supabase
        .from('billing_copq_incidents')
        .select(
          `
          *,
          bill:billing_bills(id, bill_number),
          learner:learners_profiles(id, name, roll_number),
          reporter:profiles!reported_by(id, full_name)
        `
        )
        .eq('id', id);

      // SECURITY: Filter by institution_id if provided to prevent cross-institution access
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query.single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('COPQ incident not found or access denied');
        }
        throw error;
      }

      if (!data) {
        throw new Error('COPQ incident not found');
      }

      return data as unknown as BillingCOPQIncident;
    } catch (error) {
      console.error('[billing/copq] Error fetching incident:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch COPQ incident'
      );
    }
  }

  /**
   * Get list of COPQ incidents with filters and pagination
   */
  static async getIncidents(
    filters: COPQFilters = {}
  ): Promise<COPQListResponse> {
    try {
      let query = this.supabase
        .from('billing_copq_incidents')
        .select(
          `
          *,
          bill:billing_bills(id, bill_number),
          learner:learners_profiles(id, name, roll_number),
          reporter:profiles!reported_by(id, full_name)
        `,
          { count: 'exact' }
        )
        .order('incident_date', { ascending: false });

      // Apply filters
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.category) {
        query = query.eq('category', filters.category);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.date_from) {
        query = query.gte('incident_date', filters.date_from);
      }

      if (filters.date_to) {
        query = query.lte('incident_date', filters.date_to);
      }

      if (filters.search) {
        // Sanitize search to prevent SQL injection
        const sanitizedSearch = filters.search.replace(/[%_]/g, '\\$&');
        query = query.or(
          `description.ilike.%${sanitizedSearch}%,root_cause.ilike.%${sanitizedSearch}%`
        );
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      query = query.range((page - 1) * limit, page * limit - 1);

      const { data, count, error } = await query;

      if (error) throw error;

      return {
        data: (data || []) as unknown as BillingCOPQIncident[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('[billing/copq] Error fetching incidents:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch COPQ incidents'
      );
    }
  }

  /**
   * Update a COPQ incident
   */
  static async updateIncident(
    id: string,
    updates: UpdateCOPQIncidentDto,
    institutionId?: string
  ): Promise<BillingCOPQIncident> {
    try {
      let query = this.supabase
        .from('billing_copq_incidents')
        .update(updates)
        .eq('id', id);

      // SECURITY: Filter by institution_id if provided to prevent unauthorized updates
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query
        .select(
          `
          *,
          bill:billing_bills(id, bill_number),
          learner:learners_profiles(id, name, roll_number),
          reporter:profiles!reported_by(id, full_name)
        `
        )
        .single();

      if (error) throw error;
      return data as unknown as BillingCOPQIncident;
    } catch (error) {
      console.error('[billing/copq] Error updating incident:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to update COPQ incident'
      );
    }
  }

  /**
   * Delete a COPQ incident
   */
  static async deleteIncident(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('billing_copq_incidents')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('[billing/copq] Error deleting incident:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to delete COPQ incident'
      );
    }
  }

  /**
   * Resolve a COPQ incident
   */
  static async resolveIncident(
    id: string,
    preventiveAction?: string
  ): Promise<BillingCOPQIncident> {
    try {
      const { data, error } = await this.supabase
        .from('billing_copq_incidents')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          preventive_action: preventiveAction || null
        })
        .eq('id', id)
        .select(
          `
          *,
          bill:billing_bills(id, bill_number),
          learner:learners_profiles(id, name, roll_number),
          reporter:profiles!reported_by(id, full_name)
        `
        )
        .single();

      if (error) throw error;
      return data as unknown as BillingCOPQIncident;
    } catch (error) {
      console.error('[billing/copq] Error resolving incident:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to resolve COPQ incident'
      );
    }
  }

  /**
   * Write off a COPQ incident
   */
  static async writeOffIncident(id: string): Promise<BillingCOPQIncident> {
    try {
      const { data, error } = await this.supabase
        .from('billing_copq_incidents')
        .update({
          status: 'written_off',
          resolved_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(
          `
          *,
          bill:billing_bills(id, bill_number),
          learner:learners_profiles(id, name, roll_number),
          reporter:profiles!reported_by(id, full_name)
        `
        )
        .single();

      if (error) throw error;
      return data as unknown as BillingCOPQIncident;
    } catch (error) {
      console.error('[billing/copq] Error writing off incident:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to write off COPQ incident'
      );
    }
  }

  /**
   * Get monthly summary statistics
   */
  static async getSummary(
    institutionId: string,
    year?: number
  ): Promise<COPQSummary[]> {
    try {
      const targetYear = year || new Date().getFullYear();

      const { data, error } = await this.supabase
        .from('billing_copq_summary')
        .select('*')
        .eq('institution_id', institutionId)
        .gte('month', `${targetYear}-01-01`)
        .lte('month', `${targetYear}-12-31`)
        .order('month');

      if (error) throw error;
      return (data || []) as COPQSummary[];
    } catch (error) {
      console.error('[billing/copq] Error fetching summary:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch COPQ summary'
      );
    }
  }

  /**
   * Get dashboard metrics using the database function
   */
  static async getDashboard(
    institutionId: string,
    year?: number
  ): Promise<COPQDashboard> {
    try {
      // Try to use the database function first
      const { data: dashboardData, error: fnError } = await this.supabase.rpc(
        'get_billing_copq_dashboard',
        {
          p_institution_id: institutionId,
          p_year: year || new Date().getFullYear()
        }
      );

      if (!fnError && dashboardData) {
        // Get top incidents separately
        const { data: topIncidents } = await this.supabase
          .from('billing_copq_incidents')
          .select(
            `
            *,
            bill:billing_bills(id, bill_number),
            learner:learners_profiles(id, name, roll_number),
            reporter:profiles!reported_by(id, full_name)
          `
          )
          .eq('institution_id', institutionId)
          .order('visible_cost', { ascending: false })
          .limit(5);

        return {
          ...dashboardData,
          top_incidents: (topIncidents || []) as unknown as BillingCOPQIncident[]
        } as COPQDashboard;
      }

      // Fallback to manual calculation if function doesn't exist
      return this.calculateDashboardManually(institutionId, year);
    } catch (error) {
      console.error('[billing/copq] Error fetching dashboard:', error);
      // Fallback to manual calculation
      return this.calculateDashboardManually(institutionId, year);
    }
  }

  /**
   * Manual dashboard calculation fallback
   */
  private static async calculateDashboardManually(
    institutionId: string,
    year?: number
  ): Promise<COPQDashboard> {
    const targetYear = year || new Date().getFullYear();
    const yearStart = `${targetYear}-01-01`;
    const yearEnd = `${targetYear}-12-31`;

    // Get all incidents for the year
    const { data: incidents } = await this.supabase
      .from('billing_copq_incidents')
      .select('*')
      .eq('institution_id', institutionId)
      .gte('incident_date', yearStart)
      .lte('incident_date', yearEnd);

    let totalVisible = 0;
    let totalHidden = 0;
    let openCount = 0;
    let resolvedCount = 0;
    let totalResolutionDays = 0;
    let resolvedWithDates = 0;
    const byCategory: Partial<Record<COPQCategory, number>> = {};
    const monthlyTrend: Record<string, { copq: number; visible: number; hidden: number }> = {};

    (incidents || []).forEach((i) => {
      const visible = i.visible_cost || 0;
      const hidden = i.hidden_cost_estimate || 0;
      totalVisible += visible;
      totalHidden += hidden;

      // Status counts
      if (i.status === 'logged' || i.status === 'investigating') {
        openCount++;
      } else if (i.status === 'resolved') {
        resolvedCount++;
        if (i.resolved_at && i.created_at) {
          const resolutionDays =
            (new Date(i.resolved_at).getTime() - new Date(i.created_at).getTime()) /
            (1000 * 60 * 60 * 24);
          totalResolutionDays += resolutionDays;
          resolvedWithDates++;
        }
      }

      // By category
      const category = i.category as COPQCategory;
      byCategory[category] = (byCategory[category] || 0) + visible + hidden;

      // Monthly trend
      const month = i.incident_date.substring(0, 7); // YYYY-MM
      if (!monthlyTrend[month]) {
        monthlyTrend[month] = { copq: 0, visible: 0, hidden: 0 };
      }
      monthlyTrend[month].copq += visible + hidden;
      monthlyTrend[month].visible += visible;
      monthlyTrend[month].hidden += hidden;
    });

    // Get top incidents
    const { data: topIncidents } = await this.supabase
      .from('billing_copq_incidents')
      .select(
        `
        *,
        bill:billing_bills(id, bill_number),
        learner:learners_profiles(id, name, roll_number),
        reporter:profiles!reported_by(id, full_name)
      `
      )
      .eq('institution_id', institutionId)
      .gte('incident_date', yearStart)
      .lte('incident_date', yearEnd)
      .order('visible_cost', { ascending: false })
      .limit(5);

    return {
      total_copq_ytd: totalVisible + totalHidden,
      visible_vs_hidden: {
        visible: totalVisible,
        hidden: totalHidden
      },
      by_category: byCategory,
      trend: Object.entries(monthlyTrend)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month,
          ...data
        })),
      top_incidents: (topIncidents || []) as unknown as BillingCOPQIncident[],
      stats: {
        total_incidents: incidents?.length || 0,
        open_incidents: openCount,
        resolved_incidents: resolvedCount,
        avg_resolution_time_days: resolvedWithDates > 0
          ? Math.round((totalResolutionDays / resolvedWithDates) * 10) / 10
          : 0
      }
    };
  }

  /**
   * Get iceberg visualization data (visible vs hidden costs)
   */
  static async getIcebergData(
    institutionId: string,
    year?: number
  ): Promise<COPQIcebergData> {
    try {
      const targetYear = year || new Date().getFullYear();
      const yearStart = `${targetYear}-01-01`;
      const yearEnd = `${targetYear}-12-31`;

      const { data: incidents } = await this.supabase
        .from('billing_copq_incidents')
        .select('category, visible_cost, hidden_cost_estimate')
        .eq('institution_id', institutionId)
        .gte('incident_date', yearStart)
        .lte('incident_date', yearEnd);

      const categoryVisible: Partial<Record<COPQCategory, number>> = {};
      const categoryHidden: Partial<Record<COPQCategory, number>> = {};
      let totalVisible = 0;
      let totalHidden = 0;

      (incidents || []).forEach((i) => {
        const category = i.category as COPQCategory;
        const visible = i.visible_cost || 0;
        const hidden = i.hidden_cost_estimate || 0;

        categoryVisible[category] = (categoryVisible[category] || 0) + visible;
        categoryHidden[category] = (categoryHidden[category] || 0) + hidden;
        totalVisible += visible;
        totalHidden += hidden;
      });

      const visibleCosts = Object.entries(categoryVisible)
        .filter(([, amount]) => amount > 0)
        .map(([category, amount]) => ({
          category: category as COPQCategory,
          label: COPQ_CATEGORY_LABELS[category as COPQCategory],
          amount,
          percentage: totalVisible > 0 ? (amount / totalVisible) * 100 : 0
        }))
        .sort((a, b) => b.amount - a.amount);

      const hiddenCosts = Object.entries(categoryHidden)
        .filter(([, amount]) => amount > 0)
        .map(([category, amount]) => ({
          category: category as COPQCategory,
          label: COPQ_CATEGORY_LABELS[category as COPQCategory],
          amount,
          percentage: totalHidden > 0 ? (amount / totalHidden) * 100 : 0
        }))
        .sort((a, b) => b.amount - a.amount);

      return {
        visible_costs: visibleCosts,
        hidden_costs: hiddenCosts,
        total_visible: totalVisible,
        total_hidden: totalHidden,
        ratio: totalVisible > 0 ? totalHidden / totalVisible : 0
      };
    } catch (error) {
      console.error('[billing/copq] Error fetching iceberg data:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch iceberg data'
      );
    }
  }
}
