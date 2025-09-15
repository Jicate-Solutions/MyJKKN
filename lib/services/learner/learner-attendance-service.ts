import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  format,
  startOfMonth,
  endOfMonth,
  parseISO,
  differenceInDays
} from 'date-fns';
import type {
  LearnerAttendanceDetails,
  LearnerAttendanceDay,
  LearnerAttendanceRecord,
  LearnerAttendanceStats,
  LearnerAttendanceFilters,
  LearnerSemesterData,
  AttendanceCalendarData,
  CourseAttendanceStats,
  AttendanceAlert,
  MonthlyAttendance,
  AttendanceTrend
} from '@/types/learner-attendance';

export class LearnerAttendanceService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get comprehensive attendance details for a student
   */
  static async getStudentAttendanceDetails(
    studentId: string,
    filters: LearnerAttendanceFilters = { view_mode: 'semester' }
  ): Promise<LearnerAttendanceDetails> {
    try {
      // Get student basic information
      const { data: student, error: studentError } = await this.supabase
        .from('students')
        .select(
          `
          id,
          first_name,
          last_name,
          roll_number,
          student_photo_url,
          institution_id,
          degree_id,
          department_id,
          program_id,
          semester_id,
          section_id,
          academic_year_id,
          departments(department_name),
          programs(program_name),
          semesters(semester_name),
          sections(section_name)
        `
        )
        .eq('id', studentId)
        .single();

      if (studentError || !student) {
        throw new Error('Student not found');
      }


      // Get attendance records for the student
      const attendanceRecords = await this.getStudentAttendanceRecords(
        studentId,
        student.section_id,
        filters
      );

      // Get semester data
      const semesterData = await this.getStudentSemesters(studentId);

      // Calculate statistics
      const stats = this.calculateAttendanceStats(attendanceRecords);

      // Generate calendar data
      const calendarData = this.generateCalendarData(attendanceRecords);

      // Get recent attendance (last 30 days)
      const recentAttendance = this.groupAttendanceByDay(
        attendanceRecords.filter((record) => {
          const recordDate = parseISO(record.attendance_date);
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          return recordDate >= thirtyDaysAgo;
        })
      );

      return {
        student_id: studentId,
        student_name: `${student.first_name} ${student.last_name || ''}`.trim(),
        roll_number: student.roll_number,
        student_photo_url: student.student_photo_url,
        program_name:
          (student.programs as any)?.program_name || 'Unknown Program',
        department_name:
          (student.departments as any)?.department_name || 'Unknown Department',
        semester_name:
          (student.semesters as any)?.semester_name || 'Unknown Semester',
        section_name:
          (student.sections as any)?.section_name || 'Unknown Section',
        academic_year: '2024-25', // This should come from academic_year table
        current_semester:
          semesterData.find((s) => s.is_current) || semesterData[0],
        all_semesters: semesterData,
        attendance_stats: stats,
        attendance_calendar: calendarData,
        recent_attendance: recentAttendance
      };
    } catch (error) {
      console.error('Error fetching student attendance details:', error);
      throw error;
    }
  }

  /**
   * Get attendance records for a student
   */
  private static async getStudentAttendanceRecords(
    studentId: string,
    sectionId: string,
    filters: LearnerAttendanceFilters
  ): Promise<LearnerAttendanceRecord[]> {
    try {
      let query = this.supabase.from('student_attendance').select(`
          id,
          attendance_date,
          section_id,
          semester_id,
          attendance_data,
          created_at
        `);

      // Filter by section
      query = query.eq('section_id', sectionId);

      // Apply date range filter if provided
      if (filters.date_range) {
        if (filters.date_range.from) {
          query = query.gte('attendance_date', filters.date_range.from);
        }
        if (filters.date_range.to) {
          query = query.lte('attendance_date', filters.date_range.to);
        }
      }

      // Apply semester filter if provided
      if (filters.semester_id) {
        query = query.eq('semester_id', filters.semester_id);
      }

      // Apply course filter if provided
      if (filters.course_id) {
        // For course filtering, we'll need to filter after fetching since it's in JSONB
        // This is a limitation that could be optimized with a proper index
      }

      const { data: attendanceData, error } = await query
        .order('attendance_date', { ascending: false })
        .limit(500); // Limit to prevent excessive data load

      if (error) {
        throw error;
      }

      // Process attendance data to extract student-specific records
      const studentRecords: LearnerAttendanceRecord[] = [];

      for (const record of attendanceData || []) {
        if (
          record.attendance_data &&
          typeof record.attendance_data === 'object'
        ) {
          // Parse the JSONB attendance_data
          for (const [periodId, periodData] of Object.entries(
            record.attendance_data
          )) {
            const period = periodData as any;

            // Skip if period data is invalid
            if (!period || typeof period !== 'object') continue;

            // Find the student's attendance in this period
            const studentAttendance = period.students?.find(
              (s: any) => s.student_id === studentId
            );

            if (studentAttendance) {
              // Apply status filter if provided
              if (
                filters.status &&
                filters.status !== 'all' &&
                studentAttendance.status.toLowerCase() !==
                  filters.status.toLowerCase()
              ) {
                continue;
              }

              // Apply course filter if provided
              if (filters.course_id && period.course_id !== filters.course_id) {
                continue;
              }

              const attendanceRecord: LearnerAttendanceRecord = {
                id: `${record.id}_${periodId}`,
                attendance_date: record.attendance_date,
                period_id: periodId,
                period_name:
                  period.period_name || period.time_slot || 'Unknown Period',
                start_time: period.start_time || '',
                end_time: period.end_time || '',
                course_id: period.course_id || '',
                course_name:
                  period.course_name || period.subject_name || 'Unknown Course',
                course_code: period.course_code || period.subject_code,
                status: studentAttendance.status,
                marked_at:
                  studentAttendance.marked_at ||
                  studentAttendance.marked_by_details?.marked_at,
                faculty_name: this.extractFacultyName(period.assigned_faculty),
                faculty_email: this.extractFacultyEmail(
                  period.assigned_faculty
                ),
                remarks: studentAttendance.remarks || studentAttendance.note
              };

              studentRecords.push(attendanceRecord);
            }
          }
        }
      }

      return studentRecords;
    } catch (error) {
      console.error('Error fetching student attendance records:', error);
      throw new Error('Failed to fetch attendance records');
    }
  }

  /**
   * Helper method to extract faculty name from various faculty data formats
   */
  private static extractFacultyName(facultyData: any): string | undefined {
    if (!facultyData) return undefined;

    if (typeof facultyData === 'string') return facultyData;
    if (facultyData.faculty_name) return facultyData.faculty_name;
    if (facultyData.name) return facultyData.name;
    if (Array.isArray(facultyData) && facultyData.length > 0) {
      return facultyData[0]?.faculty_name || facultyData[0]?.name;
    }

    return undefined;
  }

  /**
   * Helper method to extract faculty email from various faculty data formats
   */
  private static extractFacultyEmail(facultyData: any): string | undefined {
    if (!facultyData) return undefined;

    if (facultyData.faculty_email) return facultyData.faculty_email;
    if (facultyData.email) return facultyData.email;
    if (Array.isArray(facultyData) && facultyData.length > 0) {
      return facultyData[0]?.faculty_email || facultyData[0]?.email;
    }

    return undefined;
  }

  /**
   * Get semester data for a student
   */
  private static async getStudentSemesters(
    studentId: string
  ): Promise<LearnerSemesterData[]> {
    try {
      // This is a simplified version - you might need to implement proper semester tracking
      const { data: student } = await this.supabase
        .from('students')
        .select('semester_id, semesters(semester_name)')
        .eq('id', studentId)
        .single();

      if (!student || !student.semester_id) {
        return [];
      }

      return [
        {
          semester_id: student.semester_id,
          semester_name:
            (student.semesters as any)?.semester_name || 'Current Semester',
          start_date: '2024-09-01', // Should come from academic calendar
          end_date: '2025-04-30',
          is_current: true,
          total_days: 180,
          attendance_percentage: 0, // Will be calculated
          courses: []
        }
      ];
    } catch (error) {
      console.error('Error fetching student semesters:', error);
      return [];
    }
  }

  /**
   * Calculate attendance statistics
   */
  private static calculateAttendanceStats(
    records: LearnerAttendanceRecord[]
  ): LearnerAttendanceStats {
    const totalPeriods = records.length;
    const attendedPeriods = records.filter(
      (r) => r.status === 'Present'
    ).length;
    const latePeriods = records.filter((r) => r.status === 'Late').length;
    const permissionPeriods = records.filter(
      (r) => r.status === 'Permission'
    ).length;
    const absentPeriods = records.filter((r) => r.status === 'Absent').length;

    // Group by date to calculate day-wise attendance
    const dayGroups = records.reduce((acc, record) => {
      const date = record.attendance_date;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(record);
      return acc;
    }, {} as Record<string, LearnerAttendanceRecord[]>);

    const totalDays = Object.keys(dayGroups).length;
    const presentDays = Object.values(dayGroups).filter((dayRecords) =>
      dayRecords.some((r) => r.status === 'Present')
    ).length;

    // Calculate course-wise statistics
    const courseStats = this.calculateCourseWiseStats(records);

    // Generate monthly breakdown
    const monthlyBreakdown = this.calculateMonthlyBreakdown(records);

    // Generate trend data
    const trendData = this.calculateTrendData(records);

    // Generate alerts
    const alerts = this.generateAttendanceAlerts(
      records,
      (attendedPeriods / totalPeriods) * 100
    );

    return {
      total_days: totalDays,
      present_days: presentDays,
      absent_days: totalDays - presentDays,
      late_days: Object.values(dayGroups).filter((dayRecords) =>
        dayRecords.some((r) => r.status === 'Late')
      ).length,
      permission_days: Object.values(dayGroups).filter((dayRecords) =>
        dayRecords.some((r) => r.status === 'Permission')
      ).length,
      overall_percentage: totalDays > 0 ? (presentDays / totalDays) * 100 : 0,
      total_periods: totalPeriods,
      attended_periods: attendedPeriods,
      missed_periods: absentPeriods,
      period_percentage:
        totalPeriods > 0 ? (attendedPeriods / totalPeriods) * 100 : 0,
      monthly_breakdown: monthlyBreakdown,
      course_wise_stats: courseStats,
      recent_trend: trendData,
      alerts: alerts
    };
  }

  /**
   * Calculate course-wise attendance statistics
   */
  private static calculateCourseWiseStats(
    records: LearnerAttendanceRecord[]
  ): CourseAttendanceStats[] {
    const courseGroups = records.reduce((acc, record) => {
      const courseId = record.course_id;
      if (!acc[courseId]) {
        acc[courseId] = [];
      }
      acc[courseId].push(record);
      return acc;
    }, {} as Record<string, LearnerAttendanceRecord[]>);

    return Object.entries(courseGroups).map(([courseId, courseRecords]) => {
      const totalPeriods = courseRecords.length;
      const attendedPeriods = courseRecords.filter(
        (r) => r.status === 'Present'
      ).length;
      const firstRecord = courseRecords[0];

      return {
        course_id: courseId,
        course_name: firstRecord.course_name,
        course_code: firstRecord.course_code,
        total_periods: totalPeriods,
        attended_periods: attendedPeriods,
        percentage:
          totalPeriods > 0 ? (attendedPeriods / totalPeriods) * 100 : 0,
        faculty_name: firstRecord.faculty_name,
        recent_classes: courseRecords
          .slice(0, 5)
          .sort(
            (a, b) =>
              new Date(b.attendance_date).getTime() -
              new Date(a.attendance_date).getTime()
          )
      };
    });
  }

  /**
   * Calculate monthly attendance breakdown
   */
  private static calculateMonthlyBreakdown(
    records: LearnerAttendanceRecord[]
  ): MonthlyAttendance[] {
    const monthlyGroups = records.reduce((acc, record) => {
      const date = parseISO(record.attendance_date);
      const monthKey = format(date, 'yyyy-MM');

      if (!acc[monthKey]) {
        acc[monthKey] = [];
      }
      acc[monthKey].push(record);
      return acc;
    }, {} as Record<string, LearnerAttendanceRecord[]>);

    return Object.entries(monthlyGroups)
      .map(([monthKey, monthRecords]) => {
        const date = parseISO(monthKey + '-01');
        const dayGroups = monthRecords.reduce((acc, record) => {
          const date = record.attendance_date;
          if (!acc[date]) {
            acc[date] = [];
          }
          acc[date].push(record);
          return acc;
        }, {} as Record<string, LearnerAttendanceRecord[]>);

        const totalDays = Object.keys(dayGroups).length;
        const presentDays = Object.values(dayGroups).filter((dayRecords) =>
          dayRecords.some((r) => r.status === 'Present')
        ).length;

        const totalPeriods = monthRecords.length;
        const attendedPeriods = monthRecords.filter(
          (r) => r.status === 'Present'
        ).length;

        return {
          month: format(date, 'MMMM'),
          year: date.getFullYear(),
          total_days: totalDays,
          present_days: presentDays,
          percentage: totalDays > 0 ? (presentDays / totalDays) * 100 : 0,
          total_periods: totalPeriods,
          attended_periods: attendedPeriods
        };
      })
      .sort(
        (a, b) =>
          b.year - a.year ||
          new Date(a.month + ' 1').getMonth() -
            new Date(b.month + ' 1').getMonth()
      );
  }

  /**
   * Calculate attendance trend data
   */
  private static calculateTrendData(
    records: LearnerAttendanceRecord[]
  ): AttendanceTrend[] {
    // Group by week and calculate weekly attendance percentage
    const weeklyGroups = records.reduce((acc, record) => {
      const date = parseISO(record.attendance_date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
      const weekKey = format(weekStart, 'yyyy-MM-dd');

      if (!acc[weekKey]) {
        acc[weekKey] = [];
      }
      acc[weekKey].push(record);
      return acc;
    }, {} as Record<string, LearnerAttendanceRecord[]>);

    return Object.entries(weeklyGroups)
      .map(([weekKey, weekRecords]) => {
        const totalPeriods = weekRecords.length;
        const attendedPeriods = weekRecords.filter(
          (r) => r.status === 'Present'
        ).length;
        const percentage =
          totalPeriods > 0 ? (attendedPeriods / totalPeriods) * 100 : 0;

        return {
          date: weekKey,
          percentage: percentage,
          status: 'stable' as const // This could be calculated based on trend
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-12); // Last 12 weeks
  }

  /**
   * Generate attendance alerts
   */
  private static generateAttendanceAlerts(
    records: LearnerAttendanceRecord[],
    overallPercentage: number
  ): AttendanceAlert[] {
    const alerts: AttendanceAlert[] = [];

    // Low attendance alert
    if (overallPercentage < 75) {
      alerts.push({
        id: 'low_attendance',
        type: 'low_attendance',
        severity:
          overallPercentage < 60
            ? 'critical'
            : overallPercentage < 70
            ? 'high'
            : 'medium',
        title: 'Low Attendance Warning',
        message: `Your attendance is ${overallPercentage.toFixed(
          1
        )}%. Minimum required is 75%.`,
        suggested_action:
          'Attend classes regularly to improve your attendance percentage.',
        created_at: new Date().toISOString()
      });
    }

    // Check for consecutive absences
    const recentRecords = records
      .sort(
        (a, b) =>
          new Date(b.attendance_date).getTime() -
          new Date(a.attendance_date).getTime()
      )
      .slice(0, 10);

    let consecutiveAbsences = 0;
    for (const record of recentRecords) {
      if (record.status === 'Absent') {
        consecutiveAbsences++;
      } else {
        break;
      }
    }

    if (consecutiveAbsences >= 3) {
      alerts.push({
        id: 'consecutive_absence',
        type: 'consecutive_absence',
        severity: consecutiveAbsences >= 5 ? 'critical' : 'high',
        title: 'Consecutive Absences Detected',
        message: `You have been absent for ${consecutiveAbsences} consecutive periods.`,
        suggested_action:
          'Please contact your faculty advisor if there are any issues.',
        created_at: new Date().toISOString()
      });
    }

    return alerts;
  }

  /**
   * Generate calendar data for attendance visualization
   */
  private static generateCalendarData(
    records: LearnerAttendanceRecord[]
  ): AttendanceCalendarData[] {
    const dayGroups = records.reduce((acc, record) => {
      const date = record.attendance_date;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(record);
      return acc;
    }, {} as Record<string, LearnerAttendanceRecord[]>);

    return Object.entries(dayGroups).map(([date, dayRecords]) => {
      const totalPeriods = dayRecords.length;
      const presentPeriods = dayRecords.filter(
        (r) => r.status === 'Present'
      ).length;
      const percentage =
        totalPeriods > 0 ? (presentPeriods / totalPeriods) * 100 : 0;

      let status: 'present' | 'absent' | 'partial' | 'holiday' | 'weekend';
      if (percentage === 100) {
        status = 'present';
      } else if (percentage === 0) {
        status = 'absent';
      } else {
        status = 'partial';
      }

      return {
        date,
        status,
        percentage,
        periods: {
          present: presentPeriods,
          total: totalPeriods
        },
        courses: Array.from(new Set(dayRecords.map((r) => r.course_name)))
      };
    });
  }

  /**
   * Group attendance records by day
   */
  private static groupAttendanceByDay(
    records: LearnerAttendanceRecord[]
  ): LearnerAttendanceDay[] {
    const dayGroups = records.reduce((acc, record) => {
      const date = record.attendance_date;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(record);
      return acc;
    }, {} as Record<string, LearnerAttendanceRecord[]>);

    return Object.entries(dayGroups)
      .map(([date, dayRecords]) => {
        const totalPeriods = dayRecords.length;
        const attendedPeriods = dayRecords.filter(
          (r) => r.status === 'Present'
        ).length;
        const parsedDate = parseISO(date);

        return {
          date,
          day_name: format(parsedDate, 'EEEE'),
          total_periods: totalPeriods,
          attended_periods: attendedPeriods,
          attendance_percentage:
            totalPeriods > 0 ? (attendedPeriods / totalPeriods) * 100 : 0,
          periods: dayRecords.sort((a, b) =>
            a.start_time.localeCompare(b.start_time)
          )
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  /**
   * Get student ID from profile/auth
   */
  static async getStudentIdFromProfile(
    profileEmail: string
  ): Promise<string | null> {
    try {
      // Try to find student by matching email with student_email or college_email
      const { data: student } = await this.supabase
        .from('students')
        .select('id')
        .or(`student_email.eq.${profileEmail},college_email.eq.${profileEmail}`)
        .single();

      return student?.id || null;
    } catch (error) {
      console.error('Error getting student ID from profile:', error);
      return null;
    }
  }

  /**
   * Get student ID directly from profile ID by joining with profiles table
   */
  static async getStudentIdFromProfileId(
    profileId: string
  ): Promise<string | null> {
    try {
      // First get the profile email
      const { data: profile } = await this.supabase
        .from('profiles')
        .select('email')
        .eq('id', profileId)
        .single();

      if (!profile?.email) {
        throw new Error('Profile email not found');
      }

      // Then find the student record
      return await this.getStudentIdFromProfile(profile.email);
    } catch (error) {
      console.error('Error getting student ID from profile ID:', error);
      return null;
    }
  }
}
