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
      const page = filters.page ?? 1;
      const limit = filters.limit ?? 10;

      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });

      if (filters.search) params.set('search', filters.search);
      if (filters.institution_id) params.set('institution_id', filters.institution_id);
      if (filters.degree_id) params.set('degree_id', filters.degree_id);
      if (filters.department_id) params.set('department_id', filters.department_id);
      if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));

      const res = await fetch(`/api/jkkn/programs?${params}`);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error('ProgramService: Query error:', body);
        throw new Error(`JKKN programs API error ${res.status}`);
      }

      const json = await res.json();

      return {
        data: json.data ?? [],
        metadata: {
          total: json.metadata?.total ?? 0,
          page: json.metadata?.page ?? page,
          limit: json.metadata?.limit ?? limit,
          totalPages: json.metadata?.totalPages ?? 0,
        },
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
      const params = new URLSearchParams({
        department_id: departmentId,
        isActive: 'true',
        limit: '100',
        page: '1',
      });

      const res = await fetch(`/api/jkkn/programs?${params}`);
      if (!res.ok) return [];

      const json = await res.json();
      return json.data ?? [];
    } catch (error) {
      console.error('Error fetching programs:', error);
      return [];
    }
  }
}
