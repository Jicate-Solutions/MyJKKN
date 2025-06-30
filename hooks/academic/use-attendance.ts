import { useState, useCallback } from 'react';
import { AttendanceService } from '@/lib/services/academic/attendance-service';
import type {
  StudentAttendance,
  AttendanceFilters,
  AttendanceSearchContext,
  AttendanceRosterData,
  AttendancePeriodOption,
  BatchUpdateAttendanceDto
} from '@/types/attendance';
import type { Student } from '@/types/student';

export function useAttendance(initialFilters: AttendanceFilters = {}) {
  const [attendanceRecords, setAttendanceRecords] = useState<
    StudentAttendance[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<AttendanceFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0
  });

  const fetchAttendance = useCallback(
    async (newFilters?: AttendanceFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await AttendanceService.getAttendance(currentFilters);
        setAttendanceRecords(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching attendance:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<AttendanceFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchAttendance(updatedFilters);
    },
    [filters, fetchAttendance]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchAttendance(updatedFilters);
    },
    [filters, fetchAttendance]
  );

  return {
    attendanceRecords,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchAttendance
  };
}

export function useAttendanceRoster() {
  const [rosterData, setRosterData] = useState<AttendanceRosterData | null>(
    null
  );
  const [availablePeriods, setAvailablePeriods] = useState<
    AttendancePeriodOption[]
  >([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchContext, setSearchContext] = useState<AttendanceSearchContext>({
    institution_id: null,
    academic_year_id: null,
    degree_id: null,
    program_id: null,
    department_id: null,
    semester_id: null,
    section_id: null,
    attendance_date: null
  });

  const fetchAvailablePeriods = useCallback(
    async (context: AttendanceSearchContext) => {
      if (
        !context.institution_id ||
        !context.academic_year_id ||
        !context.degree_id ||
        !context.program_id ||
        !context.department_id ||
        !context.semester_id ||
        !context.attendance_date
      ) {
        setAvailablePeriods([]);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const periods = await AttendanceService.getAvailablePeriodsForDate(
          {
            institution_id: context.institution_id,
            academic_year_id: context.academic_year_id,
            degree_id: context.degree_id,
            program_id: context.program_id,
            department_id: context.department_id,
            semester: context.semester_id,
            section: context.section_id || undefined
          },
          context.attendance_date
        );

        setAvailablePeriods(periods);
      } catch (err) {
        console.error('Error fetching available periods:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const fetchAttendanceRoster = useCallback(
    async (
      timetableSlotId: string,
      attendanceDate: string,
      studentFilters: any
    ) => {
      try {
        setLoading(true);
        setError(null);

        const roster = await AttendanceService.getAttendanceRoster(
          timetableSlotId,
          attendanceDate,
          studentFilters
        );

        setRosterData(roster);
      } catch (err) {
        console.error('Error fetching attendance roster:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const saveAttendance = useCallback(
    async (attendanceData: BatchUpdateAttendanceDto) => {
      try {
        setLoading(true);
        setError(null);

        await AttendanceService.batchUpdateAttendance(attendanceData);
        return true;
      } catch (err) {
        console.error('Error saving attendance:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateSearchContext = useCallback(
    (newContext: Partial<AttendanceSearchContext>) => {
      setSearchContext((prevContext) => {
        const updatedContext = { ...prevContext, ...newContext };

        // Auto-fetch periods when context is complete enough
        if (newContext.attendance_date || Object.keys(newContext).length > 1) {
          // Use setTimeout to avoid calling fetchAvailablePeriods during render
          setTimeout(() => {
            fetchAvailablePeriods(updatedContext);
          }, 0);
        }

        return updatedContext;
      });
    },
    [fetchAvailablePeriods]
  );

  return {
    rosterData,
    availablePeriods,
    students,
    loading,
    error,
    searchContext,
    updateSearchContext,
    fetchAvailablePeriods,
    fetchAttendanceRoster,
    saveAttendance
  };
}
