// hooks/admission/use-activities.ts
// React Query hooks for admission lead activities and enhanced timeline

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ActivityService,
  type LeadActivity,
  type TimelineEntry,
  type CreateActivityInput,
  type ActivityStats,
} from '@/lib/services/admission/activity-service';

// Query keys
export const activityKeys = {
  all: ['lead-activities'] as const,
  lists: () => [...activityKeys.all, 'list'] as const,
  list: (leadId: string) => [...activityKeys.lists(), leadId] as const,
  timeline: (leadId: string) => [...activityKeys.all, 'timeline', leadId] as const,
  stats: (leadId: string) => [...activityKeys.all, 'stats', leadId] as const,
};

/**
 * Hook to fetch activities for a lead
 */
export function useLeadActivities(leadId?: string) {
  const query = useQuery({
    queryKey: activityKeys.list(leadId || ''),
    queryFn: () => ActivityService.getActivities(leadId!),
    enabled: !!leadId,
  });

  return {
    activities: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch enhanced timeline (activities + stage changes)
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useEnhancedTimeline(leadId?: string) {
  const query = useQuery({
    queryKey: activityKeys.timeline(leadId || ''),
    queryFn: () => ActivityService.getEnhancedTimeline(leadId!),
    enabled: !!leadId && UUID_REGEX.test(leadId),
  });

  return {
    timeline: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch activity stats for a lead
 */
export function useActivityStats(leadId?: string) {
  const query = useQuery({
    queryKey: activityKeys.stats(leadId || ''),
    queryFn: () => ActivityService.getActivityStats(leadId!),
    enabled: !!leadId,
    staleTime: 30000, // 30 seconds
  });

  return {
    stats: query.data || {
      totalActivities: 0,
      callsCount: 0,
      emailsCount: 0,
      meetingsCount: 0,
      notesCount: 0,
      stageChanges: 0,
    } as ActivityStats,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * Hook for activity mutations (create, update, delete)
 */
export function useActivityMutations(leadId?: string) {
  const queryClient = useQueryClient();

  const invalidateQueries = () => {
    if (leadId) {
      queryClient.invalidateQueries({ queryKey: activityKeys.list(leadId) });
      queryClient.invalidateQueries({ queryKey: activityKeys.timeline(leadId) });
      queryClient.invalidateQueries({ queryKey: activityKeys.stats(leadId) });
    }
    // Also invalidate the legacy timeline key
    queryClient.invalidateQueries({ queryKey: ['lead-timeline', leadId] });
  };

  const createActivity = useMutation({
    mutationFn: (input: CreateActivityInput) => ActivityService.createActivity(input),
    onSuccess: () => {
      toast.success('Activity logged successfully');
      invalidateQueries();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to log activity');
    },
  });

  const updateActivity = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CreateActivityInput> }) =>
      ActivityService.updateActivity(id, updates),
    onSuccess: () => {
      toast.success('Activity updated successfully');
      invalidateQueries();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update activity');
    },
  });

  const deleteActivity = useMutation({
    mutationFn: (id: string) => ActivityService.deleteActivity(id),
    onSuccess: () => {
      toast.success('Activity deleted');
      invalidateQueries();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete activity');
    },
  });

  return {
    createActivity,
    updateActivity,
    deleteActivity,
    isCreating: createActivity.isPending,
    isUpdating: updateActivity.isPending,
    isDeleting: deleteActivity.isPending,
  };
}
