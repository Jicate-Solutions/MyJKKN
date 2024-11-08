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

  // Get all categories with their subcategories
  static async getCategories(): Promise<Category[]> {
    try {
      // First get all categories
      const { data: categories, error: categoriesError } = await this.supabase
        .from('categories')
        .select('*')
        .order('name');

      if (categoriesError) throw categoriesError;

      // Then get all subcategories
      const { data: subcategories, error: subcategoriesError } = await this.supabase
        .from('subcategories')
        .select('*')
        .order('name');

      if (subcategoriesError) throw subcategoriesError;

      // Combine categories with their subcategories
      return categories.map(category => ({
        ...category,
        subcategories: subcategories.filter(sub => sub.category_id === category.id)
      }));
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }
  }

  // Get a single category with its subcategories
  static async getCategoryById(id: string): Promise<Category | null> {
    try {
      const { data: category, error: categoryError } = await this.supabase
        .from('categories')
        .select('*')
        .eq('id', id)
        .single();

      if (categoryError) throw categoryError;

      const { data: subcategories, error: subcategoriesError } = await this.supabase
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
      throw error;
    }
  }

  // Create a new category
  static async createCategory(data: CreateCategoryDTO): Promise<Category> {
    try {
      const { data: category, error } = await this.supabase
        .from('categories')
        .insert([data])
        .select()
        .single();

      if (error) throw error;

      toast.success('Category created successfully');
      return {
        ...category,
        subcategories: []
      };
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create category');
      throw error;
    }
  }

  // Update a category
  static async updateCategory(id: string, data: UpdateCategoryDTO): Promise<Category> {
    try {
      const { data: category, error } = await this.supabase
        .from('categories')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Category updated successfully');
      
      // Fetch subcategories after update
      const { data: subcategories } = await this.supabase
        .from('subcategories')
        .select('*')
        .eq('category_id', id);

      return {
        ...category,
        subcategories: subcategories || []
      };
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update category');
      throw error;
    }
  }

  // Delete a category
  static async deleteCategory(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Category deleted successfully');
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete category');
      throw error;
    }
  }

  // Create a subcategory
  static async createSubcategory(data: CreateSubcategoryDTO): Promise<Subcategory> {
    try {
      const { data: subcategory, error } = await this.supabase
        .from('subcategories')
        .insert([data])
        .select()
        .single();

      if (error) throw error;

      toast.success('Subcategory created successfully');
      return subcategory;
    } catch (error) {
      console.error('Error creating subcategory:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create subcategory');
      throw error;
    }
  }

  // Update a subcategory
  static async updateSubcategory(
    id: string,
    data: UpdateSubcategoryDTO
  ): Promise<Subcategory> {
    try {
      const { data: subcategory, error } = await this.supabase
        .from('subcategories')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Subcategory updated successfully');
      return subcategory;
    } catch (error) {
      console.error('Error updating subcategory:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update subcategory');
      throw error;
    }
  }

  // Delete a subcategory
  static async deleteSubcategory(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('subcategories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Subcategory deleted successfully');
    } catch (error) {
      console.error('Error deleting subcategory:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete subcategory');
      throw error;
    }
  }
}