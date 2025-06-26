import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TimetableLeaveService } from '@/lib/services/academic/timetable-leave-service';
import type {
  TimetableLeave,
  CreateTimetableLeaveDto,
  UpdateTimetableLeaveDto,
  TimetableLeaveFilters,
  DayLeaveStatus,
  DayOrderShiftConfig
} from '@/types/academics';

// Query key factory
export const timetableLeaveKeys = {
  all: ['timetable-leaves'] as const,
  lists: () => [...timetableLeaveKeys.all, 'list'] as const,
  list: (filters: TimetableLeaveFilters) =>
    [...timetableLeaveKeys.lists(), filters] as const,
  details: () => [...timetableLeaveKeys.all, 'detail'] as const,
  detail: (id: string) => [...timetableLeaveKeys.details(), id] as const,
  dateRange: (timetableId: string, startDate: string, endDate: string) =>
    [
      ...timetableLeaveKeys.all,
      'date-range',
      timetableId,
      startDate,
      endDate
    ] as const,
  shifts: (timetableId: string) =>
    [...timetableLeaveKeys.all, 'shifts', timetableId] as const,
  timetableType: (timetableId: string) =>
    [...timetableLeaveKeys.all, 'timetable-type', timetableId] as const
};

// Hook to fetch timetable leaves with filters
export function useTimetableLeaves(filters: TimetableLeaveFilters = {}) {
  return useQuery({
    queryKey: timetableLeaveKeys.list(filters),
    queryFn: () => TimetableLeaveService.getLeaves(filters),
    staleTime: 30000 // 30 seconds
  });
}

// Hook to fetch a single timetable leave
export function useTimetableLeave(id: string) {
  return useQuery({
    queryKey: timetableLeaveKeys.detail(id),
    queryFn: () => TimetableLeaveService.getLeave(id),
    enabled: !!id
  });
}

// Hook to fetch leaves by date range (for calendar views)
export function useTimetableLeavesDateRange(
  timetableId: string,
  startDate: string,
  endDate: string,
  enabled = true
) {
  return useQuery({
    queryKey: timetableLeaveKeys.dateRange(timetableId, startDate, endDate),
    queryFn: () =>
      TimetableLeaveService.getLeavesByDateRange(
        timetableId,
        startDate,
        endDate
      ),
    enabled: enabled && !!timetableId && !!startDate && !!endDate,
    staleTime: 60000 // 1 minute
  });
}

// Hook to fetch day order shifts
export function useDayOrderShifts(timetableId: string) {
  return useQuery({
    queryKey: timetableLeaveKeys.shifts(timetableId),
    queryFn: () => TimetableLeaveService.getDayOrderShifts(timetableId),
    enabled: !!timetableId,
    staleTime: 30000
  });
}

// Hook to fetch institution timetable type
export function useInstitutionTimetableType(timetableId: string) {
  return useQuery({
    queryKey: timetableLeaveKeys.timetableType(timetableId),
    queryFn: () =>
      TimetableLeaveService.getInstitutionTimetableType(timetableId),
    enabled: !!timetableId,
    staleTime: 300000 // 5 minutes (this rarely changes)
  });
}

// Hook to create a new leave
export function useCreateTimetableLeave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTimetableLeaveDto) =>
      TimetableLeaveService.createLeave(data),
    onSuccess: (newLeave) => {
      // Invalidate and refetch leaves lists
      queryClient.invalidateQueries({ queryKey: timetableLeaveKeys.lists() });

      // Invalidate date range queries for this timetable
      queryClient.invalidateQueries({
        queryKey: ['timetable-leaves', 'date-range', newLeave.timetable_id]
      });

      // Invalidate shifts if it's a day order institution
      queryClient.invalidateQueries({
        queryKey: timetableLeaveKeys.shifts(newLeave.timetable_id)
      });

      // Update specific filters that might include this leave
      queryClient.invalidateQueries({
        predicate: (query): boolean => {
          const queryKey = query.queryKey;
          return Boolean(
            queryKey[0] === 'timetable-leaves' &&
              queryKey[1] === 'list' &&
              queryKey[2] &&
              typeof queryKey[2] === 'object' &&
              (queryKey[2] as TimetableLeaveFilters).timetable_id ===
                newLeave.timetable_id
          );
        }
      });
    }
  });
}

// Hook to update a leave
export function useUpdateTimetableLeave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTimetableLeaveDto }) =>
      TimetableLeaveService.updateLeave(id, data),
    onSuccess: (updatedLeave) => {
      // Update the specific leave in cache
      queryClient.setQueryData(
        timetableLeaveKeys.detail(updatedLeave.id),
        updatedLeave
      );

      // Invalidate lists to ensure consistency
      queryClient.invalidateQueries({ queryKey: timetableLeaveKeys.lists() });

      // Invalidate date range queries
      queryClient.invalidateQueries({
        queryKey: ['timetable-leaves', 'date-range', updatedLeave.timetable_id]
      });

      // Invalidate shifts
      queryClient.invalidateQueries({
        queryKey: timetableLeaveKeys.shifts(updatedLeave.timetable_id)
      });
    }
  });
}

// Hook to delete a leave
export function useDeleteTimetableLeave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => TimetableLeaveService.deleteLeave(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({
        queryKey: timetableLeaveKeys.detail(deletedId)
      });

      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: timetableLeaveKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: ['timetable-leaves', 'date-range']
      });
      queryClient.invalidateQueries({
        queryKey: ['timetable-leaves', 'shifts']
      });
    }
  });
}

// Hook to toggle leave status
export function useToggleTimetableLeaveStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => TimetableLeaveService.toggleLeaveStatus(id),
    onSuccess: (updatedLeave) => {
      // Update the specific leave in cache
      queryClient.setQueryData(
        timetableLeaveKeys.detail(updatedLeave.id),
        updatedLeave
      );

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: timetableLeaveKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: ['timetable-leaves', 'date-range', updatedLeave.timetable_id]
      });
    }
  });
}

// Hook to bulk create leaves
export function useBulkCreateTimetableLeaves() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (leaves: CreateTimetableLeaveDto[]) =>
      TimetableLeaveService.bulkCreateLeaves(leaves),
    onSuccess: (result) => {
      if (result.success.length > 0) {
        // Get unique timetable IDs from successful creates
        const timetableIds = [
          ...new Set(result.success.map((leave) => leave.timetable_id))
        ];

        // Invalidate queries for each timetable
        timetableIds.forEach((timetableId) => {
          queryClient.invalidateQueries({
            queryKey: timetableLeaveKeys.lists()
          });
          queryClient.invalidateQueries({
            queryKey: ['timetable-leaves', 'date-range', timetableId]
          });
          queryClient.invalidateQueries({
            queryKey: timetableLeaveKeys.shifts(timetableId)
          });
        });
      }
    }
  });
}

// Hook to check if a date is available for a timetable
export function useCheckDateAvailability(timetableId: string, date: string) {
  return useQuery({
    queryKey: ['timetable-leaves', 'availability', timetableId, date],
    queryFn: () => TimetableLeaveService.isDateAvailable(timetableId, date),
    enabled: !!timetableId && !!date,
    staleTime: 10000 // 10 seconds
  });
}
