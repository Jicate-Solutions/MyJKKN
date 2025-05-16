import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
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
        if (error.code === '23505') {
          throw new Error('A period with this name already exists');
        }
        throw error;
      }

      toast.success('Period created successfully');
      return period;
    } catch (error) {
      console.error('Error creating period:', error);
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

      if (error) throw error;

      toast.success('Period updated successfully');
      return period;
    } catch (error) {
      console.error('Error updating period:', error);
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
      console.error('Error deleting period:', error);
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
        console.error(`Error deleting period ${id}:`, error);
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
      let query = this.supabase.from('periods').select('*', { count: 'exact' });

      // Apply filters
      if (filters.search) {
        query = query.ilike('period_name', `%${filters.search}%`);
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
      console.error('Error fetching periods:', error);
      throw error;
    }
  }

  static async getPeriod(id: string): Promise<Period> {
    try {
      const { data: period, error } = await this.supabase
        .from('periods')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      return period;
    } catch (error) {
      console.error('Error fetching period:', error);
      throw error;
    }
  }

  static async getPeriodsByTimeRange(
    startTime: string,
    endTime: string
  ): Promise<Period[]> {
    try {
      const { data: periods, error } = await this.supabase.rpc(
        'get_periods_in_range',
        {
          p_start_time: startTime,
          p_end_time: endTime
        }
      );

      if (error) throw error;

      return periods || [];
    } catch (error) {
      console.error('Error fetching periods by time range:', error);
      throw error;
    }
  }
}
