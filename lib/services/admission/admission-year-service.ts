// lib/services/admission/admission-year-service.ts
//
// Service layer for the Admission Years entity.
// Mirrors the shape of AcademicYearService so UI patterns stay consistent.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  AdmissionYear,
  CreateAdmissionYearDto,
  UpdateAdmissionYearDto,
  AdmissionYearFilters,
  AdmissionYearListResponse
} from '@/types/admission';
import { logger } from '@/lib/utils/enhanced-logger';

const SELECT_WITH_RELATIONS = `
  *,
  institution:institutions (id, name, counselling_code),
  program:programs (id, program_id, program_name, program_duration_yrs)
`;

export class AdmissionYearService {
  private static supabase = createClientSupabaseClient();

  static async createAdmissionYear(
    data: CreateAdmissionYearDto
  ): Promise<AdmissionYear> {
    try {
      const { data: row, error } = await (this.supabase as any)
        .from('admission_years')
        .insert([data])
        .select(SELECT_WITH_RELATIONS)
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(
            'An admission year already exists for this program and start year'
          );
        }
        throw error;
      }

      toast.success('Admission year created successfully');
      return row as AdmissionYear;
    } catch (error) {
      logger.error('admissions', 'Error creating admission year', error);
      throw error;
    }
  }

  static async updateAdmissionYear(
    id: string,
    data: UpdateAdmissionYearDto
  ): Promise<AdmissionYear> {
    try {
      const { data: row, error } = await (this.supabase as any)
        .from('admission_years')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(SELECT_WITH_RELATIONS)
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(
            'An admission year already exists for this program and start year'
          );
        }
        throw error;
      }

      toast.success('Admission year updated successfully');
      return row as AdmissionYear;
    } catch (error) {
      logger.error('admissions', 'Error updating admission year', error);
      throw error;
    }
  }

  static async deleteAdmissionYear(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('admission_years')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Admission year deleted successfully');
    } catch (error) {
      logger.error('admissions', 'Error deleting admission year', error);
      throw error;
    }
  }

  static async bulkDeleteAdmissionYears(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const id of ids) {
      try {
        await this.deleteAdmissionYear(id);
        success.push(id);
      } catch (error) {
        logger.error('admissions', `Error deleting admission year ${id}`, error);
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { success, failed };
  }

  static async getAdmissionYearsWithAccess(
    filters: AdmissionYearFilters = {},
    userInstitutionId?: string | null,
    isSuperAdmin: boolean = false
  ): Promise<AdmissionYearListResponse> {
    try {
      let query = (this.supabase as any)
        .from('admission_years')
        .select(SELECT_WITH_RELATIONS, { count: 'exact' });

      // Institution scoping
      if (filters.institution_id) {
        if (
          !isSuperAdmin &&
          userInstitutionId &&
          filters.institution_id !== userInstitutionId
        ) {
          throw new Error(
            'Access denied: You can only access your own institution data'
          );
        }
        query = query.eq('institution_id', filters.institution_id);
      } else if (!isSuperAdmin && userInstitutionId) {
        query = query.eq('institution_id', userInstitutionId);
      }

      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }

      if (filters.program_start_year !== undefined) {
        query = query.eq('program_start_year', filters.program_start_year);
      }

      if (filters.search) {
        query = query.ilike('admission_year_name', `%${filters.search}%`);
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Sort
      const sortBy = filters.sortBy || 'created_at';
      const sortOrder = filters.sortOrder || 'desc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        logger.error('admissions', 'Supabase query error in getAdmissionYearsWithAccess', error);
        throw error;
      }

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        data: (data as AdmissionYear[]) || [],
        metadata: { total, page, limit, totalPages }
      };
    } catch (error) {
      logger.error('admissions', 'Error fetching admission years with access control', error);
      throw error;
    }
  }

  static async getAdmissionYear(id: string): Promise<AdmissionYear | null> {
    try {
      const { data, error } = await this.supabase
        .from('admission_years')
        .select(SELECT_WITH_RELATIONS)
        .eq('id', id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        logger.error('admissions', 'Error fetching admission year', error);
        throw error;
      }

      return (data as AdmissionYear | null) ?? null;
    } catch (error) {
      logger.error('admissions', 'Error fetching admission year', error);
      throw error;
    }
  }

  static async getAdmissionYearsByInstitution(
    institutionId: string,
    includeInactive: boolean = false
  ): Promise<AdmissionYear[]> {
    try {
      let query = this.supabase
        .from('admission_years')
        .select(SELECT_WITH_RELATIONS)
        .eq('institution_id', institutionId);

      if (!includeInactive) query = query.eq('is_active', true);

      const { data, error } = await query.order('program_start_year', {
        ascending: false
      });

      if (error) throw error;
      return (data as AdmissionYear[]) || [];
    } catch (error) {
      logger.error('admissions', 'Error fetching admission years by institution', error);
      throw error;
    }
  }

  static async getAdmissionYearsByProgram(
    programId: string,
    includeInactive: boolean = false
  ): Promise<AdmissionYear[]> {
    try {
      let query = this.supabase
        .from('admission_years')
        .select(SELECT_WITH_RELATIONS)
        .eq('program_id', programId);

      if (!includeInactive) query = query.eq('is_active', true);

      const { data, error } = await query.order('program_start_year', {
        ascending: false
      });

      if (error) throw error;
      return (data as AdmissionYear[]) || [];
    } catch (error) {
      logger.error('admissions', 'Error fetching admission years by program', error);
      throw error;
    }
  }
}
