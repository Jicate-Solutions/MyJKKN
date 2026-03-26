// hooks/startup-studio/use-events.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EventService } from '@/lib/services/startup-studio/event-service';
import { useAuth } from '@/hooks/use-auth';
import type { EventFilters, UpdateEventDto, CreateEventDto, LearnerParticipationFilters, NotParticipatedFilters } from '@/types/startup-studio';

import { toast } from 'sonner';

// Guards against Next.js 15 Dynamic Route Prefetching placeholders like "%%drp:id:abc%%"
// that are passed as route params during speculative prefetch — they are not real UUIDs
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: string | undefined): boolean => !!id && !id.includes('%%drp:') && UUID_REGEX.test(id);

export function useEvents(filters?: EventFilters) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['startup-events', filters],
    queryFn: () => EventService.getEvents(filters),
    enabled: !authLoading,
    staleTime: 30 * 1000,
    retry: 3,
  });
}

export function useEvent(id: string | undefined) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['startup-event', id],
    queryFn: () => EventService.getEvent(id!),
    // Wait for auth session to restore before fetching — RLS requires authenticated role.
    // Without this, the first fetch fires unauthenticated, RLS returns null, and the
    // page incorrectly shows "Event not found" until a manual refresh.
    enabled: !authLoading && isValidUUID(id),
    staleTime: 30 * 1000,
    retry: 3,
  });
}

export function useEventStats(eventId: string | undefined) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['startup-event-stats', eventId],
    queryFn: () => EventService.getEventStats(eventId!),
    enabled: !authLoading && isValidUUID(eventId),
    staleTime: 15 * 1000,
    retry: 3,
  });
}

export function useLearnerParticipationStats(
  eventId: string | undefined,
  filters: LearnerParticipationFilters = {}
) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['startup-learner-participation', eventId, filters],
    queryFn: () => EventService.getLearnerParticipationStats(eventId!, filters),
    enabled: !authLoading && isValidUUID(eventId),
    staleTime: 30 * 1000,
    retry: 3,
  });
}

export function useNotParticipatedByInstitution(
  eventId: string | undefined,
  filters: LearnerParticipationFilters = {}
) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['startup-not-participated-by-institution', eventId, filters],
    queryFn: () => EventService.getNotParticipatedByInstitution(eventId!, filters),
    enabled: !authLoading && isValidUUID(eventId),
    staleTime: 30 * 1000,
    retry: 3,
  });
}

export function useNotParticipatedLearners(
  eventId: string | undefined,
  filters: NotParticipatedFilters = {}
) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['startup-not-participated', eventId, filters],
    queryFn: () => EventService.getNotParticipatedLearners(eventId!, filters),
    enabled: !authLoading && isValidUUID(eventId),
    staleTime: 30 * 1000,
    retry: 3,
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateEventDto }) =>
      EventService.updateEvent(id, dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['startup-events'] });
      queryClient.invalidateQueries({ queryKey: ['startup-event', data.id] });
      toast.success('Event updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update event');
    },
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dto, userId }: { dto: CreateEventDto; userId: string }) =>
      EventService.createEvent(dto, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['startup-events'] });
      toast.success('Event created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create event');
    },
  });
}

/**
 * Fetches only active (status = 'active') events.
 * Used by the New Cycle form to pick an event for a cycle.
 */
export function useActiveEvents() {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['startup-events', { status: 'active' }],
    queryFn: () => EventService.getEvents({ status: 'active' } as EventFilters),
    enabled: !authLoading,
    staleTime: 30 * 1000,
    retry: 3,
  });
}

/**
 * Alias for useEvents — used by the Submissions list to populate the event filter dropdown.
 */
export function useSSEvents(filters?: EventFilters) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['startup-events', filters ?? '__all__'],
    queryFn: () => EventService.getEvents(filters),
    enabled: !authLoading,
    staleTime: 30 * 1000,
    retry: 3,
  });
}
