// lib/services/category-service.ts
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateSubcategoryInput,
  Subcategory
} from '@/types/categories';

export class CategoryService {
  private static supabase = createClientComponentClient();

  // Get all categories with subcategories
  static async getCategories(): Promise<Category[]> {
    try {
      const { data, error } = await this.supabase
        .from('categories')
        .select(
          `
          *,
          subcategories (*)
        `
        )
        .order('name');

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Failed to fetch categories');
      return [];
    }
  }

  // Get a single category by ID
  static async getCategoryById(id: string): Promise<Category | null> {
    try {
      const { data, error } = await this.supabase
        .from('categories')
        .select(
          `
          *,
          subcategories (*)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error fetching category:', error);
      toast.error('Failed to fetch category');
      return null;
    }
  }

  // Create a new category
  static async createCategory(
    input: CreateCategoryInput
  ): Promise<Category | null> {
    try {
      const { data, error } = await this.supabase
        .from('categories')
        .insert({
          name: input.name,
          description: input.description
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Category created successfully');
      return data;
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error('Failed to create category');
      return null;
    }
  }

  // Update a category
  static async updateCategory(
    id: string,
    input: UpdateCategoryInput
  ): Promise<Category | null> {
    try {
      const { data, error } = await this.supabase
        .from('categories')
        .update({
          name: input.name,
          description: input.description
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Category updated successfully');
      return data;
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error('Failed to update category');
      return null;
    }
  }

  // Delete a category
  static async deleteCategory(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Category deleted successfully');
      return true;
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category');
      return false;
    }
  }

  // Create a new subcategory
  static async createSubcategory(
    categoryId: string,
    input: CreateSubcategoryInput
  ): Promise<Subcategory | null> {
    try {
      const { data, error } = await this.supabase
        .from('subcategories')
        .insert({
          name: input.name,
          description: input.description,
          parent_id: categoryId
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Subcategory created successfully');
      return data;
    } catch (error) {
      console.error('Error creating subcategory:', error);
      toast.error('Failed to create subcategory');
      return null;
    }
  }

  // Get subcategories for a category
  static async getSubcategories(categoryId: string): Promise<Subcategory[]> {
    try {
      const { data, error } = await this.supabase
        .from('subcategories')
        .select('*')
        .eq('parent_id', categoryId)
        .order('name');

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching subcategories:', error);
      toast.error('Failed to fetch subcategories');
      return [];
    }
  }

  // Delete a subcategory
  static async deleteSubcategory(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('subcategories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Subcategory deleted successfully');
      return true;
    } catch (error) {
      console.error('Error deleting subcategory:', error);
      toast.error('Failed to delete subcategory');
      return false;
    }
  }

  // Search categories
  static async searchCategories(query: string): Promise<Category[]> {
    try {
      const { data, error } = await this.supabase
        .from('categories')
        .select(
          `
          *,
          subcategories (*)
        `
        )
        .ilike('name', `%${query}%`)
        .order('name');

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error searching categories:', error);
      toast.error('Failed to search categories');
      return [];
    }
  }
}
