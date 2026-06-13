import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelCategory,
  CreateHostelCategoryDto,
  UpdateHostelCategoryDto,
  HostelCategoryFilters,
  HostelCategoryListResponse,
} from '@/types/hostel-categories';

export class HostelCategoryService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async getCategories(
    filters: HostelCategoryFilters = {}
  ): Promise<HostelCategoryListResponse> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 100;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('hostel_categories')
      .select('*', { count: 'exact' })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .range(from, to);

    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters.search) {
      query = query.or(
        `name.ilike.%${filters.search}%,type.ilike.%${filters.search}%`
      );
    }

    const { data, error, count } = await query;
    if (error) {
      logger.error('campus-living/categories', 'Database error listing', error);
      throw new Error(error.message || 'Failed to fetch hostel categories');
    }

    const total = count ?? 0;
    return {
      data: (data ?? []) as HostelCategory[],
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getActiveCategories(): Promise<HostelCategory[]> {
    const { data, error } = await this.supabase
      .from('hostel_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      logger.error('campus-living/categories', 'Database error listing active', error);
      throw new Error(error.message || 'Failed to fetch active hostel categories');
    }
    return (data ?? []) as HostelCategory[];
  }

  static async getCategoryById(id: string): Promise<HostelCategory> {
    const { data, error } = await this.supabase
      .from('hostel_categories')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      logger.error('campus-living/categories', 'Database error fetching one', error);
      throw new Error(error.message || 'Failed to fetch hostel category');
    }
    return data as HostelCategory;
  }

  static async createCategory(
    dto: CreateHostelCategoryDto
  ): Promise<HostelCategory> {
    const { data, error } = await this.supabase
      .from('hostel_categories')
      .insert([dto])
      .select()
      .single();
    if (error) {
      logger.error('campus-living/categories', 'Database error creating', error);
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.message || 'Failed to create hostel category'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }
    return data as HostelCategory;
  }

  static async updateCategory(
    id: string,
    dto: UpdateHostelCategoryDto
  ): Promise<HostelCategory> {
    const { data, error } = await this.supabase
      .from('hostel_categories')
      .update({
        ...dto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      logger.error('campus-living/categories', 'Database error updating', error);
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.message || 'Failed to update hostel category'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }
    return data as HostelCategory;
  }

  static async deleteCategory(id: string): Promise<void> {
    const { count } = await this.supabase
      .from('hostel_rooms')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id);

    if (count && count > 0) {
      throw new Error(
        `Cannot delete: ${count} room${count > 1 ? 's' : ''} still use this category. Reassign them first.`
      );
    }

    const { error } = await this.supabase
      .from('hostel_categories')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error('campus-living/categories', 'Database error deleting', error);
      throw new Error(error.message || 'Failed to delete hostel category');
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
        logger.error('campus-living/categories', `Error deleting ${id}`, e);
        failed.push({
          id,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }
    return { success, failed };
  }
}
