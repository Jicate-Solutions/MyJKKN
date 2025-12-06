// lib/services/resource-management/resource-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { StorageService } from '@/lib/storage/storage-service';
import type {
  Resource,
  CreateResourceDto,
  UpdateResourceDto,
  ResourceFilters,
  ResourceListResponse,
  BulkOperationResult,
  ResourceAvailability
} from '@/types/resource-management';

/**
 * Resource Service for managing resources
 *
 * Provides CRUD operations, availability checking, stock management,
 * and image handling for resources.
 */
export class ResourceService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get all resources with filtering and pagination
   */
  static async getResources(
    filters: ResourceFilters = {}
  ): Promise<ResourceListResponse> {
    try {
      let query = this.supabase.from('resources').select(
        `
          *,
          parent_category:resource_parent_categories(id, name, image_url),
          subcategory:resource_sub_categories(id, name, image_url),
          institution:institutions(id, name),
          department:departments(id, department_name),
          created_by_user:profiles!resources_created_by_fkey(
            id,
            full_name,
            email
          ),
          updated_by_user:profiles!resources_updated_by_fkey(
            id,
            full_name,
            email
          )
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
        );
      }

      if (filters.parent_category_id) {
        query = query.eq('parent_category_id', filters.parent_category_id);
      }

      if (filters.subcategory_id) {
        query = query.eq('subcategory_id', filters.subcategory_id);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.booking_type) {
        query = query.eq('booking_type', filters.booking_type);
      }

      if (filters.caretaker_user_ids) {
        query = query.contains(
          'caretaker_user_ids',
          filters.caretaker_user_ids
        );
      }

      // Filter by availability date if provided
      if (filters.available_on) {
        // This will need to check against reservations - implement later
        // For now, just filter by status 'available'
        query = query.eq('status', 'available');
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

      const { data: resources, error, count } = await query;

      if (error) throw error;

      return {
        data: resources || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching resources:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch resources'
      );
    }
  }

  /**
   * Get a single resource by ID
   */
  static async getResource(id: string): Promise<Resource> {
    try {
      const { data: resource, error } = await this.supabase
        .from('resources')
        .select(
          `
            *,
            parent_category:resource_parent_categories(id, name, image_url),
            subcategory:resource_sub_categories(id, name, image_url),
            institution:institutions(id, name),
            department:departments(id, department_name),
            created_by_user:profiles!resources_created_by_fkey(
              id,
              full_name,
              email
            ),
            updated_by_user:profiles!resources_updated_by_fkey(
              id,
              full_name,
              email
            )
          `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!resource) throw new Error('Resource not found');

      return resource;
    } catch (error) {
      console.error('Error fetching resource:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch resource'
      );
    }
  }

  /**
   * Create a new resource
   */
  static async createResource(
    resourceData: CreateResourceDto,
    userId: string,
    customResourceCode?: string
  ): Promise<Resource> {
    try {
      // Validate required fields
      if (!resourceData.name?.trim()) {
        throw new Error('Resource name is required');
      }

      if (!resourceData.parent_category_id) {
        throw new Error('Parent category is required');
      }

      // subcategory_id is now optional - no validation required

      if (!resourceData.institution_id) {
        throw new Error('Institution is required');
      }

      // Use resource_code from resourceData if not provided as parameter
      const resourceCode = customResourceCode || resourceData.resource_code;
      console.log('Resource code being used:', resourceCode);

      // Check if resource code already exists (if provided)
      if (resourceCode) {
        const { data: existingCode, error: codeCheckError } = await this.supabase
          .from('resources')
          .select('id')
          .eq('resource_code', resourceCode)
          .maybeSingle();

        if (codeCheckError) {
          console.error('Error checking resource code:', codeCheckError);
        }

        if (existingCode) {
          throw new Error(
            'A resource with this code already exists. Please use a different code.'
          );
        }
      }

      // Check if resource name already exists in the same location
      // Build query conditionally to handle null values correctly
      let duplicateCheckQuery = this.supabase
        .from('resources')
        .select('id')
        .eq('name', resourceData.name.trim())
        .eq('institution_id', resourceData.institution_id);

      // Handle nullable fields with .is() for null or .eq() for values
      if (resourceData.department_id) {
        duplicateCheckQuery = duplicateCheckQuery.eq('department_id', resourceData.department_id);
      } else {
        duplicateCheckQuery = duplicateCheckQuery.is('department_id', null);
      }

      if (resourceData.building_number) {
        duplicateCheckQuery = duplicateCheckQuery.eq('building_number', resourceData.building_number);
      } else {
        duplicateCheckQuery = duplicateCheckQuery.is('building_number', null);
      }

      if (resourceData.block_number) {
        duplicateCheckQuery = duplicateCheckQuery.eq('block_number', resourceData.block_number);
      } else {
        duplicateCheckQuery = duplicateCheckQuery.is('block_number', null);
      }

      if (resourceData.room_number) {
        duplicateCheckQuery = duplicateCheckQuery.eq('room_number', resourceData.room_number);
      } else {
        duplicateCheckQuery = duplicateCheckQuery.is('room_number', null);
      }

      const { data: existingResource, error: nameCheckError } = await duplicateCheckQuery.maybeSingle();

      if (nameCheckError) {
        console.error('Error checking resource name:', nameCheckError);
        throw new Error('Failed to check for duplicate resource name');
      }

      if (existingResource) {
        throw new Error(
          'A resource with this name already exists in this location'
        );
      }

      // Map form fields to database columns based on actual schema
      const { caretaker_user_ids, ...otherData } = resourceData;

      // Debug logging
      console.log('Raw caretaker_user_ids from form:', caretaker_user_ids);

      // Filter out empty/invalid caretaker IDs
      const validCaretakerIds = caretaker_user_ids?.filter(
        (id) => id && typeof id === 'string' && id.trim() !== ''
      ) || [];

      console.log('Filtered validCaretakerIds:', validCaretakerIds);

      // Use initial_stock_quantity or default to 1
      const initialStock = resourceData.initial_stock_quantity ?? 1;

      const dbData = {
        ...otherData,
        name: resourceData.name.trim(),
        resource_code: resourceCode, // Use the resolved resource code
        caretaker_user_id: validCaretakerIds[0] || null, // Single caretaker
        caretaker_user_ids: validCaretakerIds.length > 0 ? validCaretakerIds : [], // Array of caretakers
        initial_stock_quantity: initialStock,
        current_stock_quantity: initialStock,
        created_by: userId,
        updated_by: userId
      };

      console.log('Final caretaker values:', {
        caretaker_user_id: dbData.caretaker_user_id,
        caretaker_user_ids: dbData.caretaker_user_ids
      });

      const { data: resource, error } = await this.supabase
        .from('resources')
        .insert(dbData)
        .select()
        .single();

      if (error) {
        console.error('Database error creating resource:', error);

        // Handle specific error codes
        if (error.code === '23505') {
          // Unique constraint violation
          throw new Error(
            'A resource with this information already exists. Please check the resource code, name, or location.'
          );
        }

        if (error.code === '23503') {
          // Foreign key constraint violation
          if (error.message?.includes('caretaker_user_id')) {
            throw new Error(
              'Invalid caretaker selected. Please select a valid staff member or leave it empty.'
            );
          }
          throw new Error(
            'Invalid reference data. Please check all selected values.'
          );
        }

        throw error;
      }

      return resource;
    } catch (error) {
      console.error('Error creating resource:', error);

      // If it's already a formatted error message, throw it as is
      if (error instanceof Error) {
        throw error;
      }

      throw new Error('Failed to create resource');
    }
  }

  /**
   * Update an existing resource
   */
  static async updateResource(
    id: string,
    resourceData: UpdateResourceDto,
    userId: string
  ): Promise<Resource> {
    try {
      // Check if resource exists
      const existingResource = await this.getResource(id);
      if (!existingResource) {
        throw new Error('Resource not found');
      }

      // Check if new name conflicts with existing resources
      if (resourceData.name) {
        const { data: conflictResource, error: conflictCheckError } = await this.supabase
          .from('resources')
          .select('id')
          .eq('name', resourceData.name.trim())
          .eq(
            'institution_id',
            resourceData.institution_id || existingResource.institution_id
          )
          .neq('id', id)
          .maybeSingle();

        if (conflictCheckError) {
          console.error('Error checking resource name conflict:', conflictCheckError);
        }

        if (conflictResource) {
          throw new Error(
            'A resource with this name already exists in this location'
          );
        }
      }

      // Map form fields to database columns based on actual schema
      const { caretaker_user_ids, ...otherData } = resourceData;

      // Filter out empty/invalid caretaker IDs
      const validCaretakerIds = caretaker_user_ids?.filter(
        (id) => id && id.trim() !== ''
      ) || [];

      const updateData = {
        ...otherData,
        ...(resourceData.name && { name: resourceData.name.trim() }),
        ...(caretaker_user_ids !== undefined && {
          caretaker_user_id: validCaretakerIds[0] || null,
          caretaker_user_ids: validCaretakerIds.length > 0 ? validCaretakerIds : []
        }),
        updated_by: userId,
        updated_at: new Date().toISOString()
      };

      const { data: resource, error } = await this.supabase
        .from('resources')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return resource;
    } catch (error) {
      console.error('Error updating resource:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to update resource'
      );
    }
  }

  /**
   * Delete a resource by ID
   *
   * Note: Database has CASCADE delete configured for:
   * - resource_reservations (all reservations will be deleted)
   * - resource_usage_logs (all usage logs will be deleted)
   * - resource_approvals (via reservations cascade)
   */
  static async deleteResource(id: string): Promise<boolean> {
    try {
      // Get resource to retrieve image URLs for cleanup
      const resource = await this.getResource(id);

      // Delete the resource (database will cascade delete all related data)
      const { error } = await this.supabase
        .from('resources')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Delete resource images from storage if they exist
      if (resource.image_urls && resource.image_urls.length > 0) {
        try {
          for (const imageUrl of resource.image_urls) {
            await StorageService.deleteResourceImageByUrl(imageUrl);
          }
          console.log(
            `Successfully deleted ${resource.image_urls.length} images for resource ${id}`
          );
        } catch (imageError) {
          console.error(
            `Failed to delete images for resource ${id}:`,
            imageError
          );
          // Don't fail the entire operation for image cleanup errors
        }
      }

      console.log(
        `Successfully deleted resource "${resource.name}" and all related data (reservations, usage logs, approvals)`
      );

      return true;
    } catch (error) {
      console.error('Error deleting resource:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to delete resource'
      );
    }
  }

  /**
   * Bulk delete resources by IDs
   */
  static async bulkDeleteResources(
    ids: string[]
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      success: true,
      processedCount: 0,
      errors: []
    };

    console.log(`Starting bulk delete of ${ids.length} resources with cleanup`);

    for (const id of ids) {
      try {
        await this.deleteResource(id);
        result.processedCount++;
        console.log(`Successfully deleted resource ${id}`);
      } catch (error) {
        result.success = false;
        result.errors.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        console.error(`Failed to delete resource ${id}:`, error);
      }
    }

    console.log(
      `Bulk delete completed: ${result.processedCount}/${ids.length} resources processed`
    );
    return result;
  }

  /**
   * Update stock quantity
   */
  static async updateStockQuantity(
    id: string,
    quantity: number,
    userId: string
  ): Promise<Resource> {
    try {
      if (quantity < 0) {
        throw new Error('Stock quantity cannot be negative');
      }

      const { data: resource, error } = await this.supabase
        .from('resources')
        .update({
          current_stock_quantity: quantity,
          updated_by: userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return resource;
    } catch (error) {
      console.error('Error updating stock quantity:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to update stock quantity'
      );
    }
  }

  /**
   * Check resource availability for a given time period
   */
  static async checkAvailability(
    resourceId: string,
    startTime: string,
    endTime: string
  ): Promise<{ available: boolean; conflictingReservations?: any[] }> {
    try {
      const { data: reservations, error } = await this.supabase
        .from('resource_reservations')
        .select('*')
        .eq('resource_id', resourceId)
        .in('status', ['pending', 'approved'])
        .or(`and(start_time.lte.${endTime},end_time.gte.${startTime})`);

      if (error) throw error;

      const hasConflicts = reservations && reservations.length > 0;

      return {
        available: !hasConflicts,
        conflictingReservations: hasConflicts ? reservations : undefined
      };
    } catch (error) {
      console.error('Error checking availability:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to check availability'
      );
    }
  }

  /**
   * Get resources for select/dropdown
   */
  static async getResourcesForSelect(
    institutionId?: string,
    departmentId?: string
  ): Promise<Array<{ id: string; name: string; status: string }>> {
    try {
      let query = this.supabase
        .from('resources')
        .select('id, name, status')
        .eq('status', 'available')
        .order('name');

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      if (departmentId) {
        query = query.eq('department_id', departmentId);
      }

      const { data: resources, error } = await query;

      if (error) throw error;

      return resources || [];
    } catch (error) {
      console.error('Error fetching resources for select:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to fetch resources'
      );
    }
  }

  /**
   * Get resource usage statistics
   */
  static async getResourceUsageStats(resourceId: string): Promise<{
    totalReservations: number;
    completedReservations: number;
    cancelledReservations: number;
    noShowReservations: number;
    averageDuration: number;
    utilizationRate: number;
  }> {
    try {
      const { data: stats, error } = await this.supabase.rpc(
        'get_resource_usage_stats',
        {
          p_resource_id: resourceId
        }
      );

      if (error) {
        // If function doesn't exist, calculate manually
        const { data: reservations } = await this.supabase
          .from('resource_reservations')
          .select('status, start_time, end_time')
          .eq('resource_id', resourceId);

        const total = reservations?.length || 0;
        const completed =
          reservations?.filter((r) => r.status === 'completed').length || 0;
        const cancelled =
          reservations?.filter((r) => r.status === 'cancelled').length || 0;
        const noShow =
          reservations?.filter((r) => r.status === 'no_show').length || 0;

        return {
          totalReservations: total,
          completedReservations: completed,
          cancelledReservations: cancelled,
          noShowReservations: noShow,
          averageDuration: 0,
          utilizationRate: total > 0 ? (completed / total) * 100 : 0
        };
      }

      return stats;
    } catch (error) {
      console.error('Error fetching usage stats:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to fetch usage statistics'
      );
    }
  }

  /**
   * Search resources by name or description
   */
  static async searchResources(query: string): Promise<Resource[]> {
    try {
      const { data: resources, error } = await this.supabase
        .from('resources')
        .select(
          `
            *,
            parent_category:resource_parent_categories(id, name),
            subcategory:resource_sub_categories(id, name),
            institution:institutions(id, name)
          `
        )
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .in('status', ['available', 'occupied'])
        .order('name')
        .limit(10);

      if (error) throw error;

      return resources || [];
    } catch (error) {
      console.error('Error searching resources:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to search resources'
      );
    }
  }

  /**
   * Get count of resources by category and institution for ID generation
   */
  static async getResourceCountForIdGeneration(
    categoryId: string,
    institutionId: string
  ): Promise<number> {
    try {
      const { count, error} = await this.supabase
        .from('resources')
        .select('*', { count: 'exact', head: true })
        .eq('parent_category_id', categoryId)
        .eq('institution_id', institutionId);

      if (error) throw error;

      return count || 0;
    } catch (error) {
      console.error('Error getting resource count:', error);
      return 0; // Return 0 on error to allow fallback to random ID
    }
  }

  /**
   * Update resource usage count
   */
  static async incrementUsageCount(resourceId: string): Promise<void> {
    try {
      await this.supabase.rpc('increment_resource_usage', {
        resource_id: resourceId
      });
    } catch (error) {
      console.error('Error incrementing usage count:', error);
      // Don't throw error as this is non-critical
    }
  }

  /**
   * Update resource reservation count
   */
  static async incrementReservationCount(resourceId: string): Promise<void> {
    try {
      await this.supabase.rpc('increment_resource_reservations', {
        resource_id: resourceId
      });
    } catch (error) {
      console.error('Error incrementing reservation count:', error);
      // Don't throw error as this is non-critical
    }
  }
}
