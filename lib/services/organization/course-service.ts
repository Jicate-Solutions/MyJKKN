import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  Course,
  CreateCourseDto,
  UpdateCourseDto,
  CourseFilters,
  CourseListResponse
} from '@/types/organizations';

export class CourseService {
  private static supabase = createClientSupabaseClient();

  /**
   * Helper method to get accessible institution IDs for a user
   */
  private static async getUserAccessibleInstitutionIds(
    userId: string
  ): Promise<string[]> {
    try {
      // Import the service to avoid circular dependency
      const { UserInstitutionAccessService } = await import(
        '@/lib/services/users/user-institution-access-service'
      );
      return await UserInstitutionAccessService.getUserAccessibleInstitutionIds(
        userId
      );
    } catch (error) {
      console.error('Error getting user accessible institution IDs:', error);
      return [];
    }
  }

  static async getCourseByCode(
    code: string,
    institutionId: string
  ): Promise<Course | null> {
    try {
      const { data, error } = await this.supabase
        .from('courses')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('course_code', code)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Error fetching course by code:', error);
      throw error;
    }
  }

  static async createCourse(
    data: CreateCourseDto,
    showToast: boolean = true
  ): Promise<Course> {
    try {
      const courseData = {
        ...data,
        course_code: data.course_code.toUpperCase()
      };

      const { data: course, error } = await this.supabase
        .from('courses')
        .insert([courseData])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(`Course code "${data.course_code}" already exists`);
        }
        throw error;
      }

      if (showToast) {
        toast.success('Course created successfully');
      }
      return course;
    } catch (error) {
      console.error('Error creating course:', error);
      // In case of bulk upload, we don't want to throw the error here as it will stop the loop
      // The error will be caught and logged by the calling function
      if (showToast) throw error;
      // For bulk upload, just re-throw the error to be caught by the loop
      throw error;
    }
  }

  static async updateCourse(
    id: string,
    data: UpdateCourseDto
  ): Promise<Course> {
    try {
      const updateData = {
        ...data,
        course_code: data.course_code?.toUpperCase(),
        updated_at: new Date().toISOString()
      };

      const { data: course, error } = await this.supabase
        .from('courses')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Course updated successfully');
      return course;
    } catch (error) {
      console.error('Error updating course:', error);
      throw error;
    }
  }

  static async deleteCourse(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('courses')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting course:', error);
      throw error;
    }
  }

  static async getCourses(
    filters: CourseFilters = {}
  ): Promise<CourseListResponse> {
    try {
      let query = this.supabase.from('courses').select(
        `
        *,
        institution:institutions (
          id,
          name,
          counselling_code
        )
      `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `course_code.ilike.%${filters.search}%,course_name.ilike.%${filters.search}%`
        );
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply institution filtering based on user access if userId is provided
      if (filters.userId && !filters.bypassInstitutionFilter) {
        const accessibleInstitutionIds =
          await this.getUserAccessibleInstitutionIds(filters.userId);
        if (accessibleInstitutionIds.length > 0) {
          query = query.in('institution_id', accessibleInstitutionIds);
        } else {
          // If user has no accessible institutions, return empty result
          return {
            data: [],
            metadata: {
              total: 0,
              page: filters.page || 1,
              limit: filters.limit || 10,
              totalPages: 0
            }
          };
        }
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data: courses, error, count } = await query;

      if (error) {
        // Check for relationship error (when removing departments)
        if (
          error.code === 'PGRST200' &&
          error.message?.includes(
            "relationship between 'courses' and 'departments'"
          )
        ) {
          console.error('Database schema error:', error);
          toast.error(
            'Database schema needs to be updated. Please refresh the page or contact support.'
          );
          // Return empty data to prevent crashing
          return {
            data: [],
            metadata: {
              total: 0,
              page,
              limit,
              totalPages: 0
            }
          };
        }
        throw error;
      }

      return {
        data: courses || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching courses:', error);
      throw error;
    }
  }

  static async getCourse(id: string): Promise<Course> {
    try {
      const { data: course, error } = await this.supabase
        .from('courses')
        .select(
          `
          *,
          institution:institutions (
            id,
            name,
            counselling_code
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) {
        // Check for relationship error (when removing departments)
        if (
          error.code === 'PGRST200' &&
          error.message?.includes(
            "relationship between 'courses' and 'departments'"
          )
        ) {
          console.error('Database schema error:', error);
          toast.error(
            'Database schema needs to be updated. Please refresh the page or contact support.'
          );
          // Return basic course data to prevent crashing
          return { id } as Course;
        }
        throw error;
      }

      return course;
    } catch (error) {
      console.error('Error fetching course:', error);
      throw error;
    }
  }

  static async getCourseById(courseId: string): Promise<Course | null> {
    if (!courseId) {
      return null;
    }

    try {
      const { data, error } = await this.supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (error) {
        console.error(`Error fetching course ${courseId}:`, error.message);
        return null;
      }

      return data;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'An unknown error occurred';
      console.error(
        `An unexpected error occurred in getCourseById for course ${courseId}:`,
        errorMessage
      );
      return null;
    }
  }

  /**
   * Get courses based on course mappings for a specific program and semester
   * @param programId - Program ID
   * @param semesterId - Semester ID
   * @param isActive - Filter by active status (default: true)
   * @returns Array of mapped courses with mapping information
   */
  static async getCoursesByMapping(
    programId: string,
    semesterId?: string,
    isActive: boolean = true
  ): Promise<Array<Course & { mapping_id: string }>> {
    try {
      let query = this.supabase
        .from('course_mappings')
        .select(
          `
          id,
          course_id,
          course:courses (
            id,
            course_name,
            course_code,
            institution_id,
            is_active
          )
        `
        )
        .eq('program_id', programId)
        .eq('is_active', isActive);

      if (semesterId) {
        query = query.eq('semester_id', semesterId);
      }

      // Only include active courses
      query = query.filter('course.is_active', 'eq', isActive);

      const { data, error } = await query;

      if (error) throw error;

      // Transform the data to a more usable format
      const result: Array<Course & { mapping_id: string }> = [];

      (data || []).forEach((mapping: any) => {
        if (mapping.course && mapping.course.id) {
          result.push({
            id: mapping.course.id,
            institution_id: mapping.course.institution_id,
            course_name: mapping.course.course_name,
            course_code: mapping.course.course_code,
            is_active: mapping.course.is_active,
            created_at: mapping.course.created_at || '',
            updated_at: mapping.course.updated_at || '',
            mapping_id: mapping.id
          });
        }
      });

      return result;
    } catch (error) {
      console.error('Error fetching courses by mapping:', error);
      throw error;
    }
  }

  /**
   * Get courses based on mappings for a specific program and/or semester
   * Deprecated: Use getCoursesByMapping instead
   */
  static async getCoursesByProgram(
    programId: string
  ): Promise<Array<{ id: string; course_name: string; course_code: string }>> {
    console.warn(
      'getCoursesByProgram is deprecated. Use getCoursesByMapping instead.'
    );
    try {
      const courses = await this.getCoursesByMapping(programId);
      return courses.map((course) => ({
        id: course.id,
        course_name: course.course_name,
        course_code: course.course_code
      }));
    } catch (error) {
      console.error('Error fetching courses by program:', error);
      throw error;
    }
  }
}
