import { useState, useCallback, useEffect } from 'react';
import { AttendanceService } from '@/lib/services/academic/attendance-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  StudentAttendance,
  AttendanceFilters,
  AttendanceSearchContext,
  AttendanceRosterData,
  AttendancePeriodOption,
  BatchUpdateAttendanceDto,
  ConsolidatedStudentAttendance,
  ConsolidatedAttendanceData,
  ConsolidatedAttendanceStudent,
  UpsertConsolidatedAttendanceDto,
  AttendanceStudent
} from '@/types/attendance';
import type { LearnerProfile } from '@/types/learner-profile';
import toast from 'react-hot-toast';

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
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
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

  const checkStaffPermissions = useCallback(
    async (timetableSlotId: string): Promise<boolean> => {
      try {
        return await AttendanceService.canMarkAttendanceForSlot(
          timetableSlotId,
          false
        );
      } catch (error) {
        console.error('Error checking staff permissions:', error);
        return false;
      }
    },
    []
  );

  const fetchAvailablePeriods = useCallback(
    async (
      context: AttendanceSearchContext,
      options: {
        filterByStaffAssignment?: boolean;
        isSuperAdmin?: boolean;
      } = {}
    ) => {

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
          context.attendance_date,
          options
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
      fetchAvailablePeriods(searchContext, {
        filterByStaffAssignment: true,
        isSuperAdmin: false // This will be overridden by the explicit call from the page
      });
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

        // Use consolidated approach instead of the old method
        // First, get the slot details including timetable_id, period, and course
        const slotDetails = await AttendanceService.getSlotDetails(
          timetableSlotId
        );

        if (!slotDetails || !slotDetails.timetable_id) {
          throw new Error('Failed to get slot details');
        }

        // Use the consolidated roster method
        const roster = await AttendanceService.getConsolidatedAttendanceRoster(
          slotDetails.timetable_id,
          studentFilters.section_id,
          attendanceDate,
          studentFilters
        );

        // Transform the consolidated roster to match the expected format
        // Include all data from the roster including consolidated_record
        setRosterData({
          students: roster.students || [],
          timetable_slot: {
            id: timetableSlotId,
            timetable_id: slotDetails.timetable_id,
            day_of_week: slotDetails.day_of_week || 'MONDAY',
            period: slotDetails.period || {
              id: '',
              period_name: '',
              start_time: '',
              end_time: ''
            },
            course: slotDetails.course
          },
          attendance_date: attendanceDate,
          // Include the consolidated_record if it exists
          ...(roster.consolidated_record && {
            consolidated_record: roster.consolidated_record
          })
        } as AttendanceRosterData);
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
            fetchAvailablePeriods(updatedContext, {
              filterByStaffAssignment: true,
              isSuperAdmin: false // This will be overridden by the explicit call from the page
            });
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
    saveAttendance,
    checkStaffPermissions
  };
}

// =====================
// NEW CONSOLIDATED ATTENDANCE HOOKS
// =====================

export function useConsolidatedAttendance() {
  const [consolidatedRecord, setConsolidatedRecord] =
    useState<ConsolidatedStudentAttendance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConsolidatedAttendance = useCallback(
    async (
      timetable_id: string,
      section_id: string,
      attendance_date: string,
      period_id?: string
    ) => {
      try {
        setLoading(true);
        setError(null);

        const result = await AttendanceService.getConsolidatedAttendance(
          timetable_id,
          section_id,
          attendance_date,
          period_id
        );

        setConsolidatedRecord(result);
      } catch (err) {
        console.error('Error fetching consolidated attendance:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const saveConsolidatedAttendance = useCallback(
    async (data: UpsertConsolidatedAttendanceDto) => {
      try {
        setLoading(true);
        setError(null);

        const result = await AttendanceService.upsertConsolidatedAttendance(
          data
        );

        // Refresh the consolidated record after save
        await fetchConsolidatedAttendance(
          data.timetable_id,
          data.section_id,
          data.attendance_date
        );
        toast.success('Attendance saved successfully');
        return result;
      } catch (err) {
        console.error('Error saving consolidated attendance:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        toast.error('Failed to save attendance');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fetchConsolidatedAttendance]
  );

  return {
    consolidatedRecord,
    loading,
    error,
    fetchConsolidatedAttendance,
    saveConsolidatedAttendance
  };
}

export function useConsolidatedAttendanceRoster() {
  const [rosterData, setRosterData] = useState<{
    students: any[];
    timetable: any;
    section: any;
    attendance_date: string;
    consolidated_record?: ConsolidatedStudentAttendance;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConsolidatedRoster = useCallback(
    async (
      timetable_id: string,
      section_id: string,
      attendance_date: string,
      studentFilters: {
        institution_id: string;
        degree_id?: string;
        program_id?: string;
        department_id?: string;
        semester_id?: string;
      }
    ) => {
      try {
        setLoading(true);
        setError(null);

        const result = await AttendanceService.getConsolidatedAttendanceRoster(
          timetable_id,
          section_id,
          attendance_date,
          studentFilters
        );

        setRosterData(result);
      } catch (err) {
        console.error('Error fetching consolidated attendance roster:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateStudentAttendance = useCallback(
    (studentId: string, status: 'Present' | 'Absent') => {
      if (!rosterData) return;

      setRosterData((prev) => {
        if (!prev) return prev;

        return {
          ...prev,
          students: prev.students.map((student) =>
            student.id === studentId ? { ...student, status } : student
          )
        };
      });
    },
    [rosterData]
  );

  const saveConsolidatedAttendance = useCallback(
    async (
      timetable_id: string,
      section_id: string,
      attendance_date: string,
      slot_id: string,
      period_info: {
        period_name: string;
        start_time: string;
        end_time: string;
        course?: any;
        staff?: any;
      },
      marked_by: string,
      institution_id: string
    ) => {
      if (!rosterData) return false;

      try {
        setLoading(true);
        setError(null);

        // Get current user profile for marker info
        const { createClientSupabaseClient } = await import(
          '@/lib/supabase/client'
        );
        const supabase = createClientSupabaseClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();

        // Get better name from staff table if user is faculty
        let markerName = user?.user_metadata?.full_name || 'Unknown';
        let markerEmail = user?.email || '';

        // Try to get staff details for better name/email if user is faculty
        if (user?.id && user?.user_metadata?.role === 'faculty') {
          try {
            const { data: staffData } = await supabase
              .from('staff')
              .select('first_name, last_name, email, institution_email')
              .eq('profile_id', user.id)
              .eq('is_active', true)
              .single();

            // Type cast to fix TypeScript inference after React 19 upgrade
            const staffInfo = staffData as { first_name: string; last_name: string; email: string; institution_email: string } | null;

            if (staffInfo) {
              markerName =
                `${staffInfo.first_name || ''} ${
                  staffInfo.last_name || ''
                }`.trim() || markerName;
              markerEmail =
                staffInfo.email || staffInfo.institution_email || markerEmail;
            }
          } catch (error) {
            console.warn(
              'Could not fetch staff details for marker name:',
              error
            );
          }
        }

        // Build the consolidated attendance data structure with proper faculty and marker info
        const attendanceData: ConsolidatedAttendanceData = {
          [slot_id]: {
            period_id: slot_id,
            period_name: period_info.period_name,
            start_time: period_info.start_time,
            end_time: period_info.end_time,
            course_id: period_info.course?.id || '',
            course_name: period_info.course?.course_name || '',
            // Add assigned faculty if available - handle both single and multiple
            assigned_faculty: period_info.staff
              ? Array.isArray(period_info.staff)
                ? // Multiple staff - store as array
                  period_info.staff.map((staff: any) => ({
                    faculty_id: staff.id,
                    faculty_name:
                      staff.full_name ||
                      `${staff.first_name || ''} ${
                        staff.last_name || ''
                      }`.trim(),
                    faculty_email: staff.email || staff.institution_email || '',
                    is_primary: staff.is_primary || false
                  }))
                : // Single staff - store as object
                  {
                    faculty_id: period_info.staff.id,
                    faculty_name:
                      period_info.staff.full_name ||
                      `${period_info.staff.first_name || ''} ${
                        period_info.staff.last_name || ''
                      }`.trim(),
                    faculty_email:
                      period_info.staff.email ||
                      period_info.staff.institution_email ||
                      ''
                  }
              : undefined,
            // Add marker details with profile ID (works for all user types)
            marked_by_details: {
              marker_id: marked_by, // This is the profile ID passed to the function
              marker_name: markerName,
              marker_role: user?.user_metadata?.role || 'faculty',
              marker_email: markerEmail,
              marked_at: new Date().toISOString()
            },
            students: rosterData.students.map((student) => ({
              student_id: student.id,
              section_id: section_id, // Add section_id for historical accuracy
              status: student.status,
              marked_at: new Date().toISOString()
            }))
          }
        };

        await AttendanceService.batchUpdateConsolidatedAttendance(
          timetable_id,
          section_id,
          attendance_date,
          attendanceData,
          marked_by,
          institution_id,
          {
            academic_year_id: rosterData.timetable?.academic_year_id,
            degree_id: rosterData.timetable?.degree_id,
            program_id: rosterData.timetable?.program_id,
            department_id: rosterData.timetable?.department_id,
            semester_id: rosterData.timetable?.semester_id
          }
        );

        // Refresh the roster data after save
        await fetchConsolidatedRoster(
          timetable_id,
          section_id,
          attendance_date,
          {
            institution_id,
            degree_id: rosterData.timetable?.degree_id,
            program_id: rosterData.timetable?.program_id,
            department_id: rosterData.timetable?.department_id
          }
        );

        return true;
      } catch (err) {
        console.error('Error saving consolidated attendance:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [rosterData, fetchConsolidatedRoster]
  );

  return {
    rosterData,
    loading,
    error,
    fetchConsolidatedRoster,
    updateStudentAttendance,
    saveConsolidatedAttendance
  };
}

export function useAttendanceSummary() {
  const [summary, setSummary] = useState<{
    total_days: number;
    total_students: number;
    total_present: number;
    total_absent: number;
    attendance_percentage: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAttendanceSummary = useCallback(
    async (filters: {
      institution_id: string;
      timetable_id?: string;
      section_id?: string;
      start_date: string;
      end_date: string;
    }) => {
      try {
        setLoading(true);
        setError(null);

        const result = await AttendanceService.getAttendanceSummary(filters);
        setSummary(result);
      } catch (err) {
        console.error('Error fetching attendance summary:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    summary,
    loading,
    error,
    fetchAttendanceSummary
  };
}

/**
 * Hook for fetching available periods for attendance marking
 */
export function useAttendancePeriods(
  searchContext: AttendanceSearchContext,
  enabled: boolean = true
) {
  const [periods, setPeriods] = useState<AttendancePeriodOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get user permissions and profile
  const { isSuperAdmin, userProfile } = usePermissions();
  const isHOD = userProfile?.role === 'hod';

  const fetchPeriods = useCallback(
    async (context: AttendanceSearchContext) => {

      // Check which fields are missing
      const missing = [];
      if (!context.institution_id) missing.push('institution_id');
      if (!context.academic_year_id) missing.push('academic_year_id');
      if (!context.degree_id) missing.push('degree_id');
      if (!context.program_id) missing.push('program_id');
      if (!context.department_id) missing.push('department_id');
      if (!context.semester_id) missing.push('semester_id');
      if (!context.attendance_date) missing.push('attendance_date');

      if (missing.length > 0) {
      }

      if (
        !enabled ||
        !context.institution_id ||
        !context.academic_year_id ||
        !context.degree_id ||
        !context.program_id ||
        !context.department_id ||
        !context.semester_id ||
        !context.attendance_date
      ) {
        setPeriods([]);
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
            semester: context.semester_id, // Service expects 'semester' but uses it as semester_id
            section: context.section_id || undefined // Service expects 'section' but uses it as section_id
          },
          context.attendance_date,
          {
            filterByStaffAssignment: !isSuperAdmin && !isHOD, // Super admin and HOD should see all periods
            isSuperAdmin: isSuperAdmin
          }
        );

        setPeriods(periods);
      } catch (err) {
        console.error('❌ Error fetching periods:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        setPeriods([]);
      } finally {
        setLoading(false);
      }
    },
    [enabled, isSuperAdmin, isHOD]
  );

  const refetch = useCallback(() => {
    fetchPeriods(searchContext);
  }, [fetchPeriods, searchContext]);

  useEffect(() => {
    fetchPeriods(searchContext);
  }, [fetchPeriods, searchContext]);

  return {
    periods,
    loading,
    error,
    refetch
  };
}
