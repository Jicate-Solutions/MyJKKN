import { useState, useEffect, useCallback } from 'react';
import { LearnerAttendanceService } from '@/lib/services/learner/learner-attendance-service';
import { useAuth } from '@/hooks/use-auth';
import type {
  LearnerAttendanceDetails,
  LearnerAttendanceFilters,
  AttendanceChartData
} from '@/types/learner-attendance';

export function useLearnerAttendance(
  initialFilters: LearnerAttendanceFilters = { view_mode: 'semester' }
) {
  const { profile } = useAuth();
  const [attendanceData, setAttendanceData] =
    useState<LearnerAttendanceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] =
    useState<LearnerAttendanceFilters>(initialFilters);

  const fetchAttendanceData = useCallback(async () => {
    if (!profile?.id) {
      setError('Profile not found');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get student ID from profile
      const studentId = profile.email
        ? await LearnerAttendanceService.getStudentIdFromProfile(profile.email)
        : await LearnerAttendanceService.getStudentIdFromProfileId(profile.id);

      if (!studentId) {
        setError('Student record not found');
        return;
      }

      const data = await LearnerAttendanceService.getStudentAttendanceDetails(
        studentId,
        filters
      );
      setAttendanceData(data);
    } catch (err) {
      console.error('Error fetching attendance data:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to fetch attendance data'
      );
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.email, filters]);

  useEffect(() => {
    fetchAttendanceData();
  }, [fetchAttendanceData]);

  const updateFilters = useCallback(
    (newFilters: Partial<LearnerAttendanceFilters>) => {
      setFilters((prev) => ({ ...prev, ...newFilters }));
    },
    []
  );

  const refetch = useCallback(() => {
    fetchAttendanceData();
  }, [fetchAttendanceData]);

  // Generate chart data for different visualizations
  const getAttendanceChartData = useCallback(
    (
      type: 'monthly' | 'course' | 'trend' | 'status'
    ): AttendanceChartData | null => {
      if (!attendanceData) return null;

      switch (type) {
        case 'monthly':
          return {
            type: 'bar',
            data: {
              labels: attendanceData.attendance_stats.monthly_breakdown.map(
                (m) => `${m.month} ${m.year}`
              ),
              datasets: [
                {
                  label: 'Attendance %',
                  data: attendanceData.attendance_stats.monthly_breakdown.map(
                    (m) => m.percentage
                  ),
                  backgroundColor:
                    attendanceData.attendance_stats.monthly_breakdown.map((m) =>
                      m.percentage >= 75
                        ? '#10b981'
                        : m.percentage >= 60
                        ? '#f59e0b'
                        : '#ef4444'
                    ),
                  borderWidth: 1
                }
              ]
            },
            options: {
              responsive: true,
              plugins: {
                legend: { display: false },
                title: { display: true, text: 'Monthly Attendance Trend' }
              },
              scales: {
                y: { beginAtZero: true, max: 100 }
              }
            }
          };

        case 'course':
          return {
            type: 'doughnut',
            data: {
              labels: attendanceData.attendance_stats.course_wise_stats.map(
                (c) => c.course_name
              ),
              datasets: [
                {
                  label: 'Attendance %',
                  data: attendanceData.attendance_stats.course_wise_stats.map(
                    (c) => c.percentage
                  ),
                  backgroundColor: [
                    '#3b82f6',
                    '#10b981',
                    '#f59e0b',
                    '#ef4444',
                    '#8b5cf6',
                    '#f97316',
                    '#06b6d4',
                    '#84cc16',
                    '#ec4899',
                    '#6b7280'
                  ],
                  borderWidth: 2
                }
              ]
            },
            options: {
              responsive: true,
              plugins: {
                legend: { display: true, position: 'bottom' },
                title: { display: true, text: 'Course-wise Attendance' }
              }
            }
          };

        case 'trend':
          return {
            type: 'line',
            data: {
              labels: attendanceData.attendance_stats.recent_trend.map(
                (t) => t.date
              ),
              datasets: [
                {
                  label: 'Attendance %',
                  data: attendanceData.attendance_stats.recent_trend.map(
                    (t) => t.percentage
                  ),
                  borderColor: '#3b82f6',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  borderWidth: 2,
                  fill: true
                }
              ]
            },
            options: {
              responsive: true,
              plugins: {
                legend: { display: false },
                title: {
                  display: true,
                  text: 'Attendance Trend (Last 12 Weeks)'
                }
              },
              scales: {
                y: { beginAtZero: true, max: 100 }
              }
            }
          };

        case 'status':
          const stats = attendanceData.attendance_stats;
          return {
            type: 'pie',
            data: {
              labels: ['Present', 'Absent', 'Late', 'Permission'],
              datasets: [
                {
                  label: 'Days',
                  data: [
                    stats.present_days,
                    stats.absent_days,
                    stats.late_days,
                    stats.permission_days
                  ],
                  backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#3b82f6'],
                  borderWidth: 2
                }
              ]
            },
            options: {
              responsive: true,
              plugins: {
                legend: { display: true, position: 'bottom' },
                title: { display: true, text: 'Attendance Status Distribution' }
              }
            }
          };

        default:
          return null;
      }
    },
    [attendanceData]
  );

  return {
    attendanceData,
    loading,
    error,
    filters,
    updateFilters,
    refetch,
    getAttendanceChartData
  };
}
