import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  BillingActivityFilters,
  BillingActivityListResponse,
  BillingActivityMetrics,
  BillingActivityLog
} from '@/types/billing-activity';

const BILLING_RESOURCES_NO_CATEGORY = ['bill', 'receipt', 'invoice', 'discount', 'refund'];

const BILLING_RESOURCE_FILTER =
  `resource_type.in.(${BILLING_RESOURCES_NO_CATEGORY.join(',')}),` +
  `and(resource_type.eq.category,metadata->>sub_type.like.billing_%)`;


export class BillingActivityService {
  private static supabase = createClientSupabaseClient();

  static async getActivities(
    filters: BillingActivityFilters = {}
  ): Promise<BillingActivityListResponse> {
    try {
      let query = (this.supabase as any)
        .from('user_activity_logs')
        .select(
          `
          *,
          profiles(id, full_name, email, role),
          institutions(id, name)
        `,
          { count: 'exact' }
        )
        .or(BILLING_RESOURCE_FILTER);

      if (filters.action_type) {
        query = query.eq('action_type', filters.action_type);
      }

      if (filters.resource_type) {
        query = query.eq('resource_type', filters.resource_type);
      }

      if (filters.user_id) {
        query = query.eq('user_id', filters.user_id);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.resource_id) {
        query = query.eq('resource_id', filters.resource_id);
      }

      if (filters.date_from) {
        query = query.gte('created_at', filters.date_from);
      }

      if (filters.date_to) {
        query = query.lte('created_at', filters.date_to);
      }

      if (filters.search) {
        const like = `%${filters.search}%`;
        query = query.or(
          `description.ilike.${like},resource_name.ilike.${like}`
        );
      }

      const sortBy = filters.sortBy || 'created_at';
      const sortDirection = filters.sortDirection || 'desc';
      query = query.order(sortBy, { ascending: sortDirection === 'asc' });

      const page = filters.page || 1;
      const limit = filters.limit || 25;
      query = query.range((page - 1) * limit, page * limit - 1);

      const { data, count, error } = await query;

      if (error) throw error;

      return {
        data: (data || []) as BillingActivityLog[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching billing activities:', error);
      throw error;
    }
  }

  static async getMetrics(dateRange: {
    from: string;
    to: string;
  }): Promise<BillingActivityMetrics> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('user_activity_logs')
        .select('action_type, resource_type, user_id, created_at, metadata')
        .or(BILLING_RESOURCE_FILTER)
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to);

      if (error) throw error;

      const logs = data || [];
      const totalActivities = logs.length;
      const uniqueUsers = new Set(logs.map((l: any) => l.user_id)).size;

      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const todayCount = logs.filter((l: any) =>
        l.created_at.startsWith(today)
      ).length;
      const yesterdayCount = logs.filter((l: any) =>
        l.created_at.startsWith(yesterday)
      ).length;

      const actionCounts: Record<string, number> = {};
      const resourceCounts: Record<string, number> = {};

      for (const log of logs) {
        actionCounts[log.action_type] = (actionCounts[log.action_type] || 0) + 1;
        if (log.resource_type) {
          resourceCounts[log.resource_type] = (resourceCounts[log.resource_type] || 0) + 1;
        }
      }

      const actionBreakdown = Object.entries(actionCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([action_type, count]) => ({
          action_type,
          count,
          percentage: totalActivities > 0
            ? Math.round((count / totalActivities) * 100)
            : 0
        }));

      const resourceBreakdown = Object.entries(resourceCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([resource_type, count]) => ({
          resource_type,
          count,
          percentage: totalActivities > 0
            ? Math.round((count / totalActivities) * 100)
            : 0
        }));

      return {
        totalActivities,
        uniqueUsers,
        todayCount,
        yesterdayCount,
        topAction: actionBreakdown[0] ? {
          type: actionBreakdown[0].action_type,
          count: actionBreakdown[0].count,
          percentage: actionBreakdown[0].percentage
        } : null,
        topResource: resourceBreakdown[0] ? {
          type: resourceBreakdown[0].resource_type,
          count: resourceBreakdown[0].count,
          percentage: resourceBreakdown[0].percentage
        } : null,
        actionBreakdown,
        resourceBreakdown
      };
    } catch (error) {
      console.error('Error fetching billing activity metrics:', error);
      throw error;
    }
  }
}
