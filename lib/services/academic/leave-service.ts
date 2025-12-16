// lib/services/academic/leave-service.ts
// Leave Service for managing institution leaves
// Created: 2025-12-16
//
// Access Control: Uses profiles.institution_id (NOT user_institution_access)

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  InstitutionLeave,
  CreateLeaveDto,
  UpdateLeaveDto,
  LeaveFilters,
  LeaveListResponse,
  LeaveStatus
} from '@/types/leaves';

export class LeaveService {
  private static supabase = createClientSupabaseClient();

  /**
   * Create a new institution leave
   */
  static async createLeave(data: CreateLeaveDto): Promise<InstitutionLeave> {
    try {
      // Validate no overlapping approved leaves exist
      const hasOverlap = await this.checkOverlappingLeaves(
        data.institution_id,
        data.start_date,
        data.end_date,
        data.scope_level,
        data.department_ids,
        data.semester_ids,
        data.section_ids
      );

      if (hasOverlap) {
        throw new Error('An overlapping approved leave already exists for this scope');
      }

      const { data: leave, error } = await this.supabase
        .from('institution_leaves')
        .insert([data])
        .select(
          `
          *,
          leave_type:leave_types(id, leave_type_name, color_code)
        `
        )
        .single();

      if (error) {
        logger.error('academic/leaves', 'Database error creating leave', error);
        const enhancedError: any = new Error(
          error.message || 'Failed to create leave'
        );
        enhancedError.code = error.code;
        enhancedError.details = error.details;
        throw enhancedError;
      }

      return leave;
    } catch (error) {
      logger.error('academic/leaves', 'Error creating leave', error);
      throw error;
    }
  }

  /**
   * Update an existing leave
   */
  static async updateLeave(
    id: string,
    data: UpdateLeaveDto
  ): Promise<InstitutionLeave> {
    try {
      const { data: leave, error } = await this.supabase
        .from('institution_leaves')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(
          `
          *,
          leave_type:leave_types(id, leave_type_name, color_code)
        `
        )
        .single();

      if (error) {
        logger.error('academic/leaves', 'Database error updating leave', error);
        const enhancedError: any = new Error(
          error.message || 'Failed to update leave'
        );
        enhancedError.code = error.code;
        enhancedError.details = error.details;
        throw enhancedError;
      }

      return leave;
    } catch (error) {
      logger.error('academic/leaves', 'Error updating leave', error);
      throw error;
    }
  }

  /**
   * Delete a leave
   */
  static async deleteLeave(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('institution_leaves')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('academic/leaves', 'Database error deleting leave', error);
        throw error;
      }
    } catch (error) {
      logger.error('academic/leaves', 'Error deleting leave', error);
      throw error;
    }
  }

  /**
   * Get a single leave by ID
   */
  static async getLeave(id: string): Promise<InstitutionLeave> {
    try {
      const { data: leave, error } = await this.supabase
        .from('institution_leaves')
        .select(
          `
          *,
          leave_type:leave_types(id, leave_type_name, leave_type_code, color_code, requires_approval),
          approvals:leave_approvals(
            id,
            action,
            comments,
            acted_at
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return leave;
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching leave', error);
      throw error;
    }
  }

  /**
   * Get leaves (basic query)
   */
  static async getLeaves(
    filters: LeaveFilters = {}
  ): Promise<LeaveListResponse> {
    try {
      let query = this.supabase.from('institution_leaves').select(
        `
          *,
          leave_type:leave_types(id, leave_type_name, leave_type_code, color_code)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.leave_type_id) {
        query = query.eq('leave_type_id', filters.leave_type_id);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.scope_level) {
        query = query.eq('scope_level', filters.scope_level);
      }

      if (filters.department_id) {
        query = query.contains('department_ids', [filters.department_id]);
      }

      if (filters.semester_id) {
        query = query.contains('semester_ids', [filters.semester_id]);
      }

      if (filters.section_id) {
        query = query.contains('section_ids', [filters.section_id]);
      }

      if (filters.start_date) {
        query = query.gte('start_date', filters.start_date);
      }

      if (filters.end_date) {
        query = query.lte('end_date', filters.end_date);
      }

      if (filters.academic_year_id) {
        query = query.eq('academic_year_id', filters.academic_year_id);
      }

      if (filters.requested_by) {
        query = query.eq('requested_by', filters.requested_by);
      }

      if (filters.search) {
        query = query.ilike('leave_name', `%${filters.search}%`);
      }

      // Apply sorting
      if (filters.sortBy) {
        const direction = filters.sortDirection || 'desc';
        query = query.order(filters.sortBy, { ascending: direction === 'asc' });
      } else {
        query = query.order('start_date', { ascending: false });
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
      logger.error('academic/leaves', 'Error fetching leaves', error);
      throw error;
    }
  }

  /**
   * Get leaves with access control
   */
  static async getLeavesWithAccess(
    filters: LeaveFilters = {},
    userInstitutionId?: string | null,
    isSuperAdmin: boolean = false
  ): Promise<LeaveListResponse> {
    try {
      let query = this.supabase.from('institution_leaves').select(
        `
          *,
          leave_type:leave_types(id, leave_type_name, leave_type_code, color_code)
        `,
        { count: 'exact' }
      );

      // Apply institution filter based on user permissions
      if (!isSuperAdmin && userInstitutionId) {
        query = query.eq('institution_id', userInstitutionId);
      } else if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      // Apply other filters
      if (filters.leave_type_id) {
        query = query.eq('leave_type_id', filters.leave_type_id);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.scope_level) {
        query = query.eq('scope_level', filters.scope_level);
      }

      if (filters.department_id) {
        query = query.contains('department_ids', [filters.department_id]);
      }

      if (filters.semester_id) {
        query = query.contains('semester_ids', [filters.semester_id]);
      }

      if (filters.section_id) {
        query = query.contains('section_ids', [filters.section_id]);
      }

      if (filters.start_date) {
        query = query.gte('start_date', filters.start_date);
      }

      if (filters.end_date) {
        query = query.lte('end_date', filters.end_date);
      }

      if (filters.search) {
        query = query.ilike('leave_name', `%${filters.search}%`);
      }

      // Apply sorting
      query = query.order('start_date', { ascending: false });

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
      logger.error('academic/leaves', 'Error fetching leaves with access', error);
      throw error;
    }
  }

  /**
   * Approve a leave
   */
  static async approveLeave(
    id: string,
    approverId: string,
    comments?: string
  ): Promise<InstitutionLeave> {
    try {
      // Update the leave status
      const { data: leave, error } = await this.supabase
        .from('institution_leaves')
        .update({
          status: 'approved' as LeaveStatus,
          approved_by: approverId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Create approval record
      await this.supabase.from('leave_approvals').insert([
        {
          leave_id: id,
          approver_id: approverId,
          action: 'approved',
          comments,
          acted_at: new Date().toISOString()
        }
      ]);

      return leave;
    } catch (error) {
      logger.error('academic/leaves', 'Error approving leave', error);
      throw error;
    }
  }

  /**
   * Reject a leave
   */
  static async rejectLeave(
    id: string,
    approverId: string,
    reason: string
  ): Promise<InstitutionLeave> {
    try {
      const { data: leave, error } = await this.supabase
        .from('institution_leaves')
        .update({
          status: 'rejected' as LeaveStatus,
          rejection_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Create approval record
      await this.supabase.from('leave_approvals').insert([
        {
          leave_id: id,
          approver_id: approverId,
          action: 'rejected',
          comments: reason,
          acted_at: new Date().toISOString()
        }
      ]);

      return leave;
    } catch (error) {
      logger.error('academic/leaves', 'Error rejecting leave', error);
      throw error;
    }
  }

  /**
   * Cancel a leave
   */
  static async cancelLeave(id: string): Promise<InstitutionLeave> {
    try {
      const { data: leave, error } = await this.supabase
        .from('institution_leaves')
        .update({
          status: 'cancelled' as LeaveStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return leave;
    } catch (error) {
      logger.error('academic/leaves', 'Error cancelling leave', error);
      throw error;
    }
  }

  /**
   * Check for overlapping leaves
   */
  static async checkOverlappingLeaves(
    institutionId: string,
    startDate: string,
    endDate: string,
    scopeLevel: string,
    departmentIds?: string[],
    semesterIds?: string[],
    sectionIds?: string[],
    excludeId?: string
  ): Promise<boolean> {
    try {
      let query = this.supabase
        .from('institution_leaves')
        .select('id')
        .eq('institution_id', institutionId)
        .eq('status', 'approved')
        .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);

      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      // Check for scope overlap
      if (scopeLevel === 'institution') {
        query = query.eq('scope_level', 'institution');
      }

      const { data, error } = await query.limit(1);

      if (error) throw error;

      return (data?.length || 0) > 0;
    } catch (error) {
      logger.error('academic/leaves', 'Error checking overlapping leaves', error);
      throw error;
    }
  }

  /**
   * Get pending leaves for approval
   */
  static async getPendingLeaves(
    institutionId: string,
    limit: number = 10
  ): Promise<InstitutionLeave[]> {
    try {
      const { data, error } = await this.supabase
        .from('institution_leaves')
        .select(
          `
          *,
          leave_type:leave_types(id, leave_type_name, color_code)
        `
        )
        .eq('institution_id', institutionId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching pending leaves', error);
      throw error;
    }
  }

  /**
   * Get upcoming approved leaves
   */
  static async getUpcomingLeaves(
    institutionId: string,
    days: number = 30
  ): Promise<InstitutionLeave[]> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const { data, error } = await this.supabase
        .from('institution_leaves')
        .select(
          `
          *,
          leave_type:leave_types(id, leave_type_name, color_code)
        `
        )
        .eq('institution_id', institutionId)
        .eq('status', 'approved')
        .gte('start_date', today)
        .lte('start_date', futureDate)
        .order('start_date', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching upcoming leaves', error);
      throw error;
    }
  }

  /**
   * Bulk delete leaves
   */
  static async bulkDeleteLeaves(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const id of ids) {
      try {
        await this.deleteLeave(id);
        success.push(id);
      } catch (error) {
        logger.error('academic/leaves', `Error deleting leave ${id}`, error);
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { success, failed };
  }
}
