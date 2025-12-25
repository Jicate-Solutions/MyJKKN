// lib/services/academic/leave-type-service.ts
// Leave Type Service for managing leave categories
// Created: 2025-12-16
//
// Access Control: Uses profiles.institution_id (NOT user_institution_access)

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  LeaveType,
  CreateLeaveTypeDto,
  UpdateLeaveTypeDto,
  LeaveTypeFilters,
  LeaveTypeListResponse
} from '@/types/leaves';

export class LeaveTypeService {
  private static supabase = createClientSupabaseClient();

  /**
   * Create a new leave type
   */
  static async createLeaveType(data: CreateLeaveTypeDto): Promise<LeaveType> {
    try {
      const insertQuery: any = this.supabase.from('leave_types');
      const { data: leaveType, error } = await insertQuery
        .insert([data])
        .select()
        .single();

      if (error) {
        logger.error('academic/leaves', 'Database error creating leave type', error);
        const enhancedError: any = new Error(
          error.message || 'Failed to create leave type'
        );
        enhancedError.code = error.code;
        enhancedError.details = error.details;
        throw enhancedError;
      }

      return leaveType as LeaveType;
    } catch (error) {
      logger.error('academic/leaves', 'Error creating leave type', error);
      throw error;
    }
  }

  /**
   * Update an existing leave type
   */
  static async updateLeaveType(
    id: string,
    data: UpdateLeaveTypeDto
  ): Promise<LeaveType> {
    try {
      const updateQuery: any = this.supabase.from('leave_types');
      const { data: leaveType, error } = await updateQuery
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('academic/leaves', 'Database error updating leave type', error);
        const enhancedError: any = new Error(
          error.message || 'Failed to update leave type'
        );
        enhancedError.code = error.code;
        enhancedError.details = error.details;
        throw enhancedError;
      }

      return leaveType as LeaveType;
    } catch (error) {
      logger.error('academic/leaves', 'Error updating leave type', error);
      throw error;
    }
  }

  /**
   * Delete a leave type
   */
  static async deleteLeaveType(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('leave_types')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('academic/leaves', 'Database error deleting leave type', error);
        throw error;
      }
    } catch (error) {
      logger.error('academic/leaves', 'Error deleting leave type', error);
      throw error;
    }
  }

  /**
   * Get a single leave type by ID
   */
  static async getLeaveType(id: string): Promise<LeaveType> {
    try {
      const { data: leaveType, error } = await this.supabase
        .from('leave_types')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      return leaveType;
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching leave type', error);
      throw error;
    }
  }

  /**
   * Get leave types (basic query)
   */
  static async getLeaveTypes(
    filters: LeaveTypeFilters = {}
  ): Promise<LeaveTypeListResponse> {
    try {
      let query = (this.supabase as any).from('leave_types').select('*', { count: 'exact' });

      // Apply filters
      if (filters.search) {
        query = query.or(
          `leave_type_name.ilike.%${filters.search}%,leave_type_code.ilike.%${filters.search}%`
        );
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      // Apply sorting
      if (filters.sortBy) {
        const direction = filters.sortDirection || 'asc';
        query = query.order(filters.sortBy, { ascending: direction === 'asc' });
      } else {
        query = query.order('leave_type_name', { ascending: true });
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const start = (page - 1) * limit;

      query = query.range(start, start + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching leave types', error);
      throw error;
    }
  }

  /**
   * Get leave types with access control
   */
  static async getLeaveTypesWithAccess(
    filters: LeaveTypeFilters = {},
    userInstitutionId?: string | null,
    isSuperAdmin: boolean = false
  ): Promise<LeaveTypeListResponse> {
    try {
      let query = (this.supabase as any).from('leave_types').select('*', { count: 'exact' });

      // Apply institution filter based on user permissions
      if (!isSuperAdmin && userInstitutionId) {
        query = query.eq('institution_id', userInstitutionId);
      } else if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      // Apply search filter
      if (filters.search) {
        query = query.or(
          `leave_type_name.ilike.%${filters.search}%,leave_type_code.ilike.%${filters.search}%`
        );
      }

      // Apply active filter
      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      // Apply sorting
      query = query.order('leave_type_name', { ascending: true });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const offset = (page - 1) * limit;

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        data: data || [],
        metadata: {
          total,
          page,
          limit,
          totalPages
        }
      };
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching leave types with access', error);
      throw error;
    }
  }

  /**
   * Get all active leave types for an institution (for dropdowns)
   */
  static async getActiveLeaveTypes(institutionId: string): Promise<LeaveType[]> {
    try {
      const { data, error } = await this.supabase
        .from('leave_types')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('leave_type_name', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching active leave types', error);
      throw error;
    }
  }

  /**
   * Bulk delete leave types
   */
  static async bulkDeleteLeaveTypes(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const id of ids) {
      try {
        await this.deleteLeaveType(id);
        success.push(id);
      } catch (error) {
        logger.error('academic/leaves', `Error deleting leave type ${id}`, error);
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { success, failed };
  }

  /**
   * Check if leave type code exists for institution
   */
  static async isLeaveTypeCodeExists(
    institutionId: string,
    code: string,
    excludeId?: string
  ): Promise<boolean> {
    try {
      let query = this.supabase
        .from('leave_types')
        .select('id')
        .eq('institution_id', institutionId)
        .eq('leave_type_code', code);

      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data?.length || 0) > 0;
    } catch (error) {
      logger.error('academic/leaves', 'Error checking leave type code', error);
      throw error;
    }
  }
}
