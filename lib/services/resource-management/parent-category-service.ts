// lib/services/resource-management/parent-category-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { StorageService } from '@/lib/storage/storage-service';
import type {
  ParentCategory,
  CreateParentCategoryDto,
  UpdateParentCategoryDto,
  ParentCategoryFilters,
  ParentCategoryListResponse,
  BulkOperationResult
} from '@/types/resource-management';

/**
 * Parent Category Service with Permanent Delete Functionality
 *
 * This service provides complete CRUD operations for parent categories with
 * permanent deletion and automatic image cleanup:
 *
 * - DELETE: Permanently deletes the category and removes its associated
 *   images from storage. Deletion is blocked if sub-categories or resources
 *   are still assigned.
 * - UPDATE: When image URL changes, automatically cleans up the old image.
 * - BULK DELETE: Processes multiple permanent deletions with cascade cleanup.
 *
 * Image Storage Management:
 * - Images are stored in: storage/resource-management/categories/{categoryId}/
 * - On delete: Removes entire category directory and all contained images.
 * - On update: Removes old image when URL changes, keeping new image.
 * - Error handling: Image cleanup failures don't prevent database operations.
 */

export class ParentCategoryService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get all parent categories with filtering and pagination
   */
  static async getParentCategories(
    filters: ParentCategoryFilters = {}
  ): Promise<ParentCategoryListResponse> {
    try {
      let query = (this.supabase as any).from('resource_parent_categories').select(
        `
          *,
          subcategories:resource_sub_categories(count),
          resources:resources(count)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
        );
      }

      // Filter by status - by default exclude archived categories
      if (filters.status === 'all') {
        // Show all categories including archived (no status filter)
      } else if (filters.status) {
        // Show specific status
        query = query.eq('status', filters.status);
      } else {
        // Default: show only active and inactive categories, exclude archived
        query = query.in('status', ['active', 'inactive']);
      }

      // Apply sorting
      const sortBy = filters.sortBy || 'created_at';
      const sortOrder = filters.sortOrder || 'desc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to);

      const { data: categories, error, count } = await query;

      if (error) throw error;

      // Transform data to include usage statistics
      const transformedCategories = (categories || []).map((category: any) => ({
        ...category,
        usage_count: category.resources?.[0]?.count || 0,
        subcategories_count: category.subcategories?.[0]?.count || 0
      }));

      return {
        data: transformedCategories,
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching parent categories:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to fetch parent categories'
      );
    }
  }

  /**
   * Get a single parent category by ID
   */
  static async getParentCategory(id: string): Promise<ParentCategory> {
    try {
      // First get the basic category data
      const { data: category, error } = await this.supabase
        .from('resource_parent_categories')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!category) throw new Error('Parent category not found');

      // Get subcategories separately
      const { data: subcategories } = await this.supabase
        .from('resource_sub_categories')
        .select('*')
        .eq('parent_category_id', id);

      // Get created_by user info if exists
      let created_by_user = null;
      if ((category as any).created_by) {
        const { data: createdUser } = await this.supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('id', (category as any).created_by)
          .single();
        created_by_user = createdUser;
      }

      // Get updated_by user info if exists
      let updated_by_user = null;
      if ((category as any).updated_by) {
        const { data: updatedUser } = await this.supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('id', (category as any).updated_by)
          .single();
        updated_by_user = updatedUser;
      }

      // Get usage count (number of resources using this category)
      const { count: usageCount } = await this.supabase
        .from('resources')
        .select('*', { count: 'exact', head: true })
        .eq('parent_category_id', id);

      // Combine the data
      const result = {
        ...(category as any),
        subcategories: subcategories || [],
        subcategories_count: subcategories?.length || 0,
        usage_count: usageCount || 0,
        created_by_user,
        updated_by_user
      };

      return result;
    } catch (error) {
      console.error('Error fetching parent category:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to fetch parent category'
      );
    }
  }

  /**
   * Create a new parent category
   */
  static async createParentCategory(
    categoryData: CreateParentCategoryDto,
    userId: string,
    customId?: string
  ): Promise<ParentCategory> {
    try {
      // Check if category name already exists
      const { data: existingCategory } = await this.supabase
        .from('resource_parent_categories')
        .select('id')
        .eq('name', categoryData.name.trim())
        .single();

      if (existingCategory) {
        throw new Error('A category with this name already exists');
      }

      // Get the next display order if not provided
      let displayOrder = categoryData.display_order;
      if (displayOrder === undefined) {
        const { data: lastCategory } = await this.supabase
          .from('resource_parent_categories')
          .select('display_order')
          .order('display_order', { ascending: false })
          .limit(1)
          .single();

        displayOrder = ((lastCategory as any)?.display_order || 0) + 1;
      }

      const { data: category, error } = await (this.supabase
        .from('resource_parent_categories') as any)
        .insert({
          ...(customId && { id: customId }),
          ...categoryData,
          name: categoryData.name.trim(),
          display_order: displayOrder,
          created_by: userId,
          updated_by: userId
        })
        .select()
        .single();

      if (error) throw error;

      return category;
    } catch (error) {
      console.error('Error creating parent category:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to create parent category'
      );
    }
  }

  /**
   * Update an existing parent category (with image cleanup for changed images)
   */
  static async updateParentCategory(
    id: string,
    categoryData: UpdateParentCategoryDto,
    userId: string
  ): Promise<ParentCategory> {
    try {
      // Check if category exists
      const existingCategory = await this.getParentCategory(id);
      if (!existingCategory) {
        throw new Error('Parent category not found');
      }

      // Check if new name conflicts with existing categories (excluding current)
      if (categoryData.name) {
        const { data: conflictCategory } = await this.supabase
          .from('resource_parent_categories')
          .select('id')
          .eq('name', categoryData.name.trim())
          .neq('id', id)
          .single();

        if (conflictCategory) {
          throw new Error('A category with this name already exists');
        }
      }

      // Check if image URL is being changed and clean up old image
      const isImageChanged =
        categoryData.image_url &&
        categoryData.image_url !== existingCategory.image_url;

      if (isImageChanged && existingCategory.image_url) {
        try {
          await StorageService.deleteCategoryImageByUrl(
            existingCategory.image_url
          );
        } catch (imageError) {
          console.error(
            `Failed to clean up old image for category ${id}:`,
            imageError
          );
          // Don't fail the update operation for image cleanup errors
        }
      }

      const updateData = {
        ...categoryData,
        ...(categoryData.name && { name: categoryData.name.trim() }),
        updated_by: userId,
        updated_at: new Date().toISOString()
      };

      const { data: category, error } = await (this.supabase
        .from('resource_parent_categories') as any)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return category;
    } catch (error) {
      console.error('Error updating parent category:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to update parent category'
      );
    }
  }

  /**
   * Permanently delete a parent category by its ID
   *
   * This is a hard delete and is irreversible.
   * Deletion is blocked if the category has associated sub-categories or resources.
   *
   * @param id The ID of the parent category to delete
   * @returns Promise<boolean>
   */
  static async deleteParentCategory(id: string): Promise<boolean> {
    try {
      // First, get the category to check for associations and get image_url
      const category = await this.getParentCategory(id);

      // Prevent deletion if there are associated sub-categories
      if (category.subcategories_count && category.subcategories_count > 0) {
        throw new Error(
          `Cannot delete category "${category.name}" because it has ${category.subcategories_count} sub-categories. Please delete or move them first.`
        );
      }

      // Prevent deletion if there are associated resources
      if (category.usage_count && category.usage_count > 0) {
        throw new Error(
          `Cannot delete category "${category.name}" because it has ${category.usage_count} resources. Please delete or move them first.`
        );
      }

      // Perform a hard delete
      const { error } = await this.supabase
        .from('resource_parent_categories')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting category from database:', error);
        throw error;
      }

      // Delete the category image from storage if it exists
      if (category.image_url) {
        try {
          // Use URL-based deletion since image might be stored with temp ID
          const { error: deleteError } =
            await StorageService.deleteCategoryImageByUrl(category.image_url);
          if (deleteError) {
            console.error(
              `Storage deletion error for category ${id}:`,
              deleteError
            );
            // Don't throw here, just log the error
          } else {
          }
        } catch (imageError) {
          // Log the error but don't fail the entire operation
          console.error(
            `Failed to delete image for category ${id}:`,
            imageError
          );
        }
      }

      return true;
    } catch (error) {
      console.error('Error deleting parent category:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            `Failed to delete parent category: ${error}`
      );
    }
  }

  /**
   * Bulk delete parent categories by their IDs
   *
   * This is a hard delete and is irreversible.
   *
   * @param ids An array of parent category IDs to delete
   * @returns Promise<BulkOperationResult>
   */
  static async bulkDeleteParentCategories(
    ids: string[]
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      success: true,
      processedCount: 0,
      errors: []
    };

    for (const id of ids) {
      try {
        await this.deleteParentCategory(id);
        result.processedCount++;
      } catch (error) {
        result.success = false;
        result.errors.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        console.error(`Failed to delete parent category ${id}:`, error);
      }
    }

    return result;
  }

  /**
   * Get parent categories for dropdown/select components
   */
  static async getParentCategoriesForSelect(): Promise<
    Array<{ id: string; name: string }>
  > {
    try {
      const { data: categories, error } = await this.supabase
        .from('resource_parent_categories')
        .select('id, name')
        .eq('status', 'active')
        .order('name');

      if (error) throw error;

      return categories || [];
    } catch (error) {
      console.error('Error fetching parent categories for select:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to fetch parent categories'
      );
    }
  }

  /**
   * Update display order of categories
   */
  static async updateDisplayOrder(
    categoryOrders: Array<{ id: string; display_order: number }>
  ): Promise<boolean> {
    try {
      const updates = categoryOrders.map(({ id, display_order }) =>
        (this.supabase
          .from('resource_parent_categories') as any)
          .update({
            display_order,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
      );

      await Promise.all(updates);
      return true;
    } catch (error) {
      console.error('Error updating display order:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to update display order'
      );
    }
  }

  /**
   * Get category usage statistics
   */
  static async getCategoryUsageStats(): Promise<
    Array<{
      id: string;
      name: string;
      subcategories_count: number;
      resources_count: number;
      active_resources_count: number;
    }>
  > {
    try {
      const { data: stats, error } = await this.supabase
        .from('resource_parent_categories')
        .select(
          `
          id,
          name,
          subcategories:resource_sub_categories(count),
          resources:resources(count),
          active_resources:resources!inner(count)
        `
        )
        .eq('active_resources.status', 'available');

      if (error) throw error;

      return (stats || []).map((stat: any) => ({
        id: stat.id,
        name: stat.name,
        subcategories_count: stat.subcategories?.[0]?.count || 0,
        resources_count: stat.resources?.[0]?.count || 0,
        active_resources_count: stat.active_resources?.[0]?.count || 0
      }));
    } catch (error) {
      console.error('Error fetching category usage stats:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to fetch usage statistics'
      );
    }
  }

  /**
   * Search categories by name
   */
  static async searchCategories(query: string): Promise<ParentCategory[]> {
    try {
      const { data: categories, error } = await this.supabase
        .from('resource_parent_categories')
        .select('*')
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .eq('status', 'active')
        .order('name')
        .limit(10);

      if (error) throw error;

      return categories || [];
    } catch (error) {
      console.error('Error searching categories:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to search categories'
      );
    }
  }
}
