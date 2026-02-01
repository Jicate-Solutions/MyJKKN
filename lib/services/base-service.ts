// lib/services/base-service.ts
// Base service class with performance optimizations built-in
// All services should extend this for consistent pagination, validation, and timeout handling

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  validatePagination,
  calculatePaginationMetadata,
  sanitizeSearch,
  withTimeout,
  QUERY_TIMEOUTS,
  logSlowQuery,
  PERFORMANCE_THRESHOLDS,
  type PaginationMetadata,
} from '@/lib/config/pagination';

/**
 * Standard filters for list queries
 */
export interface BaseFilters {
  institution_id?: string;
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

/**
 * Standard list response with pagination metadata
 */
export interface BaseListResponse<T> {
  data: T[];
  metadata: PaginationMetadata;
}

/**
 * Base service class with performance-optimized query patterns
 * Extend this class to get automatic pagination, timeouts, and validation
 */
export abstract class BaseService {
  protected static supabase: any = createClientSupabaseClient();

  /**
   * Execute a list query with automatic pagination validation and timeout
   *
   * @param tableName - Supabase table name
   * @param filters - Filter parameters including pagination
   * @param select - Select clause (default: '*')
   * @param applyFilters - Callback to apply additional filters
   * @returns Paginated list response
   *
   * @example
   * ```typescript
   * return this.executeListQuery(
   *   'billing_copq_incidents',
   *   filters,
   *   '*',
   *   (query) => {
   *     if (filters.status) query = query.eq('status', filters.status);
   *     return query;
   *   }
   * );
   * ```
   */
  protected static async executeListQuery<T>(
    tableName: string,
    filters: BaseFilters,
    select: string = '*',
    applyFilters?: (query: any) => any
  ): Promise<BaseListResponse<T>> {
    const startTime = performance.now();

    // SECURITY: Validate pagination
    const { page, limit } = validatePagination(filters.page, filters.limit);

    try {
      let query = this.supabase
        .from(tableName)
        .select(select, { count: 'exact' });

      // SECURITY: Require institution_id for multi-tenant queries
      if (!filters.institution_id) {
        throw new Error('Institution ID is required for list queries');
      }
      query = query.eq('institution_id', filters.institution_id);

      // Apply additional filters via callback
      if (applyFilters) {
        query = applyFilters(query);
      }

      // SECURITY: Sanitize search if provided
      if (filters.search) {
        const sanitized = sanitizeSearch(filters.search);
        // Note: Caller should add OR conditions for search fields
        // This is intentionally not applied here to allow flexibility
      }

      // Apply sorting
      const sortBy = filters.sortBy || 'created_at';
      const sortDirection = filters.sortDirection || 'desc';
      query = query.order(sortBy, { ascending: sortDirection === 'asc' });

      // ALWAYS apply pagination
      const start = (page - 1) * limit;
      const end = start + limit - 1;
      query = query.range(start, end);

      // Execute with timeout
      const { data, count, error } = await withTimeout(
        query,
        QUERY_TIMEOUTS.LIST,
        `List query for ${tableName} timed out`
      );

      if (error) {
        throw new Error(`Failed to fetch ${tableName}: ${error.message}`);
      }

      logSlowQuery(`${tableName}.list`, startTime, PERFORMANCE_THRESHOLDS.LIST);

      return {
        data: (data || []) as T[],
        metadata: calculatePaginationMetadata(count || 0, page, limit),
      };
    } catch (error) {
      console.error(`[${tableName}] Error in list query:`, error);
      throw error;
    }
  }

  /**
   * Execute a single record query with timeout and institution validation
   *
   * @param tableName - Supabase table name
   * @param id - Record ID
   * @param institutionId - Optional institution ID for security check
   * @param select - Select clause (default: '*')
   * @returns Single record
   */
  protected static async executeSingleQuery<T>(
    tableName: string,
    id: string,
    institutionId?: string,
    select: string = '*'
  ): Promise<T> {
    const startTime = performance.now();

    try {
      let query = this.supabase
        .from(tableName)
        .select(select)
        .eq('id', id);

      // SECURITY: Filter by institution if provided
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await withTimeout(
        query.single(),
        QUERY_TIMEOUTS.SINGLE,
        `Single query for ${tableName} timed out`
      );

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error(`${tableName} not found or access denied`);
        }
        throw new Error(`Failed to fetch ${tableName}: ${error.message}`);
      }

      if (!data) {
        throw new Error(`${tableName} not found`);
      }

      logSlowQuery(`${tableName}.single`, startTime, PERFORMANCE_THRESHOLDS.SINGLE);

      return data as T;
    } catch (error) {
      console.error(`[${tableName}] Error in single query:`, error);
      throw error;
    }
  }

  /**
   * Execute a dashboard RPC with timeout and fallback
   *
   * @param functionName - Database function name
   * @param params - Function parameters
   * @param fallback - Fallback function if RPC fails
   * @returns Dashboard data
   */
  protected static async executeDashboardRPC<T>(
    functionName: string,
    params: Record<string, any>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now();

    try {
      const { data, error } = await withTimeout(
        this.supabase.rpc(functionName, params),
        QUERY_TIMEOUTS.DASHBOARD,
        `Dashboard function ${functionName} timed out`
      );

      if (error) {
        console.warn(`[${functionName}] DB function failed:`, error);
        if (fallback) {
          return fallback();
        }
        throw new Error(`Dashboard function failed: ${error.message}`);
      }

      logSlowQuery(`${functionName}.rpc`, startTime, PERFORMANCE_THRESHOLDS.DASHBOARD);

      return data as T;
    } catch (error) {
      console.error(`[${functionName}] Error in dashboard query:`, error);
      if (fallback) {
        console.log(`[${functionName}] Using fallback calculation`);
        return fallback();
      }
      throw error;
    }
  }

  /**
   * Execute a create operation with validation
   *
   * @param tableName - Supabase table name
   * @param data - Data to insert
   * @param select - Select clause for return value
   * @returns Created record
   */
  protected static async executeCreate<T, D>(
    tableName: string,
    data: D,
    select: string = '*'
  ): Promise<T> {
    try {
      const { data: result, error } = await withTimeout(
        this.supabase.from(tableName).insert(data).select(select).single(),
        QUERY_TIMEOUTS.DEFAULT,
        `Create operation for ${tableName} timed out`
      );

      if (error) {
        // Handle common errors
        if (error.code === '23505') {
          throw new Error(`Duplicate record in ${tableName}`);
        }
        if (error.code === '23503') {
          throw new Error(`Referenced record not found`);
        }
        throw new Error(`Failed to create ${tableName}: ${error.message}`);
      }

      return result as T;
    } catch (error) {
      console.error(`[${tableName}] Error in create:`, error);
      throw error;
    }
  }

  /**
   * Execute an update operation with validation
   *
   * @param tableName - Supabase table name
   * @param id - Record ID
   * @param updates - Data to update
   * @param institutionId - Optional institution ID for security check
   * @param select - Select clause for return value
   * @returns Updated record
   */
  protected static async executeUpdate<T, D>(
    tableName: string,
    id: string,
    updates: D,
    institutionId?: string,
    select: string = '*'
  ): Promise<T> {
    try {
      let query = this.supabase
        .from(tableName)
        .update(updates)
        .eq('id', id);

      // SECURITY: Filter by institution if provided
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await withTimeout(
        query.select(select).single(),
        QUERY_TIMEOUTS.DEFAULT,
        `Update operation for ${tableName} timed out`
      );

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error(`${tableName} not found or access denied`);
        }
        throw new Error(`Failed to update ${tableName}: ${error.message}`);
      }

      return data as T;
    } catch (error) {
      console.error(`[${tableName}] Error in update:`, error);
      throw error;
    }
  }

  /**
   * Execute a delete operation with validation
   *
   * @param tableName - Supabase table name
   * @param id - Record ID
   * @param institutionId - Optional institution ID for security check
   */
  protected static async executeDelete(
    tableName: string,
    id: string,
    institutionId?: string
  ): Promise<void> {
    try {
      let query = this.supabase.from(tableName).delete().eq('id', id);

      // SECURITY: Filter by institution if provided
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { error } = await withTimeout(
        query,
        QUERY_TIMEOUTS.DEFAULT,
        `Delete operation for ${tableName} timed out`
      );

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error(`${tableName} not found or access denied`);
        }
        if (error.code === '23503') {
          throw new Error(`Cannot delete ${tableName} - referenced by other records`);
        }
        throw new Error(`Failed to delete ${tableName}: ${error.message}`);
      }
    } catch (error) {
      console.error(`[${tableName}] Error in delete:`, error);
      throw error;
    }
  }

  /**
   * Sanitize search string for safe use in queries
   * Exposed as protected method for subclasses
   */
  protected static sanitize(search?: string | null): string {
    return sanitizeSearch(search);
  }

  /**
   * Validate pagination parameters
   * Exposed as protected method for subclasses
   */
  protected static validate(page?: number | null, limit?: number | null) {
    return validatePagination(page, limit);
  }
}
