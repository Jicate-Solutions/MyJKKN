import { createClientSupabaseClient } from '@/lib/supabase/client';
import { UserDashboardStats, UserDashboardFilters } from '@/types/users';

export class UserDashboardService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get comprehensive user dashboard statistics
   */
  static async getUserDashboardStats(
    filters: UserDashboardFilters = {}
  ): Promise<UserDashboardStats> {
    try {
      const params = new URLSearchParams();

      // Add filters to query params
      if (filters.institutionId) {
        params.append('institution_id', filters.institutionId);
      }

      if (filters.roles && filters.roles.length > 0) {
        params.append('roles', filters.roles.join(','));
      }

      if (filters.status && filters.status !== 'all') {
        params.append('status', filters.status);
      }

      if (filters.dateRange?.from && filters.dateRange?.to) {
        params.append('date_from', filters.dateRange.from.toISOString());
        params.append('date_to', filters.dateRange.to.toISOString());
      }

      const response = await fetch(
        `/api/users/dashboard-stats?${params.toString()}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch dashboard stats');
      }

      const data: UserDashboardStats = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching user dashboard stats:', error);
      throw error;
    }
  }

  /**
   * Get user activity summary for quick insights
   * Fixed: 2025-10-27 - Added pagination to fetch all users (removed 1000 row limit)
   */
  static async getUserActivitySummary(institutionId?: string) {
    try {
      // Fetch all users with pagination
      let allData: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = this.supabase
          .from('profiles')
          .select('last_login, is_active, created_at')
          .order('last_login', { ascending: false })
          .range(from, from + batchSize - 1);

        // Only apply institution filter if institutionId is provided
        if (institutionId) {
          query = query.eq('institution_id', institutionId);
        }

        const { data: batch, error } = await query;

        if (error) throw error;

        if (batch && batch.length > 0) {
          allData = allData.concat(batch);
          from += batchSize;

          if (batch.length < batchSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      const data = allData;
      console.log(`[user-activity-summary] Fetched ${data.length} total users`);

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const recentlyActive =
        data?.filter(
          (user) => user.last_login && new Date(user.last_login) >= sevenDaysAgo
        ).length || 0;

      const monthlyActive =
        data?.filter(
          (user) =>
            user.last_login && new Date(user.last_login) >= thirtyDaysAgo
        ).length || 0;

      const neverLoggedIn =
        data?.filter((user) => !user.last_login).length || 0;

      return {
        totalUsers: data?.length || 0,
        recentlyActive,
        monthlyActive,
        neverLoggedIn,
        activeRate: data?.length ? (recentlyActive / data.length) * 100 : 0
      };
    } catch (error) {
      console.error('Error fetching user activity summary:', error);
      throw error;
    }
  }

  /**
   * Get role-based user statistics
   * Fixed: 2025-10-27 - Added pagination to fetch all users (removed 1000 row limit)
   */
  static async getRoleBasedStats(institutionId?: string) {
    try {
      // Fetch all users with pagination
      let allData: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = this.supabase
          .from('profiles')
          .select('role, is_active')
          .range(from, from + batchSize - 1);

        if (institutionId) {
          query = query.eq('institution_id', institutionId);
        }

        const { data: batch, error } = await query;

        if (error) throw error;

        if (batch && batch.length > 0) {
          allData = allData.concat(batch);
          from += batchSize;

          if (batch.length < batchSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      const data = allData;
      console.log(`[role-based-stats] Fetched ${data.length} total users`);

      const roleStats: Record<string, { total: number; active: number }> = {};

      data?.forEach((user) => {
        if (!roleStats[user.role]) {
          roleStats[user.role] = { total: 0, active: 0 };
        }
        roleStats[user.role].total++;
        if (user.is_active) {
          roleStats[user.role].active++;
        }
      });

      return Object.entries(roleStats).map(([role, stats]) => ({
        role,
        total: stats.total,
        active: stats.active,
        inactive: stats.total - stats.active,
        activePercentage:
          stats.total > 0 ? (stats.active / stats.total) * 100 : 0
      }));
    } catch (error) {
      console.error('Error fetching role-based stats:', error);
      throw error;
    }
  }

  /**
   * Get user registration trends
   */
  static async getRegistrationTrends(
    days: number = 30,
    institutionId?: string
  ) {
    try {
      const endDate = new Date();
      const startDate = new Date(
        endDate.getTime() - days * 24 * 60 * 60 * 1000
      );

      let query = this.supabase
        .from('profiles')
        .select('created_at, role')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at');

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Group by date
      const trendData: Record<
        string,
        { count: number; byRole: Record<string, number> }
      > = {};

      data?.forEach((user) => {
        const date = new Date((user as any).created_at).toISOString().split('T')[0];
        if (!trendData[date]) {
          trendData[date] = { count: 0, byRole: {} };
        }
        trendData[date].count++;
        trendData[date].byRole[(user as any).role] =
          (trendData[date].byRole[(user as any).role] || 0) + 1;
      });

      // Fill in missing dates with zero counts
      const trends = [];
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];

        trends.push({
          date: dateStr,
          count: trendData[dateStr]?.count || 0,
          byRole: trendData[dateStr]?.byRole || {}
        });
      }

      return trends;
    } catch (error) {
      console.error('Error fetching registration trends:', error);
      throw error;
    }
  }

  /**
   * Get institution-wise user distribution
   * Fixed: 2025-10-27 - Added pagination to fetch all users (removed 1000 row limit)
   */
  static async getInstitutionDistribution() {
    try {
      // Fetch all users with pagination
      let allData: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error } = await this.supabase
          .from('profiles')
          .select(`
            institution_id,
            role,
            is_active,
            institutions(name, counselling_code)
          `)
          .range(from, from + batchSize - 1);

        if (error) throw error;

        if (batch && batch.length > 0) {
          allData = allData.concat(batch);
          from += batchSize;

          if (batch.length < batchSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      const data = allData;
      console.log(`[institution-distribution] Fetched ${data.length} total users`);

      const institutionStats: Record<
        string,
        {
          name: string;
          counsellingCode: string;
          users: any[];
          totalUsers: number;
          activeUsers: number;
          byRole: Record<string, number>;
        }
      > = {};

      data?.forEach((user) => {
        const instId = user.institution_id || 'no_institution';
        const instName = user.institutions?.[0]?.name || 'No Institution';
        const counsellingCode = user.institutions?.[0]?.counselling_code || '';

        if (!institutionStats[instId]) {
          institutionStats[instId] = {
            name: instName,
            counsellingCode,
            users: [],
            totalUsers: 0,
            activeUsers: 0,
            byRole: {}
          };
        }

        institutionStats[instId].users.push(user);
        institutionStats[instId].totalUsers++;

        if (user.is_active) {
          institutionStats[instId].activeUsers++;
        }

        institutionStats[instId].byRole[user.role] =
          (institutionStats[instId].byRole[user.role] || 0) + 1;
      });

      return Object.entries(institutionStats)
        .map(([id, stats]) => ({
          id,
          name: stats.name,
          counsellingCode: stats.counsellingCode,
          totalUsers: stats.totalUsers,
          activeUsers: stats.activeUsers,
          inactiveUsers: stats.totalUsers - stats.activeUsers,
          byRole: stats.byRole,
          activePercentage:
            stats.totalUsers > 0
              ? (stats.activeUsers / stats.totalUsers) * 100
              : 0
        }))
        .sort((a, b) => b.totalUsers - a.totalUsers);
    } catch (error) {
      console.error('Error fetching institution distribution:', error);
      throw error;
    }
  }

  /**
   * Get top users by activity
   */
  static async getTopUsers(
    limit: number = 10,
    type: 'recent_login' | 'recent_registration' = 'recent_login',
    institutionId?: string
  ) {
    try {
      let query = this.supabase
        .from('profiles')
        .select(
          `
          id,
          full_name,
          email,
          role,
          last_login,
          created_at,
          institutions(name)
        `
        )
        .limit(limit);

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      if (type === 'recent_login') {
        query = query
          .not('last_login', 'is', null)
          .order('last_login', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query;

      if (error) throw error;

      return (
        data?.map((user: any) => ({
          id: user.id,
          name: user.full_name || 'Unknown',
          email: user.email,
          role: user.role,
          institution: user.institutions?.[0]?.name,
          lastLogin: user.last_login,
          registeredAt: user.created_at
        })) || []
      );
    } catch (error) {
      console.error('Error fetching top users:', error);
      throw error;
    }
  }

  /**
   * Export user dashboard data
   */
  static async exportDashboardData(
    filters: UserDashboardFilters = {},
    format: 'csv' | 'excel' = 'csv'
  ) {
    try {
      const params = new URLSearchParams();
      params.append('format', format);

      if (filters.institutionId) {
        params.append('institutionId', filters.institutionId);
      }
      if (filters.roles) {
        params.append('roles', filters.roles.join(','));
      }
      if (filters.status) {
        params.append('status', filters.status);
      }
      if (filters.activityPeriod) {
        params.append('activityPeriod', filters.activityPeriod);
      }

      const response = await fetch(
        `/api/users/dashboard-export?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to export dashboard data');
      }

      return response.blob();
    } catch (error) {
      console.error('Error exporting dashboard data:', error);
      throw error;
    }
  }
}
