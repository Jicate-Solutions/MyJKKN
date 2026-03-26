'use client';

/**
 * Startup Studio - Marketing & Outreach Hooks
 * Purpose: React Query hooks for marketing activities CRUD and dashboard analytics
 * Connected to: startup-studio marketing API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Fetch marketing activities with optional filters
 */
export function useMarketingActivities(filters?: Record<string, any>) {
  const { userProfile } = usePermissions();

  return useQuery({
    queryKey: startupStudioKeys.marketing.list(filters),
    queryFn: () =>
      apiClient.get('/api/startup-studio/marketing', { params: filters }),
    enabled: !!userProfile,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single marketing activity by ID
 */
export function useMarketingActivity(id: string) {
  const { userProfile } = usePermissions();

  return useQuery({
    queryKey: startupStudioKeys.marketing.detail(id),
    queryFn: () => apiClient.get(`/api/startup-studio/marketing/${id}`),
    enabled: !!userProfile && !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch marketing dashboard analytics
 */
export function useMarketingDashboard(institutionId?: string) {
  const { userProfile } = usePermissions();

  return useQuery({
    queryKey: startupStudioKeys.marketing.dashboard(institutionId),
    queryFn: () =>
      apiClient.get('/api/startup-studio/marketing/dashboard', {
        params: institutionId ? { institution_id: institutionId } : undefined,
      }),
    enabled: !!userProfile,
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Create a new marketing activity
 */
export function useCreateMarketingActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/marketing', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.marketing.all });
      toast.success('Marketing activity created');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to create marketing activity');
    },
  });
}

/**
 * Update an existing marketing activity
 */
export function useUpdateMarketingActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/marketing/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.marketing.all });
      toast.success('Marketing activity updated');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update marketing activity');
    },
  });
}

/**
 * Delete a marketing activity
 */
export function useDeleteMarketingActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/api/startup-studio/marketing/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.marketing.all });
      toast.success('Marketing activity deleted');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to delete marketing activity');
    },
  });
}
