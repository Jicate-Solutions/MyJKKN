// lib/services/category-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  Category,
  Subcategory,
  CreateCategoryDTO,
  UpdateCategoryDTO,
  CreateSubcategoryDTO,
  UpdateSubcategoryDTO
} from '@/types/categories';

export class CategoryService {
  private static supabase = createClientSupabaseClient();

  // Get all categories with subcategories
  static async getCategories(): Promise<Category[]> {
    try {
      const { data: categories, error: categoriesError } = await this.supabase
        .from('categories')
        .select('*')
        .order('name');

      if (categoriesError) throw categoriesError;

      const { data: subcategories, error: subcategoriesError } =
        await (this.supabase as any).from('subcategories').select('*').order('name');

      if (subcategoriesError) throw subcategoriesError;

      // Combine categories with their subcategories
      return (categories || []).map((category: any) => ({
        ...category,
        subcategories: (subcategories || []).filter(
          (sub: any) => sub.category_id === category.id
        )
      })) as Category[];
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Failed to load categories');
      throw error;
    }
  }

  // Get single category with subcategories
  static async getCategoryById(id: string): Promise<Category | null> {
    try {

      const { data: category, error: categoryError } = await this.supabase
        .from('categories')
        .select('*')
        .eq('id', id)
        .single();

      if (categoryError) {
        if (categoryError.code === 'PGRST116') {
          return null;
        }
        console.error(
          `CategoryService: Error fetching category:`,
          categoryError
        );
        throw categoryError;
      }

      if (!category) {
        return null;
      }

      const categoryTyped = category as any;

      const { data: subcategories, error: subcategoriesError } =
        await this.supabase
          .from('subcategories')
          .select('*')
          .eq('category_id', id)
          .order('name');

      if (subcategoriesError) {
        console.error(
          `CategoryService: Error fetching subcategories:`,
          subcategoriesError
        );
        throw subcategoriesError;
      }

      return {
        ...categoryTyped,
        subcategories: subcategories || []
      } as Category;
    } catch (error) {
      console.error('Error fetching category:', error);
      toast.error('Failed to load category');
      return null;
    }
  }

  // Create new category
  static async createCategory(data: CreateCategoryDTO): Promise<Category> {
    try {
      const {
        data: { user },
        error: userError
      } = await this.supabase.auth.getUser();
      if (userError || !user) throw new Error('Authentication required');

      // Check user role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const profileTyped = profile as { role: string } | null;
      if (profileError || !profileTyped) throw new Error('Profile not found');
      if (!['super_admin', 'administrator'].includes(profileTyped.role)) {
        throw new Error('You do not have permission to create categories');
      }

      const { data: category, error } = await this.supabase
        .from('categories')
        .insert([
          {
            ...data,
            created_by: user.id
          }
        ] as any)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('A category with this name already exists');
        }
        throw error;
      }

      const categoryTyped = category as any;
      toast.success('Category created successfully');
      return {
        ...categoryTyped,
        subcategories: []
      } as Category;
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create category'
      );
      throw error;
    }
  }

  // Update category
  static async updateCategory(
    id: string,
    data: UpdateCategoryDTO
  ): Promise<Category> {
    try {
      const {
        data: { user },
        error: userError
      } = await this.supabase.auth.getUser();
      if (userError || !user) throw new Error('Authentication required');

      // Check user role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const profileTyped = profile as { role: string } | null;
      if (profileError || !profileTyped) throw new Error('Profile not found');
      if (!['super_admin', 'administrator'].includes(profileTyped.role)) {
        throw new Error('You do not have permission to update categories');
      }

      const updateQuery: any = this.supabase.from('categories');
      const { data: category, error } = await updateQuery
        .update({
          ...data,
          updated_by: user.id,
          updated_at: new Date().toISOString()
        } as any)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('A category with this name already exists');
        }
        throw error;
      }

      const categoryTyped = category as any;
      toast.success('Category updated successfully');
      return {
        ...categoryTyped,
        subcategories: [] // Subcategories will be fetched separately when needed
      } as Category;
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update category'
      );
      throw error;
    }
  }

  // Delete category
  static async deleteCategory(id: string): Promise<void> {
    try {
      const {
        data: { user },
        error: userError
      } = await this.supabase.auth.getUser();
      if (userError || !user) throw new Error('Authentication required');

      // Check user role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const profileTyped = profile as { role: string } | null;
      if (profileError || !profileTyped) throw new Error('Profile not found');
      if (!['super_admin', 'administrator'].includes(profileTyped.role)) {
        throw new Error('You do not have permission to delete categories');
      }

      const { error } = await this.supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Category deleted successfully');
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete category'
      );
      throw error;
    }
  }

  // Create subcategory
  static async createSubcategory(
    data: CreateSubcategoryDTO
  ): Promise<Subcategory> {
    try {
      const {
        data: { user },
        error: userError
      } = await this.supabase.auth.getUser();
      if (userError || !user) throw new Error('Authentication required');

      // Check user role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const profileTyped = profile as { role: string } | null;
      if (profileError || !profileTyped) throw new Error('Profile not found');
      if (!['super_admin', 'administrator'].includes(profileTyped.role)) {
        throw new Error('You do not have permission to create subcategories');
      }

      const { data: subcategory, error } = await this.supabase
        .from('subcategories')
        .insert([
          {
            ...data,
            created_by: user.id,
            is_active: data.is_active ?? true
          }
        ] as any)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('A subcategory with this name already exists');
        }
        throw error;
      }

      toast.success('Subcategory created successfully');
      return subcategory as Subcategory;
    } catch (error) {
      console.error('Error creating subcategory:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create subcategory'
      );
      throw error;
    }
  }

  // Update subcategory
  static async updateSubcategory(
    id: string,
    data: UpdateSubcategoryDTO
  ): Promise<Subcategory> {
    try {
      const {
        data: { user },
        error: userError
      } = await this.supabase.auth.getUser();
      if (userError || !user) throw new Error('Authentication required');

      // Check user role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const profileTyped = profile as { role: string } | null;
      if (profileError || !profileTyped) throw new Error('Profile not found');
      if (!['super_admin', 'administrator'].includes(profileTyped.role)) {
        throw new Error('You do not have permission to update subcategories');
      }

      const updateQuery: any = this.supabase.from('subcategories');
      const { data: subcategory, error} = await updateQuery
        .update({
          ...data,
          updated_by: user.id,
          updated_at: new Date().toISOString()
        } as any)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('A subcategory with this name already exists');
        }
        throw error;
      }

      toast.success('Subcategory updated successfully');
      return subcategory as Subcategory;
    } catch (error) {
      console.error('Error updating subcategory:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update subcategory'
      );
      throw error;
    }
  }

  // Delete subcategory
  static async deleteSubcategory(id: string): Promise<void> {
    try {
      const {
        data: { user },
        error: userError
      } = await this.supabase.auth.getUser();
      if (userError || !user) throw new Error('Authentication required');

      // Check user role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const profileTyped = profile as { role: string } | null;
      if (profileError || !profileTyped) throw new Error('Profile not found');
      if (!['super_admin', 'administrator'].includes(profileTyped.role)) {
        throw new Error('You do not have permission to delete subcategories');
      }

      const { error } = await this.supabase
        .from('subcategories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Subcategory deleted successfully');
    } catch (error) {
      console.error('Error deleting subcategory:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete subcategory'
      );
      throw error;
    }
  }
}
