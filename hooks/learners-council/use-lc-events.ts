'use client';

// hooks/learners-council/use-lc-events.ts
// LC-003: Event Coordination - React Query Hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { LCEventService } from '@/lib/services/learners-council/event-service';
import type { CreateEventDto, UpdateEventDto } from '@/types/learners-council';

// Query keys
export const lcEventKeys = {
  all: ['lc-events'] as const,
  lists: () => [...lcEventKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...lcEventKeys.lists(), filters] as const,
  details: () => [...lcEventKeys.all, 'detail'] as const,
  detail: (id: string) => [...lcEventKeys.details(), id] as const,
};

/**
 * Hook to fetch events with filters
 */
export function useEvents(filters: {
  status?: string;
  scope?: string;
  institution_id?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: lcEventKeys.list(filters),
    queryFn: () => LCEventService.getEvents(filters),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to fetch single event detail
 */
export function useEventDetail(id: string) {
  return useQuery({
    queryKey: lcEventKeys.detail(id),
    queryFn: () => LCEventService.getEventById(id),
    enabled: !!id,
  });
}

/**
 * Hook to create a new event
 */
export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, userId }: { data: CreateEventDto; userId: string }) =>
      LCEventService.createEvent(data, userId),
    onSuccess: () => {
      toast.success('Event created successfully');
      queryClient.invalidateQueries({ queryKey: lcEventKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create event');
    },
  });
}

/**
 * Hook to update an event
 */
export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEventDto }) =>
      LCEventService.updateEvent(id, data),
    onSuccess: (updatedEvent) => {
      toast.success('Event updated successfully');
      queryClient.invalidateQueries({ queryKey: lcEventKeys.detail(updatedEvent.id) });
      queryClient.invalidateQueries({ queryKey: lcEventKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update event');
    },
  });
}

/**
 * Hook to submit event for approval
 */
export function useSubmitForApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => LCEventService.submitEventForApproval(id),
    onSuccess: (updatedEvent) => {
      toast.success('Event submitted for approval');
      queryClient.invalidateQueries({ queryKey: lcEventKeys.detail(updatedEvent.id) });
      queryClient.invalidateQueries({ queryKey: lcEventKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit event');
    },
  });
}

/**
 * Hook to approve an event
 */
export function useApproveEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      approverId,
      comments,
    }: {
      eventId: string;
      approverId: string;
      comments?: string;
    }) => LCEventService.approveEvent(eventId, approverId, comments),
    onSuccess: (updatedEvent) => {
      toast.success('Event approved');
      queryClient.invalidateQueries({ queryKey: lcEventKeys.detail(updatedEvent.id) });
      queryClient.invalidateQueries({ queryKey: lcEventKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to approve event');
    },
  });
}

/**
 * Hook to reject an event
 */
export function useRejectEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      approverId,
      comments,
    }: {
      eventId: string;
      approverId: string;
      comments: string;
    }) => LCEventService.rejectEvent(eventId, approverId, comments),
    onSuccess: (updatedEvent) => {
      toast.success('Event rejected');
      queryClient.invalidateQueries({ queryKey: lcEventKeys.detail(updatedEvent.id) });
      queryClient.invalidateQueries({ queryKey: lcEventKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reject event');
    },
  });
}

/**
 * Hook to register for an event
 */
export function useRegisterForEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, userId }: { eventId: string; userId: string }) =>
      LCEventService.registerForEvent(eventId, userId),
    onSuccess: (_, variables) => {
      toast.success('Registered for event');
      queryClient.invalidateQueries({ queryKey: lcEventKeys.detail(variables.eventId) });
      queryClient.invalidateQueries({ queryKey: lcEventKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to register');
    },
  });
}

/**
 * Hook to cancel event registration
 */
export function useCancelRegistration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, userId }: { eventId: string; userId: string }) =>
      LCEventService.cancelRegistration(eventId, userId),
    onSuccess: (_, variables) => {
      toast.success('Registration cancelled');
      queryClient.invalidateQueries({ queryKey: lcEventKeys.detail(variables.eventId) });
      queryClient.invalidateQueries({ queryKey: lcEventKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cancel registration');
    },
  });
}

/**
 * Hook to submit event feedback
 */
export function useSubmitFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      userId,
      feedback,
      rating,
    }: {
      eventId: string;
      userId: string;
      feedback: string;
      rating: number;
    }) => LCEventService.submitFeedback(eventId, userId, feedback, rating),
    onSuccess: (_, variables) => {
      toast.success('Feedback submitted');
      queryClient.invalidateQueries({ queryKey: lcEventKeys.detail(variables.eventId) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit feedback');
    },
  });
}
