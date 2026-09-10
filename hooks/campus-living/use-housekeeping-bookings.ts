'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HousekeepingBookingService } from '@/lib/services/campus-living/housekeeping-booking-service';
import { bookingErrorMessage } from '@/lib/services/campus-living/housekeeping-rules';
import { getErrorMessage } from '@/lib/utils';
import { isRpcFailure } from '@/types/campus-living/housekeeping';
import type { RescheduleBookingDto } from '@/types/campus-living/housekeeping';

export const housekeepingBookingKeys = {
  all: ['housekeeping-bookings'] as const,
  /** excludeBookingId is part of the key: the same room/type/date grid differs
   *  depending on whether a booking is being left out of the capacity count. */
  slots: (roomId?: string, typeId?: string, date?: string, excludeBookingId?: string) =>
    [
      'housekeeping-bookings',
      'slots',
      roomId ?? '-',
      typeId ?? '-',
      date ?? '-',
      excludeBookingId ?? '-',
    ] as const,
  reschedules: (bookingId?: string) =>
    ['housekeeping-bookings', 'reschedules', bookingId ?? 'none'] as const,
  /** The admin table's status tiles. Keyed on the filters only — the page and
   *  page size must NOT be in here, or the totals would change as you page. */
  statusCounts: (filters: Record<string, unknown>) =>
    ['housekeeping-bookings', 'status-counts', filters] as const,
  detail: (bookingId?: string) =>
    ['housekeeping-bookings', 'detail', bookingId ?? 'none'] as const,
  mine: (roomId?: string) => ['housekeeping-bookings', 'mine', roomId ?? 'none'] as const,
  photos: (bookingId: string) => ['housekeeping-bookings', 'photos', bookingId] as const,
  myAllocation: () => ['housekeeping-bookings', 'my-allocation'] as const,
};

/** The caller's own live allocation, or null when they have no room. */
export function useMyAllocation() {
  return useQuery({
    queryKey: housekeepingBookingKeys.myAllocation(),
    queryFn: () => HousekeepingBookingService.getMyAllocation(),
  });
}

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

export function useSlotGrid(
  roomId?: string,
  typeId?: string,
  date?: string,
  excludeBookingId?: string,
) {
  return useQuery({
    queryKey: housekeepingBookingKeys.slots(roomId, typeId, date, excludeBookingId),
    queryFn: () =>
      HousekeepingBookingService.getSlots(
        roomId as string,
        typeId as string,
        date as string,
        excludeBookingId,
      ),
    enabled: Boolean(roomId && typeId && date),
  });
}

/** Every move a booking has made, oldest first. Both the admin timeline and
 *  the learner's history read this. */
export function useBookingReschedules(bookingId?: string) {
  return useQuery({
    queryKey: housekeepingBookingKeys.reschedules(bookingId),
    queryFn: () => HousekeepingBookingService.listReschedules(bookingId as string),
    enabled: Boolean(bookingId),
  });
}

/**
 * Status totals for the admin table's tiles, over the WHOLE filtered set.
 *
 * The table pages server-side, so counting the rows it hands back would report
 * page 1 as if it were everything. This asks the database instead.
 */
export function useBookingStatusCounts(filters: {
  dateFrom?: string;
  dateTo?: string;
  institutionId?: string;
  blockId?: string;
}) {
  return useQuery({
    queryKey: housekeepingBookingKeys.statusCounts(filters),
    queryFn: () => HousekeepingBookingService.countBookingsByStatus(filters),
  });
}

/** Everything behind one booking. Only fetches once the dialog has a booking. */
export function useBookingDetail(bookingId?: string) {
  return useQuery({
    queryKey: housekeepingBookingKeys.detail(bookingId),
    queryFn: () => HousekeepingBookingService.getBookingDetail(bookingId as string),
    enabled: Boolean(bookingId),
  });
}

export function useMyBookings(roomId?: string, fromDate?: string) {
  return useQuery({
    queryKey: housekeepingBookingKeys.mine(roomId),
    queryFn: () => HousekeepingBookingService.listMyBookings(roomId as string, fromDate),
    enabled: Boolean(roomId),
  });
}

/**
 * Ratings already on a booking. The learner surface needs this to know whether
 * THIS learner has rated — any roommate may rate, so "the booking has feedback"
 * and "I have rated" are different questions and only the second decides whether
 * to keep showing them the form.
 */
export function useBookingFeedback(bookingId?: string) {
  return useQuery({
    queryKey: ['housekeeping-bookings', 'feedback', bookingId ?? 'none'] as const,
    queryFn: () => HousekeepingBookingService.listFeedback(bookingId as string),
    enabled: Boolean(bookingId),
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

/**
 * Move a booking, then tell the room.
 *
 * The notification is fired only on success and is never awaited into the
 * result: sendNotification failing must not report a completed reschedule as an
 * error. The RPC's own refusals come back as { success: false } and are turned
 * into copy by bookingErrorMessage, exactly like assign and cancel.
 */
export function useRescheduleBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: RescheduleBookingDto) => HousekeepingBookingService.reschedule(dto),
    onSuccess: (result, dto) => {
      invalidateBookingSurfaces(qc);
      qc.invalidateQueries({ queryKey: housekeepingBookingKeys.reschedules(dto.bookingId) });
      if (isRpcFailure(result)) {
        toast.error(bookingErrorMessage(result.error_code, 'Could not reschedule this booking'));
        return;
      }
      void HousekeepingBookingService.notifyRescheduled(dto.bookingId);
      toast.success(
        result.cleaner_name
          ? `Moved to ${result.booking_date} at ${result.slot_start} — ${result.cleaner_name}`
          : `Moved to ${result.booking_date} at ${result.slot_start}`,
      );
    },
    onError: (error) => toast.error(`Could not reschedule: ${getErrorMessage(error)}`),
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
