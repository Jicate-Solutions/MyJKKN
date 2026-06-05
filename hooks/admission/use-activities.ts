// hooks/admission/use-activities.ts
// React Query hooks for admission lead activities and enhanced timeline

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ActivityService,
  type CreateActivityInput,
  type ActivityStats,
} from '@/lib/services/admission/activity-service';

// UUID format check - declared before use to avoid temporal dead zone issues
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    enabled: !!leadId && UUID_REGEX.test(leadId),
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
    enabled: !!leadId && UUID_REGEX.test(leadId),
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
    if (!leadId) return;
    queryClient.invalidateQueries({ queryKey: activityKeys.list(leadId) });
    queryClient.invalidateQueries({ queryKey: activityKeys.timeline(leadId) });
    queryClient.invalidateQueries({ queryKey: activityKeys.stats(leadId) });
    // (Dropped the legacy ['lead-timeline', leadId] invalidation — no query is
    // mounted on that key anywhere in the leads UI; it was dead work.)
  };

  const createActivity = useMutation({
    mutationFn: (input: CreateActivityInput) => ActivityService.createActivity(input),
    // Optimistic insert: show the new note in the timeline the instant Save is
    // clicked, before the RPC round-trip resolves; reconcile on settle.
    onMutate: async (input: CreateActivityInput) => {
      if (!leadId) return {};
      const timelineKey = activityKeys.timeline(leadId);
      await queryClient.cancelQueries({ queryKey: timelineKey });
      const previousTimeline = queryClient.getQueryData(timelineKey);
      const subject =
        input.title ||
        input.activity_type
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (l: string) => l.toUpperCase());
      const optimisticEntry = ActivityService.activityToTimelineEntry({
        id: `optimistic-${Date.now()}`,
        lead_id: input.lead_id,
        activity_type: input.activity_type,
        subject,
        title: subject,
        description: input.description ?? null,
        outcome: input.outcome ?? null,
        scheduled_at: input.scheduled_at ?? null,
        completed_at: null,
        created_by: null,
        created_at: new Date().toISOString(),
      });
      queryClient.setQueryData(timelineKey, (old: unknown) =>
        Array.isArray(old) ? [optimisticEntry, ...old] : [optimisticEntry],
      );
      return { previousTimeline };
    },
    onError: (error: Error, _input, context) => {
      // Roll back the optimistic entry on failure.
      if (leadId && context && 'previousTimeline' in context) {
        queryClient.setQueryData(
          activityKeys.timeline(leadId),
          (context as { previousTimeline: unknown }).previousTimeline,
        );
      }
      toast.error(error.message || 'Failed to log activity');
    },
    onSuccess: () => {
      toast.success('Activity logged successfully');
    },
    // Reconcile with the server (real id / author / stats) once the write settles
    // — runs AFTER the optimistic update, so the user already sees the note.
    onSettled: () => {
      invalidateQueries();
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
