import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  Regulation,
  CreateRegulationDto,
  UpdateRegulationDto,
  RegulationFilters,
  RegulationListResponse
} from '@/types/academics';

export class RegulationService {
  private static supabase = createClientSupabaseClient();

  static async createRegulation(data: CreateRegulationDto): Promise<Regulation> {
    try {
      const { data: regulation, error } = await this.supabase
        .from('regulations')
        .insert([data])
        .select()
        .single();

      if (error) {
        logger.error('academic/regulations', 'Database error', error);
        // Preserve the error code for proper handling in the UI
        const enhancedError: any = new Error(
          error.message || 'Failed to create regulation'
        );
        enhancedError.code = error.code;
        enhancedError.details = error.details;
        throw enhancedError;
      }

      return regulation;
    } catch (error) {
      logger.error('academic/regulations', 'Error creating regulation', error);
      throw error;
    }
  }

  static async updateRegulation(
    id: string,
    data: UpdateRegulationDto
  ): Promise<Regulation> {
    try {
      const { data: regulation, error } = await this.supabase
        .from('regulations')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('academic/regulations', 'Database error', error);
        const enhancedError: any = new Error(
          error.message || 'Failed to update regulation'
        );
        enhancedError.code = error.code;
        enhancedError.details = error.details;
        throw enhancedError;
      }

      return regulation;
    } catch (error) {
      logger.error('academic/regulations', 'Error updating regulation', error);
      throw error;
    }
  }

  static async deleteRegulation(
    id: string,
    options: { showToast?: boolean } = { showToast: true }
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('regulations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      if (options.showToast) {
        toast.success('Regulation deleted successfully');
      }
    } catch (error) {
      logger.error('academic/regulations', 'Error deleting regulation', error);
      throw error;
    }
  }

  static async bulkDeleteRegulations(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    // Process deletions sequentially
    for (const id of ids) {
      try {
        await this.deleteRegulation(id);
        success.push(id);
      } catch (error) {
        logger.error('academic/regulations', `Error deleting regulation ${id}`, error);
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { success, failed };
  }

  static async getRegulations(
    filters: RegulationFilters = {}
  ): Promise<RegulationListResponse> {
    try {
      let query = this.supabase.from('regulations').select(
        `
          *,
          institution:institutions(id, name, counselling_code)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `regulation_code.ilike.%${filters.search}%,regulation_year.ilike.%${filters.search}%`
        );
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      if (filters.regulation_year) {
        query = query.eq('regulation_year', filters.regulation_year);
      }

      // Apply sorting
      if (filters.sortBy) {
        const direction = filters.sortDirection || 'asc';
        query = query.order(filters.sortBy, { ascending: direction === 'asc' });
      } else {
        // Default sort by regulation_year descending
        query = query.order('regulation_year', { ascending: false });
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const start = (page - 1) * limit;

      query = query.range(start, start + limit - 1);

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
      logger.error('academic/regulations', 'Error fetching regulations', error);
      throw error;
    }
  }

  static async getRegulation(id: string): Promise<Regulation> {
    try {
      const { data: regulation, error } = await this.supabase
        .from('regulations')
        .select(
          `
          *,
          institution:institutions(id, name, counselling_code)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return regulation;
    } catch (error) {
      logger.error('academic/regulations', 'Error fetching regulation', error);
      throw error;
    }
  }

  // Enhanced method with institution filtering
  static async getRegulationsWithAccess(
    filters: RegulationFilters = {},
    userInstitutionId?: string | null,
    isSuperAdmin: boolean = false
  ): Promise<RegulationListResponse> {
    try {
      let query = this.supabase.from('regulations').select(
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

      // Apply institution filter based on user permissions
      if (!isSuperAdmin && userInstitutionId) {
        query = query.eq('institution_id', userInstitutionId);
      } else if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      // Apply search filter
      if (filters.search) {
        query = query.or(
          `regulation_code.ilike.%${filters.search}%,regulation_year.ilike.%${filters.search}%`
        );
      }

      // Apply active filter
      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply year filter
      if (filters.regulation_year) {
        query = query.eq('regulation_year', filters.regulation_year);
      }

      // Apply sorting
      query = query.order('regulation_year', { ascending: false });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const offset = (page - 1) * limit;

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        data: data || [],
        metadata: {
          total,
          page,
          limit,
          totalPages
        }
      };
    } catch (error) {
      logger.error('academic/regulations', 'Error fetching regulations with access control', error);
      throw error;
    }
  }

  // Get regulations by institution with access control
  static async getRegulationsByInstitutionWithAccess(
    institutionId: string,
    userInstitutionId?: string | null,
    isSuperAdmin: boolean = false
  ): Promise<Regulation[]> {
    try {
      // Check if user has access to the requested institution
      if (
        !isSuperAdmin &&
        userInstitutionId &&
        institutionId !== userInstitutionId
      ) {
        throw new Error(
          'Access denied: You can only access your own institution data'
        );
      }

      const { data, error } = await this.supabase
        .from('regulations')
        .select('*')
        .eq('institution_id', institutionId)
        .order('regulation_year', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('academic/regulations', 'Error fetching regulations by institution', error);
      throw error;
    }
  }
}
