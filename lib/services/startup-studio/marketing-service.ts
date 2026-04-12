// lib/services/startup-studio/marketing-service.ts
// CRUD + dashboard analytics for ss_marketing_activities

import { BaseService } from '../base-service';
import type {
  SSMarketingActivity,
  CreateMarketingActivityInput,
  UpdateMarketingActivityInput,
  MarketingDashboard,
  MarketingActivityType,
  MarketingActivityStatus,
} from '@/types/startup-studio';

const TABLE = 'ss_marketing_activities';

export class MarketingService extends BaseService {
  /**
   * List marketing activities with optional filters (paginated)
   */
  static async getActivities(filters: {
    type?: MarketingActivityType;
    status?: MarketingActivityStatus;
    search?: string;
    institutionId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ data: SSMarketingActivity[]; metadata: any }> {
    return this.executeListQuery<SSMarketingActivity>(
      TABLE,
      {
        institution_id: filters.institutionId,
        page: filters.page,
        limit: filters.limit,
        search: filters.search,
        sortBy: 'created_at',
        sortDirection: 'desc',
      },
      '*',
      (query) => {
        if (filters.type) {
          query = query.eq('activity_type', filters.type);
        }
        if (filters.status) {
          query = query.eq('status', filters.status);
        }
        if (filters.search) {
          const search = this.sanitize(filters.search);
          query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
        }
        return query;
      }
    );
  }

  /**
   * Fetch a single marketing activity by ID
   */
  static async getActivity(id: string, institutionId?: string): Promise<SSMarketingActivity> {
    return this.executeSingleQuery<SSMarketingActivity>(TABLE, id, institutionId);
  }

  /**
   * Create a new marketing activity
   */
  static async createActivity(input: CreateMarketingActivityInput): Promise<SSMarketingActivity> {
    return this.executeCreate<SSMarketingActivity, CreateMarketingActivityInput>(TABLE, {
      ...input,
      media_links: input.media_links ?? [],
      photos: input.photos ?? [],
      reach_count: input.reach_count ?? 0,
      leads_generated: input.leads_generated ?? 0,
      applications_from_activity: input.applications_from_activity ?? 0,
      status: input.status ?? 'planned',
    });
  }

  /**
   * Update an existing marketing activity
   */
  static async updateActivity(
    id: string,
    updates: UpdateMarketingActivityInput,
    institutionId?: string
  ): Promise<SSMarketingActivity> {
    // Strip protected fields
    const { id: _id, created_at: _ca, ...safeUpdates } = updates as any;
    return this.executeUpdate<SSMarketingActivity, typeof safeUpdates>(
      TABLE,
      id,
      safeUpdates,
      institutionId
    );
  }

  /**
   * Delete a marketing activity
   */
  static async deleteActivity(id: string, institutionId?: string): Promise<void> {
    return this.executeDelete(TABLE, id, institutionId);
  }

  /**
   * Dashboard: aggregate marketing analytics
   */
  static async getMarketingDashboard(institutionId?: string): Promise<MarketingDashboard> {
    let query = this.supabase.from(TABLE).select('*');

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch marketing dashboard: ' + error.message);

    const activities = (data || []) as SSMarketingActivity[];
    const total = activities.length;

    const totalReach = activities.reduce((sum, a) => sum + (a.reach_count || 0), 0);
    const totalLeads = activities.reduce((sum, a) => sum + (a.leads_generated || 0), 0);
    const totalApplications = activities.reduce(
      (sum, a) => sum + (a.applications_from_activity || 0),
      0
    );

    // Compute average ROI: (leads / budget) across activities with budget > 0
    const withBudget = activities.filter((a) => a.budget && a.budget > 0);
    const avgRoi =
      withBudget.length > 0
        ? Math.round(
            (withBudget.reduce((sum, a) => sum + (a.leads_generated || 0) / a.budget!, 0) /
              withBudget.length) *
              100
          ) / 100
        : 0;

    // Breakdown by activity_type
    const byType: Record<string, { count: number; reach: number; leads: number }> = {};
    for (const a of activities) {
      if (!byType[a.activity_type]) {
        byType[a.activity_type] = { count: 0, reach: 0, leads: 0 };
      }
      byType[a.activity_type].count += 1;
      byType[a.activity_type].reach += a.reach_count || 0;
      byType[a.activity_type].leads += a.leads_generated || 0;
    }

    const by_type_breakdown = Object.entries(byType).map(([type, stats]) => ({
      activity_type: type as MarketingActivityType,
      ...stats,
    }));

    // Monthly trend (last 12 months)
    const now = new Date();
    const monthly_trend: Array<{ month: string; activities: number; reach: number; leads: number }> =
      [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthActivities = activities.filter((a) => {
        if (!a.date_start) return false;
        const aDate = new Date(a.date_start);
        return aDate.getFullYear() === d.getFullYear() && aDate.getMonth() === d.getMonth();
      });

      monthly_trend.push({
        month: monthKey,
        activities: monthActivities.length,
        reach: monthActivities.reduce((sum, a) => sum + (a.reach_count || 0), 0),
        leads: monthActivities.reduce((sum, a) => sum + (a.leads_generated || 0), 0),
      });
    }

    return {
      total_activities: total,
      total_reach: totalReach,
      total_leads: totalLeads,
      total_applications: totalApplications,
      avg_roi: avgRoi,
      by_type_breakdown,
      monthly_trend,
    };
  }
}

export const marketingService = {
  getActivities: MarketingService.getActivities.bind(MarketingService),
  getActivity: MarketingService.getActivity.bind(MarketingService),
  createActivity: MarketingService.createActivity.bind(MarketingService),
  updateActivity: MarketingService.updateActivity.bind(MarketingService),
  deleteActivity: MarketingService.deleteActivity.bind(MarketingService),
  getMarketingDashboard: MarketingService.getMarketingDashboard.bind(MarketingService),
};
