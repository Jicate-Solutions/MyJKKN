import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelYear,
  CreateHostelYearDto,
  UpdateHostelYearDto,
  HostelYearFilters,
  HostelYearListResponse,
} from '@/types/hostel-years';

export class HostelYearService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async getYears(
    filters: HostelYearFilters = {}
  ): Promise<HostelYearListResponse> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 100;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('hostel_years')
      .select('*', { count: 'exact' })
      .order('start_date', { ascending: false })
      .order('name', { ascending: true })
      .range(from, to);

    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      logger.error('campus-living/hostel-years', 'Database error listing', error);
      throw new Error(error.message || 'Failed to fetch hostel years');
    }

    const total = count ?? 0;
    return {
      data: (data ?? []) as HostelYear[],
      metadata: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  static async getActiveYears(): Promise<HostelYear[]> {
    const { data, error } = await this.supabase
      .from('hostel_years')
      .select('*')
      .eq('is_active', true)
      .order('start_date', { ascending: false })
      .order('name', { ascending: true });

    if (error) {
      logger.error('campus-living/hostel-years', 'Database error listing active', error);
      throw new Error(error.message || 'Failed to fetch active hostel years');
    }
    return (data ?? []) as HostelYear[];
  }

  static async getCurrentYear(): Promise<HostelYear | null> {
    const { data, error } = await this.supabase
      .from('hostel_years')
      .select('*')
      .eq('is_current', true)
      .maybeSingle();

    if (error) {
      logger.error('campus-living/hostel-years', 'Database error fetching current', error);
      throw new Error(error.message || 'Failed to fetch current hostel year');
    }
    return (data as HostelYear | null) ?? null;
  }

  static async getYearById(id: string): Promise<HostelYear> {
    const { data, error } = await this.supabase
      .from('hostel_years')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      logger.error('campus-living/hostel-years', 'Database error fetching one', error);
      throw new Error(error.message || 'Failed to fetch hostel year');
    }
    return data as HostelYear;
  }

  static async createYear(dto: CreateHostelYearDto): Promise<HostelYear> {
    const { data, error } = await this.supabase
      .from('hostel_years')
      .insert([dto])
      .select()
      .single();
    if (error) {
      logger.error('campus-living/hostel-years', 'Database error creating', error);
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.message || 'Failed to create hostel year'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }
    return data as HostelYear;
  }

  static async updateYear(
    id: string,
    dto: UpdateHostelYearDto
  ): Promise<HostelYear> {
    const { data, error } = await this.supabase
      .from('hostel_years')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      logger.error('campus-living/hostel-years', 'Database error updating', error);
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.message || 'Failed to update hostel year'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }
    return data as HostelYear;
  }

  static async deleteYear(id: string): Promise<void> {
    // Friendly guard: the hostel_fee_config FK is RESTRICT, so the DB would
    // block this anyway — surface a clearer message before hitting it.
    const { count } = await this.supabase
      .from('hostel_fee_config')
      .select('id', { count: 'exact', head: true })
      .eq('hostel_year_id', id);

    if (count && count > 0) {
      throw new Error(
        `Cannot delete: ${count} fee configuration${count > 1 ? 's' : ''} still use this hostel year. Remove them first.`
      );
    }

    const { error } = await this.supabase
      .from('hostel_years')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error('campus-living/hostel-years', 'Database error deleting', error);
      throw new Error(error.message || 'Failed to delete hostel year');
    }
  }

  static async bulkDeleteYears(
    ids: string[]
  ): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      try {
        await this.deleteYear(id);
        success.push(id);
      } catch (e) {
        logger.error('campus-living/hostel-years', `Error deleting ${id}`, e);
        failed.push({ id, error: e instanceof Error ? e.message : 'Unknown error' });
      }
    }
    return { success, failed };
  }
}
