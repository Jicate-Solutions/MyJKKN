// lib/services/resource/resource-category-service.ts

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import type {
  ResourceCategory,
  CreateResourceCategoryDto,
  UpdateResourceCategoryDto,
  ResourceCategoryFilters,
  ResourceCategoryListResponse
} from '@/types/resources';

export class ResourceCategoryService {
  private static supabase = createClientComponentClient();

  static async createResourceCategory(
    data: CreateResourceCategoryDto
  ): Promise<ResourceCategory> {
    try {
      const { data: category, error } = await this.supabase
        .from('resource_categories')
        .insert({
          category_name: data.category_name,
          parent_category_id: data.parent_category_id,
          description: data.description,
          attributes: data.attributes,
          is_active: data.is_active ?? true
        })
        .select('*')
        .single();

      if (error) throw error;
      return category as ResourceCategory;
    } catch (error) {
      console.error('Error creating resource category:', error);
      toast.error('Failed to create resource category');
      throw error;
    }
  }

  static async updateResourceCategory(
    id: string,
    data: UpdateResourceCategoryDto
  ): Promise<ResourceCategory> {
    try {
      const { data: category, error } = await this.supabase
        .from('resource_categories')
        .update({
          category_name: data.category_name,
          parent_category_id: data.parent_category_id,
          description: data.description,
          attributes: data.attributes,
          is_active: data.is_active
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return category as ResourceCategory;
    } catch (error) {
      console.error('Error updating resource category:', error);
      toast.error('Failed to update resource category');
      throw error;
    }
  }

  static async deleteResourceCategory(id: string): Promise<void> {
    try {
      // First check if there are any resources using this category
      const { data: resources, error: resourcesError } = await this.supabase
        .from('resources')
        .select('id')
        .eq('category_id', id)
        .limit(1);

      if (resourcesError) throw resourcesError;

      if (resources && resources.length > 0) {
        throw new Error('Cannot delete category that is in use by resources');
      }

      // Check if there are any child categories
      const { data: childCategories, error: childCategoriesError } =
        await this.supabase
          .from('resource_categories')
          .select('id')
          .eq('parent_category_id', id)
          .limit(1);

      if (childCategoriesError) throw childCategoriesError;

      if (childCategories && childCategories.length > 0) {
        throw new Error('Cannot delete category that has child categories');
      }

      // If no resources or child categories, proceed with deletion
      const { error } = await this.supabase
        .from('resource_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting resource category:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to delete resource category'
      );
      throw error;
    }
  }

  static async getResourceCategories(
    filters: ResourceCategoryFilters = {}
  ): Promise<ResourceCategoryListResponse> {
    try {
      const {
        search,
        parent_category_id,
        isActive,
        page = 1,
        limit = 10
      } = filters;

      // Calculate pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      // Start building the query
      let query = this.supabase.from('resource_categories').select(
        `
          *,
          parent_category:resource_categories!parent_category_id(id, category_name)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (search) {
        query = query.ilike('category_name', `%${search}%`);
      }

      if (parent_category_id === 'null') {
        // Handle the special case for top-level categories
        query = query.is('parent_category_id', null);
      } else if (parent_category_id) {
        query = query.eq('parent_category_id', parent_category_id);
      }

      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }

      // Apply pagination
      query = query.range(from, to);

      // Execute the query
      const { data, error, count } = await query;

      if (error) {
        console.error('Supabase query error:', error);
        throw new Error(
          `Database query failed: ${error.message || 'Unknown error'}`
        );
      }

      if (!data) {
        throw new Error('No data returned from the database');
      }

      // Calculate total pages
      const totalPages = count ? Math.ceil(count / limit) : 0;

      return {
        data: data as ResourceCategory[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages
        }
      };
    } catch (error) {
      console.error('Error fetching resource categories:', error);

      // Provide more detailed error message
      let errorMessage = 'Failed to fetch resource categories';
      if (error instanceof Error) {
        errorMessage += `: ${error.message}`;
      } else if (
        error &&
        typeof error === 'object' &&
        Object.keys(error).length === 0
      ) {
        errorMessage +=
          ': Empty error object received, possible network or authentication issue';
      }

      toast.error(errorMessage);
      throw error;
    }
  }

  static async getResourceCategory(id: string): Promise<ResourceCategory> {
    try {
      const { data, error } = await this.supabase
        .from('resource_categories')
        .select(
          `
          *,
          parent_category:resource_categories!parent_category_id(id, category_name)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      // Get subcategories
      const { data: subcategories, error: subcategoriesError } =
        await this.supabase
          .from('resource_categories')
          .select('*')
          .eq('parent_category_id', id)
          .eq('is_active', true);

      if (subcategoriesError) throw subcategoriesError;

      return {
        ...data,
        subcategories: subcategories
      } as ResourceCategory;
    } catch (error) {
      console.error('Error fetching resource category:', error);
      toast.error('Failed to fetch resource category details');
      throw error;
    }
  }

  static async getAllResourceCategories(
    isActive: boolean = true
  ): Promise<ResourceCategory[]> {
    try {
      const { data, error } = await this.supabase
        .from('resource_categories')
        .select(
          `
          *,
          parent_category:resource_categories!parent_category_id(id, category_name)
        `
        )
        .eq('is_active', isActive);

      if (error) throw error;
      return data as ResourceCategory[];
    } catch (error) {
      console.error('Error fetching all resource categories:', error);
      toast.error('Failed to fetch resource categories');
      throw error;
    }
  }

  static async getCategoryHierarchy(): Promise<ResourceCategory[]> {
    try {
      // First get all top-level categories
      const { data: topLevelCategories, error } = await this.supabase
        .from('resource_categories')
        .select('*')
        .is('parent_category_id', null)
        .eq('is_active', true);

      if (error) throw error;

      // For each top-level category, get its subcategories
      const categoriesWithSubcategories = await Promise.all(
        topLevelCategories.map(async (category) => {
          const { data: subcategories, error: subcategoriesError } =
            await this.supabase
              .from('resource_categories')
              .select('*')
              .eq('parent_category_id', category.id)
              .eq('is_active', true);

          if (subcategoriesError) throw subcategoriesError;

          return {
            ...category,
            subcategories: subcategories
          };
        })
      );

      return categoriesWithSubcategories as ResourceCategory[];
    } catch (error) {
      console.error('Error fetching category hierarchy:', error);
      toast.error('Failed to fetch category hierarchy');
      throw error;
    }
  }
}
