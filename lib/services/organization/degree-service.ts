// lib/services/degree-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  Degree,
  CreateDegreeDto,
  UpdateDegreeDto,
  DegreeFilters,
  DegreeListResponse
} from '@/types/organizations';

export class DegreeService {
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
      const result =
        await UserInstitutionAccessService.getUserAccessibleInstitutionIds(
          userId
        );
      return result;
    } catch (error) {
      console.error(
        'DegreeService: Error getting user accessible institution IDs:',
        error
      );
      return [];
    }
  }

  static async getDegreeByName(
    name: string,
    institutionId: string
  ): Promise<Degree | null> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('degrees')
        .select('*')
        .eq('institution_id', institutionId)
        .ilike('degree_name', name)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found, which is not an error in this case
          return null;
        }
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Error fetching degree by name:', error);
      throw error;
    }
  }

  static async createDegree(data: CreateDegreeDto): Promise<Degree> {
    try {
      const { data: degree, error } = await (this.supabase as any)
        .from('degrees')
        .insert([
          {
            ...data,
            degree_id: data.degree_id.toUpperCase()
          }
        ])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(`Degree ID "${data.degree_id}" already exists`);
        }
        throw error;
      }

      toast.success('Degree created successfully');
      return degree;
    } catch (error) {
      console.error('Error creating degree:', error);
      throw error;
    }
  }

  static async updateDegree(
    id: string,
    data: UpdateDegreeDto
  ): Promise<Degree> {
    try {
      const { data: degree, error } = await (this.supabase as any)
        .from('degrees')
        .update({
          ...data,
          degree_id: data.degree_id?.toUpperCase(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Degree updated successfully');
      return degree;
    } catch (error) {
      console.error('Error updating degree:', error);
      throw error;
    }
  }

  static async deleteDegree(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('degrees')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Degree deleted successfully');
    } catch (error) {
      console.error('Error deleting degree:', error);
      throw error;
    }
  }

  static async getDegrees(
    filters: DegreeFilters = {}
  ): Promise<DegreeListResponse> {
    try {
      const page = filters.page ?? 1;
      const limit = filters.limit ?? 10;

      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });

      if (filters.search) params.set('search', filters.search);
      if (filters.institution_id) params.set('institution_id', filters.institution_id);
      if (filters.degree_type) params.set('degree_type', filters.degree_type);

      // Map string status → boolean isActive for JKKN API
      if (filters.status) {
        params.set('isActive', filters.status === 'active' ? 'true' : 'false');
      } else if (filters.isActive !== undefined) {
        params.set('isActive', String(filters.isActive));
      }

      const res = await fetch(`/api/jkkn/degrees?${params}`);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error('DegreeService: Query error:', body);
        throw new Error(`JKKN degrees API error ${res.status}`);
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
      console.error('DegreeService: Query error:', error);
      throw error;
    }
  }

  static async getDegree(id: string): Promise<Degree> {
    try {
      const { data: degree, error } = await (this.supabase as any)
        .from('degrees')
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

      if (error) throw error;

      return degree;
    } catch (error) {
      console.error('Error fetching degree:', error);
      throw error;
    }
  }

  static async getDegreesByInstitution(
    institutionId: string
  ): Promise<Degree[]> {
    try {
      const params = new URLSearchParams({
        institution_id: institutionId,
        isActive: 'true',
        limit: '100',
        page: '1',
      });

      const res = await fetch(`/api/jkkn/degrees?${params}`);
      if (!res.ok) return [];

      const json = await res.json();
      return json.data ?? [];
    } catch (error) {
      console.error('Error fetching degrees by institution:', error);
      return [];
    }
  }
}
