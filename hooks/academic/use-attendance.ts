import { useState, useCallback, useEffect } from 'react';
import { AttendanceService } from '@/lib/services/academic/attendance-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
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
      console.log('fetchAvailablePeriods called with context:', context);

      if (
        !context.institution_id ||
        !context.academic_year_id ||
        !context.degree_id ||
        !context.program_id ||
        !context.department_id ||
        !context.semester_id ||
        !context.attendance_date
      ) {
        console.log('Missing required fields for period fetch:', {
          institution_id: !!context.institution_id,
          academic_year_id: !!context.academic_year_id,
          degree_id: !!context.degree_id,
          program_id: !!context.program_id,
          department_id: !!context.department_id,
          semester_id: !!context.semester_id,
          attendance_date: !!context.attendance_date
        });
        setAvailablePeriods([]);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        console.log('Fetching periods with filters:', {
          institution_id: context.institution_id,
          academic_year_id: context.academic_year_id,
          degree_id: context.degree_id,
          program_id: context.program_id,
          department_id: context.department_id,
          semester: context.semester_id,
          section: context.section_id || undefined
        });

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

        console.log('Fetched periods:', periods);
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

  // Auto-fetch academic year when institution changes
  const fetchAcademicYear = useCallback(async (institutionId: string) => {
    try {
      const academicYears =
        await AcademicYearService.getAcademicYearsByInstitution(institutionId);

      if (academicYears.length > 0) {
        // Use the first active academic year
        return academicYears[0].id;
      }

      return null;
    } catch (error) {
      console.error('Error fetching academic year:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (
      searchContext.institution_id &&
      searchContext.academic_year_id &&
      searchContext.degree_id &&
      searchContext.program_id &&
      searchContext.department_id &&
      searchContext.semester_id &&
      searchContext.attendance_date
    ) {
      fetchAvailablePeriods(searchContext);
    }
  }, [fetchAvailablePeriods, searchContext]);

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
    async (newContext: Partial<AttendanceSearchContext>) => {
      // Check if this is a reset operation (all main fields are null except attendance_date)
      const isResetOperation =
        newContext.institution_id === null &&
        newContext.academic_year_id === null &&
        newContext.degree_id === null &&
        newContext.program_id === null &&
        newContext.department_id === null &&
        newContext.semester_id === null &&
        newContext.section_id === null;

      // If institution is being changed, auto-fetch academic year
      if (
        newContext.institution_id &&
        newContext.institution_id !== searchContext.institution_id
      ) {
        const academicYearId = await fetchAcademicYear(
          newContext.institution_id
        );
        newContext.academic_year_id = academicYearId;
      }

      setSearchContext((prevContext) => {
        const updatedContext = { ...prevContext, ...newContext };

        // Auto-fetch periods when context is complete enough, but not during reset
        if (
          !isResetOperation &&
          (newContext.attendance_date || Object.keys(newContext).length > 1)
        ) {
          // Use setTimeout to avoid calling fetchAvailablePeriods during render
          setTimeout(() => {
            fetchAvailablePeriods(updatedContext);
          }, 0);
        } else if (isResetOperation) {
          // Clear available periods during reset
          setAvailablePeriods([]);
        }

        return updatedContext;
      });
    },
    [fetchAvailablePeriods, fetchAcademicYear, searchContext.institution_id]
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
