// hooks/admission/use-interviews.ts
// React Query hooks for interview slots and bookings

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  InterviewService,
  type InterviewSlotRow,
  type InterviewBookingRow,
  type CreateSlotInput,
  type UpdateBookingInput,
  type InterviewSlotFilters,
} from '@/lib/services/admission/interview-service';

// Query keys
export const interviewKeys = {
  all: ['admission-interviews'] as const,
  slots: () => [...interviewKeys.all, 'slots'] as const,
  slotList: (institutionId: string, filters?: InterviewSlotFilters) =>
    [...interviewKeys.slots(), institutionId, filters] as const,
  slot: (slotId: string) => [...interviewKeys.all, 'slot', slotId] as const,
  bookings: () => [...interviewKeys.all, 'bookings'] as const,
  bookingList: (institutionId: string, filters?: { status?: string }) =>
    [...interviewKeys.bookings(), institutionId, filters] as const,
  bookingsForSlot: (slotId: string) =>
    [...interviewKeys.all, 'bookings-for-slot', slotId] as const,
  stats: (institutionId: string, interviewType?: string) =>
    [...interviewKeys.all, 'stats', institutionId, interviewType] as const,
};

/**
 * Hook to fetch interview slots
 */
export function useInterviewSlots(institutionId?: string, filters?: InterviewSlotFilters) {
  const query = useQuery({
    queryKey: interviewKeys.slotList(institutionId || '', filters),
    queryFn: () => InterviewService.getSlots(institutionId!, filters),
    enabled: !!institutionId,
  });

  return {
    slots: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch bookings for a specific slot
 */
export function useBookingsForSlot(slotId?: string) {
  const query = useQuery({
    queryKey: interviewKeys.bookingsForSlot(slotId || ''),
    queryFn: () => InterviewService.getBookingsForSlot(slotId!),
    enabled: !!slotId,
  });

  return {
    bookings: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch all bookings for an institution
 */
export function useInterviewBookings(
  institutionId?: string,
  filters?: { status?: string; slot_id?: string; application_id?: string }
) {
  const query = useQuery({
    queryKey: interviewKeys.bookingList(institutionId || '', filters),
    queryFn: () => InterviewService.getBookings(institutionId!, filters),
    enabled: !!institutionId,
  });

  return {
    bookings: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch interview stats
 */
export function useInterviewStats(institutionId?: string, interviewType?: string) {
  const query = useQuery({
    queryKey: interviewKeys.stats(institutionId || '', interviewType),
    queryFn: () => InterviewService.getStats(institutionId!, interviewType),
    enabled: !!institutionId,
  });

  return {
    stats: query.data || {
      totalSlots: 0,
      totalCapacity: 0,
      totalBooked: 0,
      todaySlots: 0,
      completedBookings: 0,
      avgScore: 0,
      totalBookings: 0,
    },
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/**
 * Hook to create a new interview slot
 */
export function useCreateInterviewSlot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSlotInput) => InterviewService.createSlot(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.slots() });
      queryClient.invalidateQueries({ queryKey: interviewKeys.all });
      toast.success('Interview slot created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create slot: ${error.message}`);
    },
  });
}

/**
 * Hook to update an interview slot
 */
export function useUpdateInterviewSlot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ slotId, updates }: { slotId: string; updates: Partial<InterviewSlotRow> }) =>
      InterviewService.updateSlot(slotId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.slots() });
      queryClient.invalidateQueries({ queryKey: interviewKeys.all });
      toast.success('Interview slot updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update slot: ${error.message}`);
    },
  });
}

/**
 * Hook to delete an interview slot
 */
export function useDeleteInterviewSlot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (slotId: string) => InterviewService.deleteSlot(slotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.slots() });
      queryClient.invalidateQueries({ queryKey: interviewKeys.all });
      toast.success('Interview slot deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete slot: ${error.message}`);
    },
  });
}

/**
 * Hook to update a booking (score, feedback, status)
 */
export function useUpdateInterviewBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bookingId, updates }: { bookingId: string; updates: UpdateBookingInput }) =>
      InterviewService.updateBooking(bookingId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.bookings() });
      queryClient.invalidateQueries({ queryKey: interviewKeys.all });
      toast.success('Booking updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update booking: ${error.message}`);
    },
  });
}
