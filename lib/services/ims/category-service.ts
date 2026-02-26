// lib/services/ims/category-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsItemCategory,
  ImsCategoryFilters,
  CreateImsCategoryDto,
  UpdateImsCategoryDto,
} from '@/types/ims';

export class ImsCategoryService {
  private static get supabase() {
    // IMS tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * List categories with pagination and filtering.
   */
  static async getCategories(filters: ImsCategoryFilters = {}): Promise<{
    data: ImsItemCategory[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('ims_item_categories')
        .select('*', { count: 'exact' });

      // Search on name or code
      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`
        );
      }

      // Active filter
      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      // Parent filter (null = root categories)
      if (filters.parent_id !== undefined) {
        if (filters.parent_id === null) {
          query = query.is('parent_id', null);
        } else {
          query = query.eq('parent_id', filters.parent_id);
        }
      }

      // Store filter (primary scope)
      if (filters.store_id) {
        query = query.eq('store_id', filters.store_id);
      }

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('name', { ascending: true });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: (data || []) as ImsItemCategory[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[ImsCategoryService] Error in getCategories:', error);
      throw error;
    }
  }

  /**
   * Get a single category by ID.
   */
  static async getCategory(id: string): Promise<ImsItemCategory> {
    try {
      const { data, error } = await this.supabase
        .from('ims_item_categories')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      return data as ImsItemCategory;
    } catch (error) {
      console.error('[ImsCategoryService] Error in getCategory:', error);
      throw error;
    }
  }

  /**
   * Create a new category.
   */
  static async createCategory(data: CreateImsCategoryDto): Promise<ImsItemCategory> {
    try {
      const { data: category, error } = await this.supabase
        .from('ims_item_categories')
        .insert(data)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(`Category code "${data.code}" already exists`);
        }
        throw error;
      }

      return category as ImsItemCategory;
    } catch (error) {
      console.error('[ImsCategoryService] Error in createCategory:', error);
      throw error;
    }
  }

  /**
   * Update an existing category.
   */
  static async updateCategory(
    id: string,
    data: UpdateImsCategoryDto
  ): Promise<ImsItemCategory> {
    try {
      const { data: category, error } = await this.supabase
        .from('ims_item_categories')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return category as ImsItemCategory;
    } catch (error) {
      console.error('[ImsCategoryService] Error in updateCategory:', error);
      throw error;
    }
  }

  /**
   * Delete a category by ID.
   */
  static async deleteCategory(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('ims_item_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('[ImsCategoryService] Error in deleteCategory:', error);
      throw error;
    }
  }

  /**
   * Lightweight category list for dropdown selects.
   */
  static async getCategoriesForSelect(
    storeId?: string
  ): Promise<
    { id: string; name: string; code: string }[]
  > {
    try {
      let query = this.supabase
        .from('ims_item_categories')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name');

      if (storeId) {
        query = query.eq('store_id', storeId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('[ImsCategoryService] Error in getCategoriesForSelect:', error);
      throw error;
    }
  }
}
