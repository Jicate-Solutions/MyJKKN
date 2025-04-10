// lib/services/department-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  Department,
  CreateDepartmentDto,
  UpdateDepartmentDto,
  DepartmentFilters,
  DepartmentListResponse
} from '@/types/organizations';

export class DepartmentService {
  private static supabase = createClientSupabaseClient();

  static async createDepartment(
    data: CreateDepartmentDto
  ): Promise<Department> {
    try {
      const { data: department, error } = await this.supabase
        .from('departments')
        .insert([
          {
            ...data,
            department_code: data.department_code.toUpperCase()
          }
        ])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(
            `Department code "${data.department_code}" already exists`
          );
        }
        throw error;
      }

      if (!department) {
        throw new Error('Failed to create department');
      }

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
        .update({
          ...data,
          department_code: data.department_code?.toUpperCase(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      if (!department) throw new Error('Department not found');

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
      return;
    } catch (error) {
      console.error('Error deleting department:', error);
      throw error;
    }
  }

  static async getDepartments(
    filters: DepartmentFilters = {}
  ): Promise<DepartmentListResponse> {
    try {
      let query = this.supabase.from('departments').select(
        `
          *,
          institution:institutions!inner (
            id,
            name,
            counselling_code
          ),
          degree:degrees!inner (
            id,
            degree_id,
            degree_name
          )
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `department_code.ilike.%${filters.search}%,department_name.ilike.%${filters.search}%`
        );
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.degree_id) {
        query = query.eq('degree_id', filters.degree_id);
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

      const { data: departments, error, count } = await query;

      if (error) throw error;

      return {
        data: departments || [],
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

  static async getDepartment(id: string): Promise<Department> {
    try {
      const { data: department, error } = await this.supabase
        .from('departments')
        .select(
          `
          *,
          institution:institutions!inner (
            id,
            name,
            counselling_code
          ),
          degree:degrees!inner (
            id,
            degree_id,
            degree_name
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!department) throw new Error('Department not found');

      return department;
    } catch (error) {
      console.error('Error fetching department:', error);
      throw error;
    }
  }

  static async getDepartmentsByInstitution(
    institutionId: string
  ): Promise<Department[]> {
    try {
      const { data: departments, error } = await this.supabase
        .from('departments')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('department_name');

      if (error) throw error;

      return departments || [];
    } catch (error) {
      console.error('Error fetching departments by institution:', error);
      toast.error('Failed to load departments');
      return [];
    }
  }

  static async getDepartmentsByInstitutionAndDegree(
    institutionId: string,
    degreeId: string
  ): Promise<Department[]> {
    try {
      const { data: departments, error } = await this.supabase
        .from('departments')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('degree_id', degreeId)
        .eq('is_active', true)
        .order('department_name');

      if (error) throw error;

      return departments || [];
    } catch (error) {
      console.error('Error fetching departments:', error);
      throw error;
    }
  }

  static async getDepartmentsByDegree(degreeId: string) {
    try {
      // Check if degreeId is a UUID or a name/label
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          degreeId
        );

      let query;

      if (isUUID) {
        // If it's a UUID, use it directly with eq
        query = this.supabase
          .from('departments')
          .select('*')
          .eq('degree_id', degreeId)
          .eq('is_active', true)
          .order('department_name');
      } else {
        // If it's not a UUID, try to find the degree by name first
        console.log('Searching for degree with name:', degreeId);

        const { data: degree } = await this.supabase
          .from('degrees')
          .select('id')
          .ilike('degree_name', degreeId)
          .single();

        if (degree) {
          console.log('Found degree with ID:', degree.id);
          query = this.supabase
            .from('departments')
            .select('*')
            .eq('degree_id', degree.id)
            .eq('is_active', true)
            .order('department_name');
        } else {
          console.log('No degree found with name:', degreeId);
          // Return empty array if no degree found
          return [];
        }
      }

      const { data: departments, error } = await query;

      if (error) throw error;

      return departments || [];
    } catch (error) {
      console.error('Error fetching departments by degree:', error);
      toast.error('Failed to load departments');
      return [];
    }
  }
}
