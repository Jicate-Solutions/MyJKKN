'use client';

/**
 * Meetings — React Query Hooks
 *
 * Wraps MeetingService. Meeting mutations invalidate their own keys; a
 * confirmed suggested task also invalidates task + project keys (a new task
 * rolls up into the project).
 *
 * Pattern: hooks/projects/use-risks.ts
 * (createClientSupabaseClient + query-key factory + invalidate on mutate).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F12.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { MeetingService } from '@/lib/services/projects/meeting-service';
import { projectKeys } from '@/hooks/projects/use-projects';
import { taskKeys } from '@/hooks/projects/use-tasks';
import type {
  MeetingFilters,
  MeetingLinkInsert,
  MeetingLinkUpdate,
  SuggestedTaskItem,
} from '@/lib/services/projects/meeting-service';

function getSupabase() {
  return createClientSupabaseClient();
}

// ─── Query Keys ─────────────────────────────────────────────────────────────────

export const meetingKeys = {
  all: ['project-meetings'] as const,
  lists: () => [...meetingKeys.all, 'list'] as const,
  list: (filters: MeetingFilters) => [...meetingKeys.lists(), filters] as const,
  byProject: (projectId: string) =>
    [...meetingKeys.lists(), 'project', projectId] as const,
  details: () => [...meetingKeys.all, 'detail'] as const,
  detail: (id: string) => [...meetingKeys.details(), id] as const,
};

// ─── Queries ─────────────────────────────────────────────────────────────────────

export function useMeetings(
  projectId: string | null | undefined,
  filters: MeetingFilters = {}
) {
  const merged: MeetingFilters = {
    ...filters,
    projectId: projectId ?? filters.projectId ?? null,
  };
  return useQuery({
    queryKey: meetingKeys.list(merged),
    queryFn: () => MeetingService.listMeetings(getSupabase(), merged),
    enabled: !!merged.projectId,
  });
}

export function useMeeting(id: string | null | undefined) {
  return useQuery({
    queryKey: meetingKeys.detail(id ?? ''),
    queryFn: () => MeetingService.getMeeting(getSupabase(), id as string),
    enabled: !!id,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────────

function invalidateMeetingLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: meetingKeys.lists() });
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MeetingLinkInsert) =>
      MeetingService.createMeeting(getSupabase(), input),
    onSuccess: () => invalidateMeetingLists(queryClient),
  });
}

export function useUpdateMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MeetingLinkUpdate }) =>
      MeetingService.updateMeeting(getSupabase(), id, input),
    onSuccess: (meeting) => {
      invalidateMeetingLists(queryClient);
      queryClient.invalidateQueries({ queryKey: meetingKeys.detail(meeting.id) });
    },
  });
}

export function useDeleteMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => MeetingService.deleteMeeting(getSupabase(), id),
    onSuccess: () => invalidateMeetingLists(queryClient),
  });
}

/**
 * Confirm a suggested task from a meeting → creates a real project_task.
 * Invalidates task lists + project detail so counters stay current.
 */
export function useConfirmSuggestedTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (suggested: SuggestedTaskItem) =>
      MeetingService.confirmSuggestedTask(getSupabase(), projectId, suggested),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}
