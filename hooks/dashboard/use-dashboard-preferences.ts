import { useQuery, useMutation, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { DashboardPreferencesService } from '@/lib/services/dashboard/dashboard-preferences-service';
import { toast } from 'react-hot-toast';

/**
 * Get user's dashboard widget preferences
 */
export function useDashboardPreferences(
  userId: string | null,
  role: string | null
): UseQueryResult<Record<string, boolean>, Error> {
  return useQuery({
    queryKey: ['dashboard-preferences', userId, role],
    queryFn: async () => {
      if (!userId || !role) throw new Error('User ID and role required');
      return DashboardPreferencesService.getPreferences(userId, role);
    },
    enabled: !!userId && !!role,
    staleTime: Infinity, // Preferences rarely change
  });
}

/**
 * Update widget visibility preference
 */
export function useUpdatePreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      role,
      widgetId,
      isVisible
    }: {
      userId: string;
      role: string;
      widgetId: string;
      isVisible: boolean;
    }) => {
      return DashboardPreferencesService.updatePreference(
        userId,
        role,
        widgetId,
        isVisible
      );
    },
    onMutate: async ({ userId, role, widgetId, isVisible }) => {
      // Optimistic update
      const queryKey = ['dashboard-preferences', userId, role];
      await queryClient.cancelQueries({ queryKey });

      const previousPreferences = queryClient.getQueryData<Record<string, boolean>>(queryKey);

      queryClient.setQueryData<Record<string, boolean>>(queryKey, (old) => ({
        ...old,
        [widgetId]: isVisible
      }));

      return { previousPreferences };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousPreferences) {
        queryClient.setQueryData(
          ['dashboard-preferences', variables.userId, variables.role],
          context.previousPreferences
        );
      }
      toast.error('Failed to update preference');
    },
    onSuccess: () => {
      toast.success('Dashboard updated');
    },
  });
}

/**
 * Reset all preferences to default
 */
export function useResetPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return DashboardPreferencesService.resetPreferences(userId, role);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['dashboard-preferences', variables.userId, variables.role]
      });
      toast.success('Dashboard reset to defaults');
    },
    onError: () => {
      toast.error('Failed to reset preferences');
    },
  });
}
