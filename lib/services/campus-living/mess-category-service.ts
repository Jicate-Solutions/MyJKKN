import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  MessCategory,
  CreateMessCategoryDto,
  UpdateMessCategoryDto,
  MessCategoryFilters,
  MessCategoryListResponse,
} from '@/types/mess-categories';

export class MessCategoryService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async getCategories(
    filters: MessCategoryFilters = {}
  ): Promise<MessCategoryListResponse> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 100;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('mess_categories')
      .select('*', { count: 'exact' })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .range(from, to);

    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters.search) {
      // Strip PostgREST filter metacharacters and wildcards before building
      // the .or() string — prevents filter injection via raw user input.
      const safe = filters.search.replace(/[,()*\\%_]/g, '').trim();
      if (safe) {
        query = query.or(`name.ilike.%${safe}%,type.ilike.%${safe}%`);
      }
    }

    const { data, error, count } = await query;
    if (error) {
      logger.error('campus-living/mess-categories', 'Database error listing', error);
      throw new Error(error.message || 'Failed to fetch mess categories');
    }

    const total = count ?? 0;
    return {
      data: (data ?? []) as MessCategory[],
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getActiveCategories(): Promise<MessCategory[]> {
    const { data, error } = await this.supabase
      .from('mess_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      logger.error('campus-living/mess-categories', 'Database error listing active', error);
      throw new Error(error.message || 'Failed to fetch active mess categories');
    }
    return (data ?? []) as MessCategory[];
  }

  static async getCategoryById(id: string): Promise<MessCategory> {
    const { data, error } = await this.supabase
      .from('mess_categories')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      logger.error('campus-living/mess-categories', 'Database error fetching one', error);
      throw new Error(error.message || 'Failed to fetch mess category');
    }
    return data as MessCategory;
  }

  static async createCategory(
    dto: CreateMessCategoryDto
  ): Promise<MessCategory> {
    const { data, error } = await this.supabase
      .from('mess_categories')
      .insert([dto])
      .select()
      .single();
    if (error) {
      logger.error('campus-living/mess-categories', 'Database error creating', error);
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.message || 'Failed to create mess category'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }
    return data as MessCategory;
  }

  static async updateCategory(
    id: string,
    dto: UpdateMessCategoryDto
  ): Promise<MessCategory> {
    const { data, error } = await this.supabase
      .from('mess_categories')
      .update({
        ...dto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      logger.error('campus-living/mess-categories', 'Database error updating', error);
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.message || 'Failed to update mess category'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }
    return data as MessCategory;
  }

  static async deleteCategory(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('mess_categories')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error('campus-living/mess-categories', 'Database error deleting', error);
      throw new Error(error.message || 'Failed to delete mess category');
    }
  }

  static async bulkDeleteCategories(
    ids: string[]
  ): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      try {
        await this.deleteCategory(id);
        success.push(id);
      } catch (e) {
        logger.error('campus-living/mess-categories', `Error deleting ${id}`, e);
        failed.push({
          id,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }
    return { success, failed };
  }
}
