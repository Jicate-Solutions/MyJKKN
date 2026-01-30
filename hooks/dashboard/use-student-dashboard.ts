import { useQuery, UseQueryResult } from '@tanstack/react-query';
import {
  StudentAttendanceSummary,
  StudentTimetableToday,
  StudentBillingSummary,
  StudentDashboardService
} from '@/lib/services/dashboard/student-dashboard-service';

/**
 * Get student attendance summary
 */
export function useStudentAttendance(
  studentId: string | null
): UseQueryResult<StudentAttendanceSummary, Error> {
  return useQuery({
    queryKey: ['student-attendance-summary', studentId],
    queryFn: async () => {
      if (!studentId) throw new Error('Student ID required');
      return StudentDashboardService.getAttendanceSummary(studentId);
    },
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}

/**
 * Get today's timetable for student
 */
export function useStudentTimetableToday(
  studentId: string | null,
  sectionId: string | null
): UseQueryResult<StudentTimetableToday[], Error> {
  return useQuery({
    queryKey: ['student-timetable-today', studentId, sectionId],
    queryFn: async () => {
      if (!studentId || !sectionId) throw new Error('Student ID and Section ID required');
      return StudentDashboardService.getTimetableToday(studentId, sectionId);
    },
    enabled: !!studentId && !!sectionId,
    staleTime: 1 * 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });
}

/**
 * Get student billing summary
 */
export function useStudentBilling(
  studentId: string | null
): UseQueryResult<StudentBillingSummary, Error> {
  return useQuery({
    queryKey: ['student-billing-summary', studentId],
    queryFn: async () => {
      if (!studentId) throw new Error('Student ID required');
      return StudentDashboardService.getBillingSummary(studentId);
    },
    enabled: !!studentId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
