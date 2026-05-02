import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  BillingCategory,
  CreateBillingCategoryDto,
  UpdateBillingCategoryDto,
  BillingCategoryFilters,
  BillingCategoryListResponse
} from '@/types/billing';

// 2026-04-28: Replaces BillingParentCategoryService + BillingSubCategoryService
// + BillingItemCategoryService. Categories are now a single global flat table
// with no institution scoping.

export class BillingCategoryService {
  private static supabase = createClientSupabaseClient();

  static async checkCategoryNameExists(
    categoryName: string,
    excludeId?: string
  ): Promise<boolean> {
    try {
      let query = this.supabase
        .from('billing_categories')
        .select('id')
        .ilike('category_name', categoryName);

      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      return !!data;
    } catch (error) {
      console.error('[billing/categories] Error checking category name:', error);
      return false;
    }
  }

  static async createBillingCategory(
    data: CreateBillingCategoryDto
  ): Promise<BillingCategory> {
    try {
      const nameExists = await this.checkCategoryNameExists(data.category_name);

      if (nameExists) {
        throw new Error(
          `Billing category "${data.category_name}" already exists`
        );
      }

      const { data: category, error } = await (this.supabase
        .from('billing_categories') as any)
        .insert([
          {
            category_name: data.category_name.trim(),
            amount: data.amount ?? null,
            frequency: data.frequency,
            description: data.description?.trim() || null,
            is_active: data.is_active ?? true
          }
        ])
        .select('*')
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(
            `Billing category "${data.category_name}" already exists`
          );
        }
        throw error;
      }

      return category as BillingCategory;
    } catch (error) {
      console.error('[billing/categories] Error creating category:', error);
      throw error;
    }
  }

  static async updateBillingCategory(
    id: string,
    data: UpdateBillingCategoryDto
  ): Promise<BillingCategory> {
    try {
      if (data.category_name) {
        const nameExists = await this.checkCategoryNameExists(
          data.category_name,
          id
        );

        if (nameExists) {
          throw new Error(
            `Billing category "${data.category_name}" already exists`
          );
        }
      }

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString()
      };

      if (data.category_name)
        updateData.category_name = data.category_name.trim();
      if (data.amount !== undefined) updateData.amount = data.amount;
      if (data.frequency) updateData.frequency = data.frequency;
      if (data.description !== undefined)
        updateData.description = data.description?.trim() || null;
      if (data.is_active !== undefined) updateData.is_active = data.is_active;

      const { data: category, error } = await (this.supabase
        .from('billing_categories') as any)
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;

      return category as BillingCategory;
    } catch (error) {
      console.error('[billing/categories] Error updating category:', error);
      throw error;
    }
  }

  /**
   * Deletes a billing category. Refuses if any billing_student_bills row
   * still references it (delete guard — was a TODO in the legacy services).
   */
  static async deleteBillingCategory(id: string): Promise<void> {
    try {
      const { count, error: countError } = await this.supabase
        .from('billing_student_bills')
        .select('id', { count: 'exact', head: true })
        .eq('item_category_id', id);

      if (countError) throw countError;

      if ((count ?? 0) > 0) {
        throw new Error(
          'Cannot delete this category — it is referenced by existing student bills.'
        );
      }

      const { error } = await this.supabase
        .from('billing_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('[billing/categories] Error deleting category:', error);
      throw error;
    }
  }

  static async bulkDeleteBillingCategories(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const id of ids) {
      try {
        await this.deleteBillingCategory(id);
        success.push(id);
      } catch (error) {
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { success, failed };
  }

  static async getBillingCategories(
    filters: BillingCategoryFilters = {}
  ): Promise<BillingCategoryListResponse> {
    try {
      const { search, frequency, isActive, page = 1, limit = 10 } = filters;

      let query = (this.supabase as any)
        .from('billing_categories')
        .select('*', { count: 'exact' });

      if (search) {
        query = query.ilike('category_name', `%${search}%`);
      }

      if (frequency) {
        query = query.eq('frequency', frequency);
      }

      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }

      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to).order('category_name', { ascending: true });

      const { data, count, error } = await query;

      if (error) throw error;

      return {
        data: (data as BillingCategory[]) || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('[billing/categories] Error listing categories:', error);
      throw error;
    }
  }

  static async getBillingCategory(id: string): Promise<BillingCategory> {
    try {
      const { data, error } = await this.supabase
        .from('billing_categories')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Billing category not found');
        }
        throw error;
      }

      return data as BillingCategory;
    } catch (error) {
      console.error('[billing/categories] Error fetching category:', error);
      throw error;
    }
  }

  /**
   * Returns all active categories (for dropdowns / pickers).
   */
  static async getActiveBillingCategories(): Promise<BillingCategory[]> {
    try {
      const { data, error } = await this.supabase
        .from('billing_categories')
        .select('*')
        .eq('is_active', true)
        .order('category_name', { ascending: true });

      if (error) throw error;

      return (data as BillingCategory[]) || [];
    } catch (error) {
      console.error(
        '[billing/categories] Error fetching active categories:',
        error
      );
      throw error;
    }
  }
}
