/**
 * Child App Analytics Service - JSON-based Implementation
 * Manages analytics and logging using consolidated JSON structure
 */

import { createServiceRoleClient } from '@/lib/supabase/server';

export interface HourlyStats {
  hour: number;
  successful_logins: number;
  failed_logins: number;
  api_calls: number;
  unique_users: number;
  avg_response_time?: number;
}

export interface DailySummary {
  total_users: number;
  new_users: number;
  total_sessions: number;
  total_api_calls: number;
  avg_session_duration: number;
  peak_concurrent_users: number;
  error_rate: number;
  most_active_hour?: number;
  top_endpoints?: Array<{ endpoint: string; calls: number }>;
}

export interface ErrorLog {
  timestamp: string;
  error_type: string;
  error_message: string;
  user_id?: string;
  endpoint?: string;
  ip_address?: string;
  count: number;
}

export interface DetailedLog {
  timestamp: string;
  user_id: string;
  action: 'login' | 'logout' | 'api_call' | 'token_refresh' | 'error';
  status: 'success' | 'error';
  ip_address?: string;
  user_agent?: string;
  endpoint?: string;
  response_time?: number;
  details?: Record<string, any>;
}

export class ChildAppAnalyticsService {
  /**
   * Log user activity (optimized for high-frequency calls)
   */
  static async logActivity(params: {
    appId: string;
    userId: string;
    action: DetailedLog['action'];
    status: DetailedLog['status'];
    ipAddress?: string;
    userAgent?: string;
    endpoint?: string;
    responseTime?: number;
    details?: Record<string, any>;
  }): Promise<void> {
    try {
      const supabase = createServiceRoleClient();
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const hour = now.getHours();

      const logEntry: DetailedLog = {
        timestamp: now.toISOString(),
        user_id: params.userId,
        action: params.action,
        status: params.status,
        ip_address: params.ipAddress,
        user_agent: params.userAgent,
        endpoint: params.endpoint,
        response_time: params.responseTime,
        details: params.details
      };

      // Update or create analytics record for today
      await supabase.rpc('update_analytics_with_activity', {
        p_app_id: params.appId,
        p_date: today,
        p_hour: hour,
        p_action: params.action,
        p_status: params.status,
        p_user_id: params.userId,
        p_log_entry: logEntry
      });
    } catch (error) {
      // Don't let analytics failures break the main flow
      console.error('Error logging activity:', error);
    }
  }

  /**
   * Log authentication event
   */
  static async logAuth(params: {
    appId: string;
    userId: string;
    action: 'login' | 'logout' | 'token_refresh';
    status: 'success' | 'error';
    ipAddress?: string;
    userAgent?: string;
    errorMessage?: string;
  }): Promise<void> {
    await this.logActivity({
      ...params,
      details: params.errorMessage
        ? { error_message: params.errorMessage }
        : undefined
    });
  }

  /**
   * Log API call
   */
  static async logApiCall(params: {
    appId: string;
    userId: string;
    endpoint: string;
    status: 'success' | 'error';
    responseTime: number;
    ipAddress?: string;
    errorMessage?: string;
  }): Promise<void> {
    await this.logActivity({
      appId: params.appId,
      userId: params.userId,
      action: 'api_call',
      status: params.status,
      endpoint: params.endpoint,
      responseTime: params.responseTime,
      ipAddress: params.ipAddress,
      details: params.errorMessage
        ? { error_message: params.errorMessage }
        : undefined
    });
  }

  /**
   * Get analytics for a specific date range
   */
  static async getAnalytics(params: {
    appId: string;
    startDate: string;
    endDate: string;
  }): Promise<{
    dailyStats: Array<{
      date: string;
      summary: DailySummary;
      hourlyStats: HourlyStats[];
    }>;
    totalUsers: number;
    totalSessions: number;
    avgErrorRate: number;
  }> {
    try {
      const supabase = createServiceRoleClient();

      const { data, error } = await supabase
        .from('child_app_analytics')
        .select('analytics_date, hourly_stats, daily_summary, error_logs')
        .eq('app_id', params.appId)
        .gte('analytics_date', params.startDate)
        .lte('analytics_date', params.endDate)
        .order('analytics_date', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch analytics: ${error.message}`);
      }

      const dailyStats = (data || []).map((record) => ({
        date: record.analytics_date,
        summary: record.daily_summary as DailySummary,
        hourlyStats: record.hourly_stats as HourlyStats[]
      }));

      // Calculate aggregated metrics
      const totalUsers = dailyStats.reduce(
        (sum, day) => sum + day.summary.total_users,
        0
      );
      const totalSessions = dailyStats.reduce(
        (sum, day) => sum + day.summary.total_sessions,
        0
      );
      const avgErrorRate =
        dailyStats.length > 0
          ? dailyStats.reduce((sum, day) => sum + day.summary.error_rate, 0) /
            dailyStats.length
          : 0;

      return {
        dailyStats,
        totalUsers,
        totalSessions,
        avgErrorRate
      };
    } catch (error) {
      console.error('Error getting analytics:', error);
      return {
        dailyStats: [],
        totalUsers: 0,
        totalSessions: 0,
        avgErrorRate: 0
      };
    }
  }

  /**
   * Get real-time statistics for today
   */
  static async getTodayStats(appId: string): Promise<{
    activeUsers: number;
    todayLogins: number;
    todayApiCalls: number;
    currentErrorRate: number;
    peakHour: { hour: number; users: number } | null;
  }> {
    try {
      const supabase = createServiceRoleClient();
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('child_app_analytics')
        .select('hourly_stats, daily_summary')
        .eq('app_id', appId)
        .eq('analytics_date', today)
        .single();

      if (error || !data) {
        return {
          activeUsers: 0,
          todayLogins: 0,
          todayApiCalls: 0,
          currentErrorRate: 0,
          peakHour: null
        };
      }

      const hourlyStats = data.hourly_stats as HourlyStats[];
      const dailySummary = data.daily_summary as DailySummary;

      // Find peak hour
      const peakHour = hourlyStats.reduce(
        (peak: { hour: number; users: number } | null, current) =>
          !peak || current.unique_users > peak.users
            ? { hour: current.hour, users: current.unique_users }
            : peak,
        null
      );

      // Count active users (those who had activity in last hour)
      const currentHour = new Date().getHours();
      const lastHourStats = hourlyStats.find(
        (stat) => stat.hour === currentHour
      );
      const activeUsers = lastHourStats?.unique_users || 0;

      return {
        activeUsers,
        todayLogins: dailySummary.total_sessions,
        todayApiCalls: dailySummary.total_api_calls,
        currentErrorRate: dailySummary.error_rate,
        peakHour
      };
    } catch (error) {
      console.error('Error getting today stats:', error);
      return {
        activeUsers: 0,
        todayLogins: 0,
        todayApiCalls: 0,
        currentErrorRate: 0,
        peakHour: null
      };
    }
  }

  /**
   * Get error analysis
   */
  static async getErrorAnalysis(params: {
    appId: string;
    startDate: string;
    endDate: string;
  }): Promise<{
    errorsByType: Array<{
      type: string;
      count: number;
      lastOccurrence: string;
    }>;
    errorTrends: Array<{
      date: string;
      errorCount: number;
      totalRequests: number;
    }>;
    topErrorEndpoints: Array<{ endpoint: string; errorCount: number }>;
  }> {
    try {
      const supabase = createServiceRoleClient();

      const { data, error } = await supabase
        .from('child_app_analytics')
        .select('analytics_date, error_logs, daily_summary')
        .eq('app_id', params.appId)
        .gte('analytics_date', params.startDate)
        .lte('analytics_date', params.endDate)
        .order('analytics_date', { ascending: true });

      if (error || !data) {
        return { errorsByType: [], errorTrends: [], topErrorEndpoints: [] };
      }

      const errorsByType = new Map<
        string,
        { count: number; lastOccurrence: string }
      >();
      const errorTrends: Array<{
        date: string;
        errorCount: number;
        totalRequests: number;
      }> = [];
      const endpointErrors = new Map<string, number>();

      data.forEach((record) => {
        const errorLogs = record.error_logs as ErrorLog[];
        const summary = record.daily_summary as DailySummary;

        let dailyErrorCount = 0;

        errorLogs.forEach((error) => {
          // Group by error type
          const existing = errorsByType.get(error.error_type) || {
            count: 0,
            lastOccurrence: ''
          };
          errorsByType.set(error.error_type, {
            count: existing.count + error.count,
            lastOccurrence:
              error.timestamp > existing.lastOccurrence
                ? error.timestamp
                : existing.lastOccurrence
          });

          // Count errors by endpoint
          if (error.endpoint) {
            endpointErrors.set(
              error.endpoint,
              (endpointErrors.get(error.endpoint) || 0) + error.count
            );
          }

          dailyErrorCount += error.count;
        });

        errorTrends.push({
          date: record.analytics_date,
          errorCount: dailyErrorCount,
          totalRequests: summary.total_api_calls
        });
      });

      return {
        errorsByType: Array.from(errorsByType.entries()).map(
          ([type, data]) => ({
            type,
            count: data.count,
            lastOccurrence: data.lastOccurrence
          })
        ),
        errorTrends,
        topErrorEndpoints: Array.from(endpointErrors.entries())
          .map(([endpoint, errorCount]) => ({ endpoint, errorCount }))
          .sort((a, b) => b.errorCount - a.errorCount)
          .slice(0, 10)
      };
    } catch (error) {
      console.error('Error getting error analysis:', error);
      return { errorsByType: [], errorTrends: [], topErrorEndpoints: [] };
    }
  }

  /**
   * Clean up old analytics data (for data retention)
   */
  static async cleanupOldData(
    retentionDays: number = 90
  ): Promise<{ deletedRecords: number }> {
    try {
      const supabase = createServiceRoleClient();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffDateString = cutoffDate.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('child_app_analytics')
        .delete()
        .lt('analytics_date', cutoffDateString);

      if (error) {
        throw new Error(`Failed to cleanup old data: ${error.message}`);
      }

      return { deletedRecords: 0 }; // Supabase delete doesn't return count
    } catch (error) {
      console.error('Error cleaning up old data:', error);
      return { deletedRecords: 0 };
    }
  }
}
