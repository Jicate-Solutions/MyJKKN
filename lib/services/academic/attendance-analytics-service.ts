import { getSupabaseClient } from '@/lib/supabase/client';
import type { Database } from '@/types/supabase';
import { format } from 'date-fns';

export interface AnalyticsFilters {
  institution_id: string;
  start_date: string;
  end_date: string;
  degree_id?: string;
  program_id?: string;
  department_id?: string;
  semester_id?: string;
  section_id?: string;
}

export interface FacultyAttendanceStats {
  staff_id: string;
  staff_name: string;
  staff_designation: string;
  total_periods: number;
  attendance_taken: number;
  attendance_not_taken: number;
  attendance_percentage: number;
  staff_email?: string;
  assigned_courses?: string;
  total_courses_assigned?: number;
}

export interface CourseAttendanceStats {
  course_id: string;
  course_name: string;
  course_code: string;
  assigned_staff?: string;
  total_periods: number;
  attendance_taken: number;
  attendance_not_taken: number;
  attendance_percentage: number;
  avg_student_attendance: number;
  total_students?: number;
}

export interface StudentAttendanceStats {
  student_id: string;
  student_name: string;
  student_roll_number: string;
  total_periods: number;
  present_periods: number;
  absent_periods: number;
  attendance_percentage: number;
}

export interface OverallAttendanceSummary {
  total_scheduled_periods: number;
  total_attendance_taken: number;
  total_attendance_pending: number;
  overall_attendance_percentage: number;
  total_students: number;
  avg_student_attendance: number;
}

export interface FilterOptions {
  institutions: Array<{ id: string; name: string }>;
  degrees: Array<{ id: string; name: string; short_name: string }>;
  departments: Array<{ id: string; name: string; code: string }>;
  programs: Array<{ id: string; name: string; code: string }>;
  semesters: Array<{ id: string; name: string; code: string }>;
  sections: Array<{ id: string; name: string; code: string }>;
}

export interface AttendanceReportFilters {
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  academic_year_id?: string;
  staff_id?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: string;
  selected_ids?: string[];
}

export interface AttendanceReportRecord {
  id: string;
  period_id: string; // Add period_id for consistent navigation
  attendance_date: string;
  institution_name: string;
  department_name: string;
  program_name: string;
  semester_name: string;
  section_name: string;
  course_name: string;
  course_code: string;
  period_name: string;
  start_time: string;
  end_time: string;
  faculty_name: string; // This might be incorrect from DB - showing marked_by instead of assigned faculty
  assigned_faculty?: string; // New field for properly assigned faculty
  assigned_faculty_list?: Array<{
    id: string;
    name: string;
    email: string;
    isPrimary?: boolean;
  }>; // Support multiple staff
  total_students: number;
  present_count: number;
  absent_count: number;
  attendance_percentage: number;
  marked_by: string;
  marked_at: string;
  total_count: number;
}

export interface AttendanceReportDetails {
  id: string;
  attendance_date: string;
  institution_name: string;
  department_name: string;
  program_name: string;
  semester_name: string;
  section_name: string;
  section_code: string;
  course_name: string;
  course_code: string;
  period_name: string;
  start_time: string;
  end_time: string;
  faculty_name: string; // This might be incorrect from DB - showing marked_by instead of assigned faculty
  faculty_email: string;
  assigned_faculty?: string; // New field for properly assigned faculty
  assigned_faculty_list?: Array<{
    id: string;
    name: string;
    email: string;
    isPrimary?: boolean;
  }>; // Support multiple staff
  total_students: number;
  present_count: number;
  absent_count: number;
  attendance_percentage: number;
  marked_by:
    | string
    | {
        id: string;
        email: string;
        full_name: string;
      };
  marked_at: string;
  students_data: Array<{
    student_id: string;
    student_name: string;
    student_email: string;
    roll_number: string;
    status: 'Present' | 'Absent';
    marked_at: string;
  }>;
  period_data: {
    course_id: string;
    period_id: string;
    timetable_info: {
      day: string;
      timing: string;
    };
  };
  degree_name: string;
  academic_year_name: string;
}

export class AttendanceAnalyticsService {
  private static getSupabase() {
    return getSupabaseClient();
  }

  /**
   * Get faculty attendance statistics
   */
  static async getFacultyAttendanceStats(
    filters: AnalyticsFilters
  ): Promise<FacultyAttendanceStats[]> {
    try {
      const supabase = this.getSupabase();

      // Build RPC parameters
      const params = {
        p_institution_id: filters.institution_id,
        p_start_date: filters.start_date,
        p_end_date: filters.end_date,
        p_degree_id: filters.degree_id || null,
        p_program_id: filters.program_id || null,
        p_department_id: filters.department_id || null,
        p_semester_id: filters.semester_id || null,
        p_section_id: filters.section_id || null
      };

      // Call the stored procedure
      const { data, error } = await supabase.rpc(
        'get_faculty_attendance_stats',
        params
      );

      if (error) throw error;

      // Map database field names to frontend interface field names
      const mappedData = (data || []).map((item: any) => ({
        staff_id: item.staff_id,
        staff_name: item.staff_name,
        staff_designation: item.staff_designation,
        total_periods: item.total_periods,
        attendance_taken: item.attendance_taken,
        attendance_not_taken: item.attendance_not_taken,
        attendance_percentage: item.attendance_percentage,
        staff_email: item.staff_email,
        assigned_courses: item.assigned_courses,
        total_courses_assigned: item.total_courses_assigned
      }));

      return mappedData;
    } catch (error) {
      console.error('Error fetching faculty attendance stats:', error);
      throw error;
    }
  }

  /**
   * Get course attendance statistics
   */
  static async getCourseAttendanceStats(
    filters: AnalyticsFilters
  ): Promise<CourseAttendanceStats[]> {
    try {
      const supabase = this.getSupabase();

      // Convert semester_id and section_id to text values
      let semesterText = null;
      let sectionText = null;

      if (filters.semester_id) {
        const { data: semester } = await supabase
          .from('semesters')
          .select('semester_name')
          .eq('id', filters.semester_id)
          .single();
        semesterText = semester?.semester_name || null;
      }

      if (filters.section_id) {
        const { data: section } = await supabase
          .from('sections')
          .select('section_name')
          .eq('id', filters.section_id)
          .single();
        sectionText = section?.section_name || null;
      }

      // Use the new proper course attendance stats function
      const { data, error } = await supabase.rpc(
        'get_proper_course_attendance_stats',
        {
          p_institution_id: filters.institution_id,
          p_start_date: filters.start_date,
          p_end_date: filters.end_date,
          p_degree_id: filters.degree_id || null,
          p_program_id: filters.program_id || null,
          p_department_id: filters.department_id || null,
          p_semester_text: semesterText,
          p_section_text: sectionText
        }
      );

      if (error) throw error;

      // Map database field names to frontend interface field names
      const mappedData = (data || []).map((item: any) => ({
        course_id: item.course_id,
        course_name: item.course_name,
        course_code: item.course_code,
        assigned_staff: item.assigned_staff,
        total_periods: item.total_scheduled_periods,
        attendance_taken: item.attendance_marked_periods,
        attendance_not_taken:
          item.total_scheduled_periods - item.attendance_marked_periods, // Calculate not taken
        attendance_percentage: item.attendance_percentage,
        avg_student_attendance: item.avg_student_attendance,
        total_students: item.total_students
      }));

      return mappedData;
    } catch (error) {
      console.error('Error fetching course attendance stats:', error);
      throw error;
    }
  }

  /**
   * Get student attendance statistics
   */
  static async getStudentAttendanceStats(
    filters: AnalyticsFilters
  ): Promise<StudentAttendanceStats[]> {
    try {
      const supabase = this.getSupabase();

      // Call the stored procedure
      const { data, error } = await supabase.rpc(
        'get_student_attendance_stats',
        {
          p_institution_id: filters.institution_id,
          p_start_date: filters.start_date,
          p_end_date: filters.end_date,
          p_degree_id: filters.degree_id || null,
          p_program_id: filters.program_id || null,
          p_department_id: filters.department_id || null,
          p_semester_id: filters.semester_id || null,
          p_section_id: filters.section_id || null
        }
      );

      if (error) throw error;

      // Map database field names to frontend interface field names
      const mappedData = (data || []).map((item: any) => ({
        student_id: item.student_id,
        student_name: item.student_name,
        student_roll_number: item.student_roll_number,
        total_periods: item.total_periods,
        present_periods: item.present_periods,
        absent_periods: item.absent_periods,
        attendance_percentage: item.attendance_percentage
      }));

      return mappedData;
    } catch (error) {
      console.error('Error fetching student attendance stats:', error);
      throw error;
    }
  }

  /**
   * Get overall attendance summary
   */
  static async getOverallAttendanceSummary(
    filters: AnalyticsFilters
  ): Promise<OverallAttendanceSummary> {
    try {
      const supabase = this.getSupabase();

      // Call the stored procedure
      const { data, error } = await supabase.rpc(
        'get_overall_attendance_summary',
        {
          p_institution_id: filters.institution_id,
          p_start_date: filters.start_date,
          p_end_date: filters.end_date,
          p_degree_id: filters.degree_id || null,
          p_program_id: filters.program_id || null,
          p_department_id: filters.department_id || null,
          p_semester_id: filters.semester_id || null,
          p_section_id: filters.section_id || null
        }
      );

      if (error) throw error;

      // Return the first record (summary is a single row)
      const summary = data?.[0];
      if (!summary) {
        // Return default values if no data
        return {
          total_scheduled_periods: 0,
          total_attendance_taken: 0,
          total_attendance_pending: 0,
          overall_attendance_percentage: 0,
          total_students: 0,
          avg_student_attendance: 0
        };
      }

      return {
        total_scheduled_periods: summary.total_scheduled_periods || 0,
        total_attendance_taken: summary.total_attendance_taken || 0,
        total_attendance_pending: summary.total_attendance_pending || 0,
        overall_attendance_percentage:
          summary.overall_attendance_percentage || 0,
        total_students: summary.total_students || 0,
        avg_student_attendance: summary.avg_student_attendance || 0
      };
    } catch (error) {
      console.error('Error fetching overall attendance summary:', error);
      throw error;
    }
  }

  /**
   * Get filter options based on user permissions
   */
  static async getFilterOptions(
    institutionId?: string
  ): Promise<FilterOptions> {
    try {
      const supabase = this.getSupabase();
      const options: FilterOptions = {
        institutions: [],
        degrees: [],
        departments: [],
        programs: [],
        semesters: [],
        sections: []
      };

      // Get institutions
      const { data: institutions } = await supabase
        .from('institutions')
        .select('id, name')
        .order('name');
      options.institutions = institutions || [];

      // If institution is selected, get related data
      if (institutionId) {
        // Get degrees
        const { data: degrees } = await supabase
          .from('degrees')
          .select('id, degree_name, degree_id')
          .eq('institution_id', institutionId)
          .order('degree_name');
        options.degrees = (degrees || []).map((d) => ({
          id: d.id,
          name: d.degree_name,
          short_name: d.degree_id || d.degree_name // Use degree_id as short name
        }));

        // Get departments
        const { data: departments } = await supabase
          .from('departments')
          .select('id, department_name, department_code')
          .eq('institution_id', institutionId)
          .order('department_name');
        options.departments = (departments || []).map((d) => ({
          id: d.id,
          name: d.department_name,
          code: d.department_code
        }));

        // Get programs
        const { data: programs } = await supabase
          .from('programs')
          .select('id, program_name, program_id')
          .eq('institution_id', institutionId)
          .order('program_name');
        options.programs = (programs || []).map((p) => ({
          id: p.id,
          name: p.program_name,
          code: p.program_id
        }));

        // Get semesters
        const { data: semesters } = await supabase
          .from('semesters')
          .select('id, semester_name, semester_code')
          .eq('institution_id', institutionId)
          .order('semester_code');
        options.semesters = (semesters || []).map((s) => ({
          id: s.id,
          name: s.semester_name,
          code: s.semester_code
        }));

        // Get sections
        const { data: sections } = await supabase
          .from('sections')
          .select('id, section_name, section_code')
          .eq('institution_id', institutionId)
          .order('section_name');
        options.sections = (sections || []).map((s) => ({
          id: s.id,
          name: s.section_name,
          code: s.section_code || s.section_name
        }));
      }

      return options;
    } catch (error) {
      console.error('Error fetching filter options:', error);
      throw error;
    }
  }

  // ... rest of the file continues without changes until getAttendanceStatistics

  /**
   * Get attendance statistics
   * Respects role-based filtering:
   * - Super admin: sees all data
   * - Principal/Admin: sees institution data
   * - Faculty: sees only their own attendance data (via staff_id filter)
   * - Filters are applied via institution_id and staff_id parameters
   */
  static async getAttendanceStatistics(filters?: AttendanceReportFilters) {
    try {
      const supabase = this.getSupabase();

      console.log('getAttendanceStatistics called with filters:', filters);

      // Get today's date
      const today = new Date().toISOString().split('T')[0];

      // For faculty users with staff_id filter, we need to use the reports API
      // which properly filters by staff assignments
      if (filters?.staff_id) {
        console.log('Faculty mode: Using staff_id filter:', filters.staff_id);
        // Helper function to convert empty strings to null
        const sanitizeParam = (value: string | undefined): string | null => {
          return value && value.trim() !== '' ? value : null;
        };

        // Use the attendance reports API to get proper counts for faculty
        const { data: reportData, error: reportError } = await supabase.rpc(
          'get_attendance_report_list',
          {
            p_institution_id: sanitizeParam(filters.institution_id),
            p_staff_id: sanitizeParam(filters.staff_id),
            p_start_date: sanitizeParam(filters.start_date),
            p_end_date: sanitizeParam(filters.end_date),
            p_page: 1,
            p_limit: 1000, // Get a large batch to calculate statistics
            p_sort_by: 'attendance_date',
            p_sort_order: 'desc'
          }
        );

        if (reportError) throw reportError;

        // Calculate statistics from the faculty's actual records
        const facultyRecords = reportData || [];
        const totalSessions = facultyRecords.length;

        // Get today's records for this faculty
        const todayRecords = facultyRecords.filter(
          (record: any) => record.attendance_date === today
        );

        let presentToday = 0;
        let absentToday = 0;
        todayRecords.forEach((record: any) => {
          presentToday += record.present_count || 0;
          absentToday += record.absent_count || 0;
        });

        // Calculate averages from faculty's records
        let totalPresent = 0;
        let totalStudents = 0;
        let excellentCount = 0;
        let poorCount = 0;

        facultyRecords.forEach((record: any) => {
          const presentCount = record.present_count || 0;
          const totalCount = record.total_students || 0;
          const percentage = record.attendance_percentage || 0;

          totalPresent += presentCount;
          totalStudents += totalCount;

          if (percentage >= 90) excellentCount++;
          if (percentage < 50) poorCount++;
        });

        const averageAttendance =
          totalStudents > 0 ? (totalPresent / totalStudents) * 100 : 0;

        // Calculate trend for faculty
        const lastWeekStart = new Date();
        lastWeekStart.setDate(lastWeekStart.getDate() - 14);
        const thisWeekStart = new Date();
        thisWeekStart.setDate(thisWeekStart.getDate() - 7);

        const lastWeekRecords = facultyRecords.filter((record: any) => {
          const recordDate = new Date(record.attendance_date);
          return recordDate >= lastWeekStart && recordDate < thisWeekStart;
        });

        const thisWeekRecords = facultyRecords.filter((record: any) => {
          const recordDate = new Date(record.attendance_date);
          return recordDate >= thisWeekStart;
        });

        // Calculate weekly averages
        let lastWeekAvg = 0;
        if (lastWeekRecords.length > 0) {
          const lastWeekSum = lastWeekRecords.reduce(
            (sum: number, r: any) => sum + (r.attendance_percentage || 0),
            0
          );
          lastWeekAvg = lastWeekSum / lastWeekRecords.length;
        }

        let thisWeekAvg = 0;
        if (thisWeekRecords.length > 0) {
          const thisWeekSum = thisWeekRecords.reduce(
            (sum: number, r: any) => sum + (r.attendance_percentage || 0),
            0
          );
          thisWeekAvg = thisWeekSum / thisWeekRecords.length;
        }

        const trendDiff = thisWeekAvg - lastWeekAvg;
        const attendanceTrend: 'up' | 'down' | 'stable' =
          trendDiff > 1 ? 'up' : trendDiff < -1 ? 'down' : 'stable';

        // Get unique students count from faculty's records
        const uniqueStudents = new Set<number>();
        facultyRecords.forEach((record: any) => {
          uniqueStudents.add(record.total_students || 0);
        });

        return {
          totalSessions,
          totalStudents: Math.max(...Array.from(uniqueStudents), 0),
          averageAttendance,
          presentToday,
          absentToday,
          excellentAttendance: excellentCount,
          poorAttendance: poorCount,
          attendanceTrend,
          trendPercentage: Math.abs(trendDiff).toFixed(1)
        };
      }

      // For non-faculty users, use the existing logic
      // Build filter conditions
      let query = supabase
        .from('student_attendance')
        .select('*', { count: 'exact' });

      if (filters?.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }
      if (filters?.section_id) {
        query = query.eq('section_id', filters.section_id);
      }
      if (filters?.start_date) {
        query = query.gte('attendance_date', filters.start_date);
      }
      if (filters?.end_date) {
        query = query.lte('attendance_date', filters.end_date);
      }

      // Get total sessions count
      const { count: totalSessions } = await query;

      // Get today's attendance - fetch ALL records for today
      let todayQuery = supabase
        .from('student_attendance')
        .select('attendance_data')
        .eq('attendance_date', today);

      // Apply filters to today's data as well
      if (filters?.institution_id) {
        todayQuery = todayQuery.eq('institution_id', filters.institution_id);
      }
      if (filters?.section_id) {
        todayQuery = todayQuery.eq('section_id', filters.section_id);
      }

      const { data: todayRecords } = await todayQuery;

      let presentToday = 0;
      let absentToday = 0;

      // Aggregate all today's records
      (todayRecords || []).forEach((record) => {
        if (record.attendance_data) {
          Object.values(record.attendance_data).forEach((period: any) => {
            if (period.students && Array.isArray(period.students)) {
              period.students.forEach((student: any) => {
                if (student.status === 'Present') presentToday++;
                else if (student.status === 'Absent') absentToday++;
              });
            }
          });
        }
      });

      // Calculate average attendance from recent records
      let recentQuery = supabase
        .from('student_attendance')
        .select('attendance_data')
        .order('attendance_date', { ascending: false })
        .limit(100);

      // Apply filters to recent records
      if (filters?.institution_id) {
        recentQuery = recentQuery.eq('institution_id', filters.institution_id);
      }
      if (filters?.section_id) {
        recentQuery = recentQuery.eq('section_id', filters.section_id);
      }
      if (filters?.start_date) {
        recentQuery = recentQuery.gte('attendance_date', filters.start_date);
      }
      if (filters?.end_date) {
        recentQuery = recentQuery.lte('attendance_date', filters.end_date);
      }

      const { data: recentRecords } = await recentQuery;

      let totalPresent = 0;
      let totalCount = 0;
      let excellentCount = 0;
      let poorCount = 0;

      (recentRecords || []).forEach((record) => {
        if (record.attendance_data) {
          Object.values(record.attendance_data).forEach((period: any) => {
            if (period.students && Array.isArray(period.students)) {
              const presentInPeriod = period.students.filter(
                (s: any) => s.status === 'Present'
              ).length;
              const totalInPeriod = period.students.length;

              totalPresent += presentInPeriod;
              totalCount += totalInPeriod;

              const percentage =
                totalInPeriod > 0 ? (presentInPeriod / totalInPeriod) * 100 : 0;
              if (percentage >= 90) excellentCount++;
              if (percentage < 50) poorCount++;
            }
          });
        }
      });

      const averageAttendance =
        totalCount > 0 ? (totalPresent / totalCount) * 100 : 0;

      // Calculate trend (comparing this week to last week)
      const lastWeekStart = new Date();
      lastWeekStart.setDate(lastWeekStart.getDate() - 14);
      const thisWeekStart = new Date();
      thisWeekStart.setDate(thisWeekStart.getDate() - 7);

      let lastWeekQuery = supabase
        .from('student_attendance')
        .select('attendance_data')
        .gte('attendance_date', lastWeekStart.toISOString().split('T')[0])
        .lt('attendance_date', thisWeekStart.toISOString().split('T')[0]);

      let thisWeekQuery = supabase
        .from('student_attendance')
        .select('attendance_data')
        .gte('attendance_date', thisWeekStart.toISOString().split('T')[0]);

      // Apply filters to trend queries
      if (filters?.institution_id) {
        lastWeekQuery = lastWeekQuery.eq(
          'institution_id',
          filters.institution_id
        );
        thisWeekQuery = thisWeekQuery.eq(
          'institution_id',
          filters.institution_id
        );
      }
      if (filters?.section_id) {
        lastWeekQuery = lastWeekQuery.eq('section_id', filters.section_id);
        thisWeekQuery = thisWeekQuery.eq('section_id', filters.section_id);
      }

      const { data: lastWeekData } = await lastWeekQuery;
      const { data: thisWeekData } = await thisWeekQuery;

      let lastWeekAvg = 0;
      let thisWeekAvg = 0;

      // Calculate last week average
      let lastWeekPresent = 0;
      let lastWeekTotal = 0;
      (lastWeekData || []).forEach((record) => {
        if (record.attendance_data) {
          Object.values(record.attendance_data).forEach((period: any) => {
            if (period.students && Array.isArray(period.students)) {
              lastWeekPresent += period.students.filter(
                (s: any) => s.status === 'Present'
              ).length;
              lastWeekTotal += period.students.length;
            }
          });
        }
      });
      lastWeekAvg =
        lastWeekTotal > 0 ? (lastWeekPresent / lastWeekTotal) * 100 : 0;

      // Calculate this week average
      let thisWeekPresent = 0;
      let thisWeekTotal = 0;
      (thisWeekData || []).forEach((record) => {
        if (record.attendance_data) {
          Object.values(record.attendance_data).forEach((period: any) => {
            if (period.students && Array.isArray(period.students)) {
              thisWeekPresent += period.students.filter(
                (s: any) => s.status === 'Present'
              ).length;
              thisWeekTotal += period.students.length;
            }
          });
        }
      });
      thisWeekAvg =
        thisWeekTotal > 0 ? (thisWeekPresent / thisWeekTotal) * 100 : 0;

      const trendDiff = thisWeekAvg - lastWeekAvg;
      const attendanceTrend: 'up' | 'down' | 'stable' =
        trendDiff > 1 ? 'up' : trendDiff < -1 ? 'down' : 'stable';

      // Get unique students count
      const studentIds = new Set<string>();
      (recentRecords || []).forEach((record) => {
        if (record.attendance_data) {
          Object.values(record.attendance_data).forEach((period: any) => {
            if (period.students && Array.isArray(period.students)) {
              period.students.forEach((student: any) => {
                if (student.student_id) studentIds.add(student.student_id);
              });
            }
          });
        }
      });

      return {
        totalSessions: totalSessions || 0,
        totalStudents: studentIds.size,
        averageAttendance,
        presentToday,
        absentToday,
        excellentAttendance: excellentCount,
        poorAttendance: poorCount,
        attendanceTrend,
        trendPercentage: Math.abs(trendDiff).toFixed(1)
      };
    } catch (error) {
      console.error('Error fetching attendance statistics:', error);
      throw error;
    }
  }

  // ... rest of the methods continue unchanged

  /**
   * Get attendance reports list
   */
  static async getAttendanceReports(
    filters: AttendanceReportFilters
  ): Promise<AttendanceReportRecord[]> {
    try {
      const supabase = this.getSupabase();

      // Helper function to convert empty strings to null
      const sanitizeParam = (value: string | undefined): string | null => {
        if (!value || value.trim() === '' || value === 'undefined') {
          return null;
        }
        return value;
      };

      const rpcParams = {
        p_institution_id: sanitizeParam(filters.institution_id),
        p_degree_id: sanitizeParam(filters.degree_id),
        p_department_id: sanitizeParam(filters.department_id),
        p_program_id: sanitizeParam(filters.program_id),
        p_semester_id: sanitizeParam(filters.semester_id),
        p_section_id: sanitizeParam(filters.section_id),
        p_academic_year_id: sanitizeParam(filters.academic_year_id),
        p_staff_id: sanitizeParam(filters.staff_id),
        p_start_date: sanitizeParam(filters.start_date),
        p_end_date: sanitizeParam(filters.end_date),
        p_page: filters.page || 1,
        p_limit: filters.limit || 10,
        p_sort_by: filters.sort_by || 'attendance_date',
        p_sort_order: filters.sort_order || 'desc'
      };

      console.log('🔍 Sending RPC params:', rpcParams);

      const { data, error } = await supabase.rpc(
        'get_attendance_report_list',
        rpcParams
      );

      if (error) {
        // Provide more specific error message for common issues
        if (error.code === '42702') {
          console.error(
            'Database column ambiguity error. Please ensure the SQL function has properly qualified column names.',
            error
          );
          throw new Error(
            'Database configuration error. Please contact support if this persists.'
          );
        }
        throw error;
      }

      // Fix course codes that are "N/A" by looking up by course name
      console.log(
        '🔍 Original reports from DB (get_attendance_report_list):',
        data?.slice(0, 2)
      ); // Debug: Show first 2 reports

      // Check if we have the problematic case (Computer Networks vs Big Data Analytics)
      const problematicReport = data?.find(
        (r: any) => r.course_name === 'Computer Networks'
      );
      if (problematicReport) {
        console.log(
          '🚨 Found Computer Networks report - checking its actual attendance data:',
          problematicReport
        );

        // Get the actual attendance data to see what course was really taught
        const { data: actualAttendanceData, error } = await supabase
          .from('student_attendance')
          .select('id, attendance_data, timetable_id')
          .eq('id', problematicReport.id)
          .single();

        if (!error && actualAttendanceData) {
          console.log(
            '📊 Actual attendance data for Computer Networks report:',
            {
              timetable_id: actualAttendanceData.timetable_id,
              attendance_data: actualAttendanceData.attendance_data
            }
          );

          // Check what course is in the attendance_data
          if (actualAttendanceData.attendance_data) {
            const periods = Object.values(actualAttendanceData.attendance_data);
            periods.forEach((period: any, index) => {
              console.log(`📚 Period ${index + 1} actual course:`, {
                course_name: period.course_name,
                course_code: period.course_code
              });
            });
          }
        }
      }

      const reportsWithFixedCourseCode = await this.fixCourseCodesInReports(
        data || []
      );

      // Enhance reports with correct assigned faculty information
      const enhancedReports = await this.enhanceReportsWithAssignedFaculty(
        reportsWithFixedCourseCode
      );

      // Debug: Log period selection for consistency monitoring
      if (enhancedReports && enhancedReports.length > 0) {
        console.log('🔍 Period selection debug for reports:', {
          totalReports: enhancedReports.length,
          sampleReport: {
            reportId: enhancedReports[0].id,
            periodId: enhancedReports[0].period_id,
            courseName: enhancedReports[0].course_name,
            periodName: enhancedReports[0].period_name
          }
        });
      }

      console.log('🔍 Enhanced reports:', enhancedReports?.slice(0, 2)); // Debug: Show first 2 enhanced reports
      return enhancedReports;
    } catch (error) {
      console.error('Error fetching attendance reports:', error);
      throw error;
    }
  }

  /**
   * Enhance attendance reports with correct assigned faculty information
   * This fixes the issue where faculty_name shows marked_by instead of assigned faculty
   */
  private static async enhanceReportsWithAssignedFaculty(
    reports: AttendanceReportRecord[]
  ): Promise<AttendanceReportRecord[]> {
    if (!reports.length) return reports;

    try {
      const supabase = this.getSupabase();

      // Get unique attendance record IDs to fetch timetable information
      const attendanceIds = [...new Set(reports.map((r) => r.id))];

      // Fetch attendance records with timetable data
      const { data: attendanceRecords, error: attendanceError } = await supabase
        .from('student_attendance')
        .select('id, timetable_id, attendance_data')
        .in('id', attendanceIds);

      if (attendanceError) {
        console.error(
          'Error fetching attendance timetable data:',
          attendanceError
        );
        return reports; // Return original reports if we can't enhance them
      }

      // Create a map of attendance_id -> timetable_data for quick lookup
      const attendanceMap = new Map(
        attendanceRecords?.map((record) => [record.id, record]) || []
      );

      // Get unique timetable IDs to fetch timetable information
      const timetableIds = [
        ...new Set(
          attendanceRecords?.map((r) => r.timetable_id).filter(Boolean) || []
        )
      ];

      console.log('🔍 Timetable IDs to fetch:', timetableIds); // Debug

      if (!timetableIds.length) {
        console.log('🚨 No timetable IDs found!'); // Debug
        return reports;
      }

      // Fetch timetables with their timetable_data
      const { data: timetables, error: timetableError } = await supabase
        .from('timetables')
        .select('id, timetable_data')
        .in('id', timetableIds);

      if (timetableError) {
        console.error('Error fetching timetable data:', timetableError);
        return reports;
      }

      console.log(
        '🔍 Fetched timetables:',
        timetables?.map((t) => ({ id: t.id, hasData: !!t.timetable_data }))
      ); // Debug

      // Create a map of timetable_id -> timetable_data
      const timetableMap = new Map(
        timetables?.map((tt) => [tt.id, tt.timetable_data]) || []
      );

      // Get all unique staff IDs from timetable data
      const allStaffIds = new Set<string>();

      for (const report of reports) {
        const attendanceRecord = attendanceMap.get(report.id);
        if (!attendanceRecord?.timetable_id) continue;

        const timetableData = timetableMap.get(attendanceRecord.timetable_id);
        if (!timetableData || typeof timetableData !== 'object') continue;

        // Look through attendance_data to find the period/slot information
        const attendanceData = attendanceRecord.attendance_data as any;
        if (!attendanceData || typeof attendanceData !== 'object') continue;

        // Find the slot data for this period
        for (const [slotId, slotData] of Object.entries(attendanceData)) {
          if (typeof slotData === 'object' && slotData) {
            // Look for this period/slot in timetable_data
            const timetableSlots = timetableData as any;
            for (const [day, dayData] of Object.entries(timetableSlots)) {
              if (typeof dayData === 'object' && dayData) {
                for (const [periodId, periodData] of Object.entries(
                  dayData as any
                )) {
                  if (typeof periodData === 'object' && periodData) {
                    const periodInfo = periodData as any;
                    if (
                      periodInfo.staff_ids &&
                      Array.isArray(periodInfo.staff_ids)
                    ) {
                      periodInfo.staff_ids.forEach((id: string) =>
                        allStaffIds.add(id)
                      );
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Fetch staff information for all staff IDs
      console.log(
        '🔍 All staff IDs found in timetables:',
        Array.from(allStaffIds)
      ); // Debug
      let staffData: any[] = [];
      if (allStaffIds.size > 0) {
        const { data: fetchedStaff, error: staffError } = await supabase
          .from('staff')
          .select('id, first_name, last_name, email, institution_email')
          .in('id', Array.from(allStaffIds))
          .eq('is_active', true);

        if (staffError) {
          console.error('Error fetching staff data:', staffError);
        } else {
          staffData = fetchedStaff || [];
          console.log('🔍 Fetched staff data:', staffData); // Debug
        }
      } else {
        console.log('🚨 No staff IDs found in timetable data!'); // Debug
      }

      // Create staff lookup map
      const staffMap = new Map(
        staffData.map((staff) => [
          staff.id,
          {
            id: staff.id,
            name:
              `${staff.first_name || ''} ${staff.last_name || ''}`.trim() ||
              'Unknown Faculty',
            email: staff.email || staff.institution_email || 'N/A'
          }
        ])
      );

      // Now enhance each report with correct faculty information
      const enhancedReports = reports.map((report) => {
        const attendanceRecord = attendanceMap.get(report.id);
        if (!attendanceRecord?.timetable_id) {
          return { ...report }; // Return as-is if no timetable data
        }

        const timetableData = timetableMap.get(attendanceRecord.timetable_id);
        if (!timetableData) {
          return { ...report };
        }

        // Find assigned faculty for this specific period using the FIXED method
        const assignedFacultyList: Array<{
          id: string;
          name: string;
          email: string;
          isPrimary?: boolean;
        }> = [];

        // FIXED: Use the new method that correctly extracts staff from specific period only
        const { staffIds: foundStaffIds, primaryStaffId } =
          this.extractStaffFromSpecificPeriod(
            attendanceRecord,
            timetableData,
            report
          );

        // Build assigned faculty list
        foundStaffIds.forEach((staffId) => {
          const staffInfo = staffMap.get(staffId);
          if (staffInfo) {
            assignedFacultyList.push({
              ...staffInfo,
              isPrimary: staffId === primaryStaffId
            });
          }
        });

        // Sort to put primary staff first
        assignedFacultyList.sort(
          (a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)
        );

        // Create assigned faculty string (comma-separated names)
        const assigned_faculty =
          assignedFacultyList.map((f) => f.name).join(', ') || undefined;

        // Debug individual report enhancement
        if (assigned_faculty) {
          console.log(
            `✅ Enhanced report ${report.id}: ${report.course_name} -> ${assigned_faculty}`
          );
        } else {
          console.log(
            `⚠️  No faculty found for report ${report.id}: ${report.course_name}, original faculty: ${report.faculty_name}`
          );
        }

        return {
          ...report,
          assigned_faculty,
          assigned_faculty_list:
            assignedFacultyList.length > 0 ? assignedFacultyList : undefined
        };
      });

      return enhancedReports;
    } catch (error) {
      console.error('Error enhancing reports with faculty data:', error);
      return reports; // Return original reports if enhancement fails
    }
  }

  /**
   * Extract staff IDs from timetable data for a specific attendance record
   * FIXED VERSION: Only gets staff from the specific period that matches the attendance data
   */
  private static extractStaffFromSpecificPeriod(
    attendanceRecord: any,
    timetableData: any,
    report: AttendanceReportRecord
  ): { staffIds: string[]; primaryStaffId: string | null } {
    const timetableSlots = timetableData as any;
    const foundStaffIds: string[] = [];
    let primaryStaffId: string | null = null;

    // Get the specific period/slot information from attendance_data
    const attendanceData = attendanceRecord.attendance_data as any;
    console.log(
      `🔍 Extracting staff for report ${report.id}:`,
      Object.keys(attendanceData || {})
    );

    if (attendanceData && typeof attendanceData === 'object') {
      // Look for matching period slot in timetable_data using attendance_data keys
      for (const [attendanceSlotKey, attendanceSlotData] of Object.entries(
        attendanceData
      )) {
        if (typeof attendanceSlotData === 'object' && attendanceSlotData) {
          const slotInfo = attendanceSlotData as any;

          // Try to find this slot in the timetable_data
          for (const [day, dayData] of Object.entries(timetableSlots)) {
            if (typeof dayData === 'object' && dayData) {
              for (const [periodId, periodData] of Object.entries(
                dayData as any
              )) {
                if (typeof periodData === 'object' && periodData) {
                  const periodInfo = periodData as any;

                  // Match by slot_id, period_id, course_id, or other identifying info
                  const isMatchingSlot =
                    (periodInfo.slot_id &&
                      periodInfo.slot_id === attendanceSlotKey) ||
                    (slotInfo.period_id &&
                      periodInfo.period_id === slotInfo.period_id) ||
                    (slotInfo.course_id &&
                      periodInfo.course_id === slotInfo.course_id);

                  if (
                    isMatchingSlot &&
                    periodInfo.staff_ids &&
                    Array.isArray(periodInfo.staff_ids)
                  ) {
                    console.log(
                      `✅ Found exact matching slot ${attendanceSlotKey} in ${day}/${periodId} with ${periodInfo.staff_ids.length} staff:`,
                      periodInfo.staff_ids
                    );
                    foundStaffIds.push(...periodInfo.staff_ids);
                    if (periodInfo.primary_staff_id) {
                      primaryStaffId = periodInfo.primary_staff_id;
                    }
                    return {
                      staffIds: [...new Set(foundStaffIds)],
                      primaryStaffId
                    };
                  }
                }
              }
            }
          }
        }
      }
    }

    // Fallback: Try to match by period_name if slot matching failed
    if (foundStaffIds.length === 0) {
      console.log(
        `⚠️  No slot match found for report ${report.id}, trying period_name: ${report.period_name}`
      );

      for (const [day, dayData] of Object.entries(timetableSlots)) {
        if (typeof dayData === 'object' && dayData) {
          for (const [periodId, periodData] of Object.entries(dayData as any)) {
            if (typeof periodData === 'object' && periodData) {
              const periodInfo = periodData as any;

              if (
                periodInfo.period_name === report.period_name &&
                periodInfo.staff_ids &&
                Array.isArray(periodInfo.staff_ids)
              ) {
                console.log(
                  `📍 Matched by period_name: ${report.period_name} with ${periodInfo.staff_ids.length} staff`
                );
                foundStaffIds.push(...periodInfo.staff_ids);
                if (periodInfo.primary_staff_id) {
                  primaryStaffId = periodInfo.primary_staff_id;
                }
                break;
              }
            }
          }
          if (foundStaffIds.length > 0) break;
        }
      }
    }

    if (foundStaffIds.length === 0) {
      console.log(
        `🚨 No staff found for report ${report.id} - this will show as "Unknown Faculty"`
      );
    }

    return { staffIds: [...new Set(foundStaffIds)], primaryStaffId };
  }

  /**
   * Enhance attendance report details with correct assigned faculty information
   * Similar to enhanceReportsWithAssignedFaculty but for AttendanceReportDetails[]
   */
  private static async enhanceDetailsWithAssignedFaculty(
    details: AttendanceReportDetails[]
  ): Promise<AttendanceReportDetails[]> {
    if (!details.length) return details;

    try {
      const supabase = this.getSupabase();

      // Get unique attendance record IDs to fetch timetable information
      const attendanceIds = [...new Set(details.map((d) => d.id))];

      // Fetch attendance records with timetable data
      const { data: attendanceRecords, error: attendanceError } = await supabase
        .from('student_attendance')
        .select('id, timetable_id, attendance_data')
        .in('id', attendanceIds);

      if (attendanceError) {
        console.error(
          'Error fetching attendance timetable data for details:',
          attendanceError
        );
        return details; // Return original details if we can't enhance them
      }

      // Create a map of attendance_id -> timetable_data for quick lookup
      const attendanceMap = new Map(
        attendanceRecords?.map((record) => [record.id, record]) || []
      );

      // Get unique timetable IDs to fetch timetable information
      const timetableIds = [
        ...new Set(
          attendanceRecords?.map((r) => r.timetable_id).filter(Boolean) || []
        )
      ];

      console.log('🔍 Details - Timetable IDs to fetch:', timetableIds); // Debug

      if (!timetableIds.length) {
        console.log('🚨 Details - No timetable IDs found!'); // Debug
        return details;
      }

      // Fetch timetables with their timetable_data
      const { data: timetables, error: timetableError } = await supabase
        .from('timetables')
        .select('id, timetable_data')
        .in('id', timetableIds);

      if (timetableError) {
        console.error(
          'Error fetching timetable data for details:',
          timetableError
        );
        return details;
      }

      console.log(
        '🔍 Details - Fetched timetables:',
        timetables?.map((t) => ({ id: t.id, hasData: !!t.timetable_data }))
      ); // Debug

      // Create a map of timetable_id -> timetable_data
      const timetableMap = new Map(
        timetables?.map((tt) => [tt.id, tt.timetable_data]) || []
      );

      // Get all unique staff IDs from timetable data
      const allStaffIds = new Set<string>();

      for (const detail of details) {
        const attendanceRecord = attendanceMap.get(detail.id);
        if (!attendanceRecord?.timetable_id) continue;

        const timetableData = timetableMap.get(attendanceRecord.timetable_id);
        if (!timetableData || typeof timetableData !== 'object') continue;

        // Look through attendance_data to find the period/slot information
        const attendanceData = attendanceRecord.attendance_data as any;
        if (!attendanceData || typeof attendanceData !== 'object') continue;

        // Find the slot data for this period
        for (const [slotId, slotData] of Object.entries(attendanceData)) {
          if (typeof slotData === 'object' && slotData) {
            // Look for this period/slot in timetable_data
            const timetableSlots = timetableData as any;
            for (const [day, dayData] of Object.entries(timetableSlots)) {
              if (typeof dayData === 'object' && dayData) {
                for (const [periodId, periodData] of Object.entries(
                  dayData as any
                )) {
                  if (typeof periodData === 'object' && periodData) {
                    const periodInfo = periodData as any;
                    if (
                      periodInfo.staff_ids &&
                      Array.isArray(periodInfo.staff_ids)
                    ) {
                      periodInfo.staff_ids.forEach((id: string) =>
                        allStaffIds.add(id)
                      );
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Fetch staff information for all staff IDs
      console.log(
        '🔍 Details - All staff IDs found in timetables:',
        Array.from(allStaffIds)
      ); // Debug
      let staffData: any[] = [];
      if (allStaffIds.size > 0) {
        const { data: fetchedStaff, error: staffError } = await supabase
          .from('staff')
          .select('id, first_name, last_name, email, institution_email')
          .in('id', Array.from(allStaffIds))
          .eq('is_active', true);

        if (staffError) {
          console.error('Error fetching staff data for details:', staffError);
        } else {
          staffData = fetchedStaff || [];
          console.log('🔍 Details - Fetched staff data:', staffData); // Debug
        }
      } else {
        console.log('🚨 Details - No staff IDs found in timetable data!'); // Debug
      }

      // Create staff lookup map
      const staffMap = new Map(
        staffData.map((staff) => [
          staff.id,
          {
            id: staff.id,
            name:
              `${staff.first_name || ''} ${staff.last_name || ''}`.trim() ||
              'Unknown Faculty',
            email: staff.email || staff.institution_email || 'N/A'
          }
        ])
      );

      // Now enhance each detail with correct faculty information
      const enhancedDetails = details.map((detail) => {
        const attendanceRecord = attendanceMap.get(detail.id);
        if (!attendanceRecord?.timetable_id) {
          return { ...detail }; // Return as-is if no timetable data
        }

        const timetableData = timetableMap.get(attendanceRecord.timetable_id);
        if (!timetableData) {
          return { ...detail };
        }

        // Find assigned faculty for this specific period
        const assignedFacultyList: Array<{
          id: string;
          name: string;
          email: string;
          isPrimary?: boolean;
        }> = [];

        // FIXED: Use the same period-specific logic for details
        const reportLike = {
          id: detail.id,
          period_name: detail.period_name,
          course_name: detail.course_name
        } as AttendanceReportRecord;

        const { staffIds: foundStaffIds, primaryStaffId } =
          this.extractStaffFromSpecificPeriod(
            attendanceRecord,
            timetableData,
            reportLike
          );

        // Build assigned faculty list
        foundStaffIds.forEach((staffId) => {
          const staffInfo = staffMap.get(staffId);
          if (staffInfo) {
            assignedFacultyList.push({
              ...staffInfo,
              isPrimary: staffId === primaryStaffId
            });
          }
        });

        // Sort to put primary staff first
        assignedFacultyList.sort(
          (a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)
        );

        // Create assigned faculty string (comma-separated names)
        const assigned_faculty =
          assignedFacultyList.map((f) => f.name).join(', ') || undefined;

        // Debug individual detail enhancement
        if (assigned_faculty) {
          console.log(
            `✅ Enhanced detail ${detail.id}: ${detail.course_name} -> ${assigned_faculty}`
          );
        } else {
          console.log(
            `⚠️  No faculty found for detail ${detail.id}: ${detail.course_name}, original faculty: ${detail.faculty_name}`
          );
        }

        return {
          ...detail,
          assigned_faculty,
          assigned_faculty_list:
            assignedFacultyList.length > 0 ? assignedFacultyList : undefined
        };
      });

      return enhancedDetails;
    } catch (error) {
      console.error('Error enhancing details with faculty data:', error);
      return details; // Return original details if enhancement fails
    }
  }

  /**
   * Get detailed attendance record for a specific session
   */
  static async getAttendanceReportDetails(
    attendanceId: string,
    periodId?: string
  ): Promise<AttendanceReportDetails[]> {
    try {
      const supabase = this.getSupabase();

      const { data, error } = await supabase.rpc(
        'get_attendance_record_details',
        {
          p_attendance_id: attendanceId,
          p_period_id: periodId || null
        }
      );

      if (error) {
        // Provide more specific error messages
        if (error.code === '42703') {
          console.error(
            'Database column error in attendance details. This has been fixed in the latest migration.',
            error
          );
          throw new Error(
            'Database schema error. Please contact support to apply the latest updates.'
          );
        }
        if (error.message?.includes('Access denied')) {
          throw new Error(error.message);
        }
        throw error;
      }

      // Enhance details with correct assigned faculty information
      console.log('🔍 Original details from DB:', data?.slice(0, 2)); // Debug: Show first 2 details
      console.log('🔍 Course code and timetable debug:', {
        course_code: data?.[0]?.course_code,
        course_name: data?.[0]?.course_name,
        period_name: data?.[0]?.period_name,
        all_keys: data?.[0] ? Object.keys(data[0]) : 'no data'
      });

      // Fix course codes that are "N/A" by looking up by course name
      const detailsWithFixedCourseCode = await this.fixCourseCodesInDetails(
        data || []
      );

      const enhancedDetails = await this.enhanceDetailsWithAssignedFaculty(
        detailsWithFixedCourseCode
      );

      // Debug: Log period selection for consistency monitoring
      console.log('🔍 Details period selection debug:', {
        attendanceId,
        requestedPeriodId: periodId,
        detailsCount: enhancedDetails?.length || 0,
        sampleDetail: enhancedDetails?.[0]
          ? {
              courseName: enhancedDetails[0].course_name,
              periodName: enhancedDetails[0].period_name,
              totalStudents: enhancedDetails[0].total_students
            }
          : 'no details'
      });

      console.log('🔍 Enhanced details:', enhancedDetails?.slice(0, 2)); // Debug: Show first 2 enhanced details

      return enhancedDetails;
    } catch (error) {
      console.error('Error fetching attendance report details:', error);
      throw error;
    }
  }

  /**
   * Get academic years for filter dropdown
   */
  static async getAcademicYears(): Promise<
    Array<{
      id: string;
      name: string;
      start_date: string;
      end_date: string;
      is_current: boolean;
    }>
  > {
    try {
      const supabase = this.getSupabase();

      // Get user's institution ID if not super admin
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      let query = supabase
        .from('academic_years')
        .select(
          'id, academic_year_name, start_date, end_date, is_active, institution_id'
        )
        .eq('is_active', true);

      // If user exists, check their role and institution
      if (userId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, institution_id')
          .eq('id', userId)
          .single();

        // Apply institution filter for non-super admin users
        if (
          profile &&
          profile.role !== 'super_admin' &&
          profile.institution_id
        ) {
          query = query.eq('institution_id', profile.institution_id);
        }
      }

      const { data, error } = await query.order('academic_year_name', {
        ascending: false
      });

      if (error) throw error;

      // Use TRIM to remove any whitespace and ensure uniqueness
      const uniqueYears = new Map();
      (data || []).forEach((item) => {
        const trimmedName = item.academic_year_name.trim();
        if (!uniqueYears.has(trimmedName)) {
          uniqueYears.set(trimmedName, {
            id: item.id,
            name: trimmedName,
            start_date: item.start_date,
            end_date: item.end_date,
            is_current: item.is_active
          });
        }
      });

      return Array.from(uniqueYears.values());
    } catch (error) {
      console.error('Error fetching academic years:', error);
      throw error;
    }
  }

  /**
   * Get institutions for filter dropdown (for super admin)
   */
  static async getInstitutions(): Promise<Array<{ id: string; name: string }>> {
    try {
      const supabase = this.getSupabase();
      const { data, error } = await supabase
        .from('institutions')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching institutions:', error);
      throw error;
    }
  }

  // Continue with rest of the filter methods...

  /**
   * Get degrees for filter dropdown
   */
  static async getDegrees(
    institutionId: string
  ): Promise<Array<{ id: string; name: string; short_name: string }>> {
    try {
      // Sanitize parameter - don't query if empty string
      if (!institutionId || institutionId.trim() === '') {
        return [];
      }

      const supabase = this.getSupabase();
      const { data, error } = await supabase
        .from('degrees')
        .select('id, degree_name, degree_id')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('degree_name');

      if (error) throw error;

      return (data || []).map((item) => ({
        id: item.id,
        name: item.degree_name,
        short_name: item.degree_id || item.degree_name // Use degree_id as short name
      }));
    } catch (error) {
      console.error('Error fetching degrees:', error);
      throw error;
    }
  }

  /**
   * Get departments for filter dropdown
   */
  static async getDepartments(
    degreeId: string
  ): Promise<Array<{ id: string; name: string; code: string }>> {
    try {
      // Sanitize parameter - don't query if empty string
      if (!degreeId || degreeId.trim() === '') {
        return [];
      }

      const supabase = this.getSupabase();
      const { data, error } = await supabase
        .from('departments')
        .select('id, department_name, department_code')
        .eq('degree_id', degreeId)
        .eq('is_active', true)
        .order('department_name');

      if (error) throw error;

      return (data || []).map((item) => ({
        id: item.id,
        name: item.department_name,
        code: item.department_code
      }));
    } catch (error) {
      console.error('Error fetching departments:', error);
      throw error;
    }
  }

  /**
   * Get programs for filter dropdown
   */
  static async getPrograms(
    departmentId: string
  ): Promise<Array<{ id: string; name: string; code: string }>> {
    try {
      // Sanitize parameter - don't query if empty string
      if (!departmentId || departmentId.trim() === '') {
        return [];
      }

      const supabase = this.getSupabase();
      const { data, error } = await supabase
        .from('programs')
        .select('id, program_name, program_id')
        .eq('department_id', departmentId)
        .eq('is_active', true)
        .order('program_name');

      if (error) throw error;

      return (data || []).map((item) => ({
        id: item.id,
        name: item.program_name,
        code: item.program_id
      }));
    } catch (error) {
      console.error('Error fetching programs:', error);
      throw error;
    }
  }

  /**
   * Get semesters for filter dropdown
   */
  static async getSemesters(
    programId: string
  ): Promise<Array<{ id: string; name: string; number: number }>> {
    try {
      // Sanitize parameter - don't query if empty string
      if (!programId || programId.trim() === '') {
        return [];
      }

      const supabase = this.getSupabase();
      const { data, error } = await supabase
        .from('semesters')
        .select('id, semester_name, semester_code')
        .eq('program_id', programId)
        .eq('is_active', true)
        .order('semester_code');

      if (error) throw error;

      return (data || []).map((item) => ({
        id: item.id,
        name: item.semester_name,
        code: item.semester_code
      }));
    } catch (error) {
      console.error('Error fetching semesters:', error);
      throw error;
    }
  }

  /**
   * Get sections for filter dropdown
   */
  static async getSections(
    semesterId: string
  ): Promise<Array<{ id: string; name: string; code: string }>> {
    try {
      // Sanitize parameter - don't query if empty string
      if (!semesterId || semesterId.trim() === '') {
        return [];
      }

      const supabase = this.getSupabase();
      const { data, error } = await supabase
        .from('sections')
        .select('id, section_name')
        .eq('semester_id', semesterId)
        .eq('is_active', true)
        .order('section_name');

      if (error) throw error;

      return (data || []).map((item) => ({
        id: item.id,
        name: item.section_name,
        code: item.section_name // sections table doesn't have section_code
      }));
    } catch (error) {
      console.error('Error fetching sections:', error);
      throw error;
    }
  }

  /**
   * Get staff/faculty for filter dropdown (for super admin)
   */
  static async getStaff(institutionId?: string): Promise<
    Array<{
      id: string;
      name: string;
      email: string;
      institution_email: string;
      designation: string;
      profile_id?: string;
    }>
  > {
    try {
      const supabase = this.getSupabase();

      let query = supabase
        .from('staff')
        .select(
          'id, first_name, last_name, email, institution_email, designation, profile_id'
        )
        .eq('is_active', true);

      if (institutionId && institutionId.trim() !== '') {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query.order('first_name');

      if (error) throw error;

      return (data || []).map((item) => ({
        id: item.id,
        name: `${item.first_name} ${item.last_name}`,
        email: item.email,
        institution_email: item.institution_email,
        designation: item.designation,
        profile_id: item.profile_id
      }));
    } catch (error) {
      console.error('Error fetching staff:', error);
      throw error;
    }
  }

  /**
   * Export attendance report to CSV
   */
  static async exportAttendanceReportToCSV(
    filters: AttendanceReportFilters
  ): Promise<string> {
    try {
      // Get records for export
      const exportFilters = {
        ...filters,
        page: 1,
        limit: 10000 // Get all records for export
      };

      const records = await this.getAttendanceReports(exportFilters);

      if (!records || records.length === 0) {
        throw new Error('No records found to export');
      }

      // Create CSV header
      const headers = [
        'Date',
        'Course Name',
        'Course Code',
        'Period',
        'Time',
        'Section',
        'Semester',
        'Department',
        'Program',
        'Faculty',
        'Total Students',
        'Present',
        'Absent',
        'Attendance %',
        'Institution',
        'Marked By',
        'Marked At'
      ];

      // Create CSV rows
      const rows = records.map((record: any) => [
        format(new Date(record.attendance_date), 'yyyy-MM-dd'),
        record.course_name,
        record.course_code,
        record.period_name,
        `${record.start_time} - ${record.end_time}`,
        record.section_name,
        record.semester_name,
        record.department_name || '',
        record.program_name || '',
        record.faculty_name,
        record.total_students.toString(),
        record.present_count.toString(),
        record.absent_count.toString(),
        `${record.attendance_percentage}%`,
        record.institution_name,
        record.marked_by,
        format(new Date(record.marked_at), 'yyyy-MM-dd HH:mm')
      ]);

      // Combine headers and rows
      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))
      ].join('\n');

      return csvContent;
    } catch (error) {
      console.error('Error exporting attendance report:', error);
      throw error;
    }
  }

  /**
   * Fix course codes that are "N/A" by looking up courses by name (for reports list)
   */
  private static async fixCourseCodesInReports(
    reports: AttendanceReportRecord[]
  ): Promise<AttendanceReportRecord[]> {
    try {
      const supabase = this.getSupabase();

      // PRIORITY 1: Fix all reports by checking actual attendance data first
      // This ensures we show what was actually taught, not what was assigned in timetable
      const allReportsToCheck = reports.map((r) => r.id);

      console.log(
        '🔧 Fixing course info for all reports by checking actual attendance data...'
      );

      // Get actual attendance data for all reports
      const { data: attendanceRecords, error: attendanceError } = await supabase
        .from('student_attendance')
        .select('id, attendance_data')
        .in('id', allReportsToCheck);

      if (attendanceError) {
        console.error(
          'Error fetching attendance data for course fixing:',
          attendanceError
        );
        return reports; // Fall back to original data
      }

      // Create a map of attendance_id -> actual course info from attendance_data
      const actualCourseMap = new Map<
        string,
        { course_name: string; course_code: string }
      >();

      (attendanceRecords || []).forEach((record) => {
        if (
          record.attendance_data &&
          typeof record.attendance_data === 'object'
        ) {
          // Get course info from the first period in attendance_data (they should all be the same course)
          const periods = Object.values(record.attendance_data);
          const firstPeriod = periods[0] as any;

          if (
            firstPeriod &&
            firstPeriod.course_name &&
            firstPeriod.course_name !== 'Unknown Course'
          ) {
            actualCourseMap.set(record.id, {
              course_name: firstPeriod.course_name,
              course_code: firstPeriod.course_code || ''
            });

            console.log(`📚 Found actual course for ${record.id}:`, {
              course_name: firstPeriod.course_name,
              course_code: firstPeriod.course_code
            });
          }
        }
      });

      // Now find reports that still need fixing after checking attendance data
      const reportsNeedingFix = reports.filter((report) => {
        const hasActualCourse = actualCourseMap.has(report.id);
        const needsCourseCodeFix =
          !report.course_code ||
          report.course_code === 'N/A' ||
          report.course_code.trim() === '';
        const hasUnknownCourseName = report.course_name === 'Unknown Course';
        const hasValidCourseName =
          report.course_name &&
          report.course_name !== 'N/A' &&
          report.course_name.trim() !== '';

        // Need to fix if: we don't have actual course data AND ((missing course code AND has valid course name) OR has "Unknown Course" name)
        return (
          !hasActualCourse &&
          ((needsCourseCodeFix && hasValidCourseName) || hasUnknownCourseName)
        );
      });

      console.log(
        `🔧 Reports needing additional fixing after attendance data check: ${reportsNeedingFix.length}`
      );

      if (reportsNeedingFix.length === 0 && actualCourseMap.size === 0) {
        return reports; // No fixes needed
      }

      // For "Unknown Course" entries, we need to look up the actual course from attendance data
      const unknownCourseReports = reportsNeedingFix.filter(
        (r) => r.course_name === 'Unknown Course'
      );
      const validCourseNameReports = reportsNeedingFix.filter(
        (r) => r.course_name !== 'Unknown Course'
      );

      // Get course codes for reports with valid course names
      const courseNamesToLookup = [
        ...new Set(validCourseNameReports.map((report) => report.course_name))
      ];

      let allCourses: any[] = [];

      // Lookup courses by name for valid course names
      if (courseNamesToLookup.length > 0) {
        const { data: coursesByName, error: coursesByNameError } =
          await supabase
            .from('courses')
            .select('course_name, course_code')
            .in('course_name', courseNamesToLookup);

        if (coursesByNameError) {
          console.error(
            'Error looking up courses by name for reports:',
            coursesByNameError
          );
        } else {
          allCourses = [...allCourses, ...(coursesByName || [])];
        }
      }

      // For "Unknown Course" entries, try to get the actual course info from attendance data
      if (unknownCourseReports.length > 0) {
        const attendanceIds = unknownCourseReports.map((r) => r.id);
        const { data: attendanceRecords, error: attendanceError } =
          await supabase
            .from('student_attendance')
            .select('id, attendance_data')
            .in('id', attendanceIds);

        if (!attendanceError && attendanceRecords) {
          // Extract course names from attendance_data and look them up
          const extractedCourseNames = new Set<string>();
          attendanceRecords.forEach((record) => {
            if (record.attendance_data) {
              Object.values(record.attendance_data).forEach((period: any) => {
                if (
                  period.course_name &&
                  period.course_name !== 'Unknown Course'
                ) {
                  extractedCourseNames.add(period.course_name);
                }
              });
            }
          });

          if (extractedCourseNames.size > 0) {
            const { data: extractedCourses, error: extractedError } =
              await supabase
                .from('courses')
                .select('course_name, course_code')
                .in('course_name', Array.from(extractedCourseNames));

            if (!extractedError && extractedCourses) {
              allCourses = [...allCourses, ...extractedCourses];
            }
          }
        }
      }

      const courses = allCourses;

      // Create a map of course_name -> course_code
      const courseCodeMap = new Map<string, string>();
      (courses || []).forEach((course) => {
        courseCodeMap.set(course.course_name, course.course_code);
      });

      console.log('🔍 Course code lookup results for reports:', {
        courseNamesToLookup,
        foundCourses: courses,
        courseCodeMap: Object.fromEntries(courseCodeMap)
      });

      // Create a map for "Unknown Course" entries to their actual course info
      const unknownCourseMap = new Map<
        string,
        { course_name: string; course_code: string }
      >();

      if (unknownCourseReports.length > 0) {
        const attendanceIds = unknownCourseReports.map((r) => r.id);
        const { data: attendanceRecords } = await supabase
          .from('student_attendance')
          .select('id, attendance_data')
          .in('id', attendanceIds);

        if (attendanceRecords) {
          attendanceRecords.forEach((record) => {
            if (record.attendance_data) {
              Object.values(record.attendance_data).forEach((period: any) => {
                if (
                  period.course_name &&
                  period.course_name !== 'Unknown Course'
                ) {
                  const foundCourse = courses.find(
                    (c) => c.course_name === period.course_name
                  );
                  if (foundCourse) {
                    unknownCourseMap.set(record.id, {
                      course_name: foundCourse.course_name,
                      course_code: foundCourse.course_code
                    });
                  }
                }
              });
            }
          });
        }
      }

      // Fix the course codes and names
      return reports.map((report) => {
        // PRIORITY 1: Use actual course data from attendance_data if available
        const actualCourseInfo = actualCourseMap.get(report.id);
        if (actualCourseInfo) {
          console.log(
            `✅ Using actual course data for ${report.id}: ${actualCourseInfo.course_name} (was: ${report.course_name})`
          );
          return {
            ...report,
            course_name: actualCourseInfo.course_name,
            course_code: actualCourseInfo.course_code
          };
        }

        // PRIORITY 2: Handle "Unknown Course" cases that couldn't be resolved from attendance_data
        if (report.course_name === 'Unknown Course') {
          const fallbackCourseInfo = unknownCourseMap.get(report.id);
          if (fallbackCourseInfo) {
            return {
              ...report,
              course_name: fallbackCourseInfo.course_name,
              course_code: fallbackCourseInfo.course_code
            };
          } else {
            // If no specific course found, but it's a practical session, update the name
            if (
              report.period_name &&
              report.period_name.toLowerCase().includes('practical')
            ) {
              return {
                ...report,
                course_name: `${report.period_name} Session`,
                course_code: 'PRACTICAL'
              };
            }
          }
        }

        // PRIORITY 3: Handle missing course codes for valid course names
        if (
          (!report.course_code ||
            report.course_code === 'N/A' ||
            report.course_code.trim() === '') &&
          report.course_name
        ) {
          const foundCourseCode = courseCodeMap.get(report.course_name);
          if (foundCourseCode) {
            return {
              ...report,
              course_code: foundCourseCode
            };
          }
        }

        return report;
      });
    } catch (error) {
      console.error('Error fixing course codes in reports:', error);
      return reports; // Return original reports if anything fails
    }
  }

  /**
   * Fix course codes that are "N/A" by looking up courses by name (for report details)
   */
  private static async fixCourseCodesInDetails(
    details: AttendanceReportDetails[]
  ): Promise<AttendanceReportDetails[]> {
    try {
      const supabase = this.getSupabase();

      // Find details with missing/empty course codes that have course names
      const detailsNeedingFix = details.filter(
        (detail) =>
          (!detail.course_code ||
            detail.course_code === 'N/A' ||
            detail.course_code.trim() === '') &&
          detail.course_name &&
          detail.course_name !== 'N/A' &&
          detail.course_name.trim() !== ''
      );

      if (detailsNeedingFix.length === 0) {
        return details; // No fixes needed
      }

      // Get unique course names that need fixing
      const courseNamesToLookup = [
        ...new Set(detailsNeedingFix.map((detail) => detail.course_name))
      ];

      // Lookup courses by name
      const { data: courses, error } = await supabase
        .from('courses')
        .select('course_name, course_code')
        .in('course_name', courseNamesToLookup);

      if (error) {
        console.error('Error looking up courses by name:', error);
        return details; // Return original details if lookup fails
      }

      // Create a map of course_name -> course_code
      const courseCodeMap = new Map<string, string>();
      (courses || []).forEach((course) => {
        courseCodeMap.set(course.course_name, course.course_code);
      });

      console.log('🔍 Course code lookup results:', {
        courseNamesToLookup,
        foundCourses: courses,
        courseCodeMap: Object.fromEntries(courseCodeMap)
      });

      // Fix the course codes
      return details.map((detail) => {
        if (
          (!detail.course_code ||
            detail.course_code === 'N/A' ||
            detail.course_code.trim() === '') &&
          detail.course_name
        ) {
          const foundCourseCode = courseCodeMap.get(detail.course_name);
          if (foundCourseCode) {
            return {
              ...detail,
              course_code: foundCourseCode
            };
          }
        }
        return detail;
      });
    } catch (error) {
      console.error('Error fixing course codes:', error);
      return details; // Return original details if anything fails
    }
  }
}
