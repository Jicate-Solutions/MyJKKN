'use client';

/**
 * Startup Studio - Venue Hooks
 * Purpose: React Query hooks for venue, staff, and team allocation management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

// Helper for DELETE requests that need a body (apiClient.delete doesn't support body)
async function deleteWithBody(path: string, body: Record<string, any>): Promise<void> {
  const response = await fetch(path, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || `Delete failed with status ${response.status}`);
  }
}

// ============================================
// VENUES
// ============================================

export function useEventVenues(eventId: string, dayType: 'build_day' | 'demo_day') {
  return useQuery({
    queryKey: ['startup-studio', 'events', eventId, 'venues', dayType],
    queryFn: () =>
      apiClient.get(`/api/startup-studio/events/${eventId}/venues`, {
        params: { dayType },
      }),
    enabled: !!eventId && !!dayType,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useAddEventVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/events/${eventId}/venues`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['startup-studio', 'events', variables.eventId, 'venues'],
      });
    },
  });
}

export function useUpdateEventVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      venueId,
      data,
    }: {
      eventId: string;
      venueId: string;
      data: Record<string, any>;
    }) =>
      apiClient.patch(
        `/api/startup-studio/events/${eventId}/venues/${venueId}`,
        data
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['startup-studio', 'events', variables.eventId, 'venues'],
      });
    },
  });
}

export function useRemoveEventVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, venueId }: { eventId: string; venueId: string }) =>
      apiClient.delete(
        `/api/startup-studio/events/${eventId}/venues/${venueId}`
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['startup-studio', 'events', variables.eventId, 'venues'],
      });
    },
  });
}

export function useAutoAllocateTeams() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      dayType,
    }: {
      eventId: string;
      dayType: 'build_day' | 'demo_day';
    }) =>
      apiClient.post(
        `/api/startup-studio/events/${eventId}/venues/auto-allocate`,
        { day_type: dayType }
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['startup-studio', 'events', variables.eventId, 'venues'],
      });
    },
  });
}

export function useVenueStats(eventId: string, dayType: 'build_day' | 'demo_day') {
  return useQuery({
    queryKey: ['startup-studio', 'events', eventId, 'venues', dayType, 'stats'],
    queryFn: () =>
      apiClient.get(`/api/startup-studio/events/${eventId}/venues`, {
        params: { dayType, stats: true },
      }),
    enabled: !!eventId && !!dayType,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ============================================
// STAFF ASSIGNMENT
// ============================================

export function useAvailableMentors(eventId: string, search?: string) {
  return useQuery({
    queryKey: ['startup-studio', 'events', eventId, 'venues', 'mentors', search],
    queryFn: () =>
      apiClient.get(`/api/startup-studio/events/${eventId}/venues/mentors`, {
        params: search ? { search } : undefined,
      }),
    enabled: !!eventId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useAssignVenueStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      venueId,
      userIds,
      role,
    }: {
      eventId: string;
      venueId: string;
      userIds: string[];
      role: string;
    }) =>
      apiClient.post(
        `/api/startup-studio/events/${eventId}/venues/${venueId}/staff`,
        { user_ids: userIds, role }
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['startup-studio', 'events', variables.eventId, 'venues'],
      });
    },
  });
}

export function useRemoveVenueStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      venueId,
      userId,
    }: {
      eventId: string;
      venueId: string;
      userId: string;
    }) =>
      deleteWithBody(
        `/api/startup-studio/events/${eventId}/venues/${venueId}/staff`,
        { user_id: userId }
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['startup-studio', 'events', variables.eventId, 'venues'],
      });
    },
  });
}

// ============================================
// TEAM ALLOCATION
// ============================================

export function useAllocateTeamsToVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      venueId,
      teamIds,
    }: {
      eventId: string;
      venueId: string;
      teamIds: string[];
    }) =>
      apiClient.post(
        `/api/startup-studio/events/${eventId}/venues/${venueId}/teams`,
        { team_ids: teamIds }
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['startup-studio', 'events', variables.eventId, 'venues'],
      });
      queryClient.invalidateQueries({
        queryKey: ['startup-studio', 'events', variables.eventId, 'registrations'],
      });
    },
  });
}

export function useRemoveTeamFromVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      venueId,
      teamId,
    }: {
      eventId: string;
      venueId: string;
      teamId: string;
    }) =>
      deleteWithBody(
        `/api/startup-studio/events/${eventId}/venues/${venueId}/teams`,
        { team_id: teamId }
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['startup-studio', 'events', variables.eventId, 'venues'],
      });
    },
  });
}
