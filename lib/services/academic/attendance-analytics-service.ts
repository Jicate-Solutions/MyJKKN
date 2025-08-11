import { getSupabaseClient } from '@/lib/supabase/client';
import type { Database } from '@/types/supabase';

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
  semesters: Array<{ id: string; name: string; number: number }>;
  sections: Array<{ id: string; name: string; code: string }>;
}

export class AttendanceAnalyticsService {
  private static getSupabase(admin = false) {
    return getSupabaseClient({ admin });
  }

  /**
   * Get faculty attendance statistics
   */
  static async getFacultyAttendanceStats(
    filters: AnalyticsFilters
  ): Promise<FacultyAttendanceStats[]> {
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

      // Use the new proper faculty attendance stats function
      const { data, error } = await supabase.rpc(
        'get_proper_faculty_attendance_stats',
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
        staff_id: item.staff_id,
        staff_name: item.staff_name,
        staff_designation: item.staff_designation,
        total_periods: item.total_assigned_periods,
        attendance_taken: item.attendance_marked_periods,
        attendance_not_taken: item.attendance_not_marked,
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
        attendance_not_taken: item.attendance_not_marked,
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
  ): Promise<OverallAttendanceSummary> {
    try {
      const supabase = this.getSupabase();

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

      return (
        data?.[0] || {
          total_scheduled_periods: 0,
          total_attendance_taken: 0,
          total_attendance_pending: 0,
          overall_attendance_percentage: 0,
          total_students: 0,
          avg_student_attendance: 0
        }
      );
    } catch (error) {
      console.error('Error fetching overall attendance summary:', error);
      throw error;
    }
  }

  /**
   * Get institutions for filter dropdown
   */
  static async getInstitutions(): Promise<FilterOptions['institutions']> {
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

  /**
   * Get degrees for filter dropdown
   */
  static async getDegrees(
    institution_id: string
  ): Promise<FilterOptions['degrees']> {
    try {
      const supabase = this.getSupabase();

      const { data, error } = await supabase
        .from('degrees')
        .select('id, degree_name, degree_id')
        .eq('institution_id', institution_id)
        .eq('is_active', true)
        .order('degree_name');

      if (error) throw error;

      return (
        data?.map((item) => ({
          id: item.id,
          name: item.degree_name,
          short_name: item.degree_id
        })) || []
      );
    } catch (error) {
      console.error('Error fetching degrees:', error);
      throw error;
    }
  }

  /**
   * Get departments for filter dropdown
   */
  static async getDepartments(
    degree_id: string
  ): Promise<FilterOptions['departments']> {
    try {
      const supabase = this.getSupabase();

      const { data, error } = await supabase
        .from('departments')
        .select('id, department_name, department_code')
        .eq('degree_id', degree_id)
        .eq('is_active', true)
        .order('department_name');

      if (error) throw error;

      return (
        data?.map((item) => ({
          id: item.id,
          name: item.department_name,
          code: item.department_code
        })) || []
      );
    } catch (error) {
      console.error('Error fetching departments:', error);
      throw error;
    }
  }

  /**
   * Get programs for filter dropdown
   */
  static async getPrograms(
    department_id: string
  ): Promise<FilterOptions['programs']> {
    try {
      const supabase = this.getSupabase();

      const { data, error } = await supabase
        .from('programs')
        .select('id, program_name, program_id')
        .eq('department_id', department_id)
        .eq('is_active', true)
        .order('program_name');

      if (error) throw error;

      return (
        data?.map((item) => ({
          id: item.id,
          name: item.program_name,
          code: item.program_id
        })) || []
      );
    } catch (error) {
      console.error('Error fetching programs:', error);
      throw error;
    }
  }

  /**
   * Get semesters for filter dropdown
   */
  static async getSemesters(
    program_id: string
  ): Promise<FilterOptions['semesters']> {
    try {
      const supabase = this.getSupabase();

      const { data, error } = await supabase
        .from('semesters')
        .select('id, semester_name, semester_code')
        .eq('program_id', program_id)
        .eq('is_active', true)
        .order('semester_code');

      if (error) throw error;

      return (
        data?.map((item) => ({
          id: item.id,
          name: item.semester_name,
          number: item.semester_code
        })) || []
      );
    } catch (error) {
      console.error('Error fetching semesters:', error);
      throw error;
    }
  }

  /**
   * Get sections for filter dropdown
   */
  static async getSections(
    semester_id: string
  ): Promise<FilterOptions['sections']> {
    try {
      const supabase = this.getSupabase();

      const { data, error } = await supabase
        .from('sections')
        .select('id, section_name')
        .eq('semester_id', semester_id)
        .eq('is_active', true)
        .order('section_name');

      if (error) throw error;

      return (
        data?.map((item) => ({
          id: item.id,
          name: item.section_name,
          code: item.section_name
        })) || []
      );
    } catch (error) {
      console.error('Error fetching sections:', error);
      throw error;
    }
  }
}
