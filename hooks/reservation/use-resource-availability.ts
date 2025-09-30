// hooks/reservation/use-resource-availability.ts
// React Query hooks for checking resource availability

import { useQuery, useMutation } from '@tanstack/react-query';
import { ReservationService } from '@/lib/services/reservation/reservation-service';
import type { AvailabilityCheckDto } from '@/types/reservation';

/**
 * Hook to check if a resource is available for a specific time slot
 */
export function useCheckAvailability() {
  return useMutation({
    mutationFn: (dto: AvailabilityCheckDto) =>
      ReservationService.checkAvailability(dto)
  });
}

/**
 * Alias for backwards compatibility
 */
export const useCheckResourceAvailability = (
  dto: AvailabilityCheckDto,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ['resource-availability', dto],
    queryFn: () => ReservationService.checkAvailability(dto),
    enabled,
    staleTime: 15 * 1000,
    retry: 2
  });
};

/**
 * Hook to get available time slots for a specific date
 */
export function useAvailableSlots(
  resourceId: string | undefined,
  date: string | undefined
) {
  return useQuery({
    queryKey: ['available-slots', resourceId, date],
    queryFn: () => {
      if (!resourceId || !date) return [];
      return ReservationService.getAvailableSlots(resourceId, date);
    },
    enabled: !!resourceId && !!date,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute for real-time updates
    retry: 3
  });
}

/**
 * Hook to get month availability calendar
 */
export function useMonthAvailability(
  resourceId: string | undefined,
  month: number | undefined,
  year: number | undefined
) {
  return useQuery({
    queryKey: ['month-availability', resourceId, month, year],
    queryFn: () => {
      if (!resourceId || !month || !year) return [];
      return ReservationService.getMonthAvailability(resourceId, month, year);
    },
    enabled: !!resourceId && !!month && !!year,
    staleTime: 60 * 1000, // 1 minute
    retry: 3
  });
}

/**
 * Hook to get resource availability status (quick check)
 */
export function useResourceAvailabilityStatus(
  resourceId: string | undefined,
  startTime: string | undefined,
  endTime: string | undefined
) {
  return useQuery({
    queryKey: ['resource-availability-status', resourceId, startTime, endTime],
    queryFn: async () => {
      if (!resourceId || !startTime || !endTime) return null;
      return ReservationService.checkAvailability({
        resource_id: resourceId,
        start_time: startTime,
        end_time: endTime
      });
    },
    enabled: !!resourceId && !!startTime && !!endTime,
    staleTime: 15 * 1000, // 15 seconds
    retry: 2
  });
}
