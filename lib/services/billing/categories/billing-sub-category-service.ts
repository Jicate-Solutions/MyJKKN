import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  BillingSubCategory,
  CreateBillingSubCategoryDto,
  UpdateBillingSubCategoryDto,
  BillingSubCategoryFilters,
  BillingSubCategoryListResponse
} from '@/types/billing';

export class BillingSubCategoryService {
  private static supabase = createClientSupabaseClient();

  static async checkSubCategoryNameExists(
    parentCategoryId: string,
    subCategoryName: string,
    excludeId?: string
  ): Promise<boolean> {
    try {
      let query = this.supabase
        .from('billing_sub_categories')
        .select('id')
        .eq('parent_category_id', parentCategoryId)
        .ilike('sub_category_name', subCategoryName);

      // If excludeId is provided (for editing), exclude that sub category
      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      return !!data;
    } catch (error) {
      console.error('Error checking sub category name:', error);
      return false;
    }
  }

  static async createBillingSubCategory(
    data: CreateBillingSubCategoryDto
  ): Promise<BillingSubCategory> {
    try {
      // Check if sub category name already exists for this parent category
      const nameExists = await this.checkSubCategoryNameExists(
        data.parent_category_id,
        data.sub_category_name
      );

      if (nameExists) {
        throw new Error(
          `Sub category "${data.sub_category_name}" already exists for this parent category`
        );
      }

      const { data: subCategory, error } = await (this.supabase
        .from('billing_sub_categories') as any)
        .insert([
          {
            institution_id: data.institution_id,
            parent_category_id: data.parent_category_id,
            sub_category_name: data.sub_category_name.trim(),
            is_active: data.is_active ?? true
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
          )
        `
        )
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(
            `Sub category "${data.sub_category_name}" already exists for this parent category`
          );
        }
        throw error;
      }

      return subCategory;
    } catch (error) {
      console.error('Error creating billing sub category:', error);
      throw error;
    }
  }

  static async updateBillingSubCategory(
    id: string,
    data: UpdateBillingSubCategoryDto
  ): Promise<BillingSubCategory> {
    try {
      // Check if sub category name already exists for this parent category (excluding current record)
      if (data.parent_category_id && data.sub_category_name) {
        const nameExists = await this.checkSubCategoryNameExists(
          data.parent_category_id,
          data.sub_category_name,
          id
        );

        if (nameExists) {
          throw new Error(
            `Sub category "${data.sub_category_name}" already exists for this parent category`
          );
        }
      }

      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (data.institution_id) updateData.institution_id = data.institution_id;
      if (data.parent_category_id)
        updateData.parent_category_id = data.parent_category_id;
      if (data.sub_category_name)
        updateData.sub_category_name = data.sub_category_name.trim();
      if (data.is_active !== undefined) updateData.is_active = data.is_active;

      const { data: subCategory, error } = await (this.supabase
        .from('billing_sub_categories') as any)
        .update(updateData)
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
          )
        `
        )
        .single();

      if (error) throw error;

      return subCategory;
    } catch (error) {
      console.error('Error updating billing sub category:', error);
      throw error;
    }
  }

  static async deleteBillingSubCategory(id: string): Promise<void> {
    try {
      // Check if sub category has associated item categories before deletion
      const { count, error: countError } = await this.supabase
        .from('billing_item_categories')
        .select('*', { count: 'exact', head: true })
        .eq('sub_category_id', id);

      if (countError) throw countError;

      if (count && count > 0) {
        throw new Error(
          `Cannot delete: this sub category has ${count} associated item categories. Remove them first.`
        );
      }

      const { error } = await this.supabase
        .from('billing_sub_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting billing sub category:', error);
      throw error;
    }
  }

  static async bulkDeleteBillingSubCategories(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const id of ids) {
      try {
        await this.deleteBillingSubCategory(id);
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

  static async getBillingSubCategories(
    filters: BillingSubCategoryFilters = {}
  ): Promise<BillingSubCategoryListResponse> {
    try {
      const {
        search,
        institution_id,
        parent_category_id,
        isActive,
        page = 1,
        limit = 10
      } = filters;

      let query = (this.supabase as any).from('billing_sub_categories').select(
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
          )
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (search) {
        query = query.ilike('sub_category_name', `%${search}%`);
      }

      if (institution_id) {
        query = query.eq('institution_id', institution_id);
      }

      if (parent_category_id) {
        query = query.eq('parent_category_id', parent_category_id);
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
      console.error('Error fetching billing sub categories:', error);
      throw error;
    }
  }

  static async getBillingSubCategory(id: string): Promise<BillingSubCategory> {
    try {
      const { data, error } = await this.supabase
        .from('billing_sub_categories')
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
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Billing sub category not found');
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching billing sub category:', error);
      throw error;
    }
  }

  static async getBillingSubCategoriesByParentCategory(
    parentCategoryId: string,
    isActive = true
  ): Promise<BillingSubCategory[]> {
    try {
      let query = this.supabase
        .from('billing_sub_categories')
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
          )
        `
        )
        .eq('parent_category_id', parentCategoryId)
        .order('sub_category_name', { ascending: true });

      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error(
        'Error fetching billing sub categories by parent category:',
        error
      );
      throw error;
    }
  }

  static async getBillingSubCategoriesByInstitution(
    institutionId: string,
    isActive = true
  ): Promise<BillingSubCategory[]> {
    try {
      let query = this.supabase
        .from('billing_sub_categories')
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
          )
        `
        )
        .eq('institution_id', institutionId)
        .order('sub_category_name', { ascending: true });

      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error(
        'Error fetching billing sub categories by institution:',
        error
      );
      throw error;
    }
  }
}
