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

  static async createProgram(data: CreateProgramDto): Promise<Program> {
    try {
      const { data: program, error } = await this.supabase
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
      const { data: program, error } = await this.supabase
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
      const { error } = await this.supabase
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
      let query = this.supabase.from('programs').select(
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
      const { data: program, error } = await this.supabase
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
      const { data: programs } = await this.supabase
        .from('programs')
        .select('*')
        .eq('department_id', departmentId)
        .eq('is_active', true);
      return programs || [];
    } catch (error) {
      console.error('Error fetching programs:', error);
      return [];
    }
  }
}
