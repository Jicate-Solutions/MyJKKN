import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  UserActivityLog,
  UserActivityLogWithUser,
  ActivityLogFilters,
  ActivityLogsPaginatedResponse,
  CreateActivityLogRequest,
  ActivityDashboardMetrics,
  ActivityStats,
  ACTIVITY_TYPES,
  RESOURCE_TYPES,
  ACTIVITY_SEVERITY,
  STATUS_CODE_CATEGORIES
} from '@/types/activity';

export class ActivityService {
  private static supabase = createClientSupabaseClient();

  /**
   * Create a new activity log entry
   */
  static async createActivityLog(
    data: CreateActivityLogRequest
  ): Promise<UserActivityLog> {
    try {
      const { data: activity, error } = await (this.supabase as any)
        .from('user_activity_logs')
        .insert([data])
        .select('*')
        .single();

      if (error) throw error;
      return activity;
    } catch (error) {
      console.error('Error creating activity log:', error);
      throw error;
    }
  }

  /**
   * Log user activity with automatic metadata extraction
   */
  static async logActivity({
    user_id,
    action_type,
    resource_type,
    resource_id,
    resource_name,
    description,
    request,
    metadata = {},
    institution_id
  }: {
    user_id: string;
    action_type: string;
    resource_type?: string;
    resource_id?: string;
    resource_name?: string;
    description: string;
    request?: Request;
    metadata?: Record<string, any>;
    institution_id?: string;
  }): Promise<UserActivityLog> {
    try {
      const activityData: CreateActivityLogRequest = {
        user_id,
        action_type,
        resource_type,
        resource_id,
        resource_name,
        description,
        metadata,
        institution_id
      };

      // Extract request metadata if available
      if (request) {
        const url = new URL(request.url);
        activityData.request_url = url.pathname;
        activityData.request_method = request.method;
        activityData.user_agent =
          request.headers.get('user-agent') || undefined;

        // Extract IP address from various headers
        const forwarded = request.headers.get('x-forwarded-for');
        const realIp = request.headers.get('x-real-ip');
        const clientIp = request.headers.get('x-client-ip');

        activityData.ip_address =
          forwarded?.split(',')[0] || realIp || clientIp || undefined;
      }

      return await this.createActivityLog(activityData);
    } catch (error) {
      console.error('Error logging activity:', error);
      throw error;
    }
  }

  /**
   * Get paginated activity logs with filters and user information
   */
  static async getActivityLogs({
    filters = {},
    page = 1,
    limit = 50,
    sortBy = 'created_at',
    sortOrder = 'desc'
  }: {
    filters?: ActivityLogFilters;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ActivityLogsPaginatedResponse> {
    try {
      let query = (this.supabase as any).from('user_activity_logs').select(
        `
          *,
          profiles!fk_user_activity_logs_profile(
            id,
            full_name,
            email,
            role
          ),
          institutions(
            id,
            name
          )
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.user_id) {
        query = query.eq('user_id', filters.user_id);
      }

      if (filters.action_type) {
        query = query.eq('action_type', filters.action_type);
      }

      if (filters.resource_type) {
        query = query.eq('resource_type', filters.resource_type);
      }

      if (filters.resource_id) {
        query = query.eq('resource_id', filters.resource_id);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.ip_address) {
        query = query.eq('ip_address', filters.ip_address);
      }

      if (filters.status_code) {
        query = query.eq('status_code', filters.status_code);
      }

      if (filters.session_id) {
        query = query.eq('session_id', filters.session_id);
      }

      if (filters.date_from) {
        query = query.gte('created_at', filters.date_from);
      }

      if (filters.date_to) {
        query = query.lte('created_at', filters.date_to);
      }

      if (filters.search) {
        query = query.or(
          `description.ilike.%${filters.search}%,action_type.ilike.%${filters.search}%,resource_type.ilike.%${filters.search}%,resource_name.ilike.%${filters.search}%`
        );
      }

      // Apply sorting
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Apply pagination
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      const totalPages = Math.ceil((count || 0) / limit);

      return {
        data: data as unknown as UserActivityLogWithUser[],
        count: count || 0,
        page,
        limit,
        totalPages
      };
    } catch (error) {
      console.error('Error fetching activity logs:', error);
      throw error;
    }
  }

  /**
   * Get activity dashboard metrics
   */
  static async getDashboardMetrics(dateRange: {
    from: string;
    to: string;
  }): Promise<ActivityDashboardMetrics> {
    try {
      // Get total activities
      const { count: totalActivities } = await this.supabase
        .from('user_activity_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to);

      // Get unique users
      const { data: uniqueUsersData } = await this.supabase
        .from('user_activity_logs')
        .select('user_id')
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to);

      // Type cast to fix TypeScript inference after React 19 upgrade
      const usersData = uniqueUsersData as { user_id: string }[] | null;

      const uniqueUsers = new Set(
        usersData?.map((log) => log.user_id) || []
      ).size;

      // Get unique sessions
      const { data: uniqueSessionsData } = await this.supabase
        .from('user_activity_logs')
        .select('session_id')
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to)
        .not('session_id', 'is', null);

      // Type cast to fix TypeScript inference after React 19 upgrade
      const sessionsData = uniqueSessionsData as { session_id: string }[] | null;

      const uniqueSessions = new Set(
        sessionsData?.map((log) => log.session_id) || []
      ).size;

      // Get top actions
      const { data: actionsData } = await this.supabase
        .from('user_activity_logs')
        .select('action_type')
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to);

      // Type cast to fix TypeScript inference after React 19 upgrade
      const actionsResult = actionsData as { action_type: string }[] | null;

      const actionCounts =
        actionsResult?.reduce((acc, log) => {
          acc[log.action_type] = (acc[log.action_type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>) || {};

      const topActions = (
        Object.entries(actionCounts) as [string, number][]
      )
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([action_type, count]) => ({
          action_type,
          count,
          percentage: Math.round((count / (totalActivities || 1)) * 100)
        }));

      // Get top resources
      const { data: resourcesData } = await this.supabase
        .from('user_activity_logs')
        .select('resource_type')
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to)
        .not('resource_type', 'is', null);

      // Type cast to fix TypeScript inference after React 19 upgrade
      const resourcesResult = resourcesData as { resource_type: string | null }[] | null;

      const resourceCounts =
        resourcesResult?.reduce((acc, log) => {
          if (log.resource_type) {
            acc[log.resource_type] = (acc[log.resource_type] || 0) + 1;
          }
          return acc;
        }, {} as Record<string, number>) || {};

      const topResources = (
        Object.entries(resourceCounts) as [string, number][]
      )
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([resource_type, count]) => ({
          resource_type,
          count,
          percentage: Math.round((count / (totalActivities || 1)) * 100)
        }));

      // Get activity trend (last 30 days)
      const trendData = await this.getActivityTrend(dateRange);

      // Get hourly distribution
      const hourlyData = await this.getHourlyDistribution(dateRange);

      // Get institution breakdown
      const institutionData = await this.getInstitutionBreakdown(dateRange);

      // Get most active user
      const { data: userActivityData } = await this.supabase
        .from('user_activity_logs')
        .select('user_id, profiles!fk_user_activity_logs_profile(full_name)')
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to);

      // Double cast required: Supabase infers SelectQueryError when FK isn't in schema cache
      const userActivityResult = userActivityData as unknown as { user_id: string; profiles: { full_name: string } | null }[] | null;

      const userCounts =
        userActivityResult?.reduce((acc, log) => {
          acc[log.user_id] = (acc[log.user_id] || 0) + 1;
          return acc;
        }, {} as Record<string, number>) || {};

      const mostActiveUserId = (
        Object.entries(userCounts) as [string, number][]
      ).sort(([, a], [, b]) => b - a)[0]?.[0];

      const mostActiveUser =
        userActivityResult?.find((log) => log.user_id === mostActiveUserId)
          ?.profiles?.full_name || 'Unknown';

      return {
        totalActivities: totalActivities || 0,
        uniqueUsers,
        uniqueSessions,
        avgActivitiesPerUser:
          uniqueUsers > 0
            ? Math.round((totalActivities || 0) / uniqueUsers)
            : 0,
        mostActiveUser,
        topActions,
        topResources,
        activityTrend: trendData,
        hourlyDistribution: hourlyData,
        institutionBreakdown: institutionData
      };
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error);
      throw error;
    }
  }

  /**
   * Get activity trend data
   */
  private static async getActivityTrend(dateRange: {
    from: string;
    to: string;
  }): Promise<Array<{ date: string; count: number }>> {
    try {
      const { data } = await (this.supabase as any).rpc('get_daily_activity_trend', {
        start_date: dateRange.from,
        end_date: dateRange.to
      });

      return data || [];
    } catch (error) {
      // Fallback if RPC doesn't exist
      const { data } = await this.supabase
        .from('user_activity_logs')
        .select('created_at')
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to);

      // Type cast to fix TypeScript inference after React 19 upgrade
      const trendData = data as { created_at: string }[] | null;

      const dailyCounts =
        trendData?.reduce((acc, log) => {
          const date = log.created_at.split('T')[0];
          acc[date] = (acc[date] || 0) + 1;
          return acc;
        }, {} as Record<string, number>) || {};

      return (Object.entries(dailyCounts) as [string, number][])
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));
    }
  }

  /**
   * Get hourly distribution data
   */
  private static async getHourlyDistribution(dateRange: {
    from: string;
    to: string;
  }): Promise<Array<{ hour: number; count: number }>> {
    try {
      const { data } = await this.supabase
        .from('user_activity_logs')
        .select('created_at')
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to);

      // Type cast to fix TypeScript inference after React 19 upgrade
      const hourlyData = data as { created_at: string }[] | null;

      const hourlyCounts =
        hourlyData?.reduce((acc, log) => {
          const hour = new Date(log.created_at).getHours();
          acc[hour] = (acc[hour] || 0) + 1;
          return acc;
        }, {} as Record<number, number>) || {};

      return Array.from({ length: 24 }, (_, hour) => ({
        hour,
        count: hourlyCounts[hour] || 0
      }));
    } catch (error) {
      console.error('Error getting hourly distribution:', error);
      return [];
    }
  }

  /**
   * Get institution breakdown data
   */
  private static async getInstitutionBreakdown(dateRange: {
    from: string;
    to: string;
  }): Promise<
    Array<{ institution_name: string; count: number; percentage: number }>
  > {
    try {
      const { data } = await this.supabase
        .from('user_activity_logs')
        .select(
          `
          institution_id,
          institutions(name)
        `
        )
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to)
        .not('institution_id', 'is', null);

      // Type cast to fix TypeScript inference after React 19 upgrade
      const institutionData = data as { institutions: { name: string } | null }[] | null;

      const totalWithInstitution = institutionData?.length || 0;

      const institutionCounts =
        institutionData?.reduce((acc, log) => {
          const name = log.institutions?.name || 'Unknown';
          acc[name] = (acc[name] || 0) + 1;
          return acc;
        }, {} as Record<string, number>) || {};

      return (Object.entries(institutionCounts) as [string, number][])
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([institution_name, count]) => ({
          institution_name,
          count,
          percentage: Math.round((count / totalWithInstitution) * 100)
        }));
    } catch (error) {
      console.error('Error getting institution breakdown:', error);
      return [];
    }
  }

  /**
   * Get activity logs for a specific user
   */
  static async getUserActivityLogs(
    userId: string,
    limit: number = 50
  ): Promise<UserActivityLogWithUser[]> {
    try {
      const { data, error } = await this.supabase
        .from('user_activity_logs')
        .select(
          `
          *,
          profiles!fk_user_activity_logs_profile(
            id,
            full_name,
            email,
            role
          ),
          institutions(
            id,
            name
          )
        `
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as unknown as UserActivityLogWithUser[];
    } catch (error) {
      console.error('Error fetching user activity logs:', error);
      throw error;
    }
  }

  /**
   * Delete old activity logs (for maintenance)
   */
  static async deleteOldLogs(daysToKeep: number = 365): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const { error } = await this.supabase
        .from('user_activity_logs')
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting old logs:', error);
      throw error;
    }
  }

  /**
   * Refresh activity statistics materialized view
   */
  static async refreshActivityStats(): Promise<void> {
    try {
      const { error } = await (this.supabase as any).rpc('refresh_activity_stats');
      if (error) throw error;
    } catch (error) {
      console.error('Error refreshing activity stats:', error);
      throw error;
    }
  }

  /**
   * Get security-related activities
   */
  static async getSecurityActivities(dateRange: {
    from: string;
    to: string;
  }): Promise<UserActivityLogWithUser[]> {
    try {
      const securityActions = [
        ACTIVITY_TYPES.LOGIN,
        ACTIVITY_TYPES.LOGOUT,
        ACTIVITY_TYPES.PASSWORD_CHANGE,
        ACTIVITY_TYPES.PASSWORD_RESET,
        ACTIVITY_TYPES.UNAUTHORIZED_ACCESS,
        ACTIVITY_TYPES.SECURITY_VIOLATION,
        ACTIVITY_TYPES.SUSPICIOUS_ACTIVITY
      ];

      const { data, error } = await this.supabase
        .from('user_activity_logs')
        .select(
          `
          *,
          profiles!fk_user_activity_logs_profile(
            id,
            full_name,
            email,
            role
          ),
          institutions(
            id,
            name
          )
        `
        )
        .in('action_type', securityActions)
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as UserActivityLogWithUser[];
    } catch (error) {
      console.error('Error fetching security activities:', error);
      throw error;
    }
  }

  /**
   * Utility method to determine activity severity
   */
  static getActivitySeverity(actionType: string, statusCode?: number): string {
    // Critical actions
    if (
      [
        ACTIVITY_TYPES.SECURITY_VIOLATION,
        ACTIVITY_TYPES.UNAUTHORIZED_ACCESS,
        ACTIVITY_TYPES.SUSPICIOUS_ACTIVITY,
        ACTIVITY_TYPES.USER_DELETE,
        ACTIVITY_TYPES.DELETE
      ].includes(actionType as any)
    ) {
      return ACTIVITY_SEVERITY.CRITICAL;
    }

    // High severity actions
    if (
      [
        ACTIVITY_TYPES.PASSWORD_CHANGE,
        ACTIVITY_TYPES.ROLE_ASSIGN,
        ACTIVITY_TYPES.PERMISSIONS_UPDATE,
        ACTIVITY_TYPES.USER_CREATE,
        ACTIVITY_TYPES.USER_UPDATE
      ].includes(actionType as any)
    ) {
      return ACTIVITY_SEVERITY.HIGH;
    }

    // Medium severity actions
    if (
      [
        ACTIVITY_TYPES.LOGIN,
        ACTIVITY_TYPES.LOGOUT,
        ACTIVITY_TYPES.CREATE,
        ACTIVITY_TYPES.UPDATE,
        ACTIVITY_TYPES.UPLOAD
      ].includes(actionType as any)
    ) {
      return ACTIVITY_SEVERITY.MEDIUM;
    }

    // Check status codes
    if (statusCode) {
      if (STATUS_CODE_CATEGORIES.SERVER_ERROR.includes(statusCode as any)) {
        return ACTIVITY_SEVERITY.HIGH;
      }
      if (STATUS_CODE_CATEGORIES.CLIENT_ERROR.includes(statusCode as any)) {
        return ACTIVITY_SEVERITY.MEDIUM;
      }
    }

    return ACTIVITY_SEVERITY.LOW;
  }
}
