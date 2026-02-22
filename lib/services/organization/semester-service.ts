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

  static async getSemesterByName(
    name: string,
    programId: string
  ): Promise<Semester | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('semesters')
        .select('*')
        .eq('program_id', programId)
        .ilike('semester_name', name)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Error fetching semester by name:', error);
      throw error;
    }
  }

  static async createSemester(data: CreateSemesterDto): Promise<Semester> {
    try {
      const { data: semester, error } = await (this.supabase as any)
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
          // Check if it's a duplicate semester name in the hierarchy
          if (error.message?.includes('unique_semester_hierarchy')) {
            throw new Error(
              `A semester with the name "${data.semester_name}" already exists in this program`
            );
          }
          throw new Error('A duplicate entry already exists');
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
      const { data: semester, error } = await (this.supabase as any)
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
      const { error } = await (this.supabase as any)
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
      let query = (this.supabase as any).from('semesters').select(
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

      // Apply institution filtering based on user access if userId is provided
      if (filters.userId && !filters.bypassInstitutionFilter) {
        const accessibleInstitutionIds =
          await (this.getUserAccessibleInstitutionIds(filters.userId) as any);
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
      const { data: semester, error } = await (this.supabase as any)
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

  /**
   * Get semesters by program ID following proper organizational hierarchy
   * This is the recommended method for fetching semesters within a program.
   * 
   * @param programId - The program ID to fetch semesters for
   * @returns Promise<Semester[]> - List of active semesters in the specified program
   */
  static async getSemestersByProgram(programId: string) {
    try {
      const { data, error } = await (this.supabase as any)
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
   * @deprecated This method was created to work around data inconsistencies and should no longer be used.
   * Use getSemestersByProgram() instead, which follows proper organizational hierarchy.
   * Data inconsistencies have been fixed in migration 048_fix_semester_program_inconsistencies.
   * 
   * Get semesters that actually have students in the selected program
   * This helped work around data inconsistency where students were assigned to semesters from different programs
   * @param programId - The program ID
   * @returns List of semesters that have students in the specified program
   */
  static async getSemestersByProgramWithStudents(programId: string) {
    // Log deprecation warning
    console.warn(
      '[DEPRECATED] getSemestersByProgramWithStudents() is deprecated. ' +
      'Use getSemestersByProgram() instead. Data inconsistencies have been fixed.'
    );
    
    try {
      // Fetch semesters that actually have students in the selected program
      const { data: students, error } = await (this.supabase as any)
        .from('learners_profiles')
        .select(
          `
          semester_id,
          semesters!semester_id(
            id,
            semester_name,
            semester_code,
            is_active
          )
        `
        )
        .eq('program_id', programId)
        .not('semester_id', 'is', null);

      if (error) throw error;

      // Extract unique semesters and format them
      const uniqueSemesters = new Map();

      students?.forEach((student: any) => {
        const semester = student.semesters;
        if (
          semester &&
          semester.is_active &&
          !uniqueSemesters.has(semester.id)
        ) {
          uniqueSemesters.set(semester.id, {
            id: semester.id,
            semester_name: semester.semester_name,
            semester_code: semester.semester_code
          });
        }
      });

      const semesterList = Array.from(uniqueSemesters.values()).sort(
        (a: any, b: any) => a.semester_name.localeCompare(b.semester_name)
      );

      return semesterList;
    } catch (error) {
      console.error(
        'Error fetching semesters by program with students:',
        error
      );
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
      const { data, error } = await (this.supabase as any)
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
        .filter((item: any) => item.semester)
        .map((item: any) => {
          const semester = item.semester as any;
          return {
            id: semester.id,
            semester_name: semester.semester_name,
            semester_code: semester.semester_code,
            is_active: semester.is_active
          };
        });

      return semesters;
    } catch (error) {
      console.error('Error fetching semesters by course:', error);
      throw error;
    }
  }
}
