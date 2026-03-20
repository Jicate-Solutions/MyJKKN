import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  BillingItemCategory,
  CreateBillingItemCategoryDto,
  UpdateBillingItemCategoryDto,
  BillingItemCategoryFilters,
  BillingItemCategoryListResponse
} from '@/types/billing';

export class BillingItemCategoryService {
  private static supabase = createClientSupabaseClient();

  static async checkItemCategoryNameExists(
    subCategoryId: string,
    itemCategoryName: string,
    excludeId?: string
  ): Promise<boolean> {
    try {
      let query = this.supabase
        .from('billing_item_categories')
        .select('id')
        .eq('sub_category_id', subCategoryId)
        .ilike('item_category_name', itemCategoryName);

      // If excludeId is provided (for editing), exclude that item category
      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      return !!data;
    } catch (error) {
      console.error('Error checking item category name:', error);
      return false;
    }
  }

  static async createBillingItemCategory(
    itemCategoryData: CreateBillingItemCategoryDto
  ): Promise<BillingItemCategory> {
    try {
      // Check if item category name already exists in this sub category
      const nameExists = await this.checkItemCategoryNameExists(
        itemCategoryData.sub_category_id,
        itemCategoryData.item_category_name
      );

      if (nameExists) {
        throw new Error(
          'An item category with this name already exists in the selected sub category'
        );
      }

      const { data, error } = await (this.supabase
        .from('billing_item_categories') as any)
        .insert([
          {
            ...itemCategoryData,
            created_by: (await this.supabase.auth.getUser()).data.user?.id
          }
        ])
        .select(
          `
          *,
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          parent_category:billing_parent_categories(
            id,
            parent_category_name
          ),
          sub_category:billing_sub_categories(
            id,
            sub_category_name
          )
        `
        )
        .single();

      if (error) throw error;
      return data as unknown as BillingItemCategory;
    } catch (error) {
      console.error('Error creating billing item category:', error);
      throw error;
    }
  }

  static async updateBillingItemCategory(
    id: string,
    itemCategoryData: UpdateBillingItemCategoryDto
  ): Promise<BillingItemCategory> {
    try {
      // If updating name, check if it already exists in this sub category
      if (
        itemCategoryData.item_category_name &&
        itemCategoryData.sub_category_id
      ) {
        const nameExists = await this.checkItemCategoryNameExists(
          itemCategoryData.sub_category_id,
          itemCategoryData.item_category_name,
          id
        );

        if (nameExists) {
          throw new Error(
            'An item category with this name already exists in the selected sub category'
          );
        }
      }

      const { data, error } = await (this.supabase
        .from('billing_item_categories') as any)
        .update({
          ...itemCategoryData,
          updated_by: (await this.supabase.auth.getUser()).data.user?.id
        })
        .eq('id', id)
        .select(
          `
          *,
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          parent_category:billing_parent_categories(
            id,
            parent_category_name
          ),
          sub_category:billing_sub_categories(
            id,
            sub_category_name
          )
        `
        )
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Billing item category not found');
        }
        throw error;
      }

      return data as unknown as BillingItemCategory;
    } catch (error) {
      console.error('Error updating billing item category:', error);
      throw error;
    }
  }

  static async deleteBillingItemCategory(id: string): Promise<void> {
    try {
      // TODO: Check if item category has associated billing schedules before deletion
      // This will be implemented when we create the billing schedule module

      const { error } = await this.supabase
        .from('billing_item_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting billing item category:', error);
      throw error;
    }
  }

  static async bulkDeleteBillingItemCategories(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const id of ids) {
      try {
        await this.deleteBillingItemCategory(id);
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

  static async getBillingItemCategories(
    filters: BillingItemCategoryFilters = {}
  ): Promise<BillingItemCategoryListResponse> {
    try {
      const {
        search,
        institution_id,
        parent_category_id,
        sub_category_id,
        frequency,
        isActive,
        page = 1,
        limit = 10
      } = filters;

      let query = (this.supabase as any).from('billing_item_categories').select(
        `
          *,
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          parent_category:billing_parent_categories(
            id,
            parent_category_name
          ),
          sub_category:billing_sub_categories(
            id,
            sub_category_name
          )
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (search) {
        query = query.ilike('item_category_name', `%${search}%`);
      }

      if (institution_id) {
        query = query.eq('institution_id', institution_id);
      }

      if (parent_category_id) {
        query = query.eq('parent_category_id', parent_category_id);
      }

      if (sub_category_id) {
        query = query.eq('sub_category_id', sub_category_id);
      }

      if (frequency) {
        query = query.eq('frequency', frequency);
      }

      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }

      // Apply pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      // Order by created_at descending
      query = query.order('created_at', { ascending: false });

      const { data, count, error } = await query;

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
      console.error('Error fetching billing item categories:', error);
      throw error;
    }
  }

  static async getBillingItemCategory(
    id: string
  ): Promise<BillingItemCategory> {
    try {
      const { data, error } = await this.supabase
        .from('billing_item_categories')
        .select(
          `
          *,
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          parent_category:billing_parent_categories(
            id,
            parent_category_name
          ),
          sub_category:billing_sub_categories(
            id,
            sub_category_name
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Billing item category not found');
        }
        throw error;
      }

      return data as unknown as BillingItemCategory;
    } catch (error) {
      console.error('Error fetching billing item category:', error);
      throw error;
    }
  }

  static async getBillingItemCategoriesBySubCategory(
    subCategoryId: string,
    isActive = true
  ): Promise<BillingItemCategory[]> {
    try {
      let query = this.supabase
        .from('billing_item_categories')
        .select(
          `
          *,
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          parent_category:billing_parent_categories(
            id,
            parent_category_name
          ),
          sub_category:billing_sub_categories(
            id,
            sub_category_name
          )
        `
        )
        .eq('sub_category_id', subCategoryId)
        .order('item_category_name', { ascending: true });

      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []) as unknown as BillingItemCategory[];
    } catch (error) {
      console.error(
        'Error fetching billing item categories by sub category:',
        error
      );
      throw error;
    }
  }

  static async getBillingItemCategoriesByInstitution(
    institutionId: string,
    isActive = true
  ): Promise<BillingItemCategory[]> {
    try {
      let query = this.supabase
        .from('billing_item_categories')
        .select(
          `
          *,
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          parent_category:billing_parent_categories(
            id,
            parent_category_name
          ),
          sub_category:billing_sub_categories(
            id,
            sub_category_name
          )
        `
        )
        .eq('institution_id', institutionId)
        .order('item_category_name', { ascending: true });

      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []) as unknown as BillingItemCategory[];
    } catch (error) {
      console.error(
        'Error fetching billing item categories by institution:',
        error
      );
      throw error;
    }
  }
}
