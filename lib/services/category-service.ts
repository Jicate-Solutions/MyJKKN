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
      const response = await fetch('/api/categories', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch categories');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Failed to load categories');
      return [];
    }
  }

  // Get a single category with its subcategories
  static async getCategoryById(id: string): Promise<Category | null> {
    try {
      const response = await fetch(`/api/categories/${id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch category');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching category:', error);
      toast.error('Failed to load category');
      return null;
    }
  }

  // Create a new category
  static async createCategory(data: CreateCategoryDTO): Promise<Category> {
    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to create category');
      }

      toast.success('Category created successfully');
      return responseData;
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create category'
      );
      throw error;
    }
  }

  // Update a category
  static async updateCategory(
    id: string,
    data: UpdateCategoryDTO
  ): Promise<Category> {
    try {
      const response = await fetch(`/api/categories/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to update category');
      }

      toast.success('Category updated successfully');
      return responseData;
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update category'
      );
      throw error;
    }
  }

  // Delete a category
  static async deleteCategory(id: string): Promise<void> {
    try {
      const response = await fetch(`/api/categories/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete category');
      }

      toast.success('Category deleted successfully');
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete category'
      );
      throw error;
    }
  }

  // Create a subcategory
  static async createSubcategory(
    data: CreateSubcategoryDTO
  ): Promise<Subcategory> {
    try {
      const response = await fetch('/api/categories/subcategories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to create subcategory');
      }

      toast.success('Subcategory created successfully');
      return responseData;
    } catch (error) {
      console.error('Error creating subcategory:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create subcategory'
      );
      throw error;
    }
  }

  // Update a subcategory
  static async updateSubcategory(
    id: string,
    data: UpdateSubcategoryDTO
  ): Promise<Subcategory> {
    try {
      const response = await fetch(`/api/categories/subcategories/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to update subcategory');
      }

      toast.success('Subcategory updated successfully');
      return responseData;
    } catch (error) {
      console.error('Error updating subcategory:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update subcategory'
      );
      throw error;
    }
  }

  // Delete a subcategory
  static async deleteSubcategory(id: string): Promise<void> {
    try {
      const response = await fetch(`/api/categories/subcategories/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete subcategory');
      }

      toast.success('Subcategory deleted successfully');
    } catch (error) {
      console.error('Error deleting subcategory:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to delete subcategory';
      toast.error(message);
      throw error;
    }
  }
}
