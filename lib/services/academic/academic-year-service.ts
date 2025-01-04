// lib/services/academic/academic-year-service.ts

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import type {
  AcademicYear,
  CreateAcademicYearDto,
  UpdateAcademicYearDto,
  AcademicYearFilters,
  AcademicYearListResponse
} from '@/types/academics';

export class AcademicYearService {
  private static supabase = createClientComponentClient();

  static async createAcademicYear(
    data: CreateAcademicYearDto
  ): Promise<AcademicYear> {
    try {
      const { data: academicYear, error } = await this.supabase
        .from('academic_years')
        .insert([data])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(
            'An academic year with this name already exists for the selected institution'
          );
        }
        throw error;
      }

      toast.success('Academic year created successfully');
      return academicYear;
    } catch (error) {
      console.error('Error creating academic year:', error);
      throw error;
    }
  }

  static async updateAcademicYear(
    id: string,
    data: UpdateAcademicYearDto
  ): Promise<AcademicYear> {
    try {
      const { data: academicYear, error } = await this.supabase
        .from('academic_years')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Academic year updated successfully');
      return academicYear;
    } catch (error) {
      console.error('Error updating academic year:', error);
      throw error;
    }
  }

  static async deleteAcademicYear(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('academic_years')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Academic year deleted successfully');
    } catch (error) {
      console.error('Error deleting academic year:', error);
      throw error;
    }
  }

  static async getAcademicYears(
    filters: AcademicYearFilters = {}
  ): Promise<AcademicYearListResponse> {
    try {
      let query = this.supabase.from('academic_years').select(
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
        query = query.ilike('academic_year_name', `%${filters.search}%`);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
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

      const { data: academicYears, error, count } = await query;

      if (error) throw error;

      return {
        data: academicYears || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching academic years:', error);
      throw error;
    }
  }

  static async getAcademicYear(id: string): Promise<AcademicYear> {
    try {
      const { data: academicYear, error } = await this.supabase
        .from('academic_years')
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

      return academicYear;
    } catch (error) {
      console.error('Error fetching academic year:', error);
      throw error;
    }
  }

  static async getAcademicYearsByInstitution(
    institutionId: string
  ): Promise<AcademicYear[]> {
    try {
      const { data: academicYears, error } = await this.supabase
        .from('academic_years')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('start_date', { ascending: false });

      if (error) throw error;

      return academicYears || [];
    } catch (error) {
      console.error('Error fetching academic years by institution:', error);
      throw error;
    }
  }
}
