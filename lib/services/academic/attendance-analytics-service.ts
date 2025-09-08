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

export interface DashboardSummary {
  total_sessions: number;
  marked_sessions: number;
  pending_sessions: number;
  completion_rate: number;
  total_students: number;
  average_attendance: number;
}

export interface PeriodAttendance {
  period_id: string;
  period_name: string;
  course_name: string;
  staff_name: string;
  attendance_date: string;
  present_count: number;
  absent_count: number;
  total_count: number;
  attendance_percentage: number;
}

export class AttendanceAnalyticsService {
  private static supabase = getSupabaseClient();

  /**
   * Get faculty attendance statistics
   */
  static async getFacultyAttendanceStats(
    filters: AnalyticsFilters
  ): Promise<FacultyAttendanceStats[]> {
    try {
      const { data, error } = await this.supabase.rpc(
        'get_faculty_attendance_stats',
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
      return data || [];
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
      const { data, error } = await this.supabase.rpc(
        'get_course_attendance_stats',
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
      return data || [];
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
      const { data, error } = await this.supabase.rpc(
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
      return data || [];
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
  ): Promise<DashboardSummary> {
    try {
      const { data, error } = await this.supabase.rpc(
        'get_attendance_summary',
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
      
      return data?.[0] || {
        total_sessions: 0,
        marked_sessions: 0,
        pending_sessions: 0,
        completion_rate: 0,
        total_students: 0,
        average_attendance: 0
      };
    } catch (error) {
      console.error('Error fetching attendance summary:', error);
      throw error;
    }
  }

  /**
   * Get filter options for analytics
   */
  static async getFilterOptions(institutionId: string) {
    try {
      const [degrees, programs, departments, semesters, sections] = await Promise.all([
        this.getDegrees(institutionId),
        this.getPrograms(institutionId),
        this.getDepartments(institutionId),
        this.getSemesters(institutionId),
        this.getSections(institutionId)
      ]);

      return {
        degrees,
        programs,
        departments,
        semesters,
        sections
      };
    } catch (error) {
      console.error('Error fetching filter options:', error);
      throw error;
    }
  }

  /**
   * Get academic years for an institution
   */
  static async getAcademicYears(): Promise<
    Array<{ id: string; name: string; is_active: boolean }>
  > {
    try {
      const { data, error } = await this.supabase
        .from('academic_years')
        .select('id, academic_year_name, is_active')
        .order('start_date', { ascending: false });

      if (error) throw error;

      return (data || []).map((year) => ({
        id: year.id,
        name: year.academic_year_name,
        is_active: year.is_active
      }));
    } catch (error) {
      console.error('Error fetching academic years:', error);
      throw error;
    }
  }

  /**
   * Get institutions
   */
  static async getInstitutions(): Promise<Array<{ id: string; name: string }>> {
    try {
      const { data, error } = await this.supabase
        .from('institutions')
        .select('id, name')
        .eq('status', 'active')
        .order('name');

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching institutions:', error);
      throw error;
    }
  }

  /**
   * Get degrees for an institution
   */
  static async getDegrees(
    institutionId: string
  ): Promise<Array<{ id: string; name: string }>> {
    try {
      const { data, error } = await this.supabase
        .from('degrees')
        .select('id, degree_name')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('degree_name');

      if (error) throw error;

      return (data || []).map((degree) => ({
        id: degree.id,
        name: degree.degree_name
      }));
    } catch (error) {
      console.error('Error fetching degrees:', error);
      throw error;
    }
  }

  /**
   * Get departments for an institution
   */
  static async getDepartments(
    institutionId: string
  ): Promise<Array<{ id: string; name: string }>> {
    try {
      const { data, error } = await this.supabase
        .from('departments')
        .select('id, department_name')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('department_name');

      if (error) throw error;

      return (data || []).map((dept) => ({
        id: dept.id,
        name: dept.department_name
      }));
    } catch (error) {
      console.error('Error fetching departments:', error);
      throw error;
    }
  }

  /**
   * Get programs for an institution
   */
  static async getPrograms(
    institutionId: string
  ): Promise<Array<{ id: string; name: string }>> {
    try {
      const { data, error } = await this.supabase
        .from('programs')
        .select('id, program_name')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('program_name');

      if (error) throw error;

      return (data || []).map((program) => ({
        id: program.id,
        name: program.program_name
      }));
    } catch (error) {
      console.error('Error fetching programs:', error);
      throw error;
    }
  }

  /**
   * Get semesters for an institution
   */
  static async getSemesters(
    institutionId: string
  ): Promise<Array<{ id: string; name: string }>> {
    try {
      const { data, error } = await this.supabase
        .from('semesters')
        .select('id, semester_name')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('semester_order');

      if (error) throw error;

      return (data || []).map((semester) => ({
        id: semester.id,
        name: semester.semester_name
      }));
    } catch (error) {
      console.error('Error fetching semesters:', error);
      throw error;
    }
  }

  /**
   * Get sections for an institution
   */
  static async getSections(
    institutionId: string
  ): Promise<Array<{ id: string; name: string }>> {
    try {
      const { data, error } = await this.supabase
        .from('sections')
        .select('id, section_name')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('section_name');

      if (error) throw error;

      return (data || []).map((section) => ({
        id: section.id,
        name: section.section_name
      }));
    } catch (error) {
      console.error('Error fetching sections:', error);
      throw error;
    }
  }

  /**
   * Get staff for an institution
   */
  static async getStaff(institutionId?: string): Promise<
    Array<{ id: string; name: string; designation: string }>
  > {
    try {
      let query = this.supabase
        .from('staff')
        .select('id, first_name, last_name, designation')
        .eq('status', 'active');

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query.order('first_name');

      if (error) throw error;

      return (data || []).map((staff) => ({
        id: staff.id,
        name: `${staff.first_name} ${staff.last_name}`,
        designation: staff.designation || ''
      }));
    } catch (error) {
      console.error('Error fetching staff:', error);
      throw error;
    }
  }
}