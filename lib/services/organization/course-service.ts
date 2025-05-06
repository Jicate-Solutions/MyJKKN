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

  static async createCourse(data: CreateCourseDto): Promise<Course> {
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

      toast.success('Course created successfully');
      return course;
    } catch (error) {
      console.error('Error creating course:', error);
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

      toast.success('Course deleted successfully');
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
    try {
      if (!courseId) return null;

      console.log(`Fetching course by ID: ${courseId}`);
      const { data, error } = await this.supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (error) {
        console.error('Error fetching course by ID:', error);
        return null;
      }

      console.log(`Found course:`, data);
      return data;
    } catch (error) {
      console.error(`Error fetching course by ID ${courseId}:`, error);
      return null;
    }
  }
}
