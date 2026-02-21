// hooks/admission/use-activity-alerts.ts
// React Query hooks for Activity Alert rules and history

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ActivityAlertService,
  type ActivityAlertRule,
  type AlertEventType,
  type AlertRuleFilters,
  type AlertHistoryFilters,
} from '@/lib/services/admission/activity-alert-service';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const activityAlertKeys = {
  all: ['activity-alerts'] as const,
  rules: () => [...activityAlertKeys.all, 'rules'] as const,
  rulesList: (filters: AlertRuleFilters) => [...activityAlertKeys.rules(), filters] as const,
  history: () => [...activityAlertKeys.all, 'history'] as const,
  historyList: (filters: AlertHistoryFilters) => [...activityAlertKeys.history(), filters] as const,
  eventTypes: () => [...activityAlertKeys.all, 'event-types'] as const,
};

// ============================================================================
// RULES HOOKS
// ============================================================================

export function useAlertRules(institutionId?: string) {
  const query = useQuery({
    queryKey: activityAlertKeys.rulesList({ institutionId: institutionId || '' }),
    queryFn: () => ActivityAlertService.getAlertRules({ institutionId: institutionId! }),
    enabled: !!institutionId,
  });

  return {
    rules: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useAlertHistory(filters: AlertHistoryFilters) {
  const query = useQuery({
    queryKey: activityAlertKeys.historyList(filters),
    queryFn: () => ActivityAlertService.getAlertHistory(filters),
    enabled: !!filters.institutionId,
  });

  return {
    entries: query.data?.entries || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useEventTypes() {
  return {
    eventTypes: ActivityAlertService.getEventTypes(),
  };
}

// ============================================================================
// MUTATIONS
// ============================================================================

export function useAlertMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: activityAlertKeys.rules() });
  };

  const initializeRules = useMutation({
    mutationFn: (institutionId: string) => ActivityAlertService.initializeDefaultRules(institutionId),
    onSuccess: () => {
      toast.success('Alert rules initialized');
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to initialize alert rules');
    },
  });

  const toggleRule = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      ActivityAlertService.toggleAlertRule(id, isEnabled),
    onSuccess: (_, variables) => {
      toast.success(variables.isEnabled ? 'Alert enabled' : 'Alert disabled');
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to toggle alert');
    },
  });

  const updateRule = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      ActivityAlertService.updateAlertRule(id, data),
    onSuccess: () => {
      toast.success('Alert rule updated');
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update alert rule');
    },
  });

  const createRule = useMutation({
    mutationFn: (data: any) => ActivityAlertService.createAlertRule(data),
    onSuccess: () => {
      toast.success('Alert rule created');
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create alert rule');
    },
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) => ActivityAlertService.deleteAlertRule(id),
    onSuccess: () => {
      toast.success('Alert rule deleted');
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete alert rule');
    },
  });

  return {
    initializeRules,
    toggleRule,
    updateRule,
    createRule,
    deleteRule,
  };
}
