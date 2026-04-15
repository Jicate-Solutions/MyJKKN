import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  BillingCategory,
  CreateBillingCategoryDto,
  UpdateBillingCategoryDto,
  BillingCategoryFilters,
  BillingCategoryListResponse
} from '@/types/billing';

const RELATION_SELECT = `
  *,
  institution:institutions(
    id,
    name,
    counselling_code
  )
`;

export class BillingCategoryService {
  private static supabase = createClientSupabaseClient();

  static async checkCategoryNameExists(
    institutionId: string,
    categoryName: string,
    excludeId?: string
  ): Promise<boolean> {
    try {
      let query = this.supabase
        .from('billing_categories')
        .select('id')
        .eq('institution_id', institutionId)
        .ilike('category_name', categoryName);

      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return !!data;
    } catch (error) {
      console.error('[billing/categories] Error checking name:', error);
      return false;
    }
  }

  static async createBillingCategory(
    dto: CreateBillingCategoryDto
  ): Promise<BillingCategory> {
    try {
      const exists = await this.checkCategoryNameExists(
        dto.institution_id,
        dto.category_name
      );
      if (exists) {
        throw new Error(
          'A billing category with this name already exists for the selected institution'
        );
      }

      const { data, error } = await (this.supabase
        .from('billing_categories') as any)
        .insert([
          {
            ...dto,
            created_by: (await this.supabase.auth.getUser()).data.user?.id
          }
        ])
        .select(RELATION_SELECT)
        .single();

      if (error) throw error;
      return data as unknown as BillingCategory;
    } catch (error) {
      console.error('[billing/categories] Error creating:', error);
      throw error;
    }
  }

  static async updateBillingCategory(
    id: string,
    dto: UpdateBillingCategoryDto
  ): Promise<BillingCategory> {
    try {
      if (dto.category_name && dto.institution_id) {
        const exists = await this.checkCategoryNameExists(
          dto.institution_id,
          dto.category_name,
          id
        );
        if (exists) {
          throw new Error(
            'A billing category with this name already exists for the selected institution'
          );
        }
      }

      const { data, error } = await (this.supabase
        .from('billing_categories') as any)
        .update({
          ...dto,
          updated_by: (await this.supabase.auth.getUser()).data.user?.id
        })
        .eq('id', id)
        .select(RELATION_SELECT)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Billing category not found');
        }
        throw error;
      }
      return data as unknown as BillingCategory;
    } catch (error) {
      console.error('[billing/categories] Error updating:', error);
      throw error;
    }
  }

  static async deleteBillingCategory(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('billing_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('[billing/categories] Error deleting:', error);
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
      const {
        search,
        institution_id,
        frequency,
        isActive,
        page = 1,
        limit = 10
      } = filters;

      let query = (this.supabase as any)
        .from('billing_categories')
        .select(RELATION_SELECT, { count: 'exact' });

      if (search) {
        query = query.ilike('category_name', `%${search}%`);
      }
      if (institution_id) {
        query = query.eq('institution_id', institution_id);
      }
      if (frequency) {
        query = query.eq('frequency', frequency);
      }
      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }

      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to).order('created_at', { ascending: false });

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
      console.error('[billing/categories] Error fetching list:', error);
      throw error;
    }
  }

  static async getBillingCategory(id: string): Promise<BillingCategory> {
    try {
      const { data, error } = await this.supabase
        .from('billing_categories')
        .select(RELATION_SELECT)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Billing category not found');
        }
        throw error;
      }
      return data as unknown as BillingCategory;
    } catch (error) {
      console.error('[billing/categories] Error fetching one:', error);
      throw error;
    }
  }

  static async getBillingCategoriesByInstitution(
    institutionId: string,
    isActive = true
  ): Promise<BillingCategory[]> {
    try {
      let query = this.supabase
        .from('billing_categories')
        .select(RELATION_SELECT)
        .eq('institution_id', institutionId)
        .order('category_name', { ascending: true });

      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as BillingCategory[];
    } catch (error) {
      console.error(
        '[billing/categories] Error fetching by institution:',
        error
      );
      throw error;
    }
  }
}
