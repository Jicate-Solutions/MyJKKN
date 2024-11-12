// lib/services/organization-service.ts

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import type {
  Institution,
  Department,
  CreateInstitutionDto,
  UpdateInstitutionDto,
  CreateDepartmentDto,
  UpdateDepartmentDto,
  InstitutionFilters,
  DepartmentFilters,
  OrganizationListResponse,
  InstitutionWithDepartments,
  DepartmentWithInstitution
} from '@/types/organizations';

export class OrganizationService {
  private static supabase = createClientComponentClient();

  // Institution Methods
  static async getInstitutions(
    filters: InstitutionFilters = {}
  ): Promise<OrganizationListResponse<Institution>> {
    try {
      let query = this.supabase
        .from('institutions')
        .select('*', { count: 'exact' });

      // Apply filters
      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`
        );
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const start = (page - 1) * limit;
      const end = start + limit - 1;

      query = query.range(start, end).order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching institutions:', error);
      throw error;
    }
  }

  static async getInstitutionWithDepartments(
    id: string
  ): Promise<InstitutionWithDepartments | null> {
    try {
      const { data: institution, error: institutionError } = await this.supabase
        .from('institutions')
        .select('*')
        .eq('id', id)
        .single();

      if (institutionError) throw institutionError;

      const { data: departments, error: departmentsError } = await this.supabase
        .from('departments')
        .select('*')
        .eq('institution_id', id)
        .order('name');

      if (departmentsError) throw departmentsError;

      return {
        ...institution,
        departments: departments || []
      };
    } catch (error) {
      console.error('Error fetching institution with departments:', error);
      return null;
    }
  }

  static async createInstitution(
    data: CreateInstitutionDto
  ): Promise<Institution> {
    try {
      // First check if institution with same code exists
      const { data: existing } = await this.supabase
        .from('institutions')
        .select('id, code')
        .eq('code', data.code)
        .maybeSingle();

      if (existing) {
        throw new Error(`Institution with code "${data.code}" already exists`);
      }

      const { data: institution, error } = await this.supabase
        .from('institutions')
        .insert([data])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(
            `Institution with code "${data.code}" already exists`
          );
        }
        throw error;
      }

      toast.success('Institution created successfully');
      return institution;
    } catch (error) {
      console.error('Error creating institution:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to create institution';
      toast.error(message);
      throw error;
    }
  }

  // Add method to check if code exists
  static async checkCodeExists(code: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('institutions')
        .select('id')
        .eq('code', code)
        .maybeSingle();

      if (error) throw error;

      return !!data;
    } catch (error) {
      console.error('Error checking institution code:', error);
      return false;
    }
  }

  static async updateInstitution(
    id: string,
    data: UpdateInstitutionDto
  ): Promise<Institution> {
    try {
      const { data: institution, error } = await this.supabase
        .from('institutions')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Institution updated successfully');
      return institution;
    } catch (error) {
      console.error('Error updating institution:', error);
      throw error;
    }
  }

  static async deleteInstitution(id: string): Promise<void> {
    try {
      // First check if the institution exists
      const { data: institution, error: checkError } = await this.supabase
        .from('institutions')
        .select('name')
        .eq('id', id)
        .single();

      if (checkError) {
        throw new Error('Institution not found');
      }

      // Delete the institution (departments will be automatically deleted due to CASCADE)
      const { error: deleteError } = await this.supabase
        .from('institutions')
        .delete()
        .eq('id', id);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        throw new Error(deleteError.message || 'Failed to delete institution');
      }

      toast.success('Institution deleted successfully');
    } catch (error) {
      console.error('Error deleting institution:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to delete institution';
      toast.error(message);
      throw error;
    }
  }

  // Department Methods
  static async getDepartments(
    filters: DepartmentFilters = {}
  ): Promise<OrganizationListResponse<Department>> {
    try {
      let query = this.supabase.from('departments').select(
        `
        *,
        institution:institutions (
          id,
          name,
          code
        )
      `,
        { count: 'exact' }
      );

      if (filters.institutionId) {
        query = query.eq('institution_id', filters.institutionId);
      }

      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`
        );
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const start = (page - 1) * limit;
      const end = start + limit - 1;

      query = query.range(start, end).order('name');

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching departments:', error);
      throw error;
    }
  }

  static async getDepartmentById(
    id: string
  ): Promise<DepartmentWithInstitution | null> {
    try {
      const { data, error } = await this.supabase
        .from('departments')
        .select(
          `
          *,
          institution:institutions(id, name, code)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching department:', error);
      return null;
    }
  }

  static async createDepartment(
    data: CreateDepartmentDto
  ): Promise<Department> {
    try {
      // Check if department code already exists in the same institution
      const { data: existing } = await this.supabase
        .from('departments')
        .select('id')
        .eq('institution_id', data.institution_id)
        .eq('code', data.code)
        .maybeSingle();

      if (existing) {
        throw new Error(
          `Department code "${data.code}" already exists in this institution`
        );
      }

      const { data: department, error } = await this.supabase
        .from('departments')
        .insert([data])
        .select()
        .single();

      if (error) throw error;

      toast.success('Department created successfully');
      return department;
    } catch (error) {
      console.error('Error creating department:', error);
      throw error;
    }
  }

  static async updateDepartment(
    id: string,
    data: UpdateDepartmentDto
  ): Promise<Department> {
    try {
      const { data: department, error } = await this.supabase
        .from('departments')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Department updated successfully');
      return department;
    } catch (error) {
      console.error('Error updating department:', error);
      throw error;
    }
  }

  static async deleteDepartment(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('departments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Department deleted successfully');
    } catch (error) {
      console.error('Error deleting department:', error);
      throw error;
    }
  }
}
