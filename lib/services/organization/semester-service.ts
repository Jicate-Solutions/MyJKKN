import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  Semester,
  CreateSemesterDto,
  UpdateSemesterDto,
  SemesterFilters,
  SemesterListResponse
} from '@/types/organizations';

export class SemesterService {
  private static supabase = createClientSupabaseClient();

  static async createSemester(data: CreateSemesterDto): Promise<Semester> {
    try {
      const { data: semester, error } = await this.supabase
        .from('semesters')
        .insert([
          {
            ...data,
            semester_code: data.semester_code.toUpperCase()
          }
        ])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(
            `Semester code "${data.semester_code}" already exists`
          );
        }
        throw error;
      }

      return semester;
    } catch (error) {
      console.error('Error creating semester:', error);
      throw error;
    }
  }

  static async updateSemester(
    id: string,
    data: UpdateSemesterDto
  ): Promise<Semester> {
    try {
      const { data: semester, error } = await this.supabase
        .from('semesters')
        .update({
          ...data,
          semester_code: data.semester_code?.toUpperCase(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return semester;
    } catch (error) {
      console.error('Error updating semester:', error);
      throw error;
    }
  }

  static async deleteSemester(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('semesters')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting semester:', error);
      throw error;
    }
  }

  static async getSemesters(
    filters: SemesterFilters = {}
  ): Promise<SemesterListResponse> {
    try {
      let query = this.supabase.from('semesters').select(
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
          `semester_code.ilike.%${filters.search}%,semester_name.ilike.%${filters.search}%`
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

      if (filters.semester_type) {
        query = query.eq('semester_type', filters.semester_type);
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

      const { data: semesters, error, count } = await query;

      if (error) throw error;

      return {
        data: semesters || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching semesters:', error);
      throw error;
    }
  }

  static async getSemester(id: string): Promise<Semester> {
    try {
      const { data: semester, error } = await this.supabase
        .from('semesters')
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

      return semester;
    } catch (error) {
      console.error('Error fetching semester:', error);
      throw error;
    }
  }

  static async getSemestersByProgram(programId: string) {
    try {
      const { data, error } = await this.supabase
        .from('semesters')
        .select('*')
        .eq('program_id', programId)
        .eq('is_active', true)
        .order('semester_name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching semesters by program:', error);
      throw error;
    }
  }

  /**
   * Get semesters that are mapped to a specific course
   * @param courseId - The course ID
   * @returns List of semesters mapped to the course
   */
  static async getSemestersByCourse(courseId: string) {
    try {
      // Use course mappings to find semesters related to this course
      const { data, error } = await this.supabase
        .from('course_mappings')
        .select(
          `
          semester_id,
          semester:semesters (
            id,
            semester_name,
            semester_code,
            is_active
          )
        `
        )
        .eq('course_id', courseId)
        .eq('is_active', true)
        .filter('semester.is_active', 'eq', true);

      if (error) throw error;

      // Transform the data to return just the semester objects
      const semesters = (data || [])
        .filter((item) => item.semester)
        .map((item) => ({
          id: item.semester.id,
          semester_name: item.semester.semester_name,
          semester_code: item.semester.semester_code,
          is_active: item.semester.is_active
        }));

      return semesters;
    } catch (error) {
      console.error('Error fetching semesters by course:', error);
      throw error;
    }
  }
}
