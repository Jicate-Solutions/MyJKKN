/**
 * EXAMPLE SERVICE WITH COMPREHENSIVE ERROR HANDLING
 *
 * This is a template demonstrating proper error handling patterns.
 * Use this as a reference when updating existing services.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  ValidationError,
  NotFoundError,
  DatabaseError,
  AuthenticationError,
  AuthorizationError,
  fromSupabaseError,
} from '@/lib/errors/app-errors';
import { ErrorLogger } from '@/lib/utils/error-logger';

export class ExampleService {
  private static supabase = createClientSupabaseClient();

  /**
   * CREATE operation with comprehensive error handling
   */
  static async createResource(
    data: {
      name: string;
      description?: string;
      institution_id: string;
    }
  ) {
    try {
      // 1. INPUT VALIDATION
      if (!data.name || data.name.trim().length === 0) {
        throw new ValidationError('Name is required');
      }

      if (!data.institution_id) {
        throw new ValidationError('Institution ID is required');
      }

      // Validate UUID format if needed
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(data.institution_id)) {
        throw new ValidationError('Invalid institution ID format');
      }

      // 2. AUTHENTICATION CHECK
      const {
        data: { user },
        error: authError,
      } = await this.supabase.auth.getUser();

      if (authError || !user) {
        throw new AuthenticationError('You must be logged in to create a resource');
      }

      // 3. DATABASE OPERATION
      const { data: resource, error: dbError } = await this.supabase
        .from('example_table')
        .insert({
          ...data,
          created_by: user.id,
        })
        .select('*')
        .single();

      // 4. HANDLE DATABASE ERRORS
      if (dbError) {
        throw fromSupabaseError(dbError, 'Resource');
      }

      if (!resource) {
        throw new DatabaseError('Failed to create resource - no data returned');
      }

      // 5. SUCCESS - Return data
      return resource;
    } catch (error) {
      // 6. LOG ERROR WITH CONTEXT
      ErrorLogger.log(error as Error, {
        method: 'ExampleService.createResource',
        institutionId: data.institution_id,
        userId: 'redacted', // Don't log sensitive data
      });

      // 7. RE-THROW - Let caller handle
      throw error;
    }
  }

  /**
   * READ operation with comprehensive error handling
   */
  static async getResource(id: string, institutionId?: string) {
    try {
      // 1. INPUT VALIDATION
      if (!id) {
        throw new ValidationError('Resource ID is required');
      }

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        throw new ValidationError('Invalid resource ID format');
      }

      // 2. BUILD QUERY
      let query = this.supabase
        .from('example_table')
        .select('*')
        .eq('id', id);

      // 3. AUTHORIZATION - Filter by institution
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      // 4. EXECUTE QUERY
      const { data, error } = await query.single();

      // 5. HANDLE ERRORS
      if (error) {
        throw fromSupabaseError(error, 'Resource');
      }

      if (!data) {
        throw new NotFoundError('Resource');
      }

      // 6. SUCCESS
      return data;
    } catch (error) {
      // 7. LOG AND RE-THROW
      ErrorLogger.log(error as Error, {
        method: 'ExampleService.getResource',
        id,
        institutionId,
      });
      throw error;
    }
  }

  /**
   * LIST operation with comprehensive error handling
   */
  static async listResources(filters: {
    institution_id: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    try {
      // 1. INPUT VALIDATION
      if (!filters.institution_id) {
        throw new ValidationError('Institution ID is required');
      }

      const page = Math.max(1, filters.page || 1);
      const limit = Math.min(100, Math.max(1, filters.limit || 10)); // Cap at 100

      // 2. BUILD QUERY
      let query = this.supabase
        .from('example_table')
        .select('*', { count: 'exact' })
        .eq('institution_id', filters.institution_id)
        .order('created_at', { ascending: false });

      // 3. APPLY SEARCH FILTER (Sanitized)
      if (filters.search) {
        const sanitizedSearch = this.sanitizeSearch(filters.search);
        query = query.ilike('name', `%${sanitizedSearch}%`);
      }

      // 4. APPLY PAGINATION
      const start = (page - 1) * limit;
      const end = start + limit - 1;
      query = query.range(start, end);

      // 5. EXECUTE QUERY
      const { data, count, error } = await query;

      // 6. HANDLE ERRORS
      if (error) {
        throw fromSupabaseError(error, 'Resources list');
      }

      // 7. SUCCESS
      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      // 8. LOG AND RE-THROW
      ErrorLogger.log(error as Error, {
        method: 'ExampleService.listResources',
        institutionId: filters.institution_id,
        search: filters.search,
      });
      throw error;
    }
  }

  /**
   * UPDATE operation with comprehensive error handling
   */
  static async updateResource(
    id: string,
    updates: {
      name?: string;
      description?: string;
    },
    institutionId?: string
  ) {
    try {
      // 1. INPUT VALIDATION
      if (!id) {
        throw new ValidationError('Resource ID is required');
      }

      if (!updates || Object.keys(updates).length === 0) {
        throw new ValidationError('No updates provided');
      }

      if (updates.name !== undefined && updates.name.trim().length === 0) {
        throw new ValidationError('Name cannot be empty');
      }

      // 2. BUILD QUERY
      let query = this.supabase
        .from('example_table')
        .update(updates)
        .eq('id', id);

      // 3. AUTHORIZATION - Filter by institution
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      // 4. EXECUTE UPDATE
      const { data, error } = await query.select('*').single();

      // 5. HANDLE ERRORS
      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('Resource or access denied');
        }
        throw fromSupabaseError(error, 'Resource update');
      }

      if (!data) {
        throw new NotFoundError('Resource');
      }

      // 6. SUCCESS
      return data;
    } catch (error) {
      // 7. LOG AND RE-THROW
      ErrorLogger.log(error as Error, {
        method: 'ExampleService.updateResource',
        id,
        institutionId,
      });
      throw error;
    }
  }

  /**
   * DELETE operation with comprehensive error handling
   */
  static async deleteResource(id: string, institutionId?: string): Promise<void> {
    try {
      // 1. INPUT VALIDATION
      if (!id) {
        throw new ValidationError('Resource ID is required');
      }

      // 2. CHECK IF RESOURCE EXISTS AND USER HAS ACCESS
      await this.getResource(id, institutionId);

      // 3. BUILD DELETE QUERY
      let query = this.supabase
        .from('example_table')
        .delete()
        .eq('id', id);

      // 4. AUTHORIZATION - Filter by institution
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      // 5. EXECUTE DELETE
      const { error } = await query;

      // 6. HANDLE ERRORS
      if (error) {
        throw fromSupabaseError(error, 'Resource deletion');
      }

      // 7. SUCCESS (void return)
    } catch (error) {
      // 8. LOG AND RE-THROW
      ErrorLogger.log(error as Error, {
        method: 'ExampleService.deleteResource',
        id,
        institutionId,
      });
      throw error;
    }
  }

  /**
   * SECURITY: Sanitize search input to prevent SQL injection
   */
  private static sanitizeSearch(input: string): string {
    if (!input) return '';
    // Escape SQL ILIKE wildcards (%) and single-character wildcards (_)
    // Also escape backslash to prevent escape sequence injection
    return input.replace(/[%_\\]/g, '\\$&');
  }

  /**
   * BUSINESS LOGIC operation with error handling
   */
  static async performBusinessOperation(
    resourceId: string,
    institutionId: string
  ) {
    try {
      // 1. GET RESOURCE
      const resource = await this.getResource(resourceId, institutionId);

      // 2. BUSINESS LOGIC VALIDATION
      if (resource.status === 'archived') {
        throw new ValidationError('Cannot perform operation on archived resource');
      }

      // 3. PERFORM OPERATION
      const result = await this.updateResource(
        resourceId,
        { status: 'processed' },
        institutionId
      );

      // 4. LOG INFO (not error)
      ErrorLogger.info('Business operation completed', {
        method: 'ExampleService.performBusinessOperation',
        resourceId,
        institutionId,
      });

      // 5. SUCCESS
      return result;
    } catch (error) {
      // 6. LOG AND RE-THROW
      ErrorLogger.log(error as Error, {
        method: 'ExampleService.performBusinessOperation',
        resourceId,
        institutionId,
      });
      throw error;
    }
  }
}

/**
 * KEY PRINCIPLES:
 *
 * 1. VALIDATE INPUT - Check all parameters before database operations
 * 2. SPECIFIC ERRORS - Use custom error classes (ValidationError, NotFoundError, etc.)
 * 3. LOG WITH CONTEXT - Include method name, IDs, but NOT sensitive data
 * 4. RE-THROW - Let the caller (API route) handle the response
 * 5. SANITIZE INPUT - Prevent SQL injection in search queries
 * 6. AUTHORIZATION - Always filter by institution_id when provided
 * 7. USE fromSupabaseError - Convert Supabase errors to custom errors
 * 8. DON'T EXPOSE INTERNALS - Generic errors for non-operational issues
 */
