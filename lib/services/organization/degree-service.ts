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

  static async createDegree(data: CreateDegreeDto): Promise<Degree> {
    try {
      const { data: degree, error } = await this.supabase
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
      const { data: degree, error } = await this.supabase
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
      const { error } = await this.supabase
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
      let query = this.supabase.from('degrees').select(
        `
        *,
        institution:institutions (
          id,
          name,
          counselling_code
        )
      `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `degree_id.ilike.%${filters.search}%,degree_name.ilike.%${filters.search}%`
        );
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.degree_type) {
        query = query.eq('degree_type', filters.degree_type);
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

      const { data: degrees, error, count } = await query;

      if (error) throw error;

      return {
        data: degrees || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching degrees:', error);
      throw error;
    }
  }

  static async getDegree(id: string): Promise<Degree> {
    try {
      const { data: degree, error } = await this.supabase
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
      const { data: degrees, error } = await this.supabase
        .from('degrees')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('degree_name');

      if (error) throw error;

      return degrees || [];
    } catch (error) {
      console.error('Error fetching degrees by institution:', error);
      throw error;
    }
  }
}
