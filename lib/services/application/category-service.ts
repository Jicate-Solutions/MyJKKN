// lib/services/category-service.ts

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
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
  private static supabase = createClientComponentClient();

  // Get all categories with subcategories
  static async getCategories(): Promise<Category[]> {
    try {
      const { data: categories, error: categoriesError } = await this.supabase
        .from('categories')
        .select('*')
        .order('name');

      if (categoriesError) throw categoriesError;

      const { data: subcategories, error: subcategoriesError } =
        await this.supabase.from('subcategories').select('*').order('name');

      if (subcategoriesError) throw subcategoriesError;

      // Combine categories with their subcategories
      return categories.map((category) => ({
        ...category,
        subcategories: subcategories.filter(
          (sub) => sub.category_id === category.id
        )
      }));
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

      if (categoryError) throw categoryError;

      const { data: subcategories, error: subcategoriesError } =
        await this.supabase
          .from('subcategories')
          .select('*')
          .eq('category_id', id)
          .order('name');

      if (subcategoriesError) throw subcategoriesError;

      return {
        ...category,
        subcategories
      };
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
        data: { session },
        error: sessionError
      } = await this.supabase.auth.getSession();
      if (sessionError || !session) throw new Error('Authentication required');

      // Check user role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profile) throw new Error('Profile not found');
      if (!['super_admin', 'administrator'].includes(profile.role)) {
        throw new Error('You do not have permission to create categories');
      }

      const { data: category, error } = await this.supabase
        .from('categories')
        .insert([
          {
            ...data,
            created_by: session.user.id
          }
        ])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('A category with this name already exists');
        }
        throw error;
      }

      toast.success('Category created successfully');
      return {
        ...category,
        subcategories: []
      };
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
        data: { session },
        error: sessionError
      } = await this.supabase.auth.getSession();
      if (sessionError || !session) throw new Error('Authentication required');

      // Check user role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profile) throw new Error('Profile not found');
      if (!['super_admin', 'administrator'].includes(profile.role)) {
        throw new Error('You do not have permission to update categories');
      }

      const { data: category, error } = await this.supabase
        .from('categories')
        .update({
          ...data,
          updated_by: session.user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('A category with this name already exists');
        }
        throw error;
      }

      toast.success('Category updated successfully');
      return {
        ...category,
        subcategories: [] // Subcategories will be fetched separately when needed
      };
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
        data: { session },
        error: sessionError
      } = await this.supabase.auth.getSession();
      if (sessionError || !session) throw new Error('Authentication required');

      // Check user role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profile) throw new Error('Profile not found');
      if (!['super_admin', 'administrator'].includes(profile.role)) {
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
        data: { session },
        error: sessionError
      } = await this.supabase.auth.getSession();
      if (sessionError || !session) throw new Error('Authentication required');

      // Check user role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profile) throw new Error('Profile not found');
      if (!['super_admin', 'administrator'].includes(profile.role)) {
        throw new Error('You do not have permission to create subcategories');
      }

      const { data: subcategory, error } = await this.supabase
        .from('subcategories')
        .insert([
          {
            ...data,
            created_by: session.user.id,
            is_active: data.is_active ?? true
          }
        ])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('A subcategory with this name already exists');
        }
        throw error;
      }

      toast.success('Subcategory created successfully');
      return subcategory;
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
        data: { session },
        error: sessionError
      } = await this.supabase.auth.getSession();
      if (sessionError || !session) throw new Error('Authentication required');

      // Check user role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profile) throw new Error('Profile not found');
      if (!['super_admin', 'administrator'].includes(profile.role)) {
        throw new Error('You do not have permission to update subcategories');
      }

      const { data: subcategory, error } = await this.supabase
        .from('subcategories')
        .update({
          ...data,
          updated_by: session.user.id,
          updated_at: new Date().toISOString()
        })
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
      return subcategory;
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
        data: { session },
        error: sessionError
      } = await this.supabase.auth.getSession();
      if (sessionError || !session) throw new Error('Authentication required');

      // Check user role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profile) throw new Error('Profile not found');
      if (!['super_admin', 'administrator'].includes(profile.role)) {
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
