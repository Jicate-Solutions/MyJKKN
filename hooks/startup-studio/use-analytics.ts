'use client';

/**
 * Startup Studio - Analytics Hooks
 * Purpose: React Query hooks for startup studio dashboards and analytics
 * Connected to: startup-studio analytics API
 */

import { useQuery } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

// ============================================
// QUERY HOOKS - ANALYTICS (read-only)
// ============================================

/**
 * Fetch dashboard statistics
 */
export function useDashboardStats(eventId?: string) {
  return useQuery({
    queryKey: startupStudioKeys.analytics.dashboard(eventId),
    queryFn: () => apiClient.get('/api/startup-studio/analytics/dashboard', {
      params: eventId ? { event_id: eventId } : undefined,
    }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch cycle status distribution
 */
export function useCycleStatusDistribution(eventId?: string) {
  return useQuery({
    queryKey: startupStudioKeys.analytics.cycleStatus(eventId),
    queryFn: () => apiClient.get('/api/startup-studio/analytics/cycle-status', {
      params: eventId ? { event_id: eventId } : undefined,
    }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch problem theme distribution
 */
export function useProblemThemeDistribution() {
  return useQuery({
    queryKey: startupStudioKeys.analytics.problemThemes(),
    queryFn: () => apiClient.get('/api/startup-studio/analytics/problem-themes'),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch NIF stage analytics
 */
export function useNifStageAnalytics() {
  return useQuery({
    queryKey: startupStudioKeys.analytics.nifStages(),
    queryFn: () => apiClient.get('/api/startup-studio/analytics/nif-stages'),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch impact summary
 */
export function useImpactSummary(eventId?: string) {
  return useQuery({
    queryKey: startupStudioKeys.analytics.impact(eventId),
    queryFn: () => apiClient.get('/api/startup-studio/analytics/impact', {
      params: eventId ? { event_id: eventId } : undefined,
    }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch step completion rates
 */
export function useStepCompletionRates(eventId?: string) {
  return useQuery({
    queryKey: startupStudioKeys.analytics.stepCompletion(eventId),
    queryFn: () => apiClient.get('/api/startup-studio/analytics/step-completion', {
      params: eventId ? { event_id: eventId } : undefined,
    }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}
