import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  EmploymentCategory,
  CreateEmploymentCategoryDto,
  UpdateEmploymentCategoryDto,
  CategoryFilters,
  CategoryListResponse
} from '@/types/staff';

export class CategoryService {
  private static supabase = createClientSupabaseClient();

  static async createCategory(
    data: CreateEmploymentCategoryDto
  ): Promise<EmploymentCategory> {
    try {
      // First get the current user
      const {
        data: { session },
        error: sessionError
      } = await this.supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.user) throw new Error('No authenticated user');

      // Add created_by and updated_by to the data
      const { data: category, error } = await this.supabase
        .from('employment_categories')
        .insert([
          {
            ...data,
            created_by: session.user.id,
            updated_by: session.user.id
          }
        ])
        .select()
        .single();

      if (error) throw error;

      return category;
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  }

  static async updateCategory(
    id: string,
    data: UpdateEmploymentCategoryDto
  ): Promise<EmploymentCategory> {
    try {
      // First get the current user
      const {
        data: { session },
        error: sessionError
      } = await this.supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.user) throw new Error('No authenticated user');

      const { data: category, error } = await this.supabase
        .from('employment_categories')
        .update({
          ...data,
          updated_by: session.user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return category;
    } catch (error) {
      console.error('Error updating category:', error);
      throw error;
    }
  }

  static async deleteCategory(id: string): Promise<void> {
    try {
      // Get the current user session
      const {
        data: { session },
        error: sessionError
      } = await this.supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.user) throw new Error('No authenticated user');

      // First check if category exists
      const { data: existing, error: checkError } = await this.supabase
        .from('employment_categories')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (checkError) throw checkError;
      if (!existing) throw new Error('Category not found');

      // Delete category
      const { error: deleteError } = await this.supabase
        .from('employment_categories')
        .delete()
        .eq('id', id)
        .throwOnError(); // This will throw an error if the deletion fails

      
      if (deleteError) throw deleteError;
    } catch (error) {
      console.error('Delete error:', error);
      throw error instanceof Error
        ? error
        : new Error('Failed to delete category');
    }
  }

  static async getCategories(
    filters: CategoryFilters = {}
  ): Promise<CategoryListResponse> {
    try {
      let query = this.supabase
        .from('employment_categories')
        .select('*', { count: 'exact' });

      if (filters.search) {
        query = query.or(
          `category_name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
        );
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data: categories, error, count } = await query;

      if (error) throw error;

      return {
        data: categories || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }
  }

  static async getCategory(id: string): Promise<EmploymentCategory> {
    try {
      const { data: category, error } = await this.supabase
        .from('employment_categories')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      return category;
    } catch (error) {
      console.error('Error fetching category:', error);
      throw error;
    }
  }
}
