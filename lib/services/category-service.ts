// lib/services/category-service.ts
import { supabase } from '@/lib/supabase/client';
import { Database } from '@/types/supabase';
import { toast } from 'react-hot-toast';
import {
  Category,
  CreateCategoryInput,
  CreateSubcategoryInput,
  Subcategory
} from '@/types/categories';

type CategoryResponse = Database['public']['Tables']['categories']['Row'];
type SubcategoryResponse = Database['public']['Tables']['subcategories']['Row'];

export class CategoryService {
  static async getCategories(): Promise<CategoryResponse[]> {
    try {
      const { data, error } = await supabase
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

  static async createCategory(
    input: CreateCategoryInput
  ): Promise<CategoryResponse | null> {
    try {
      const { data, error } = await supabase
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

  static async createSubcategory(
    categoryId: string,
    input: CreateSubcategoryInput
  ): Promise<SubcategoryResponse | null> {
    try {
      const { data, error } = await supabase
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

  static async deleteCategory(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('categories').delete().eq('id', id);

      if (error) throw error;

      toast.success('Category deleted successfully');
      return true;
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category');
      return false;
    }
  }

  static async deleteSubcategory(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
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
}
