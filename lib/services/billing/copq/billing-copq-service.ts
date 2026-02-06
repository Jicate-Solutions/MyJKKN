// lib/services/billing/copq/billing-copq-service.ts
// Service layer for Billing COPQ operations

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  safeRupeesToPaisa,
  safePaisaToRupees,
  isValidPaisa
} from '@/lib/utils/currency';
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

/**
 * Interface for database view row (billing_copq_summary)
 * All cost fields are in paisa (BIGINT)
 */
interface COPQSummaryViewRow {
  institution_id: string;
  month: string;
  category: COPQCategory;
  incident_count: number;
  total_visible_paisa: number;
  total_hidden_paisa: number;
  total_copq_paisa: number;
  avg_time_spent: number;
}

/**
 * Interface for monthly trend data from database function
 * All cost fields are in paisa (BIGINT)
 */
interface COPQMonthlyTrendRow {
  month: string;
  copq_paisa: number;
  visible_paisa: number;
  hidden_paisa: number;
}

export class BillingCOPQService {
  private static supabase: any = createClientSupabaseClient();

  /**
   * SECURITY: Validate institution access
   * Ensures user has permission to access the requested institution's data
   * @throws Error if institution_id is invalid or user lacks access
   */
  private static async validateInstitutionAccess(
    institutionId: string
  ): Promise<void> {
    if (!institutionId || institutionId.trim() === '') {
      throw new Error('Institution ID is required');
    }

    // Get current user
    const { data: { user }, error: authError } = await this.supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Authentication required');
    }

    // Check user's institution access
    const { data: access, error } = await this.supabase
      .from('user_institution_access')
      .select('institution_id')
      .eq('user_id', user.id)
      .eq('institution_id', institutionId)
      .single();

    if (error || !access) {
      console.error('[billing-copq] Access denied:', { userId: user.id, institutionId });
      throw new Error('Access denied: Institution not accessible to user');
    }
  }

  /**
   * Convert rupees to paisa for storage
   * ₹100.50 → 10050 paisa
   * Uses validated conversion from currency utilities
   * @throws CurrencyError if rupees is invalid (NaN, Infinity, negative)
   */
  private static rupeesToPaisa(rupees: number): number {
    return safeRupeesToPaisa(rupees);
  }

  /**
   * Convert paisa to rupees for display
   * 10050 paisa → ₹100.50
   * Uses validated conversion from currency utilities
   * @throws CurrencyError if paisa is invalid
   */
  private static paisaToRupees(paisa: number): number {
    return safePaisaToRupees(paisa);
  }

  /**
   * Safely add two monetary values in paisa
   * Integer addition is exact - no precision loss
   */
  private static addMoney(a: number, b: number): number {
    return a + b;
  }

  /**
   * Sum an array of monetary values in paisa
   */
  private static sumMoney(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0);
  }

  /**
   * Sanitize search input to prevent SQL injection
   * Escapes wildcards and special characters used in ILIKE queries
   * @security CRITICAL - All user search inputs MUST pass through this
   */
  private static sanitizeSearch(input: string): string {
    if (!input) return '';
    // Escape SQL ILIKE wildcards (%) and single-character wildcards (_)
    // Also escape backslash to prevent escape sequence injection
    return input.replace(/[%_\\]/g, '\\$&');
  }

  /**
   * Convert incident from database (paisa) to API format (rupees)
   */
  private static convertIncidentToRupees(incident: any): BillingCOPQIncident {
    return {
      ...incident,
      visible_cost: this.paisaToRupees(incident.visible_cost || 0),
      hidden_cost_estimate: this.paisaToRupees(incident.hidden_cost_estimate || 0)
    };
  }

  /**
   * Log a new COPQ incident
   */
  static async logIncident(
    incident: CreateCOPQIncidentDto
  ): Promise<BillingCOPQIncident> {
    try {
      // SECURITY: Validate financial inputs before conversion
      if (
        typeof incident.visible_cost !== 'number' ||
        isNaN(incident.visible_cost) ||
        !isFinite(incident.visible_cost) ||
        incident.visible_cost < 0
      ) {
        throw new Error('Invalid visible_cost: must be a non-negative number');
      }

      if (
        typeof incident.hidden_cost_estimate !== 'number' ||
        isNaN(incident.hidden_cost_estimate) ||
        !isFinite(incident.hidden_cost_estimate) ||
        incident.hidden_cost_estimate < 0
      ) {
        throw new Error('Invalid hidden_cost_estimate: must be a non-negative number');
      }

      // Get current user for reported_by
      const {
        data: { user }
      } = await this.supabase.auth.getUser();

      // Convert input from rupees to paisa for storage
      // safeRupeesToPaisa() will throw CurrencyError if validation fails
      const incidentInPaisa = {
        ...incident,
        visible_cost: this.rupeesToPaisa(incident.visible_cost),
        hidden_cost_estimate: this.rupeesToPaisa(incident.hidden_cost_estimate),
        reported_by: user?.id || null
      };

      const { data, error } = await this.supabase
        .from('billing_copq_incidents')
        .insert(incidentInPaisa)
        .select('*')
        .single();

      if (error) throw error;

      // Convert output from paisa to rupees for frontend
      return this.convertIncidentToRupees(data);
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

      // Convert from paisa to rupees for frontend
      return this.convertIncidentToRupees(data);
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
    filters: COPQFilters
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
        // SECURITY FIX: Sanitize search to prevent SQL injection
        const sanitizedSearch = this.sanitizeSearch(filters.search);
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

      // Convert all incidents from paisa to rupees
      const convertedData = (data || []).map(incident => this.convertIncidentToRupees(incident));

      return {
        data: convertedData,
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
      // SECURITY: Validate financial inputs if present
      if (updates.visible_cost !== undefined) {
        if (
          typeof updates.visible_cost !== 'number' ||
          isNaN(updates.visible_cost) ||
          !isFinite(updates.visible_cost) ||
          updates.visible_cost < 0
        ) {
          throw new Error('Invalid visible_cost: must be a non-negative number');
        }
      }

      if (updates.hidden_cost_estimate !== undefined) {
        if (
          typeof updates.hidden_cost_estimate !== 'number' ||
          isNaN(updates.hidden_cost_estimate) ||
          !isFinite(updates.hidden_cost_estimate) ||
          updates.hidden_cost_estimate < 0
        ) {
          throw new Error('Invalid hidden_cost_estimate: must be a non-negative number');
        }
      }

      // Convert cost fields from rupees to paisa if present
      const updatesInPaisa = { ...updates };
      if (updates.visible_cost !== undefined) {
        updatesInPaisa.visible_cost = this.rupeesToPaisa(updates.visible_cost);
      }
      if (updates.hidden_cost_estimate !== undefined) {
        updatesInPaisa.hidden_cost_estimate = this.rupeesToPaisa(updates.hidden_cost_estimate);
      }

      let query = this.supabase
        .from('billing_copq_incidents')
        .update(updatesInPaisa)
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

      // Convert from paisa to rupees for frontend
      return this.convertIncidentToRupees(data);
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

      // Convert from paisa to rupees for frontend
      return this.convertIncidentToRupees(data);
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

      // Convert from paisa to rupees for frontend
      return this.convertIncidentToRupees(data);
    } catch (error) {
      console.error('[billing/copq] Error writing off incident:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to write off COPQ incident'
      );
    }
  }

  /**
   * Get monthly summary statistics
   * Note: The billing_copq_summary view stores costs in paisa (BIGINT).
   * Column names in the view are: total_visible_paisa, total_hidden_paisa, total_copq_paisa.
   * This method maps them to the COPQSummary interface and converts paisa to rupees.
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

      // Map view column names (paisa) to TypeScript interface (rupees)
      return (data || []).map((row: COPQSummaryViewRow) => ({
        institution_id: row.institution_id,
        month: row.month,
        category: row.category,
        incident_count: row.incident_count,
        total_visible_cost: this.paisaToRupees(row.total_visible_paisa || 0),
        total_hidden_cost: this.paisaToRupees(row.total_hidden_paisa || 0),
        total_copq: this.paisaToRupees(row.total_copq_paisa || 0),
        avg_time_spent: row.avg_time_spent || 0
      })) as COPQSummary[];
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

        // Convert dashboard data from paisa to rupees
        return {
          total_copq_ytd: this.paisaToRupees(dashboardData.total_copq_ytd_paisa || 0),
          visible_vs_hidden: {
            visible: this.paisaToRupees(dashboardData.visible_vs_hidden?.visible_paisa || 0),
            hidden: this.paisaToRupees(dashboardData.visible_vs_hidden?.hidden_paisa || 0)
          },
          by_category: Object.fromEntries(
            Object.entries(dashboardData.by_category || {}).map(([cat, paisa]) => {
              // Validate that paisa is a valid number before conversion
              const paisaValue = typeof paisa === 'number' ? paisa : 0;
              if (!isValidPaisa(paisaValue)) {
                console.warn(`[billing/copq] Invalid paisa value for category ${cat}:`, paisa);
                return [cat, 0];
              }
              return [cat, this.paisaToRupees(paisaValue)];
            })
          ),
          trend: (dashboardData.trend || []).map((month: any) => ({
            month: month.month,
            copq: this.paisaToRupees(month.copq_paisa || 0),
            visible: this.paisaToRupees(month.visible_paisa || 0),
            hidden: this.paisaToRupees(month.hidden_paisa || 0)
          })),
          top_incidents: (topIncidents || []).map(incident => this.convertIncidentToRupees(incident)),
          stats: dashboardData.stats || {
            total_incidents: 0,
            open_incidents: 0,
            resolved_incidents: 0,
            avg_resolution_time_days: 0
          }
        };
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

    // Use integer arithmetic (paisa) for all calculations
    let totalVisiblePaisa = 0;
    let totalHiddenPaisa = 0;
    let openCount = 0;
    let resolvedCount = 0;
    let totalResolutionDays = 0;
    let resolvedWithDates = 0;
    const byCategoryPaisa: Partial<Record<COPQCategory, number>> = {};
    const monthlyTrendPaisa: Record<string, { copq: number; visible: number; hidden: number }> = {};

    (incidents || []).forEach((i) => {
      // Values from DB are already in paisa - use directly (integer arithmetic)
      const visiblePaisa = i.visible_cost || 0;
      const hiddenPaisa = i.hidden_cost_estimate || 0;
      totalVisiblePaisa = this.addMoney(totalVisiblePaisa, visiblePaisa);
      totalHiddenPaisa = this.addMoney(totalHiddenPaisa, hiddenPaisa);

      // Status counts
      if (i.status === 'logged' || i.status === 'investigating') {
        openCount++;
      } else if (i.status === 'resolved') {
        resolvedCount++;
        if (i.resolved_at && i.created_at) {
          const resolutionDays =
            (new Date(i.resolved_at).getTime() - new Date(i.created_at).getTime()) /
            (1000 * 60 * 60 * 24);
          // Only count positive resolution times (data integrity check)
          if (resolutionDays >= 0) {
            totalResolutionDays += resolutionDays;
            resolvedWithDates++;
          } else {
            console.warn('[billing/copq] Invalid resolution time (resolved_at before created_at):', {
              id: i.id,
              created_at: i.created_at,
              resolved_at: i.resolved_at
            });
          }
        }
      }

      // By category (integer addition)
      const category = i.category as COPQCategory;
      const currentCategoryPaisa = byCategoryPaisa[category] || 0;
      byCategoryPaisa[category] = this.addMoney(currentCategoryPaisa, this.addMoney(visiblePaisa, hiddenPaisa));

      // Monthly trend (integer addition)
      const month = i.incident_date.substring(0, 7); // YYYY-MM
      if (!monthlyTrendPaisa[month]) {
        monthlyTrendPaisa[month] = { copq: 0, visible: 0, hidden: 0 };
      }
      monthlyTrendPaisa[month].copq = this.addMoney(monthlyTrendPaisa[month].copq, this.addMoney(visiblePaisa, hiddenPaisa));
      monthlyTrendPaisa[month].visible = this.addMoney(monthlyTrendPaisa[month].visible, visiblePaisa);
      monthlyTrendPaisa[month].hidden = this.addMoney(monthlyTrendPaisa[month].hidden, hiddenPaisa);
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

    // Convert all paisa values to rupees for API response
    return {
      total_copq_ytd: this.paisaToRupees(this.addMoney(totalVisiblePaisa, totalHiddenPaisa)),
      visible_vs_hidden: {
        visible: this.paisaToRupees(totalVisiblePaisa),
        hidden: this.paisaToRupees(totalHiddenPaisa)
      },
      by_category: Object.fromEntries(
        Object.entries(byCategoryPaisa).map(([cat, paisa]) => [
          cat,
          this.paisaToRupees(paisa)
        ])
      ),
      trend: Object.entries(monthlyTrendPaisa)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
          month,
          copq: this.paisaToRupees(data.copq),
          visible: this.paisaToRupees(data.visible),
          hidden: this.paisaToRupees(data.hidden)
        })),
      top_incidents: (topIncidents || []).map(incident => this.convertIncidentToRupees(incident)),
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

      // Use integer arithmetic (paisa) for all calculations
      const categoryVisiblePaisa: Partial<Record<COPQCategory, number>> = {};
      const categoryHiddenPaisa: Partial<Record<COPQCategory, number>> = {};
      let totalVisiblePaisa = 0;
      let totalHiddenPaisa = 0;

      (incidents || []).forEach((i) => {
        const category = i.category as COPQCategory;
        // Values from DB are already in paisa
        const visiblePaisa = i.visible_cost || 0;
        const hiddenPaisa = i.hidden_cost_estimate || 0;

        const currentVisiblePaisa = categoryVisiblePaisa[category] || 0;
        const currentHiddenPaisa = categoryHiddenPaisa[category] || 0;
        categoryVisiblePaisa[category] = this.addMoney(currentVisiblePaisa, visiblePaisa);
        categoryHiddenPaisa[category] = this.addMoney(currentHiddenPaisa, hiddenPaisa);
        totalVisiblePaisa = this.addMoney(totalVisiblePaisa, visiblePaisa);
        totalHiddenPaisa = this.addMoney(totalHiddenPaisa, hiddenPaisa);
      });

      // Convert to rupees for API response
      const visibleCosts = Object.entries(categoryVisiblePaisa)
        .filter(([, amountPaisa]) => amountPaisa > 0)
        .map(([category, amountPaisa]) => {
          const amountRupees = this.paisaToRupees(amountPaisa);
          return {
            category: category as COPQCategory,
            label: COPQ_CATEGORY_LABELS[category as COPQCategory],
            amount: amountRupees,
            percentage: totalVisiblePaisa > 0 ? (amountPaisa / totalVisiblePaisa) * 100 : 0
          };
        })
        .sort((a, b) => b.amount - a.amount);

      const hiddenCosts = Object.entries(categoryHiddenPaisa)
        .filter(([, amountPaisa]) => amountPaisa > 0)
        .map(([category, amountPaisa]) => {
          const amountRupees = this.paisaToRupees(amountPaisa);
          return {
            category: category as COPQCategory,
            label: COPQ_CATEGORY_LABELS[category as COPQCategory],
            amount: amountRupees,
            percentage: totalHiddenPaisa > 0 ? (amountPaisa / totalHiddenPaisa) * 100 : 0
          };
        })
        .sort((a, b) => b.amount - a.amount);

      const totalVisibleRupees = this.paisaToRupees(totalVisiblePaisa);
      const totalHiddenRupees = this.paisaToRupees(totalHiddenPaisa);

      return {
        visible_costs: visibleCosts,
        hidden_costs: hiddenCosts,
        total_visible: totalVisibleRupees,
        total_hidden: totalHiddenRupees,
        ratio: totalVisibleRupees > 0 ? totalHiddenRupees / totalVisibleRupees : 0
      };
    } catch (error) {
      console.error('[billing/copq] Error fetching iceberg data:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch iceberg data'
      );
    }
  }
}
