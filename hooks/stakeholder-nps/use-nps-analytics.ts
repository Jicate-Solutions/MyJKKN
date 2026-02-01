'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NPSService } from '@/lib/services/stakeholder-nps/nps-service';
import type { AnalyticsFilters, NPSAnalytics, NPSDashboardData } from '@/types/stakeholder-nps';
import { toast } from 'react-hot-toast';

// Query keys for cache management
export const npsAnalyticsKeys = {
  all: ['nps-analytics'] as const,
  lists: () => [...npsAnalyticsKeys.all, 'list'] as const,
  list: (filters: AnalyticsFilters) => [...npsAnalyticsKeys.lists(), filters] as const,
  dashboard: (institutionId: string) => [...npsAnalyticsKeys.all, 'dashboard', institutionId] as const
};

/**
 * Hook for fetching analytics data with filters
 */
export function useNPSAnalytics(initialFilters: AnalyticsFilters = {}) {
  const [filters, setFilters] = useState<AnalyticsFilters>(initialFilters);

  const query = useQuery({
    queryKey: npsAnalyticsKeys.list(filters),
    queryFn: () => NPSService.getAnalytics(filters),
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  const updateFilters = useCallback((newFilters: Partial<AnalyticsFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  return {
    analytics: query.data || [],
    loading: query.isLoading,
    error: query.error?.message || null,
    filters,
    updateFilters,
    resetFilters,
    refetch: query.refetch
  };
}

/**
 * Hook for fetching dashboard data
 */
export function useNPSDashboard(institutionId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: npsAnalyticsKeys.dashboard(institutionId),
    queryFn: () => NPSService.getDashboardData(institutionId),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000, // 2 minutes for dashboard data
    retry: 1
  });

  const refreshDashboard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: npsAnalyticsKeys.dashboard(institutionId) });
    toast.success('Dashboard refreshed');
  }, [queryClient, institutionId]);

  return {
    dashboard: query.data || {
      overall_nps: 0,
      total_responses: 0,
      response_rate: 0,
      by_stakeholder: {
        parent: { score: 0, responses: 0, promoters: 0, passives: 0, detractors: 0 },
        learner: { score: 0, responses: 0, promoters: 0, passives: 0, detractors: 0 },
        alumni: { score: 0, responses: 0, promoters: 0, passives: 0, detractors: 0 },
        industry: { score: 0, responses: 0, promoters: 0, passives: 0, detractors: 0 },
        staff: { score: 0, responses: 0, promoters: 0, passives: 0, detractors: 0 }
      },
      by_department: {},
      trend: [],
      recent_feedback: []
    } as NPSDashboardData,
    loading: query.isLoading,
    error: query.error?.message || null,
    refreshDashboard,
    refetch: query.refetch
  };
}

/**
 * Hook for recalculating analytics
 */
export function useRecalculateAnalytics() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const recalculate = useCallback(async (surveyId: string) => {
    try {
      setLoading(true);
      await NPSService.recalculateAnalytics(surveyId);
      queryClient.invalidateQueries({ queryKey: npsAnalyticsKeys.all });
      toast.success('Analytics recalculated successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to recalculate analytics';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  return {
    recalculate,
    loading
  };
}
