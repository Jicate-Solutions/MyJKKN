/**
 * Student Attendance Service
 * Created: 2025-12-29
 * Description: Service layer for student self-service attendance view
 */

import { createClient } from '@/lib/supabase/server';
import type {
  StudentAttendanceRecord,
  AttendanceStatistics,
  CourseAttendance,
  TrendData,
  ExportData
} from '@/types/student-attendance';

export class StudentAttendanceService {
  /**
   * Get attendance records for a student in a specific semester
   * Parses JSONB attendance_data to extract individual student records
   */
  static async getStudentAttendanceBySemester(
    learnerId: string,
    semesterId: string
  ): Promise<StudentAttendanceRecord[]> {
    const supabase = await createClient();

    // 1. Get student's section_id and basic info
    const { data: learner, error: learnerError } = await supabase
      .from('learners_profiles')
      .select('section_id, first_name, last_name')
      .eq('id', learnerId)
      .single();

    if (learnerError || !learner) {
      console.error('[learners/attendance] Failed to fetch learner profile:', learnerError);
      return [];
    }

    // 2. Get timetables for the semester
    const { data: timetables, error: timetablesError } = await supabase
      .from('timetables')
      .select('id, periods, timetable_data')
      .eq('semester_id', semesterId)
      .eq('section_id', learner.section_id)
      .eq('is_active', true);

    if (timetablesError || !timetables?.length) {
      console.warn('[learners/attendance] No timetables found:', { semesterId, sectionId: learner.section_id });
      return [];
    }

    // 3. Get attendance records (RLS automatically filters to student's section)
    const { data: attendance, error: attendanceError } = await supabase
      .from('student_attendance')
      .select('attendance_date, attendance_data, timetable_id')
      .in('timetable_id', timetables.map(t => t.id))
      .eq('section_id', learner.section_id)
      .order('attendance_date', { ascending: false });

    if (attendanceError) {
      console.error('[learners/attendance] Failed to fetch attendance records:', attendanceError);
      return [];
    }

    if (!attendance || attendance.length === 0) {
      console.warn('[learners/attendance] No attendance records found:', { learnerId, semesterId });
      return [];
    }

    // 4. Extract student's attendance from JSONB
    const records: StudentAttendanceRecord[] = [];

    for (const record of attendance) {
      const attendanceData = record.attendance_data as any;
      const timetable = timetables.find(t => t.id === record.timetable_id);

      if (!attendanceData || !timetable) continue;

      // Iterate through each period in the attendance data
      for (const [periodId, periodData] of Object.entries(attendanceData)) {
        const students = (periodData as any).students || [];
        const studentData = students.find((s: any) => s.student_id === learnerId);

        if (studentData) {
          const periodInfo = (timetable.periods as any[])?.find(
            p => p.period_id === periodId
          );

          records.push({
            date: record.attendance_date,
            period_name: periodInfo?.period_name || 'Period',
            start_time: periodInfo?.start_time || '',
            end_time: periodInfo?.end_time || '',
            course_name: (periodData as any).course_name || 'Unknown',
            course_code: (periodData as any).course_code,
            status: studentData.status,
            marked_at: studentData.marked_at
          });
        }
      }
    }

    return records;
  }

  /**
   * Calculate attendance statistics for a semester
   */
  static async getAttendanceStatistics(
    learnerId: string,
    semesterId: string
  ): Promise<AttendanceStatistics> {
    const records = await this.getStudentAttendanceBySemester(learnerId, semesterId);

    const totalClasses = records.length;
    const presentCount = records.filter(r => r.status === 'Present').length;
    const absentCount = totalClasses - presentCount;
    const percentage = totalClasses > 0 ? Math.round((presentCount / totalClasses) * 100) : 0;

    return {
      totalClasses,
      presentCount,
      absentCount,
      percentage,
      threshold: 75,
      isAboveThreshold: percentage >= 75
    };
  }

  /**
   * Get course-wise attendance breakdown
   */
  static async getCourseWiseAttendance(
    learnerId: string,
    semesterId: string
  ): Promise<CourseAttendance[]> {
    const records = await this.getStudentAttendanceBySemester(learnerId, semesterId);

    const courseMap = new Map<string, CourseAttendance>();

    records.forEach(record => {
      const key = record.course_code || record.course_name;

      if (!courseMap.has(key)) {
        courseMap.set(key, {
          course_name: record.course_name,
          course_code: record.course_code,
          total: 0,
          present: 0,
          absent: 0,
          percentage: 0
        });
      }

      const course = courseMap.get(key)!;
      course.total++;
      if (record.status === 'Present') {
        course.present++;
      } else {
        course.absent++;
      }
    });

    return Array.from(courseMap.values())
      .map(c => ({
        ...c,
        percentage: c.total > 0 ? Math.round((c.present / c.total) * 100) : 0
      }))
      .sort((a, b) => a.course_name.localeCompare(b.course_name));
  }

  /**
   * Get attendance trend data for chart (last N days)
   */
  static async getAttendanceTrend(
    learnerId: string,
    semesterId: string,
    days = 30
  ): Promise<TrendData[]> {
    const records = await this.getStudentAttendanceBySemester(learnerId, semesterId);

    // Filter to last N days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentRecords = records
      .filter(r => {
        const recordDate = new Date(r.date);
        return recordDate >= cutoffDate;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Group by date and calculate daily percentage
    const trendMap = new Map<string, { total: number; present: number }>();

    recentRecords.forEach(record => {
      if (!trendMap.has(record.date)) {
        trendMap.set(record.date, { total: 0, present: 0 });
      }
      const dayData = trendMap.get(record.date)!;
      dayData.total++;
      if (record.status === 'Present') {
        dayData.present++;
      }
    });

    return Array.from(trendMap.entries()).map(([date, data]) => ({
      date,
      percentage: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0
    }));
  }

  /**
   * Export attendance data (for PDF/Excel generation)
   */
  static async exportAttendanceData(
    learnerId: string,
    semesterId: string
  ): Promise<ExportData> {
    const supabase = await createClient();

    // Fetch all data in parallel
    const [learnerResult, semesterResult, statistics, courseWise, records] = await Promise.all([
      supabase
        .from('learners_profiles')
        .select('first_name, last_name, roll_number, section:sections(section_name)')
        .eq('id', learnerId)
        .single(),
      supabase
        .from('semesters')
        .select('semester_name, academic_year:academic_years(year_range)')
        .eq('id', semesterId)
        .single(),
      this.getAttendanceStatistics(learnerId, semesterId),
      this.getCourseWiseAttendance(learnerId, semesterId),
      this.getStudentAttendanceBySemester(learnerId, semesterId)
    ]);

    return {
      student: {
        name: `${learnerResult.data?.first_name || ''} ${learnerResult.data?.last_name || ''}`.trim(),
        roll_number: learnerResult.data?.roll_number || '',
        section: (learnerResult.data?.section as any)?.section_name || ''
      },
      semester: {
        name: semesterResult.data?.semester_name || '',
        academic_year: (semesterResult.data?.academic_year as any)?.year_range || ''
      },
      statistics,
      courseWise,
      records
    };
  }
}
