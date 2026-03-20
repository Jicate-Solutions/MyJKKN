import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  Program,
  CreateProgramDto,
  UpdateProgramDto,
  ProgramFilters,
  ProgramListResponse
} from '@/types/organizations';

export class ProgramService {
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

  static async getProgramByName(
    name: string,
    departmentId: string
  ): Promise<Program | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('programs')
        .select('*')
        .eq('department_id', departmentId)
        .ilike('program_name', name)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Error fetching program by name:', error);
      throw error;
    }
  }

  static async createProgram(data: CreateProgramDto): Promise<Program> {
    try {
      const { data: program, error } = await (this.supabase as any)
        .from('programs')
        .insert([
          {
            ...data,
            program_id: data.program_id.toUpperCase()
          }
        ])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(`Program ID "${data.program_id}" already exists`);
        }
        throw error;
      }

      toast.success('Program created successfully');
      return program;
    } catch (error) {
      console.error('Error creating program:', error);
      throw error;
    }
  }

  static async updateProgram(
    id: string,
    data: UpdateProgramDto
  ): Promise<Program> {
    try {
      const { data: program, error } = await (this.supabase as any)
        .from('programs')
        .update({
          ...data,
          program_id: data.program_id?.toUpperCase(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Program updated successfully');
      return program;
    } catch (error) {
      console.error('Error updating program:', error);
      throw error;
    }
  }

  static async deleteProgram(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('programs')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Program deleted successfully');
    } catch (error) {
      console.error('Error deleting program:', error);
      throw error;
    }
  }

  static async getPrograms(
    filters: ProgramFilters = {}
  ): Promise<ProgramListResponse> {
    try {
      let query = (this.supabase as any).from('programs').select(
        `
        *,
        institution:institutions (
          id,
          name,
          counselling_code
        ),
        degree:degrees (
          id,
          degree_id,
          degree_name
        ),
        department:departments (
          id,
          department_code,
          department_name
        )
      `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `program_id.ilike.%${filters.search}%,program_name.ilike.%${filters.search}%`
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

      const { data: programs, error, count } = await query;

      if (error) throw error;

      return {
        data: programs || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching programs:', error);
      throw error;
    }
  }

  static async getProgram(id: string): Promise<Program> {
    try {
      const { data: program, error } = await (this.supabase as any)
        .from('programs')
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
            degree_id,
            degree_name
          ),
          department:departments (
            id,
            department_code,
            department_name
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return program;
    } catch (error) {
      console.error('Error fetching program:', error);
      throw error;
    }
  }

  static async getProgramsByDepartment(departmentId: string) {
    try {
      // Check if departmentId is a UUID or a name/label
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          departmentId
        );

      let query;

      if (isUUID) {
        // If it's a UUID, use it directly with eq
        query = (this.supabase as any)
          .from('programs')
          .select('*')
          .eq('department_id', departmentId)
          .eq('is_active', true)
          .order('program_name');
      } else {
        // If it's not a UUID, try to find the department by name first
        const { data: department } = await (this.supabase as any)
          .from('departments')
          .select('id')
          .ilike('department_name', departmentId)
          .single();

        if (department) {
          query = (this.supabase as any)
            .from('programs')
            .select('*')
            .eq('department_id', department.id)
            .eq('is_active', true)
            .order('program_name');
        } else {
          // Return empty array if no department found
          return [];
        }
      }

      const { data: programs, error } = await query;
      return programs || [];
    } catch (error) {
      console.error('Error fetching programs:', error);
      return [];
    }
  }
}
