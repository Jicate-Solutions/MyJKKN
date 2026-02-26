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

  static async getDepartmentByName(
    name: string,
    degreeId: string
  ): Promise<Department | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('departments')
        .select('*')
        .eq('degree_id', degreeId)
        .ilike('department_name', name)
        .single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Error fetching department by name:', error);
      throw error;
    }
  }

  static async createDepartment(
    data: CreateDepartmentDto
  ): Promise<Department> {
    try {
      const { data: department, error } = await (this.supabase as any)
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
      const { data: department, error } = await (this.supabase as any)
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
      const { error } = await (this.supabase as any)
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
      const page = filters.page ?? 1;
      const limit = filters.limit ?? 10;

      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });

      if (filters.search) params.set('search', filters.search);
      if (filters.institution_id) params.set('institution_id', filters.institution_id);
      if (filters.degree_id) params.set('degree_id', filters.degree_id);
      if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));

      const res = await fetch(`/api/jkkn/departments?${params}`);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error('DepartmentService: Query error:', body);
        throw new Error(`JKKN departments API error ${res.status}`);
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
      console.error('Error fetching departments:', error);
      throw error;
    }
  }

  static async getDepartment(id: string): Promise<Department> {
    try {
      // Note: departments table actual schema has: id, name, code, description,
      // hod_user_id, parent_department_id, is_active, created_at, updated_at
      const { data: department, error } = await (this.supabase as any)
        .from('departments')
        .select(`*`)
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
      const params = new URLSearchParams({
        institution_id: institutionId,
        isActive: 'true',
        limit: '100',
        page: '1',
      });

      const res = await fetch(`/api/jkkn/departments?${params}`);
      if (!res.ok) return [];

      const json = await res.json();
      return json.data ?? [];
    } catch (error) {
      console.error('Error fetching departments by institution:', error);
      return [];
    }
  }

  static async getDepartmentsByInstitutionAndDegree(
    institutionId: string,
    degreeId: string
  ): Promise<Department[]> {
    try {
      const params = new URLSearchParams({
        institution_id: institutionId,
        isActive: 'true',
        limit: '100',
        page: '1',
      });

      const res = await fetch(`/api/jkkn/departments?${params}`);
      if (!res.ok) return [];

      const json = await res.json();
      // Filter client-side by degree_id since JKKN API doesn't support degree_id filter
      const all: Department[] = json.data ?? [];
      return all.filter(d => d.degree_id === degreeId);
    } catch (error) {
      console.error('Error fetching departments:', error);
      return [];
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
        query = (this.supabase as any)
          .from('departments')
          .select('*')
          .eq('degree_id', degreeId)
          .eq('is_active', true)
          .order('department_name');
      } else {
        // If it's not a UUID, try to find the degree by name first
        const { data: degree } = await (this.supabase as any)
          .from('degrees')
          .select('id')
          .ilike('degree_name', degreeId)
          .single();

        if (degree) {
          query = (this.supabase as any)
            .from('departments')
            .select('*')
            .eq('degree_id', degree.id)
            .eq('is_active', true)
            .order('department_name');
        } else {
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
