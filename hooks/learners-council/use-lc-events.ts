'use client';

// hooks/learners-council/use-lc-events.ts
// LC-003: Event Coordination - React Query Hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { LCEventService } from '@/lib/services/learners-council/event-service';
import type { CreateEventDto, UpdateEventDto } from '@/types/learners-council';

// Query keys factory
export const lcEventKeys = {
  all: ['lc-events'] as const,
  lists: () => [...lcEventKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...lcEventKeys.lists(), filters] as const,
  details: () => [...lcEventKeys.all, 'detail'] as const,
  detail: (id: string) => [...lcEventKeys.details(), id] as const,
  calendar: (start: string, end: string) => [...lcEventKeys.all, 'calendar', start, end] as const,
  myRegistered: (userId: string) => [...lcEventKeys.all, 'my-registered', userId] as const,
  feedbackSummary: (eventId: string) => [...lcEventKeys.all, 'feedback-summary', eventId] as const,
  venueAvailability: (venueId: string, date: string) => [...lcEventKeys.all, 'venue', venueId, date] as const,
};

// ============================================================================
// QUERY HOOKS
// ============================================================================

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
    staleTime: 2 * 60 * 1000,
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
 * Hook to fetch events by date range — for calendar view
 */
export function useEventsByDateRange(
  startDate: string,
  endDate: string,
  filters?: { scope?: string; institution_id?: string; status?: string }
) {
  return useQuery({
    queryKey: lcEventKeys.calendar(startDate, endDate),
    queryFn: () => LCEventService.getEventsByDateRange(startDate, endDate, filters),
    enabled: !!startDate && !!endDate,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch events the user is registered for
 */
export function useMyRegisteredEvents(userId: string) {
  return useQuery({
    queryKey: lcEventKeys.myRegistered(userId),
    queryFn: () => LCEventService.getMyRegisteredEvents(userId),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch aggregated feedback summary for an event
 */
export function useEventFeedbackSummary(eventId: string) {
  return useQuery({
    queryKey: lcEventKeys.feedbackSummary(eventId),
    queryFn: () => LCEventService.getEventFeedbackSummary(eventId),
    enabled: !!eventId,
  });
}

/**
 * Hook to check venue availability
 */
export function useCheckVenueAvailability(
  venueId: string,
  date: string,
  startTime: string,
  endTime: string
) {
  return useQuery({
    queryKey: lcEventKeys.venueAvailability(venueId, date),
    queryFn: () => LCEventService.checkVenueAvailability(venueId, date, startTime, endTime),
    enabled: !!venueId && !!date && !!startTime && !!endTime,
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

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
 * UPDATED: Now includes approverRole parameter
 */
export function useApproveEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      approverId,
      approverRole,
      comments,
    }: {
      eventId: string;
      approverId: string;
      approverRole: string;
      comments?: string;
    }) => LCEventService.approveEvent(eventId, approverId, approverRole, comments),
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
 * UPDATED: Now includes approverRole parameter
 */
export function useRejectEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      approverId,
      approverRole,
      comments,
    }: {
      eventId: string;
      approverId: string;
      approverRole: string;
      comments: string;
    }) => LCEventService.rejectEvent(eventId, approverId, approverRole, comments),
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
 * Hook to publish an approved event
 */
export function usePublishEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => LCEventService.publishEvent(eventId),
    onSuccess: (updatedEvent) => {
      toast.success('Event published');
      queryClient.invalidateQueries({ queryKey: lcEventKeys.detail(updatedEvent.id) });
      queryClient.invalidateQueries({ queryKey: lcEventKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to publish event');
    },
  });
}

/**
 * Hook to mark event as completed
 */
export function useCompleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => LCEventService.completeEvent(eventId),
    onSuccess: (updatedEvent) => {
      toast.success('Event marked as completed');
      queryClient.invalidateQueries({ queryKey: lcEventKeys.detail(updatedEvent.id) });
      queryClient.invalidateQueries({ queryKey: lcEventKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to complete event');
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
      queryClient.invalidateQueries({ queryKey: lcEventKeys.myRegistered(variables.userId) });
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
      queryClient.invalidateQueries({ queryKey: lcEventKeys.myRegistered(variables.userId) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cancel registration');
    },
  });
}

/**
 * Hook to mark attendance for a single participant
 */
export function useMarkAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      participantId,
      attended,
    }: {
      eventId: string;
      participantId: string;
      attended: boolean;
    }) => LCEventService.markAttendance(eventId, participantId, attended),
    onSuccess: (_, variables) => {
      toast.success(variables.attended ? 'Marked as attended' : 'Marked as absent');
      queryClient.invalidateQueries({ queryKey: lcEventKeys.detail(variables.eventId) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to mark attendance');
    },
  });
}

/**
 * Hook to bulk mark attendance for multiple participants
 */
export function useBulkMarkAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      attendeeIds,
    }: {
      eventId: string;
      attendeeIds: string[];
    }) => LCEventService.bulkMarkAttendance(eventId, attendeeIds),
    onSuccess: (_, variables) => {
      toast.success(`Marked ${variables.attendeeIds.length} participants as attended`);
      queryClient.invalidateQueries({ queryKey: lcEventKeys.detail(variables.eventId) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to mark attendance');
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
      queryClient.invalidateQueries({ queryKey: lcEventKeys.feedbackSummary(variables.eventId) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit feedback');
    },
  });
}

/**
 * Hook to export event data (returns data for CSV generation)
 */
export function useExportEventData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => LCEventService.exportEventData(eventId),
    onSuccess: () => {
      toast.success('Event data exported');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to export event data');
    },
  });
}
