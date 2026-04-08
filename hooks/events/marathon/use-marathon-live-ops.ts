// hooks/events/marathon/use-marathon-live-ops.ts
// React Query hooks for marathon live ops — polling-based real-time race day data.
// Created: 2026-04-07

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  MarathonLiveOpsService,
  type LiveOpsData,
} from '@/lib/services/events/marathon/marathon-live-ops-service';
import type { CreateMarathonIncidentDto } from '@/types/events-marathon';

// ============================================================================
// Query Keys
// ============================================================================

const KEYS = {
  all: ['marathon-live-ops'] as const,
  liveData: (eventId: string) => [...KEYS.all, 'live', eventId] as const,
  runnerDetail: (eventId: string, bib: string) =>
    [...KEYS.all, 'runner', eventId, bib] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Main live ops data hook — polls every 10 seconds when enabled.
 * Enabled defaults to true; pass false to pause polling (e.g. pre-race).
 */
export function useLiveOpsData(eventId: string, enabled = true) {
  return useQuery<LiveOpsData>({
    queryKey: KEYS.liveData(eventId),
    queryFn: () => MarathonLiveOpsService.getLiveOpsData(eventId),
    enabled: !!eventId && enabled,
    refetchInterval: enabled ? 10_000 : false,
    refetchIntervalInBackground: false,
  });
}

/**
 * Fetch detailed data for a single runner.
 */
export function useRunnerDetail(eventId: string, bib: string) {
  return useQuery({
    queryKey: KEYS.runnerDetail(eventId, bib),
    queryFn: () => MarathonLiveOpsService.getRunnerDetail(eventId, bib),
    enabled: !!eventId && !!bib,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Create a new incident.
 */
export function useCreateIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateMarathonIncidentDto) =>
      MarathonLiveOpsService.createIncident(dto),
    onSuccess: (incident) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.liveData(incident.event_id),
      });
      toast.success(`Incident "${incident.title}" reported`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to report incident');
    },
  });
}

/**
 * Resolve an incident with notes.
 */
export function useResolveIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, resolutionNotes }: { id: string; resolutionNotes: string }) =>
      MarathonLiveOpsService.resolveIncident(id, resolutionNotes),
    onSuccess: (incident) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.liveData(incident.event_id),
      });
      toast.success('Incident resolved');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to resolve incident');
    },
  });
}

/**
 * Check in a volunteer.
 */
export function useCheckinVolunteer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: {
      event_id: string;
      volunteer_name: string;
      volunteer_phone?: string;
      station: string;
      role?: string;
    }) => MarathonLiveOpsService.checkinVolunteer(dto),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.liveData(variables.event_id),
      });
      toast.success(`${variables.volunteer_name} checked in`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to check in volunteer');
    },
  });
}

/**
 * Check out a volunteer.
 */
export function useCheckoutVolunteer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, eventId }: { id: string; eventId: string }) =>
      MarathonLiveOpsService.checkoutVolunteer(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.liveData(variables.eventId),
      });
      toast.success('Volunteer checked out');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to check out volunteer');
    },
  });
}

/**
 * Delete a volunteer check-in record permanently.
 */
export function useDeleteVolunteer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, eventId }: { id: string; eventId: string }) =>
      MarathonLiveOpsService.deleteVolunteer(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.liveData(variables.eventId),
      });
      toast.success('Volunteer deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete volunteer');
    },
  });
}
