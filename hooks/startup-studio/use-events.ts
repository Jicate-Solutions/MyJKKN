'use client';

/**
 * Startup Studio - Event Hooks
 * Purpose: React Query hooks for startup studio events (hackathons, sprints, etc.)
 * Connected to: startup-studio events API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

// ============================================
// QUERY HOOKS - EVENTS
// ============================================

/**
 * Fetch all events with optional filters
 */
export function useSSEvents(filters?: Record<string, any>) {
  return useQuery({
    queryKey: startupStudioKeys.events.list(filters),
    queryFn: () => apiClient.get('/api/startup-studio/events', { params: filters }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single event by ID
 */
export function useSSEvent(id: string) {
  return useQuery({
    queryKey: startupStudioKeys.events.detail(id),
    queryFn: () => apiClient.get(`/api/startup-studio/events/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single event by slug
 */
export function useSSEventBySlug(slug: string) {
  return useQuery({
    queryKey: startupStudioKeys.events.bySlug(slug),
    queryFn: () => apiClient.get(`/api/startup-studio/events/slug/${slug}`),
    enabled: !!slug,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch all active events
 */
export function useActiveEvents() {
  return useQuery({
    queryKey: startupStudioKeys.events.active(),
    queryFn: () => apiClient.get('/api/startup-studio/events/active'),
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS - EVENTS
// ============================================

/**
 * Create a new event
 */
export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/events', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.events.all });
    },
  });
}

/**
 * Update an existing event
 */
export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/events/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.events.all });
    },
  });
}

/**
 * Delete an event
 */
export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/startup-studio/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.events.all });
    },
  });
}
