import { useQuery } from '@tanstack/react-query';
import {
  AttendanceAnalyticsService,
  type AnalyticsFilters,
  type FacultyAttendanceStats,
  type CourseAttendanceStats,
  type StudentAttendanceStats,
  type OverallAttendanceSummary,
  type FilterOptions
} from '@/lib/services/academic/attendance-analytics-service';

// Re-export for convenience
export type { AnalyticsFilters };

export const ATTENDANCE_ANALYTICS_KEYS = {
  all: ['attendance-analytics'] as const,
  facultyStats: (filters: AnalyticsFilters) =>
    [...ATTENDANCE_ANALYTICS_KEYS.all, 'faculty', filters] as const,
  courseStats: (filters: AnalyticsFilters) =>
    [...ATTENDANCE_ANALYTICS_KEYS.all, 'course', filters] as const,
  studentStats: (filters: AnalyticsFilters) =>
    [...ATTENDANCE_ANALYTICS_KEYS.all, 'student', filters] as const,
  overallSummary: (filters: AnalyticsFilters) =>
    [...ATTENDANCE_ANALYTICS_KEYS.all, 'summary', filters] as const,
  institutions: () =>
    [...ATTENDANCE_ANALYTICS_KEYS.all, 'institutions'] as const,
  degrees: (institutionId: string) =>
    [...ATTENDANCE_ANALYTICS_KEYS.all, 'degrees', institutionId] as const,
  departments: (degreeId: string) =>
    [...ATTENDANCE_ANALYTICS_KEYS.all, 'departments', degreeId] as const,
  programs: (departmentId: string) =>
    [...ATTENDANCE_ANALYTICS_KEYS.all, 'programs', departmentId] as const,
  semesters: (programId: string) =>
    [...ATTENDANCE_ANALYTICS_KEYS.all, 'semesters', programId] as const,
  sections: (semesterId: string) =>
    [...ATTENDANCE_ANALYTICS_KEYS.all, 'sections', semesterId] as const
};

/**
 * Hook to fetch faculty attendance statistics
 */
export function useFacultyAttendanceStats(
  filters: AnalyticsFilters,
  enabled = true
) {
  return useQuery({
    queryKey: ATTENDANCE_ANALYTICS_KEYS.facultyStats(filters),
    queryFn: () =>
      AttendanceAnalyticsService.getFacultyAttendanceStats(filters),
    enabled:
      enabled &&
      !!filters.institution_id &&
      !!filters.start_date &&
      !!filters.end_date,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1
  });
}

/**
 * Hook to fetch course attendance statistics
 */
export function useCourseAttendanceStats(
  filters: AnalyticsFilters,
  enabled = true
) {
  return useQuery({
    queryKey: ATTENDANCE_ANALYTICS_KEYS.courseStats(filters),
    queryFn: () => AttendanceAnalyticsService.getCourseAttendanceStats(filters),
    enabled:
      enabled &&
      !!filters.institution_id &&
      !!filters.start_date &&
      !!filters.end_date,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1
  });
}

/**
 * Hook to fetch student attendance statistics
 */
export function useStudentAttendanceStats(
  filters: AnalyticsFilters,
  enabled = true
) {
  return useQuery({
    queryKey: ATTENDANCE_ANALYTICS_KEYS.studentStats(filters),
    queryFn: () =>
      AttendanceAnalyticsService.getStudentAttendanceStats(filters),
    enabled:
      enabled &&
      !!filters.institution_id &&
      !!filters.start_date &&
      !!filters.end_date,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1
  });
}

/**
 * Hook to fetch overall attendance summary
 */
export function useOverallAttendanceSummary(
  filters: AnalyticsFilters,
  enabled = true
) {
  return useQuery({
    queryKey: ATTENDANCE_ANALYTICS_KEYS.overallSummary(filters),
    queryFn: () =>
      AttendanceAnalyticsService.getOverallAttendanceSummary(filters),
    enabled:
      enabled &&
      !!filters.institution_id &&
      !!filters.start_date &&
      !!filters.end_date,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1
  });
}

/**
 * Hook to fetch institutions for filter dropdown
 */
export function useInstitutions() {
  return useQuery({
    queryKey: ATTENDANCE_ANALYTICS_KEYS.institutions(),
    queryFn: () => AttendanceAnalyticsService.getInstitutions(),
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1
  });
}

/**
 * Hook to fetch degrees for filter dropdown
 */
export function useDegrees(institutionId: string, enabled = true) {
  return useQuery({
    queryKey: ATTENDANCE_ANALYTICS_KEYS.degrees(institutionId),
    queryFn: () => AttendanceAnalyticsService.getDegrees(institutionId),
    enabled: enabled && !!institutionId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1
  });
}

/**
 * Hook to fetch departments for filter dropdown
 */
export function useDepartments(degreeId: string, enabled = true) {
  return useQuery({
    queryKey: ATTENDANCE_ANALYTICS_KEYS.departments(degreeId),
    queryFn: () => AttendanceAnalyticsService.getDepartments(degreeId),
    enabled: enabled && !!degreeId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1
  });
}

/**
 * Hook to fetch programs for filter dropdown
 */
export function usePrograms(departmentId: string, enabled = true) {
  return useQuery({
    queryKey: ATTENDANCE_ANALYTICS_KEYS.programs(departmentId),
    queryFn: () => AttendanceAnalyticsService.getPrograms(departmentId),
    enabled: enabled && !!departmentId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1
  });
}

/**
 * Hook to fetch semesters for filter dropdown
 */
export function useSemesters(programId: string, enabled = true) {
  return useQuery({
    queryKey: ATTENDANCE_ANALYTICS_KEYS.semesters(programId),
    queryFn: () => AttendanceAnalyticsService.getSemesters(programId),
    enabled: enabled && !!programId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1
  });
}

/**
 * Hook to fetch sections for filter dropdown
 */
export function useSections(semesterId: string, enabled = true) {
  return useQuery({
    queryKey: ATTENDANCE_ANALYTICS_KEYS.sections(semesterId),
    queryFn: () => AttendanceAnalyticsService.getSections(semesterId),
    enabled: enabled && !!semesterId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1
  });
}
