'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { FacultyTimetableService } from '@/lib/services/academic/faculty-timetable-service';
import type {
  FacultySlot,
  FacultyCalendarFilters,
  FacultyCalendarEvent,
  FacultyAvailabilityApiResponse
} from '@/types/faculty-calendar';
import { useAuth } from '@/hooks/use-auth';
import moment from 'moment';

interface UseFacultyCalendarOptions {
  viewMode: 'faculty' | 'admin';
  staffId?: string;
  filters?: FacultyCalendarFilters;
  enabled?: boolean;
}

export function useFacultyCalendar({
  viewMode,
  staffId,
  filters,
  enabled = true
}: UseFacultyCalendarOptions) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Default date range (current month)
  const defaultDateRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: start, to: end };
  }, []);

  // Determine the effective filters
  const effectiveFilters = useMemo(() => {
    if (viewMode === 'faculty') {
      return {
        date_range: defaultDateRange,
        include_break_slots: true,
        ...filters
      };
    }
    return {
      date_range: defaultDateRange,
      include_break_slots: false,
      ...filters
    };
  }, [viewMode, filters, defaultDateRange]);

  // Query key for caching
  const queryKey = useMemo(
    () => ['faculty-calendar', viewMode, staffId, effectiveFilters],
    [viewMode, staffId, effectiveFilters]
  );

  // Main data query
  const {
    data: response,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey,
    queryFn: async () => {
      if (viewMode === 'faculty') {
        if (!staffId) {
          // Try to get current user's staff record
          const staffRecord =
            await FacultyTimetableService.getCurrentUserStaffRecord();
          if (!staffRecord) {
            // Return empty result instead of throwing error
            return { slots: [], total_count: 0 };
          }
          return FacultyTimetableService.getFacultyTimetableSlots(
            staffRecord.id,
            effectiveFilters.date_range,
            effectiveFilters
          );
        }
        return FacultyTimetableService.getFacultyTimetableSlots(
          staffId,
          effectiveFilters.date_range,
          effectiveFilters
        );
      } else {
        return FacultyTimetableService.getAllFacultyTimetableSlots(
          effectiveFilters.date_range,
          effectiveFilters
        );
      }
    },
    enabled: Boolean(
      enabled && (viewMode === 'faculty' || viewMode === 'admin')
    ),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  });

  // Combine slot date with period time to create accurate event start/end
  const combineDateAndTime = (dateStr: string, timeStr: string) => {
    return moment(`${dateStr} ${timeStr}`, 'YYYY-MM-DD HH:mm:ss').toDate();
  };

  // Main transformation logic
  const events = useMemo<FacultyCalendarEvent[]>(() => {
    if (!response?.slots) return [];

    const calendarEvents: FacultyCalendarEvent[] = [];

    response.slots.forEach((slot) => {
      // Handle different timetable formats
      if (slot.timetable.timetable_format === 'batch' && slot.slot_date) {
        // Batch mode - specific date
        const date = new Date(slot.slot_date);
        const startTime = new Date(`${slot.slot_date}T${slot.start_time}`);
        const endTime = new Date(`${slot.slot_date}T${slot.end_time}`);

        const event: FacultyCalendarEvent = {
          id: `${slot.id}-${slot.slot_date}`,
          title: slot.is_break_slot
            ? slot.break_description || 'Break'
            : slot.course?.course_code || 'Class',
          start: startTime,
          end: endTime,
          resource: slot,
          color: slot.is_break_slot
            ? '#f59e0b'
            : slot.is_combined
            ? '#8b5cf6'
            : '#3b82f6',
          textColor: 'white'
        };

        calendarEvents.push(event);
      } else if (
        slot.timetable.timetable_format === 'regular' &&
        slot.day_of_week
      ) {
        // Regular mode - generate events for each occurrence in date range
        const dayOfWeekMap: { [key: string]: number } = {
          SUNDAY: 0,
          MONDAY: 1,
          TUESDAY: 2,
          WEDNESDAY: 3,
          THURSDAY: 4,
          FRIDAY: 5,
          SATURDAY: 6
        };

        const targetDayOfWeek = dayOfWeekMap[slot.day_of_week];
        const currentDate = new Date(effectiveFilters.date_range.from);
        const endDate = new Date(effectiveFilters.date_range.to);

        // Find all occurrences of this day in the date range
        while (currentDate <= endDate) {
          if (currentDate.getDay() === targetDayOfWeek) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const startTime = new Date(`${dateStr}T${slot.start_time}`);
            const endTime = new Date(`${dateStr}T${slot.end_time}`);

            const event: FacultyCalendarEvent = {
              id: `${slot.id}-${dateStr}`,
              title: slot.is_break_slot
                ? slot.break_description || 'Break'
                : slot.course?.course_code || 'Class',
              start: startTime,
              end: endTime,
              resource: slot,
              color: slot.is_break_slot
                ? '#f59e0b'
                : slot.is_combined
                ? '#8b5cf6'
                : '#3b82f6',
              textColor: 'white'
            };

            calendarEvents.push(event);
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
    });

    return calendarEvents;
  }, [response?.slots, effectiveFilters.date_range]);

  // Get unique courses for legend/filtering
  const courses = useMemo(() => {
    if (!response?.slots) return [];

    const courseMap = new Map();
    response.slots.forEach((slot) => {
      if (slot.course) {
        courseMap.set(slot.course.id, slot.course);
      }
    });

    return Array.from(courseMap.values());
  }, [response?.slots]);

  // Get unique faculty for admin view
  const faculty = useMemo(() => {
    if (!response?.slots || viewMode !== 'admin') return [];

    const facultyMap = new Map();
    response.slots.forEach((slot) => {
      // Extract faculty from main slot
      if (slot.course) {
        // Only for non-break slots
        // This would need to be enhanced to extract actual faculty info
        // For now, we'll return empty array as faculty info is embedded in slots
      }
    });

    return Array.from(facultyMap.values());
  }, [response?.slots, viewMode]);

  // Update filters function
  const updateFilters = useCallback(
    (newFilters: Partial<FacultyCalendarFilters>) => {
      // This would typically update URL params or local state
      // Implementation depends on how filters are managed in the parent component
    },
    []
  );

  // Refresh data
  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Invalidate and refresh
  const invalidateAndRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['faculty-calendar'] });
    refetch();
  }, [queryClient, refetch]);

  // Handle disabled query case
  const isQueryEnabled =
    enabled &&
    (viewMode === 'faculty' ||
      (viewMode === 'admin' &&
        (filters?.institution_id ||
          filters?.department_id ||
          filters?.staff_ids?.length)));

  return {
    // Data
    slots: response?.slots || [],
    events,
    courses,
    faculty,
    totalCount: response?.total_count || 0,

    // State
    isLoading: isQueryEnabled ? isLoading : false,
    error: isQueryEnabled ? error : null,

    // Actions
    refresh,
    invalidateAndRefresh,
    updateFilters,

    // Computed
    hasData: (response?.slots?.length || 0) > 0,
    isEmpty:
      isQueryEnabled && !isLoading && (response?.slots?.length || 0) === 0
  };
}

// Hook for faculty availability checking
export function useFacultyAvailability(
  date: string,
  periodId: string,
  filters: {
    institution_id: string;
    department_id?: string;
  },
  enabled: boolean = true
) {
  const queryKey = ['faculty-availability', date, periodId, filters];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      FacultyTimetableService.getFacultyAvailability(date, periodId, filters),
    enabled: enabled && !!date && !!periodId && !!filters.institution_id,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false
  });

  return {
    availability: data,
    isLoading,
    error,
    refetch,
    availableFaculty: data?.available_faculty || [],
    unavailableFaculty: data?.unavailable_faculty || [],
    hasData: !!data
  };
}

// Hook for current user's staff record
export function useCurrentUserStaff() {
  const { profile } = useAuth();

  const {
    data: staffRecord,
    isLoading,
    error
  } = useQuery({
    queryKey: ['current-user-staff', profile?.id],
    queryFn: () => FacultyTimetableService.getCurrentUserStaffRecord(),
    enabled: !!profile && profile.role === 'faculty',
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false
  });

  return {
    staffRecord,
    isLoading,
    error,
    isFaculty: profile?.role === 'faculty',
    hasStaffRecord: !!staffRecord
  };
}
