import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery
} from '@/lib/auth/api-institution-filter';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  Period,
  CreatePeriodDto,
  UpdatePeriodDto,
  PeriodFilters,
  PeriodListResponse
} from '@/types/academics';

export class PeriodService {
  private static supabase = createClientSupabaseClient();

  static async createPeriod(data: CreatePeriodDto): Promise<Period> {
    try {
      const { data: period, error } = await this.supabase
        .from('periods')
        .insert([data])
        .select()
        .single();

      if (error) {
        logger.error('academic/periods', 'Database error', error);
        // Preserve the error code for proper handling in the UI
        const enhancedError: any = new Error(
          error.message || 'Failed to create period'
        );
        enhancedError.code = error.code;
        enhancedError.details = error.details;
        throw enhancedError;
      }

      return period;
    } catch (error) {
      logger.error('academic/periods', 'Error creating period', error);
      throw error;
    }
  }

  static async updatePeriod(
    id: string,
    data: UpdatePeriodDto
  ): Promise<Period> {
    try {
      const { data: period, error } = await this.supabase
        .from('periods')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('academic/periods', 'Database error', error);
        // Preserve the error code for proper handling in the UI
        const enhancedError: any = new Error(
          error.message || 'Failed to update period'
        );
        enhancedError.code = error.code;
        enhancedError.details = error.details;
        throw enhancedError;
      }

      return period;
    } catch (error) {
      logger.error('academic/periods', 'Error updating period', error);
      throw error;
    }
  }

  static async deletePeriod(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('periods')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Period deleted successfully');
    } catch (error) {
      logger.error('academic/periods', 'Error deleting period', error);
      throw error;
    }
  }

  static async bulkDeletePeriods(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    // Process deletions sequentially
    for (const id of ids) {
      try {
        await this.deletePeriod(id);
        success.push(id);
      } catch (error) {
        logger.error('academic/periods', `Error deleting period ${id}`, error);
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { success, failed };
  }

  static async getPeriods(
    filters: PeriodFilters = {}
  ): Promise<PeriodListResponse> {
    try {
      let query = (this.supabase as any).from('periods').select(
        `
          *,
          institution:institutions(id, name)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.ilike('period_name', `%${filters.search}%`);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.isBreak !== undefined) {
        query = query.eq('is_break', filters.isBreak);
      }

      // Apply sorting
      if (filters.sortBy) {
        const direction = filters.sortDirection || 'asc';
        query = query.order(filters.sortBy, { ascending: direction === 'asc' });
      } else {
        // Default sort by start_time
        query = query.order('start_time', { ascending: true });
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
      logger.error('academic/periods', 'Error fetching periods', error);
      throw error;
    }
  }

  static async getPeriod(id: string): Promise<Period> {
    try {
      const { data: period, error } = await this.supabase
        .from('periods')
        .select(
          `
          *,
          institution:institutions(id, name)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return period;
    } catch (error) {
      logger.error('academic/periods', 'Error fetching period', error);
      throw error;
    }
  }

  static async getPeriodsByTimeRange(
    startTime: string,
    endTime: string
  ): Promise<Period[]> {
    try {
      const { data: periods, error } = await (this.supabase as any).rpc(
        'get_periods_in_range',
        {
          p_start_time: startTime,
          p_end_time: endTime
        }
      );

      if (error) throw error;

      return periods || [];
    } catch (error) {
      logger.error('academic/periods', 'Error fetching periods by time range', error);
      throw error;
    }
  }

  // Add institution filtering helper method
  private static async applyInstitutionAccess(
    query: any,
    userInstitutionId?: string | null
  ): Promise<any> {
    if (userInstitutionId) {
      return query.eq('institution_id', userInstitutionId);
    }
    return query;
  }

  // Enhanced method with institution filtering
  static async getPeriodsWithAccess(
    filters: PeriodFilters = {},
    userInstitutionId?: string | null,
    isSuperAdmin: boolean = false
  ): Promise<PeriodListResponse> {
    try {
      let query = (this.supabase as any).from('periods').select(
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
        query = query.ilike('period_name', `%${filters.search}%`);
      }

      // Apply break filter
      if (filters.isBreak !== undefined) {
        query = query.eq('is_break', filters.isBreak);
      }

      // Apply sorting
      query = query.order('start_time', { ascending: true });

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
      logger.error('academic/periods', 'Error fetching periods with access control', error);
      throw error;
    }
  }

  // Enhanced method for getting periods by institution with access control
  static async getPeriodsByInstitutionWithAccess(
    institutionId: string,
    userInstitutionId?: string | null,
    isSuperAdmin: boolean = false
  ): Promise<Period[]> {
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
        .from('periods')
        .select('*')
        .eq('institution_id', institutionId)
        .order('start_time', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('academic/periods', 'Error fetching periods by institution', error);
      throw error;
    }
  }
}
