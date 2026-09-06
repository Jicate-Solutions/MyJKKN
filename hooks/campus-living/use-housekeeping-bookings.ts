'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  HousekeepingBookingService,
  type BookingBoardParams,
  type MarkableBookingStatus,
} from '@/lib/services/campus-living/housekeeping-booking-service';

export interface AssignBookingInput {
  bookingId: string;
  profileId?: string | null;
  name?: string | null;
  clear?: boolean;
}

// Query key factory — all keys namespaced under 'housekeeping-bookings'.
export const housekeepingBookingKeys = {
  all: ['housekeeping-bookings'] as const,
  availableSlots: (blockId: string | undefined, date: string | undefined) =>
    ['housekeeping-bookings', 'available-slots', blockId, date] as const,
  myBookings: (fromDate?: string) =>
    ['housekeeping-bookings', 'my-bookings', fromDate ?? 'all'] as const,
  entitlement: () => ['housekeeping-bookings', 'entitlement'] as const,
  board: (institutionId: string | undefined, params: BookingBoardParams) =>
    [
      'housekeeping-bookings',
      'board',
      institutionId,
      params.date ?? null,
      params.dateFrom ?? null,
      params.dateTo ?? null,
    ] as const,
  assignableStaff: (institutionId: string | undefined) =>
    ['housekeeping-bookings', 'assignable-staff', institutionId] as const,
};

// Resident-friendly messages for the RPC envelope error codes
// (fn_housekeeping_book_slot / cancel contracts — spec 2026-06-10).
const BOOKING_ERROR_MESSAGES: Record<string, string> = {
  disabled: 'Housekeeping slot booking is currently turned off',
  no_active_allocation: 'You need an active hostel allocation to book a cleaning slot',
  tier_not_entitled: 'Your hostel tier does not include housekeeping slot booking',
  quota_exhausted: 'You have used all your included cleaning slots for this week',
  slot_full: 'That slot has just been filled — please pick another',
  outside_window: 'That time is outside the daily cleaning window',
  too_far_ahead: 'That date is too far ahead to book yet',
  past_slot: 'That slot has already passed',
  duplicate: 'You already have a booking for this slot',
  // cancel / mark codes (fn_housekeeping_cancel_booking / _mark_booking)
  cutoff_passed: 'Too close to the slot time to cancel — please contact the hostel office',
  forbidden: 'You can only manage your own bookings',
  invalid_status: 'That status change is not allowed',
  not_cancellable: 'This booking can no longer be cancelled',
  not_found: 'This booking no longer exists',
  not_markable: 'Only booked or assigned slots can be marked complete or no-show',
  // assign codes (fn_housekeeping_assign_booking)
  not_assignable: 'Only booked or assigned slots can be assigned',
  missing_assignee: 'Pick a staff member or type a name',
};

function bookingErrorMessage(errorCode?: string, fallback = 'Request failed'): string {
  return (errorCode && BOOKING_ERROR_MESSAGES[errorCode]) || fallback;
}

// --- Queries ---

export function useAvailableSlots(
  blockId: string | undefined,
  date: string | undefined
) {
  return useQuery({
    queryKey: housekeepingBookingKeys.availableSlots(blockId, date),
    queryFn: () => HousekeepingBookingService.getAvailableSlots(blockId!, date!),
    enabled: !!blockId && !!date,
  });
}

export function useMyBookings(fromDate?: string) {
  return useQuery({
    queryKey: housekeepingBookingKeys.myBookings(fromDate),
    queryFn: () => HousekeepingBookingService.getMyBookings(fromDate),
  });
}

export function useMyEntitlement() {
  return useQuery({
    queryKey: housekeepingBookingKeys.entitlement(),
    queryFn: () => HousekeepingBookingService.getMyEntitlement(),
  });
}

/**
 * `institutionId` undefined = all institutions the caller can access — a
 * legitimate scope, not a missing param, so the query always runs. (It used
 * to be `enabled: !!institutionId`, which left super admins and users with no
 * profiles.institution_id staring at an empty board.)
 */
export function useBookingBoard(
  institutionId?: string,
  params: BookingBoardParams = {}
) {
  return useQuery({
    queryKey: housekeepingBookingKeys.board(institutionId, params),
    queryFn: () => HousekeepingBookingService.getBookingBoard(institutionId, params),
  });
}

export function useAssignableStaff(institutionId: string | undefined) {
  return useQuery({
    queryKey: housekeepingBookingKeys.assignableStaff(institutionId),
    queryFn: () => HousekeepingBookingService.getAssignableStaff(institutionId!),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000,
  });
}

// --- Mutations ---

export function useBookSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      date,
      slotStart,
      notes,
    }: {
      date: string;
      slotStart: string;
      notes?: string;
    }) => HousekeepingBookingService.bookSlot(date, slotStart, notes),
    onSuccess: (result) => {
      // Refresh slot grid + lists either way — a slot_full rejection means
      // the availability the user is looking at is already stale.
      queryClient.invalidateQueries({ queryKey: housekeepingBookingKeys.all });
      if (result.success) {
        toast.success('Cleaning slot booked');
      } else {
        toast.error(bookingErrorMessage(result.error_code, 'Could not book this slot'));
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to book slot: ${error.message}`);
    },
  });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) =>
      HousekeepingBookingService.cancelBooking(bookingId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: housekeepingBookingKeys.all });
      if (result.success) {
        toast.success('Booking cancelled');
      } else {
        toast.error(bookingErrorMessage(result.error_code, 'Could not cancel this booking'));
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel booking: ${error.message}`);
    },
  });
}

export function useAssignBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, profileId, name, clear }: AssignBookingInput) =>
      HousekeepingBookingService.assignBooking(bookingId, { profileId, name, clear }),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: housekeepingBookingKeys.all });
      if (result.success) {
        toast.success(variables.clear ? 'Assignment cleared' : 'Booking assigned');
      } else {
        const message =
          result.error_code === 'forbidden'
            ? 'You do not have permission to assign bookings (housekeeping schedule required)'
            : bookingErrorMessage(result.error_code, 'Could not assign this booking');
        toast.error(message);
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to assign booking: ${error.message}`);
    },
  });
}

export function useMarkBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookingId,
      status,
    }: {
      bookingId: string;
      status: MarkableBookingStatus;
    }) => HousekeepingBookingService.markBooking(bookingId, status),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: housekeepingBookingKeys.all });
      if (result.success) {
        toast.success(
          variables.status === 'completed'
            ? 'Booking marked complete'
            : 'Booking marked as no-show'
        );
      } else {
        // 'forbidden' from fn_housekeeping_mark_booking means the STAFF caller
        // lacks campus_living.housekeeping.mark_done — the shared map's
        // resident-facing "own bookings" wording is wrong in this context.
        const message =
          result.error_code === 'forbidden'
            ? 'You do not have permission to update bookings — ask your admin for the housekeeping mark-done permission'
            : bookingErrorMessage(result.error_code, 'Could not update this booking');
        toast.error(message);
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to update booking: ${error.message}`);
    },
  });
}
