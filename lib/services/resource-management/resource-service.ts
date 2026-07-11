// lib/services/resource-management/resource-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { StorageService } from '@/lib/storage/storage-service';
import {
  logActivityForCurrentUser,
  ResourceManagementActivityTemplates,
} from '@/lib/utils/activity-logger-client';
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
      let query = (this.supabase as any).from('resources').select(
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

      // Procurement intake drafts awaiting room/caretaker setup.
      if (filters.needs_setup) {
        query = query.contains('tags', ['needs-setup']);
      }

      // Filter by availability date if provided
      if (filters.available_on) {
        // This will need to check against reservations - implement later
        // For now, just filter by status 'available'
        query = query.eq('status', 'available');
      }

      // Wave 1.5 HR-adapter substrate (PR-1): scope to current assignment
      if (filters.assignee_type) {
        query = query.eq('assignee_type', filters.assignee_type);
      }
      if (filters.assignee_id) {
        query = query.eq('assignee_id', filters.assignee_id);
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

      return resource as unknown as Resource;
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

      // Use resource_code from resourceData if not provided as parameter.
      // We may rewrite this several times below if the pre-INSERT check or the
      // DB unique constraint reports a collision — see resolveAvailableResourceCode
      // for why a single MAX+1 isn't enough under concurrent JKKN-family creates.
      let resourceCode = customResourceCode || resourceData.resource_code;
      console.log('Resource code being used:', resourceCode);

      if (resourceCode) {
        resourceCode = await this.resolveAvailableResourceCode(
          resourceCode,
          resourceData.parent_category_id,
          resourceData.institution_id
        );
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

      // Defense-in-depth: any nullable FK column that arrives as '' from the
      // form (or bulk-upload, or API caller) would otherwise reach Postgres as
      // an empty UUID and trigger 22P02. Normalize to null here so callers
      // can't bypass the form's own cleaning step.
      const NULLABLE_UUID_KEYS = [
        'subcategory_id',
        'department_id',
        'caretaker_user_id'
      ] as const;
      for (const key of NULLABLE_UUID_KEYS) {
        const v = (otherData as any)[key];
        if (typeof v === 'string' && v.trim() === '') {
          (otherData as any)[key] = null;
        }
      }

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
        // Ensure JSONB config fields are explicitly included
        approval_config: resourceData.approval_config || {},
        booking_config: resourceData.booking_config || {},
        reminder_config: resourceData.reminder_config || {},
        created_by: userId,
        updated_by: userId
      };

      console.log('Final caretaker values:', {
        caretaker_user_id: dbData.caretaker_user_id,
        caretaker_user_ids: dbData.caretaker_user_ids
      });

      let resource: any = null;
      let insertError: any = null;

      // Retry only on resource_code unique-constraint collisions. Name/location
      // duplicates were already filtered above and shouldn't be auto-rewritten.
      const MAX_INSERT_ATTEMPTS = 5;
      for (let attempt = 1; attempt <= MAX_INSERT_ATTEMPTS; attempt++) {
        const { data, error: err } = await (this.supabase as any)
          .from('resources')
          .insert(dbData)
          .select()
          .single();

        if (!err) {
          resource = data;
          insertError = null;
          break;
        }

        const isResourceCodeCollision =
          err.code === '23505' &&
          typeof err.message === 'string' &&
          err.message.toLowerCase().includes('resource_code');

        if (!isResourceCodeCollision || attempt === MAX_INSERT_ATTEMPTS) {
          insertError = err;
          break;
        }

        if (!resourceData.parent_category_id || !resourceData.institution_id) {
          insertError = err;
          break;
        }

        // Another insert won the race for our resource_code. Re-derive a fresh
        // code from MAX(suffix) and try again with that value.
        const fresh = await this.resolveAvailableResourceCode(
          dbData.resource_code,
          resourceData.parent_category_id,
          resourceData.institution_id
        );
        console.warn(
          `Resource code collision on ${dbData.resource_code}; retrying with ${fresh} (attempt ${attempt + 1}/${MAX_INSERT_ATTEMPTS})`
        );
        dbData.resource_code = fresh;
      }

      const error = insertError;

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

        if (error.code === '22P02') {
          // Invalid input syntax (most often empty string in a UUID column)
          throw new Error(
            `Database rejected a value: ${error.message}. Please re-check the form fields and try again.`
          );
        }

        // Preserve the actual Postgres message instead of leaking the raw
        // plain object up to a catch that does `instanceof Error`. Without
        // this wrap, every uncategorized error becomes the generic
        // "Failed to create resource" toast (PostgrestBuilder returns a
        // plain object, not an Error — see lib/utils.ts getErrorMessage).
        const dbMessage = [error.message, error.details, error.hint]
          .filter(Boolean)
          .join(' — ');
        throw new Error(dbMessage || 'Database error while creating resource');
      }

      const tpl = ResourceManagementActivityTemplates.resourceCreated(resource.name);
      await logActivityForCurrentUser({
        actionType: tpl.actionType,
        resourceType: tpl.resourceType,
        resourceId: resource.id,
        resourceName: resource.name,
        description: tpl.description,
        metadata: { sub_type: tpl.sub_type },
        institutionId: resource.institution_id,
      });

      return resource;
    } catch (error) {
      console.error('Error creating resource:', error);

      // If it's already a formatted error message, throw it as is
      if (error instanceof Error) {
        throw error;
      }

      // Supabase errors are plain {code, details, hint, message} objects —
      // not Error instances. Preserve their message so the toast shows the
      // real reason instead of "Failed to create resource".
      if (
        error !== null &&
        typeof error === 'object' &&
        'message' in error &&
        typeof (error as { message: unknown }).message === 'string'
      ) {
        throw new Error((error as { message: string }).message);
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

      // Check if new name conflicts with existing resources at the same location.
      // Must mirror the CREATE check (institution + department + building + block + room)
      // so that two resources with the same name in different locations can coexist.
      // For each location field, fall back to the existing resource value when the field
      // is absent from the update payload (i.e. not being changed this edit).
      if (resourceData.name) {
        const effInstitution = resourceData.institution_id ?? existingResource.institution_id;
        const effDepartment  = resourceData.department_id  !== undefined ? resourceData.department_id  : existingResource.department_id;
        const effBuilding    = resourceData.building_number !== undefined ? resourceData.building_number : existingResource.building_number;
        const effBlock       = resourceData.block_number    !== undefined ? resourceData.block_number    : existingResource.block_number;
        const effRoom        = resourceData.room_number     !== undefined ? resourceData.room_number     : existingResource.room_number;

        let conflictCheckQuery = this.supabase
          .from('resources')
          .select('id')
          .eq('name', resourceData.name.trim())
          .eq('institution_id', effInstitution)
          .neq('id', id);

        if (effDepartment) {
          conflictCheckQuery = conflictCheckQuery.eq('department_id', effDepartment);
        } else {
          conflictCheckQuery = conflictCheckQuery.is('department_id', null);
        }

        if (effBuilding) {
          conflictCheckQuery = conflictCheckQuery.eq('building_number', effBuilding);
        } else {
          conflictCheckQuery = conflictCheckQuery.is('building_number', null);
        }

        if (effBlock) {
          conflictCheckQuery = conflictCheckQuery.eq('block_number', effBlock);
        } else {
          conflictCheckQuery = conflictCheckQuery.is('block_number', null);
        }

        if (effRoom) {
          conflictCheckQuery = conflictCheckQuery.eq('room_number', effRoom);
        } else {
          conflictCheckQuery = conflictCheckQuery.is('room_number', null);
        }

        const { data: conflictResource, error: conflictCheckError } = await conflictCheckQuery.maybeSingle();

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

      // Defense-in-depth: same '' → null normalization as createResource so
      // edits can't reintroduce the 22P02 UUID error when a user clears an
      // optional FK dropdown (mirrors createResource above).
      const NULLABLE_UUID_KEYS = [
        'subcategory_id',
        'department_id',
        'caretaker_user_id'
      ] as const;
      for (const key of NULLABLE_UUID_KEYS) {
        const v = (otherData as any)[key];
        if (typeof v === 'string' && v.trim() === '') {
          (otherData as any)[key] = null;
        }
      }

      const updateData = {
        ...otherData,
        ...(resourceData.name && { name: resourceData.name.trim() }),
        ...(caretaker_user_ids !== undefined && {
          caretaker_user_id: validCaretakerIds[0] || null,
          caretaker_user_ids: validCaretakerIds.length > 0 ? validCaretakerIds : []
        }),
        // Ensure JSONB config fields are explicitly included when provided
        ...(resourceData.approval_config !== undefined && {
          approval_config: resourceData.approval_config || {}
        }),
        ...(resourceData.booking_config !== undefined && {
          booking_config: resourceData.booking_config || {}
        }),
        ...(resourceData.reminder_config !== undefined && {
          reminder_config: resourceData.reminder_config || {}
        }),
        updated_by: userId,
        updated_at: new Date().toISOString()
      };

      const { data: resource, error } = await (this.supabase as any)
        .from('resources')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const tpl = ResourceManagementActivityTemplates.resourceUpdated(resource.name);
      await logActivityForCurrentUser({
        actionType: tpl.actionType,
        resourceType: tpl.resourceType,
        resourceId: resource.id,
        resourceName: resource.name,
        description: tpl.description,
        metadata: { sub_type: tpl.sub_type },
        institutionId: resource.institution_id,
      });

      return resource;
    } catch (error) {
      console.error('Error updating resource:', error);
      // Same plain-object handling as createResource — preserve PostgREST
      // {code, details, hint, message} instead of falling back to a generic
      // string that hides the real reason in the toast.
      if (error instanceof Error) {
        throw error;
      }
      if (
        error !== null &&
        typeof error === 'object' &&
        'message' in error &&
        typeof (error as { message: unknown }).message === 'string'
      ) {
        throw new Error((error as { message: string }).message);
      }
      throw new Error('Failed to update resource');
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
      const { error } = await (this.supabase as any)
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

      const tpl = ResourceManagementActivityTemplates.resourceDeleted(resource.name);
      await logActivityForCurrentUser({
        actionType: tpl.actionType,
        resourceType: tpl.resourceType,
        resourceId: id,
        resourceName: resource.name,
        description: tpl.description,
        metadata: { sub_type: tpl.sub_type },
        institutionId: resource.institution_id,
      });

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

    const tpl = ResourceManagementActivityTemplates.resourcesBulkDeleted(
      ids.length,
      result.processedCount
    );
    await logActivityForCurrentUser({
      actionType: tpl.actionType,
      resourceType: tpl.resourceType,
      description: tpl.description,
      metadata: { sub_type: tpl.sub_type, ids },
    });

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

      const { data: resource, error } = await (this.supabase as any)
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

      const tpl = ResourceManagementActivityTemplates.resourceStockUpdated(
        resource.name,
        quantity
      );
      await logActivityForCurrentUser({
        actionType: tpl.actionType,
        resourceType: tpl.resourceType,
        resourceId: id,
        resourceName: resource.name,
        description: tpl.description,
        metadata: { sub_type: tpl.sub_type, new_quantity: quantity },
        institutionId: resource.institution_id,
      });

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
  /**
   * Count of procurement-intake drafts awaiting setup (tags contains 'needs-setup').
   * Institution-scoped TOTAL — deliberately ignores the list's secondary filters
   * (search/status/category); the badge click clears those so the click-through
   * shows exactly this set. RLS prevents cross-tenant reads for own-scope roles;
   * the institution filter aligns the number for scope-'all' users too.
   */
  static async getNeedsSetupCount(institutionId?: string): Promise<number> {
    let query = (this.supabase as any)
      .from('resources')
      .select('id', { count: 'exact', head: true })
      .contains('tags', ['needs-setup']);
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  }

  static async getResourcesForSelect(
    institutionId?: string,
    departmentId?: string
  ): Promise<Array<{ id: string; name: string; status: string; parent_category_id?: string }>> {
    try {
      let query = this.supabase
        .from('resources')
        .select('id, name, status, parent_category_id')
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
      const { data: stats, error } = await (this.supabase as any).rpc(
        'get_resource_usage_stats',
        {
          p_resource_id: resourceId
        }
      );

      if (error) {
        // If function doesn't exist, calculate manually
        const { data: reservations } = await (this.supabase as any)
          .from('resource_reservations')
          .select('status, start_time, end_time')
          .eq('resource_id', resourceId);

        const total = reservations?.length || 0;
        const completed =
          reservations?.filter((r: any) => r.status === 'completed').length || 0;
        const cancelled =
          reservations?.filter((r: any) => r.status === 'cancelled').length || 0;
        const noShow =
          reservations?.filter((r: any) => r.status === 'no_show').length || 0;

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

      return (resources || []) as unknown as Resource[];
    } catch (error) {
      console.error('Error searching resources:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to search resources'
      );
    }
  }

  /**
   * Return a resource_code that is currently free in the database, starting
   * from the caller-supplied candidate and bumping the numeric suffix on each
   * collision. Used by createResource() to close the read-then-INSERT race
   * window that the form's auto-generation cannot fix on its own.
   *
   * Why this is needed even after getResourceCountForIdGeneration returns
   * MAX+1: the form auto-generates the code at category/institution selection
   * time and caches it in React state. While the user fills out the rest of
   * the form (often several minutes), other JKKN-family institutions sharing
   * the same `RES-<CAT>-JKKN-` prefix keep advancing the global suffix. By
   * submit time, the cached code is stale and the pre-INSERT existence check
   * — or the DB UNIQUE constraint — fires. Confirmed in production 2026-05-14
   * for JKKN College of Pharmacy (codes 0004→0009 minted in a 20-minute
   * window across two concurrent users; a third user's stale 0006 form kept
   * losing the race).
   *
   * Behavior:
   *   - If the candidate isn't taken, returns it unchanged.
   *   - If taken, computes MAX(suffix) for the prefix family and returns
   *     prefix + (MAX+1). Repeats up to 5 times in case the DB advances mid
   *     loop (e.g. two browser tabs racing).
   *   - If the candidate doesn't match the RES-<CAT>-<INST>-<NNNN> shape, or
   *     the category/institution can't be resolved, throws the standard
   *     "already exists" error so the user can pick a manual code instead of
   *     us silently inserting under an unexpected one.
   */
  static async resolveAvailableResourceCode(
    candidateCode: string,
    categoryId?: string | null,
    institutionId?: string | null
  ): Promise<string> {
    const MAX_REGEN_ATTEMPTS = 5;

    const prefix = await this.resolveResourceCodePrefix(
      candidateCode,
      categoryId,
      institutionId
    );

    let code = candidateCode;
    for (let attempt = 0; attempt <= MAX_REGEN_ATTEMPTS; attempt++) {
      const { data: existing } = await (this.supabase as any)
        .from('resources')
        .select('id')
        .eq('resource_code', code)
        .maybeSingle();

      if (!existing) {
        return code;
      }

      if (!prefix) {
        throw new Error(
          'A resource with this code already exists. Please use a different code.'
        );
      }

      const nextSuffix = (await this.fetchMaxResourceCodeSuffix(prefix)) + 1;
      code = `${prefix}${String(nextSuffix).padStart(4, '0')}`;
    }

    throw new Error(
      'A resource with this code already exists. Please use a different code.'
    );
  }

  /**
   * Rebuild the `RES-<CAT>-<INST>-` prefix either from category/institution
   * names (matches generateResourceCode exactly) or by parsing the candidate
   * code itself. Returns null when neither path yields a usable prefix.
   */
  private static async resolveResourceCodePrefix(
    candidateCode: string,
    categoryId?: string | null,
    institutionId?: string | null
  ): Promise<string | null> {
    if (categoryId && institutionId) {
      const [{ data: category }, { data: institution }] = await Promise.all([
        this.supabase
          .from('resource_parent_categories')
          .select('name')
          .eq('id', categoryId)
          .maybeSingle(),
        this.supabase
          .from('institutions')
          .select('name')
          .eq('id', institutionId)
          .maybeSingle()
      ]);

      if (category?.name && institution?.name) {
        const categoryCode = category.name
          .replace(/[^a-zA-Z]/g, '')
          .substring(0, 3)
          .toUpperCase()
          .padEnd(3, 'X');
        const institutionCode = institution.name
          .replace(/[^a-zA-Z]/g, '')
          .substring(0, 4)
          .toUpperCase()
          .padEnd(4, 'X');
        return `RES-${categoryCode}-${institutionCode}-`;
      }
    }

    const parts = candidateCode.split('-');
    if (parts.length === 4 && parts[0] === 'RES' && /^\d+$/.test(parts[3])) {
      return `${parts[0]}-${parts[1]}-${parts[2]}-`;
    }

    return null;
  }

  /**
   * Highest numeric suffix currently used by any row sharing the given prefix.
   * Returns 0 when the prefix has no rows yet.
   */
  private static async fetchMaxResourceCodeSuffix(prefix: string): Promise<number> {
    const { data, error } = await (this.supabase as any)
      .from('resources')
      .select('resource_code')
      .like('resource_code', `${prefix}%`);

    if (error) {
      console.error('Error fetching resource_code suffix MAX:', error);
      return 0;
    }

    let maxSuffix = 0;
    for (const row of (data ?? []) as { resource_code: string }[]) {
      const suffixStr = row.resource_code.substring(prefix.length);
      const suffix = parseInt(suffixStr, 10);
      if (Number.isFinite(suffix) && suffix > maxSuffix) {
        maxSuffix = suffix;
      }
    }
    return maxSuffix;
  }

  /**
   * Get count of resources by category and institution for ID generation
   */
  /**
   * Returns the seed value for the next sequential resource_code suffix.
   *
   * Despite the legacy name, this no longer returns a row COUNT. It returns
   * the MAX numeric suffix already used for the same RES-<CAT>-<INST>-
   * prefix family, so the generator (which always adds 1) produces a code
   * that cannot collide.
   *
   * Why this matters: the prefix is derived from the FIRST 3 alpha chars of
   * the category and the FIRST 4 alpha chars of the institution name. JKKN
   * has 11 institutions that all compress to "JKKN" (JKKN College of
   * Pharmacy, JKKN College of Engineering and Technology, JKKN Main Office,
   * etc.) — so two distinct institutions creating resources in the same
   * category would race on the same suffix and one would always lose to a
   * 23505 (unique violation) at insert time. Scoping the lookup to a single
   * (category, institution) row COUNT was the original bug: at College of
   * Pharmacy with zero existing rows the next code was 0001, which clashes
   * with Main Office's existing 0001.
   *
   * Using MAX across the prefix family also fixes the secondary bug where
   * deleting a row left a gap (COUNT=N-1) and the next insert reused an
   * already-taken suffix.
   */
  static async getResourceCountForIdGeneration(
    categoryId: string,
    institutionId: string
  ): Promise<number> {
    try {
      // Shares prefix/MAX primitives with resolveAvailableResourceCode so the
      // form's preview code stays in lockstep with the createResource retry logic.
      const prefix = await this.resolveResourceCodePrefix('', categoryId, institutionId);
      if (!prefix) return 0;
      return await this.fetchMaxResourceCodeSuffix(prefix);
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
      await (this.supabase as any).rpc('increment_resource_usage', {
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
      await (this.supabase as any).rpc('increment_resource_reservations', {
        resource_id: resourceId
      });
    } catch (error) {
      console.error('Error incrementing reservation count:', error);
      // Don't throw error as this is non-critical
    }
  }

  // ===== Wave 1.5 HR-adapter substrate (PR-1) =====

  /**
   * Assign a resource to a staff member.
   *
   * Sets assignee_type='staff', assignee_id=staffId, assigned_at=now(), and
   * clears returned_at so the resource shows as currently held.
   *
   * Throws on Supabase error (RLS, CHECK violation, missing row).
   */
  static async assignToStaff(
    resourceId: string,
    staffId: string
  ): Promise<Resource> {
    const { data: resource, error } = await (this.supabase as any)
      .from('resources')
      .update({
        assignee_type: 'staff',
        assignee_id: staffId,
        assigned_at: new Date().toISOString(),
        returned_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', resourceId)
      .select()
      .single();

    if (error) {
      console.error('Error assigning resource to staff:', error);
      throw new Error(error.message || 'Failed to assign resource to staff');
    }

    return resource as Resource;
  }

  /**
   * Mark a resource as returned to the pool.
   *
   * Sets assignee_type='none', clears assignee_id, and stamps returned_at=now().
   * assigned_at is intentionally retained so the previous-assignment history is
   * preserved until the next assign call overwrites it.
   *
   * Throws on Supabase error.
   */
  static async markReturned(resourceId: string): Promise<Resource> {
    const { data: resource, error } = await (this.supabase as any)
      .from('resources')
      .update({
        assignee_type: 'none',
        assignee_id: null,
        returned_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', resourceId)
      .select()
      .single();

    if (error) {
      console.error('Error marking resource returned:', error);
      throw new Error(error.message || 'Failed to mark resource returned');
    }

    return resource as Resource;
  }
}
