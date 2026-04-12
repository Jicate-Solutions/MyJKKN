'use client';

/**
 * Startup Studio - Event Registration Hooks
 * Purpose: React Query hooks for team registration, checklists, and presentations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

// ============================================
// REGISTRATION
// ============================================

export function useEventRegistrations(eventId: string, filters?: Record<string, any>) {
  return useQuery({
    queryKey: ['startup-studio', 'events', eventId, 'registrations', filters],
    queryFn: () => apiClient.get(`/api/startup-studio/events/${eventId}/registrations`, { params: filters }),
    enabled: !!eventId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useRegisterTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/events/${eventId}/register`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['startup-studio', 'events'] });
      queryClient.invalidateQueries({ queryKey: ['startup-studio', 'teams'] });
    },
  });
}

export function useUpdateRegistrationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, teamIds, status }: { eventId: string; teamIds: string[]; status: string }) =>
      apiClient.post(`/api/startup-studio/events/${eventId}/registrations`, { team_ids: teamIds, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['startup-studio', 'events'] });
      queryClient.invalidateQueries({ queryKey: ['startup-studio', 'teams'] });
    },
  });
}

// ============================================
// CHECKLISTS
// ============================================

export function useEventChecklists(eventId: string) {
  return useQuery({
    queryKey: ['startup-studio', 'events', eventId, 'checklists'],
    queryFn: () => apiClient.get(`/api/startup-studio/events/${eventId}/checklists`),
    enabled: !!eventId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useToggleChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/events/${eventId}/checklists`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['startup-studio', 'events', variables.eventId, 'checklists'] });
    },
  });
}

export function useSeedChecklists() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId }: { eventId: string }) =>
      apiClient.post(`/api/startup-studio/events/${eventId}/checklists`, { action: 'seed' }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['startup-studio', 'events', variables.eventId, 'checklists'] });
    },
  });
}

// ============================================
// PRESENTATIONS (Demo Day)
// ============================================

export function usePresentationSlots(eventId: string) {
  return useQuery({
    queryKey: ['startup-studio', 'events', eventId, 'demo-day'],
    queryFn: () => apiClient.get(`/api/startup-studio/events/${eventId}/demo-day`),
    enabled: !!eventId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useGenerateSlots() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/events/${eventId}/demo-day`, { action: 'generate', ...data }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['startup-studio', 'events', variables.eventId, 'demo-day'] });
    },
  });
}

export function useAssignSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, slotId, teamId, submissionId }: { eventId: string; slotId: string; teamId: string; submissionId?: string }) =>
      apiClient.post(`/api/startup-studio/events/${eventId}/demo-day`, { action: 'assign', slot_id: slotId, team_id: teamId, submission_id: submissionId }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['startup-studio', 'events', variables.eventId, 'demo-day'] });
    },
  });
}

export function useUpdateSlotStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, slotId, status }: { eventId: string; slotId: string; status: string }) =>
      apiClient.post(`/api/startup-studio/events/${eventId}/demo-day`, { action: 'update_status', slot_id: slotId, status }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['startup-studio', 'events', variables.eventId, 'demo-day'] });
    },
  });
}
