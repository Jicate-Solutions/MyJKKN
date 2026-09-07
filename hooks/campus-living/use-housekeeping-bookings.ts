'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HousekeepingBookingService } from '@/lib/services/campus-living/housekeeping-booking-service';
import { bookingErrorMessage } from '@/lib/services/campus-living/housekeeping-rules';
import { getErrorMessage } from '@/lib/utils';
import { isRpcFailure } from '@/types/campus-living/housekeeping';

export const housekeepingBookingKeys = {
  all: ['housekeeping-bookings'] as const,
  slots: (roomId?: string, typeId?: string, date?: string) =>
    ['housekeeping-bookings', 'slots', roomId ?? '-', typeId ?? '-', date ?? '-'] as const,
  dayBoard: (date: string, institutionId?: string, blockId?: string) =>
    ['housekeeping-bookings', 'day-board', date, institutionId ?? 'all', blockId ?? 'all'] as const,
  mine: (roomId?: string) => ['housekeeping-bookings', 'mine', roomId ?? 'none'] as const,
  photos: (bookingId: string) => ['housekeeping-bookings', 'photos', bookingId] as const,
};

/**
 * Everything a booking mutation must refresh.
 *
 * Nothing self-refreshes in this app (staleTime 5min, no refetch on focus), so
 * a booking change has to push the OTHER module's keys too or a warden sees a
 * stale attendance hold. Holds are their own namespace, invalidated here as
 * well because completing or waiving a booking changes them.
 */
function invalidateBookingSurfaces(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: housekeepingBookingKeys.all });
  qc.invalidateQueries({ queryKey: ['housekeeping-holds'] });
  qc.invalidateQueries({ queryKey: ['hostel-attendance'] });
}

export function useSlotGrid(roomId?: string, typeId?: string, date?: string) {
  return useQuery({
    queryKey: housekeepingBookingKeys.slots(roomId, typeId, date),
    queryFn: () =>
      HousekeepingBookingService.getSlots(roomId as string, typeId as string, date as string),
    enabled: Boolean(roomId && typeId && date),
  });
}

export function useDayBoard(date: string, institutionId?: string, blockId?: string) {
  return useQuery({
    queryKey: housekeepingBookingKeys.dayBoard(date, institutionId, blockId),
    queryFn: () => HousekeepingBookingService.listDayBoard(date, institutionId, blockId),
  });
}

export function useMyBookings(roomId?: string, fromDate?: string) {
  return useQuery({
    queryKey: housekeepingBookingKeys.mine(roomId),
    queryFn: () => HousekeepingBookingService.listMyBookings(roomId as string, fromDate),
    enabled: Boolean(roomId),
  });
}

export function useBookingPhotos(bookingId: string) {
  return useQuery({
    queryKey: housekeepingBookingKeys.photos(bookingId),
    queryFn: () => HousekeepingBookingService.listPhotos(bookingId),
    enabled: Boolean(bookingId),
  });
}

export function useBookSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      typeId,
      date,
      slotStart,
      notes,
    }: {
      typeId: string;
      date: string;
      slotStart: string;
      notes?: string;
    }) => HousekeepingBookingService.book(typeId, date, slotStart, notes),
    onSuccess: (result) => {
      // Invalidate on BOTH outcomes: a refusal means the grid on screen is
      // already stale (someone else took the slot, or locked the room).
      invalidateBookingSurfaces(qc);
      if (!isRpcFailure(result)) {
        toast.success('Cleaning booked');
      } else if (result.error_code === 'quota_exhausted' && result.allowed != null) {
        toast.error(`Your room has used all ${result.allowed} of its bookings for this cleaning.`);
      } else {
        toast.error(bookingErrorMessage(result.error_code, 'Could not book this slot'));
      }
    },
    onError: (error) => toast.error(`Could not book this slot: ${getErrorMessage(error)}`),
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason?: string }) =>
      HousekeepingBookingService.cancel(bookingId, reason),
    onSuccess: (result) => {
      invalidateBookingSurfaces(qc);
      if (isRpcFailure(result)) {
        toast.error(bookingErrorMessage(result.error_code, 'Could not cancel this booking'));
      } else {
        toast.success('Booking cancelled');
      }
    },
    onError: (error) => toast.error(`Could not cancel: ${getErrorMessage(error)}`),
  });
}

export function useAssignCleaner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookingId,
      cleanerId,
      clear,
    }: {
      bookingId: string;
      cleanerId: string | null;
      clear?: boolean;
    }) => HousekeepingBookingService.assign(bookingId, cleanerId, clear ?? false),
    onSuccess: (result) => {
      invalidateBookingSurfaces(qc);
      if (isRpcFailure(result)) {
        toast.error(bookingErrorMessage(result.error_code, 'Could not assign this cleaner'));
      } else {
        toast.success(
          result.cleaner_name ? `Assigned to ${result.cleaner_name}` : 'Cleaner cleared',
        );
      }
    },
    onError: (error) => toast.error(`Could not assign: ${getErrorMessage(error)}`),
  });
}

export function useWaiveHold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookingId,
      reason,
      waivedBy,
    }: {
      bookingId: string;
      reason: string;
      waivedBy: string;
    }) => HousekeepingBookingService.waiveHold(bookingId, reason, waivedBy),
    onSuccess: () => {
      invalidateBookingSurfaces(qc);
      toast.success('Hold waived — attendance released for this room');
    },
    onError: (error) => toast.error(`Could not waive the hold: ${getErrorMessage(error)}`),
  });
}

export function useSubmitFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      bookingId: string;
      institutionId: string;
      roomId: string;
      learnerId: string;
      rating: number;
      comment?: string | null;
    }) => HousekeepingBookingService.submitFeedback(args),
    onSuccess: () => {
      invalidateBookingSurfaces(qc);
      toast.success('Thanks — your rating released attendance for your room');
    },
    onError: (error) => {
      const msg = getErrorMessage(error);
      toast.error(
        msg.includes('23505')
          ? 'You have already rated this cleaning.'
          : `Could not submit your rating: ${msg}`,
      );
    },
  });
}

/** Re-exported so pages import learner-facing copy from one place. */
export { bookingErrorMessage };
