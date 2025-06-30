import { createClientSupabaseClient } from '@/lib/supabase/client';
import { UserInstitutionAccessService } from '@/lib/services/users/user-institution-access-service';
import type {
  BillingParentCategory,
  CreateBillingParentCategoryDto,
  UpdateBillingParentCategoryDto,
  BillingParentCategoryFilters,
  BillingParentCategoryListResponse
} from '@/types/billing';

export class BillingParentCategoryService {
  private static supabase = createClientSupabaseClient();

  static async checkCategoryNameExists(
    institutionId: string,
    categoryName: string,
    excludeId?: string
  ): Promise<boolean> {
    try {
      let query = this.supabase
        .from('billing_parent_categories')
        .select('id')
        .eq('institution_id', institutionId)
        .ilike('parent_category_name', categoryName);

      // If excludeId is provided (for editing), exclude that category
      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      return !!data;
    } catch (error) {
      console.error('Error checking category name:', error);
      return false;
    }
  }

  static async createBillingParentCategory(
    data: CreateBillingParentCategoryDto
  ): Promise<BillingParentCategory> {
    try {
      // Check if category name already exists for this institution
      const nameExists = await this.checkCategoryNameExists(
        data.institution_id,
        data.parent_category_name
      );

      if (nameExists) {
        throw new Error(
          `Parent category "${data.parent_category_name}" already exists for this institution`
        );
      }

      const { data: category, error } = await this.supabase
        .from('billing_parent_categories')
        .insert([
          {
            institution_id: data.institution_id,
            parent_category_name: data.parent_category_name.trim(),
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
          )
        `
        )
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(
            `Parent category "${data.parent_category_name}" already exists for this institution`
          );
        }
        throw error;
      }

      return category;
    } catch (error) {
      console.error('Error creating billing parent category:', error);
      throw error;
    }
  }

  static async updateBillingParentCategory(
    id: string,
    data: UpdateBillingParentCategoryDto
  ): Promise<BillingParentCategory> {
    try {
      // Check if category name already exists for this institution (excluding current record)
      if (data.institution_id && data.parent_category_name) {
        const nameExists = await this.checkCategoryNameExists(
          data.institution_id,
          data.parent_category_name,
          id
        );

        if (nameExists) {
          throw new Error(
            `Parent category "${data.parent_category_name}" already exists for this institution`
          );
        }
      }

      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (data.institution_id) updateData.institution_id = data.institution_id;
      if (data.parent_category_name)
        updateData.parent_category_name = data.parent_category_name.trim();
      if (data.is_active !== undefined) updateData.is_active = data.is_active;

      const { data: category, error } = await this.supabase
        .from('billing_parent_categories')
        .update(updateData)
        .eq('id', id)
        .select(
          `
          *,
          institution:institutions(
            id,
            name,
            counselling_code
          )
        `
        )
        .single();

      if (error) throw error;

      return category;
    } catch (error) {
      console.error('Error updating billing parent category:', error);
      throw error;
    }
  }

  static async deleteBillingParentCategory(id: string): Promise<void> {
    try {
      // TODO: Check if category has associated sub-categories before deletion
      // This will be implemented when we create the sub-category module

      const { error } = await this.supabase
        .from('billing_parent_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting billing parent category:', error);
      throw error;
    }
  }

  static async bulkDeleteBillingParentCategories(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const id of ids) {
      try {
        await this.deleteBillingParentCategory(id);
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

  static async getBillingParentCategories(
    filters: BillingParentCategoryFilters = {}
  ): Promise<BillingParentCategoryListResponse> {
    try {
      const {
        search,
        institution_id,
        isActive,
        page = 1,
        limit = 10
      } = filters;

      let query = this.supabase.from('billing_parent_categories').select(
        `
          *,
          institution:institutions(
            id,
            name,
            counselling_code
          )
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (search) {
        query = query.ilike('parent_category_name', `%${search}%`);
      }

      if (institution_id) {
        query = query.eq('institution_id', institution_id);
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
      console.error('Error fetching billing parent categories:', error);
      throw error;
    }
  }

  /**
   * Get billing parent categories with user institution access control
   */
  static async getBillingParentCategoriesForUser(
    userId: string,
    filters: BillingParentCategoryFilters = {}
  ): Promise<BillingParentCategoryListResponse> {
    try {
      // Get user's accessible institutions
      const accessibleInstitutions =
        await UserInstitutionAccessService.getUserAccessibleInstitutions(
          userId
        );
      const accessibleInstitutionIds = accessibleInstitutions.map(
        (inst) => inst.institution_id
      );

      // If user has no accessible institutions, return empty result
      if (accessibleInstitutionIds.length === 0) {
        return {
          data: [],
          metadata: {
            total: 0,
            page: filters.page || 1,
            limit: filters.limit || 10,
            totalPages: 0
          }
        };
      }

      const {
        search,
        institution_id,
        isActive,
        page = 1,
        limit = 10
      } = filters;

      let query = this.supabase.from('billing_parent_categories').select(
        `
          *,
          institution:institutions(
            id,
            name,
            counselling_code
          )
        `,
        { count: 'exact' }
      );

      // Apply institution access filter
      query = query.in('institution_id', accessibleInstitutionIds);

      // Apply other filters
      if (search) {
        query = query.ilike('parent_category_name', `%${search}%`);
      }

      if (institution_id && accessibleInstitutionIds.includes(institution_id)) {
        query = query.eq('institution_id', institution_id);
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
      console.error(
        'Error fetching billing parent categories for user:',
        error
      );
      throw error;
    }
  }

  static async getBillingParentCategory(
    id: string
  ): Promise<BillingParentCategory> {
    try {
      const { data, error } = await this.supabase
        .from('billing_parent_categories')
        .select(
          `
          *,
          institution:institutions(
            id,
            name,
            counselling_code
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Billing parent category not found');
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching billing parent category:', error);
      throw error;
    }
  }

  static async getBillingParentCategoriesByInstitution(
    institutionId: string,
    isActive = true
  ): Promise<BillingParentCategory[]> {
    try {
      let query = this.supabase
        .from('billing_parent_categories')
        .select(
          `
          *,
          institution:institutions(
            id,
            name,
            counselling_code
          )
        `
        )
        .eq('institution_id', institutionId)
        .order('parent_category_name', { ascending: true });

      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error(
        'Error fetching billing parent categories by institution:',
        error
      );
      throw error;
    }
  }
}
