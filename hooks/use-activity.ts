import { useState, useEffect, useCallback } from 'react';
import {
  UserActivityLogWithUser,
  ActivityLogFilters,
  ActivityLogsPaginatedResponse,
  ActivityDashboardMetrics,
  CreateActivityLogRequest
} from '@/types/activity';

interface UseActivityLogsProps {
  filters?: ActivityLogFilters;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function useActivityLogs({
  filters = {},
  page = 1,
  limit = 50,
  sortBy = 'created_at',
  sortOrder = 'desc'
}: UseActivityLogsProps = {}) {
  const [data, setData] = useState<ActivityLogsPaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivityLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sortBy,
        sortOrder,
        ...Object.fromEntries(
          Object.entries(filters).filter(
            ([_, value]) => value !== undefined && value !== ''
          )
        )
      });

      const response = await fetch(`/api/activity?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch activity logs');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [filters, page, limit, sortBy, sortOrder]);

  useEffect(() => {
    fetchActivityLogs();
  }, [fetchActivityLogs]);

  const refresh = useCallback(() => {
    fetchActivityLogs();
  }, [fetchActivityLogs]);

  return {
    data,
    loading,
    error,
    refresh
  };
}

interface UseActivityMetricsProps {
  period?: 'day' | 'week' | 'month' | 'year';
  dateFrom?: string;
  dateTo?: string;
}

export function useActivityMetrics({
  period = 'week',
  dateFrom,
  dateTo
}: UseActivityMetricsProps = {}) {
  const [metrics, setMetrics] = useState<ActivityDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        period,
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo && { date_to: dateTo })
      });

      const response = await fetch(`/api/activity/metrics?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch activity metrics');
      }

      const result = await response.json();
      setMetrics(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [period, dateFrom, dateTo]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const refresh = useCallback(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return {
    metrics,
    loading,
    error,
    refresh
  };
}

export function useActivityLogger() {
  const [isLogging, setIsLogging] = useState(false);

  const logActivity = useCallback(
    async (activityData: Omit<CreateActivityLogRequest, 'user_id'>) => {
      try {
        setIsLogging(true);

        const response = await fetch('/api/activity', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(activityData)
        });

        if (!response.ok) {
          throw new Error('Failed to log activity');
        }

        return await response.json();
      } catch (error) {
        console.error('Error logging activity:', error);
        throw error;
      } finally {
        setIsLogging(false);
      }
    },
    []
  );

  return {
    logActivity,
    isLogging
  };
}

// Utility hook for real-time activity feed
export function useActivityFeed(limit: number = 20) {
  const [activities, setActivities] = useState<UserActivityLogWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecentActivities = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        limit: limit.toString(),
        sortBy: 'created_at',
        sortOrder: 'desc'
      });

      const response = await fetch(`/api/activity?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch recent activities');
      }

      const result = await response.json();
      setActivities(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchRecentActivities();

    // Set up polling for real-time updates (every 30 seconds)
    const interval = setInterval(fetchRecentActivities, 30000);

    return () => clearInterval(interval);
  }, [fetchRecentActivities]);

  const refresh = useCallback(() => {
    fetchRecentActivities();
  }, [fetchRecentActivities]);

  return {
    activities,
    loading,
    error,
    refresh
  };
}

// Hook for user-specific activity logs
export function useUserActivity(userId: string, limit: number = 50) {
  const [activities, setActivities] = useState<UserActivityLogWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserActivities = useCallback(async () => {
    if (!userId) {
      setActivities([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        user_id: userId,
        limit: limit.toString(),
        sortBy: 'created_at',
        sortOrder: 'desc'
      });

      const response = await fetch(`/api/activity?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch user activities');
      }

      const result = await response.json();
      setActivities(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [userId, limit]);

  useEffect(() => {
    fetchUserActivities();
  }, [fetchUserActivities]);

  const refresh = useCallback(() => {
    fetchUserActivities();
  }, [fetchUserActivities]);

  return {
    activities,
    loading,
    error,
    refresh
  };
}

// Hook for filtering and searching activities
export function useActivityFilters() {
  const [filters, setFilters] = useState<ActivityLogFilters>({});

  const updateFilter = useCallback(
    (key: keyof ActivityLogFilters, value: any) => {
      setFilters((prev) => ({
        ...prev,
        [key]: value
      }));
    },
    []
  );

  const removeFilter = useCallback((key: keyof ActivityLogFilters) => {
    setFilters((prev) => {
      const newFilters = { ...prev };
      delete newFilters[key];
      return newFilters;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  const hasActiveFilters = Object.keys(filters).length > 0;

  return {
    filters,
    updateFilter,
    removeFilter,
    clearFilters,
    hasActiveFilters
  };
}
