import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  CourseMapping,
  CreateCourseMappingDto,
  UpdateCourseMappingDto,
  CourseMappingFilters,
  CourseMappingListResponse
} from '@/types/organizations';

export class CourseMappingService {
  private static supabase = createClientSupabaseClient();

  static async createCourseMapping(
    data: CreateCourseMappingDto
  ): Promise<CourseMapping> {
    try {
      if (!data.course_ids || data.course_ids.length !== 1) {
        throw new Error(
          'createCourseMapping expects exactly one course ID in course_ids array'
        );
      }
      const courseId = data.course_ids[0];

      const insertData = {
        institution_id: data.institution_id,
        degree_id: data.degree_id,
        department_id: data.department_id,
        program_id: data.program_id,
        semester_id: data.semester_id,
        course_id: courseId,
        is_active: data.is_active
      };

      const { data: courseMapping, error } = await this.supabase
        .from('course_mappings')
        .insert([insertData])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(
            `This course (${courseId}) is already mapped to this combination`
          );
        }
        console.error('Supabase insert error for data:', insertData);
        throw error;
      }

      return courseMapping;
    } catch (error) {
      console.error('Error creating course mapping:', error);
      throw error;
    }
  }

  static async updateCourseMapping(
    id: string,
    data: UpdateCourseMappingDto
  ): Promise<CourseMapping> {
    try {
      const { data: courseMapping, error } = await this.supabase
        .from('course_mappings')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Course mapping updated successfully');
      return courseMapping;
    } catch (error) {
      console.error('Error updating course mapping:', error);
      throw error;
    }
  }

  static async deleteCourseMapping(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('course_mappings')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Course mapping deleted successfully');
    } catch (error) {
      console.error('Error deleting course mapping:', error);
      throw error;
    }
  }

  static async getCourseMappings(
    filters: CourseMappingFilters = {}
  ): Promise<CourseMappingListResponse> {
    try {
      let query = this.supabase.from('course_mappings').select(
        `
        *,
        institution:institutions (
          id,
          name
        ),
        degree:degrees (
          id,
          degree_name
        ),
        department:departments (
          id,
          department_name
        ),
        program:programs (
          id,
          program_name
        ),
        semester:semesters (
          id,
          semester_name
        ),
        course:courses (
          id,
          course_name,
          course_code
        )
      `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `course.course_code.ilike.%${filters.search}%,course.course_name.ilike.%${filters.search}%`
        );
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.degree_id) {
        query = query.eq('degree_id', filters.degree_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }

      if (filters.semester_id) {
        query = query.eq('semester_id', filters.semester_id);
      }

      if (filters.course_id) {
        query = query.eq('course_id', filters.course_id);
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data: mappings, error, count } = await query;

      if (error) throw error;

      return {
        data: mappings || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching course mappings:', error);
      throw error;
    }
  }

  static async getCourseMapping(id: string): Promise<CourseMapping> {
    try {
      const { data: mapping, error } = await this.supabase
        .from('course_mappings')
        .select(
          `
          *,
          institution:institutions (
            id,
            name
          ),
          degree:degrees (
            id,
            degree_name
          ),
          department:departments (
            id,
            department_name
          ),
          program:programs (
            id,
            program_name
          ),
          semester:semesters (
            id,
            semester_name
          ),
          course:courses (
            id,
            course_name,
            course_code
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return mapping;
    } catch (error) {
      console.error('Error fetching course mapping:', error);
      throw error;
    }
  }

  static async getUnmappedCourses(
    institutionId: string,
    departmentId: string,
    semesterId: string
  ): Promise<{ id: string; course_name: string; course_code: string }[]> {
    try {
      // Get all courses for this institution/department
      const { data: allCourses, error: coursesError } = await this.supabase
        .from('courses')
        .select('id, course_name, course_code')
        .eq('institution_id', institutionId)
        .eq('department_id', departmentId)
        .eq('is_active', true);

      if (coursesError) throw coursesError;

      // Get all course IDs already mapped to this semester
      const { data: mappedCourses, error: mappingsError } = await this.supabase
        .from('course_mappings')
        .select('course_id')
        .eq('institution_id', institutionId)
        .eq('department_id', departmentId)
        .eq('semester_id', semesterId);

      if (mappingsError) throw mappingsError;

      // Extract the mapped course IDs
      const mappedCourseIds = mappedCourses.map((m) => m.course_id);

      // Filter out the mapped courses to get unmapped courses
      const unmappedCourses = allCourses.filter(
        (course) => !mappedCourseIds.includes(course.id)
      );

      return unmappedCourses;
    } catch (error) {
      console.error('Error fetching unmapped courses:', error);
      throw error;
    }
  }
}
