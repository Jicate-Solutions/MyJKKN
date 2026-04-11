'use client';

/**
 * Startup Studio - My Event Hooks
 * Purpose: React Query hooks for participant-facing views (my team, my assignment)
 */

import { useQuery } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

/**
 * Fetch the current user's team for an event
 */
export function useMyTeam(eventId: string) {
  return useQuery({
    queryKey: ['startup-studio', 'events', eventId, 'my-team'],
    queryFn: () =>
      apiClient.get<{ team: any; message?: string }>(
        `/api/startup-studio/events/${eventId}/my-team`
      ),
    enabled: !!eventId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch the current user's venue assignments (mentor/judge) for an event
 */
export function useMyAssignment(eventId: string) {
  return useQuery({
    queryKey: ['startup-studio', 'events', eventId, 'my-assignment'],
    queryFn: () =>
      apiClient.get<{ assignments: any[]; message?: string }>(
        `/api/startup-studio/events/${eventId}/my-assignment`
      ),
    enabled: !!eventId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}
