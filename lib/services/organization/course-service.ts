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
      const { data: course, error } = await this.supabase
        .from('courses')
        .insert([
          {
            ...data,
            course_code: data.course_code.toUpperCase()
          }
        ])
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
      const { data: course, error } = await this.supabase
        .from('courses')
        .update({
          ...data,
          course_code: data.course_code?.toUpperCase(),
          updated_at: new Date().toISOString()
        })
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

      if (filters.degree_id) {
        query = query.eq('degree_id', filters.degree_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
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

      if (error) throw error;

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
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return course;
    } catch (error) {
      console.error('Error fetching course:', error);
      throw error;
    }
  }

  static async getCoursesByProgram(programId: string): Promise<Course[]> {
    try {
      // Check if programId is a UUID or a name/label
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          programId
        );

      let query;

      if (isUUID) {
        // If it's a UUID, use it directly with eq
        query = this.supabase
          .from('courses')
          .select('*')
          .eq('program_id', programId)
          .eq('is_active', true)
          .order('course_name');
      } else {
        // If it's not a UUID, try to find the program by name first
        console.log('Searching for program with name:', programId);

        const { data: program } = await this.supabase
          .from('programs')
          .select('id')
          .ilike('program_name', programId)
          .single();

        if (program) {
          console.log('Found program with ID:', program.id);
          query = this.supabase
            .from('courses')
            .select('*')
            .eq('program_id', program.id)
            .eq('is_active', true)
            .order('course_name');
        } else {
          console.log('No program found with name:', programId);
          // Return empty array if no program found
          return [];
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching courses by program:', error);
      return [];
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
