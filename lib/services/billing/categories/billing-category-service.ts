import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logActivityForCurrentUser, BillingActivityTemplates } from '@/lib/utils/activity-logger-client';
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
            kind: data.kind,
            description: data.description?.trim() || null,
            is_active: data.is_active ?? true,
            visible_to_learners: data.visible_to_learners ?? true,
            once_per_learner: data.once_per_learner ?? false,
            collection_type: data.collection_type
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

      const template = BillingActivityTemplates.categoryCreated(data.category_name);
      logActivityForCurrentUser({
        ...template,
        resourceId: (category as BillingCategory).id,
        resourceName: data.category_name,
        metadata: { sub_type: template.sub_type, amount: data.amount, frequency: data.frequency },
      });

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
      if (data.kind) updateData.kind = data.kind;
      if (data.description !== undefined)
        updateData.description = data.description?.trim() || null;
      if (data.is_active !== undefined) updateData.is_active = data.is_active;
      if (data.visible_to_learners !== undefined)
        updateData.visible_to_learners = data.visible_to_learners;
      if (data.once_per_learner !== undefined)
        updateData.once_per_learner = data.once_per_learner;
      if (data.collection_type) updateData.collection_type = data.collection_type;

      const { data: category, error } = await (this.supabase
        .from('billing_categories') as any)
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;

      const changedFields = Object.keys(data).filter(k => k !== 'updated_at' && k !== 'id');
      const template = BillingActivityTemplates.categoryUpdated(
        (category as BillingCategory).category_name,
        changedFields
      );
      logActivityForCurrentUser({
        ...template,
        resourceId: id,
        resourceName: (category as BillingCategory).category_name,
        metadata: { sub_type: template.sub_type, changed_fields: changedFields },
      });

      return category as BillingCategory;
    } catch (error) {
      console.error('[billing/categories] Error updating category:', error);
      throw error;
    }
  }

  /**
   * How many learners already hold more than one live bill for this category.
   *
   * Drives the warning shown before turning "Once per learner" on: 9 categories
   * are currently in violation, and enabling the flag does NOT retroactively
   * clean them up — it only blocks new bills. Showing the number up front is
   * what stops that being a silent surprise later.
   *
   * Backed by a SECURITY DEFINER RPC because the flag is global to the
   * category: an RLS-scoped count would under-report for an institution-scoped
   * user and give false confidence that the category is clean.
   */
  static async getDuplicateConflicts(categoryId: string): Promise<{
    learnersWithDuplicates: number;
    extraBills: number;
    extraValue: number;
  }> {
    const { data, error } = await (this.supabase as any).rpc(
      'billing_category_duplicate_conflicts',
      { p_category_id: categoryId }
    );

    if (error) {
      console.error('[billing/categories] Error checking duplicate conflicts:', error);
      throw error;
    }

    // RETURNS TABLE gives an array; a category with no bills yields one
    // all-zero row rather than an empty set, but guard for both.
    const row = Array.isArray(data) ? data[0] : data;
    return {
      learnersWithDuplicates: Number(row?.learners_with_duplicates ?? 0),
      extraBills: Number(row?.extra_bills ?? 0),
      extraValue: Number(row?.extra_value ?? 0)
    };
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

      const { data: cat } = await this.supabase
        .from('billing_categories')
        .select('category_name')
        .eq('id', id)
        .single();

      const { error } = await this.supabase
        .from('billing_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      const template = BillingActivityTemplates.categoryDeleted(cat?.category_name || id);
      logActivityForCurrentUser({
        ...template,
        resourceId: id,
        resourceName: cat?.category_name || id,
        metadata: { sub_type: template.sub_type },
      });
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

    if (success.length > 0) {
      const template = BillingActivityTemplates.categoriesBulkDeleted(success.length);
      logActivityForCurrentUser({
        ...template,
        metadata: { sub_type: template.sub_type, deleted_ids: success, failed_count: failed.length },
      });
    }

    return { success, failed };
  }

  static async getBillingCategories(
    filters: BillingCategoryFilters = {}
  ): Promise<BillingCategoryListResponse> {
    try {
      const {
        search,
        frequency,
        isActive,
        collectionType,
        visibleToLearners,
        page = 1,
        limit = 10,
        sortBy,
        sortOrder
      } = filters;

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

      if (collectionType) {
        query = query.eq('collection_type', collectionType);
      }

      if (visibleToLearners !== undefined) {
        query = query.eq('visible_to_learners', visibleToLearners);
      }

      // Whitelist sortable columns (guards against arbitrary order-by injection from
      // the DataTable). Default to category_name asc — the prior fixed behaviour.
      const SORTABLE = new Set([
        'category_name', 'kind', 'frequency', 'amount', 'is_active', 'created_at',
        'collection_type', 'visible_to_learners', 'once_per_learner'
      ]);
      const orderColumn = sortBy && SORTABLE.has(sortBy) ? sortBy : 'category_name';
      const ascending = orderColumn === 'category_name' ? sortOrder !== 'desc' : sortOrder === 'asc';

      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to).order(orderColumn, { ascending });

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
