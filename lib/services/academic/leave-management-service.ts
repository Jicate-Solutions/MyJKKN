// lib/services/academic/leave-management-service.ts
// Consolidated Leave Management Service (Family A)
// Merged: 2026-02-28
//
// Consolidates 5 original files into one class:
//   - leave-type-service.ts       (LeaveTypeService)
//   - leave-service.ts            (LeaveService)
//   - leave-approval-service.ts   (LeaveApprovalService)
//   - leave-calendar-service.ts   (LeaveCalendarService)
//   - leave-attendance-integration.ts (LeaveAttendanceIntegration)
//
// Each original file is now a re-export compatibility shim.
// Access Control: Uses profiles.institution_id (NOT user_institution_access)

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { logActivityClient, AcademicActivityTemplates } from '@/lib/utils/activity-logger-client';
import type {
  LeaveType,
  CreateLeaveTypeDto,
  UpdateLeaveTypeDto,
  LeaveTypeFilters,
  LeaveTypeListResponse,
  InstitutionLeave,
  CreateLeaveDto,
  UpdateLeaveDto,
  LeaveFilters,
  LeaveListResponse,
  LeaveStatus,
  LeaveApproval,
  LeaveApprovalChain,
  CreateApprovalChainDto,
  UpdateApprovalChainDto,
  PendingApproval,
  ProcessApprovalDto,
  LeaveScopeLevel,
  CalendarLeave,
  CalendarDayInfo,
  MonthlyCalendarData,
  LeaveCalendarFilters,
  AttendanceLeaveCheck,
  AttendanceLeaveResult,
  LeaveBlockInfo,
} from '@/types/leaves';

export class LeaveManagementService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEAVE TYPE MANAGEMENT (from leave-type-service.ts)
  // ═══════════════════════════════════════════════════════════════════════════

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

      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id) return;
          const typeName = leaveType.leave_type_name || leaveType.id;
          const template = AcademicActivityTemplates.leaveTypeCreated(typeName);
          await logActivityClient({
            userId: user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: leaveType.id,
            resourceName: typeName,
            description: template.description,
            metadata: { sub_type: template.sub_type },
            institutionId: leaveType.institution_id,
          });
        } catch { /* never block */ }
      })();

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

      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id) return;
          const typeName = leaveType.leave_type_name || leaveType.id;
          const template = AcademicActivityTemplates.leaveTypeUpdated(typeName, Object.keys(data));
          await logActivityClient({
            userId: user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: leaveType.id,
            resourceName: typeName,
            description: template.description,
            metadata: { sub_type: template.sub_type, changed_fields: Object.keys(data) },
            institutionId: leaveType.institution_id,
          });
        } catch { /* never block */ }
      })();

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
      let typeNameForLog = id;
      let typeInstitutionIdForLog: string | undefined;
      try {
        const { data: existingType } = await this.supabase
          .from('leave_types')
          .select('leave_type_name, institution_id')
          .eq('id', id)
          .single();
        typeNameForLog = existingType?.leave_type_name || id;
        typeInstitutionIdForLog = existingType?.institution_id;
      } catch { /* ignore */ }

      const { error } = await this.supabase
        .from('leave_types')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('academic/leaves', 'Database error deleting leave type', error);
        throw error;
      }

      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id) return;
          const template = AcademicActivityTemplates.leaveTypeDeleted(typeNameForLog);
          await logActivityClient({
            userId: user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: id,
            resourceName: typeNameForLog,
            description: template.description,
            metadata: { sub_type: template.sub_type },
            institutionId: typeInstitutionIdForLog,
          });
        } catch { /* never block */ }
      })();
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

  // ═══════════════════════════════════════════════════════════════════════════
  // INSTITUTION LEAVE MANAGEMENT (from leave-service.ts)
  // ═══════════════════════════════════════════════════════════════════════════

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
        .insert([data] as any)
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

      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id) return;
          const leaveTypeName = (leave as any).leave_type?.leave_type_name || 'Leave';
          const template = AcademicActivityTemplates.leaveCreated(leaveTypeName);
          await logActivityClient({
            userId: user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: (leave as any).id,
            resourceName: leaveTypeName,
            description: template.description,
            metadata: { sub_type: template.sub_type, start_date: (leave as any).start_date, end_date: (leave as any).end_date },
            institutionId: (leave as any).institution_id,
          });
        } catch { /* never block */ }
      })();

      return leave as unknown as InstitutionLeave;
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
      const { data: leave, error } = await (this.supabase as any)
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

      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id) return;
          const leaveTypeName = (leave as any).leave_type?.leave_type_name || 'Leave';
          const template = AcademicActivityTemplates.leaveUpdated(leaveTypeName, Object.keys(data));
          await logActivityClient({
            userId: user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: (leave as any).id,
            resourceName: leaveTypeName,
            description: template.description,
            metadata: { sub_type: template.sub_type, changed_fields: Object.keys(data) },
            institutionId: (leave as any).institution_id,
          });
        } catch { /* never block */ }
      })();

      return leave as unknown as InstitutionLeave;
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
      let leaveInstitutionIdForLog: string | undefined;
      try {
        const { data: existingLeave } = await this.supabase
          .from('institution_leaves')
          .select('institution_id')
          .eq('id', id)
          .single();
        leaveInstitutionIdForLog = existingLeave?.institution_id;
      } catch { /* ignore */ }

      const { error } = await this.supabase
        .from('institution_leaves')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('academic/leaves', 'Database error deleting leave', error);
        throw error;
      }

      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id) return;
          const template = AcademicActivityTemplates.leaveDeleted(id);
          await logActivityClient({
            userId: user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: id,
            description: template.description,
            metadata: { sub_type: template.sub_type },
            institutionId: leaveInstitutionIdForLog,
          });
        } catch { /* never block */ }
      })();
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
          requested_by_profile:profiles!requested_by(id, full_name, email),
          approved_by_profile:profiles!approved_by(id, full_name, email),
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

      return leave as unknown as InstitutionLeave;
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
      let query = (this.supabase as any).from('institution_leaves').select(
        `
          *,
          leave_type:leave_types(id, leave_type_name, leave_type_code, color_code),
          requested_by_profile:profiles!requested_by(id, full_name, email)
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
        data: (data || []) as unknown as InstitutionLeave[],
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
   *
   * NOTE: Intentionally uses profiles.institution_id (not user_institution_access).
   * The userInstitutionId parameter should be resolved by the caller from
   * profiles.institution_id (matching the access control pattern declared at the top of this file).
   * See AcademicPermissionHelper for the shared resolution utility.
   */
  static async getLeavesWithAccess(
    filters: LeaveFilters = {},
    userInstitutionId?: string | null,
    isSuperAdmin: boolean = false
  ): Promise<LeaveListResponse> {
    try {
      let query = (this.supabase as any).from('institution_leaves').select(
        `
          *,
          leave_type:leave_types(id, leave_type_name, leave_type_code, color_code),
          requested_by_profile:profiles!requested_by(id, full_name, email)
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
        data: (data || []) as unknown as InstitutionLeave[],
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
      const { data: leave, error } = await (this.supabase as any)
        .from('institution_leaves')
        .update({
          status: 'approved' as LeaveStatus,
          approved_by: approverId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(
          `
          *,
          leave_type:leave_types(id, leave_type_name, leave_type_code, color_code)
        `
        )
        .single();

      if (error) throw error;

      // Create approval record
      await (this.supabase as any).from('leave_approvals').insert([
        {
          leave_id: id,
          approver_id: approverId,
          action: 'approved',
          comments,
          acted_at: new Date().toISOString()
        }
      ]);

      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: applicantProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', (leave as any).requested_by)
            .single();
          const applicantName = applicantProfile?.full_name || 'Applicant';
          const leaveTypeName = (leave as any).leave_type?.leave_type_name || 'leave';
          const template = AcademicActivityTemplates.leaveApplicationApproved(applicantName, leaveTypeName);
          await logActivityClient({
            userId: approverId,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: id,
            resourceName: applicantName,
            description: template.description,
            metadata: { sub_type: template.sub_type, leave_type: leaveTypeName, comments },
            institutionId: (leave as any).institution_id,
          });
        } catch { /* never block */ }
      })();

      return leave as unknown as InstitutionLeave;
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
      const { data: leave, error } = await (this.supabase as any)
        .from('institution_leaves')
        .update({
          status: 'rejected' as LeaveStatus,
          rejection_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(
          `
          *,
          leave_type:leave_types(id, leave_type_name, leave_type_code, color_code)
        `
        )
        .single();

      if (error) throw error;

      // Create approval record
      await (this.supabase as any).from('leave_approvals').insert([
        {
          leave_id: id,
          approver_id: approverId,
          action: 'rejected',
          comments: reason,
          acted_at: new Date().toISOString()
        }
      ]);

      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: applicantProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', (leave as any).requested_by)
            .single();
          const applicantName = applicantProfile?.full_name || 'Applicant';
          const leaveTypeName = (leave as any).leave_type?.leave_type_name || 'leave';
          const template = AcademicActivityTemplates.leaveApplicationRejected(applicantName, leaveTypeName);
          await logActivityClient({
            userId: approverId,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: id,
            resourceName: applicantName,
            description: template.description,
            metadata: { sub_type: template.sub_type, leave_type: leaveTypeName, reason },
            institutionId: (leave as any).institution_id,
          });
        } catch { /* never block */ }
      })();

      return leave as unknown as InstitutionLeave;
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
      const { data: leave, error } = await (this.supabase as any)
        .from('institution_leaves')
        .update({
          status: 'cancelled' as LeaveStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(
          `
          *,
          leave_type:leave_types(id, leave_type_name, leave_type_code, color_code)
        `
        )
        .single();

      if (error) throw error;

      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id) return;
          const leaveTypeName = (leave as any).leave_type?.leave_type_name || 'leave';
          const template = AcademicActivityTemplates.leaveApplicationCancelled('User', leaveTypeName);
          await logActivityClient({
            userId: user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: id,
            description: template.description,
            metadata: { sub_type: template.sub_type, leave_type: leaveTypeName },
            institutionId: (leave as any).institution_id,
          });
        } catch { /* never block */ }
      })();

      return leave as unknown as InstitutionLeave;
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

      return ((data as any[])?.length || 0) > 0;
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

      return (data || []) as unknown as InstitutionLeave[];
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

      return (data || []) as unknown as InstitutionLeave[];
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

  // ═══════════════════════════════════════════════════════════════════════════
  // LEAVE APPROVAL WORKFLOW (from leave-approval-service.ts)
  // ═══════════════════════════════════════════════════════════════════════════

  // =====================================================
  // APPROVAL CHAIN MANAGEMENT
  // =====================================================

  /**
   * Create a new approval chain
   */
  static async createApprovalChain(
    data: CreateApprovalChainDto
  ): Promise<LeaveApprovalChain> {
    try {
      const { data: chain, error } = await this.supabase
        .from('leave_approval_chains')
        .insert([data] as any)
        .select()
        .single();

      if (error) {
        logger.error('academic/leaves', 'Database error creating approval chain', error);
        throw error;
      }

      return chain as LeaveApprovalChain;
    } catch (error) {
      logger.error('academic/leaves', 'Error creating approval chain', error);
      throw error;
    }
  }

  /**
   * Update an approval chain
   */
  static async updateApprovalChain(
    id: string,
    data: UpdateApprovalChainDto
  ): Promise<LeaveApprovalChain> {
    try {
      const updatePayload: UpdateApprovalChainDto & { updated_at: string } = {
        ...data,
        updated_at: new Date().toISOString()
      };

      const { data: chain, error } = await (this.supabase as any)
        .from('leave_approval_chains')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return chain as LeaveApprovalChain;
    } catch (error) {
      logger.error('academic/leaves', 'Error updating approval chain', error);
      throw error;
    }
  }

  /**
   * Delete an approval chain
   */
  static async deleteApprovalChain(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('leave_approval_chains')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      logger.error('academic/leaves', 'Error deleting approval chain', error);
      throw error;
    }
  }

  /**
   * Get approval chains for an institution
   */
  static async getApprovalChains(
    institutionId: string,
    leaveTypeId?: string,
    scopeLevel?: LeaveScopeLevel
  ): Promise<LeaveApprovalChain[]> {
    try {
      let query = this.supabase
        .from('leave_approval_chains')
        .select(
          `
          *,
          leave_type:leave_types(id, leave_type_name, color_code)
        `
        )
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('chain_order', { ascending: true });

      if (leaveTypeId) {
        query = query.eq('leave_type_id', leaveTypeId);
      }

      if (scopeLevel) {
        query = query.eq('scope_level', scopeLevel);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []) as unknown as LeaveApprovalChain[];
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching approval chains', error);
      throw error;
    }
  }

  /**
   * Get the approval chain for a specific leave request
   */
  static async getApprovalChainForLeave(
    institutionId: string,
    leaveTypeId: string,
    scopeLevel: LeaveScopeLevel
  ): Promise<LeaveApprovalChain[]> {
    try {
      const { data, error } = await this.supabase
        .from('leave_approval_chains')
        .select(
          `
          *,
          leave_type:leave_types(id, leave_type_name, color_code)
        `
        )
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .or(`leave_type_id.eq.${leaveTypeId},leave_type_id.is.null`)
        .or(`scope_level.eq.${scopeLevel},scope_level.eq.institution`)
        .order('chain_order', { ascending: true });

      if (error) throw error;

      return (data || []) as unknown as LeaveApprovalChain[];
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching approval chain for leave', error);
      throw error;
    }
  }

  // =====================================================
  // APPROVAL PROCESSING
  // =====================================================

  /**
   * Process an approval action (approve/reject)
   */
  static async processApproval(
    data: ProcessApprovalDto
  ): Promise<LeaveApproval> {
    try {
      // Create the approval record
      const { data: approval, error: approvalError } = await this.supabase
        .from('leave_approvals')
        .insert([
          {
            leave_id: data.leave_id,
            approver_id: data.approver_id,
            action: data.action,
            comments: data.comments,
            acted_at: new Date().toISOString()
          }
        ] as any)
        .select()
        .single();

      if (approvalError) throw approvalError;

      // Update the leave status
      const newStatus = data.action === 'approved' ? 'approved' : 'rejected';
      const updateData: {
        status: string;
        updated_at: string;
        approved_by?: string;
        approved_at?: string;
        rejection_reason?: string;
      } = {
        status: newStatus,
        updated_at: new Date().toISOString()
      };

      if (data.action === 'approved') {
        updateData.approved_by = data.approver_id;
        updateData.approved_at = new Date().toISOString();
      } else {
        updateData.rejection_reason = data.comments;
      }

      const { error: leaveError } = await (this.supabase as any)
        .from('institution_leaves')
        .update(updateData)
        .eq('id', data.leave_id);

      if (leaveError) throw leaveError;

      return approval as LeaveApproval;
    } catch (error) {
      logger.error('academic/leaves', 'Error processing approval', error);
      throw error;
    }
  }

  /**
   * Get approvals for a leave
   */
  static async getApprovalsForLeave(leaveId: string): Promise<LeaveApproval[]> {
    try {
      const { data, error } = await this.supabase
        .from('leave_approvals')
        .select(
          `
          *,
          approver:profiles(id, full_name, email)
        `
        )
        .eq('leave_id', leaveId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []) as unknown as LeaveApproval[];
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching approvals for leave', error);
      throw error;
    }
  }

  // =====================================================
  // PENDING APPROVALS
  // =====================================================

  /**
   * Get pending approvals for a user (based on their role)
   */
  static async getPendingApprovalsForUser(
    userId: string,
    institutionId: string
  ): Promise<PendingApproval[]> {
    try {
      // Define type for user roles
      interface UserRoleWithCustom {
        role_id: string;
        custom_role?: {
          id: string;
          role_name: string;
          permissions: Record<string, boolean>;
        } | null;
      }

      // Get user's roles
      const { data: userRoles, error: rolesError } = await this.supabase
        .from('user_roles')
        .select(
          `
          role_id,
          custom_role:custom_roles(id, role_name, permissions)
        `
        )
        .eq('user_id', userId);

      if (rolesError) throw rolesError;

      // Get pending leaves
      const { data: pendingLeaves, error: leavesError } = await this.supabase
        .from('institution_leaves')
        .select(
          `
          *,
          leave_type:leave_types(id, leave_type_name, color_code, requires_approval)
        `
        )
        .eq('institution_id', institutionId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (leavesError) throw leavesError;

      // Get approval chains with leave_type information
      const { data: chains, error: chainsError } = await this.supabase
        .from('leave_approval_chains')
        .select(
          `
          *,
          leave_type:leave_types(id, leave_type_name, color_code)
        `
        )
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('chain_order', { ascending: true });

      if (chainsError) throw chainsError;

      // Type assertions for the data
      const typedUserRoles = (userRoles || []) as unknown as UserRoleWithCustom[];
      const typedLeaves = (pendingLeaves || []) as unknown as InstitutionLeave[];
      const typedChains = (chains || []) as unknown as LeaveApprovalChain[];

      // Match pending leaves to user's approval authority
      const pendingApprovals: PendingApproval[] = [];

      for (const leave of typedLeaves) {
        const leaveChains = typedChains.filter(
          (chain) =>
            (!chain.leave_type_id || chain.leave_type_id === leave.leave_type_id) &&
            (chain.scope_level === leave.scope_level ||
              chain.scope_level === 'institution')
        );

        if (leaveChains.length === 0) continue;

        // Check if user has the required role for any step
        for (const chain of leaveChains) {
          const hasRole = typedUserRoles.some((ur) => {
            // Check if role name matches
            if (ur.custom_role?.role_name?.toLowerCase() === chain.approver_role?.toLowerCase()) {
              return true;
            }
            // Check if role ID matches
            if (ur.role_id === chain.approver_role) {
              return true;
            }
            // Check permissions
            const permissions = ur.custom_role?.permissions;
            if (permissions && typeof permissions === 'object') {
              return (
                permissions['leave.approve.institution'] ||
                permissions['leave.approve.department'] ||
                permissions[`leave.approve.${chain.scope_level}`]
              );
            }
            return false;
          });

          if (hasRole) {
            pendingApprovals.push({
              leave: leave,
              approval_chain: chain,
              current_step: chain.chain_order,
              total_steps: leaveChains.length
            });
            break;
          }
        }
      }

      return pendingApprovals;
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching pending approvals for user', error);
      throw error;
    }
  }

  /**
   * Get count of pending approvals for a user
   */
  static async getPendingApprovalCount(
    userId: string,
    institutionId: string
  ): Promise<number> {
    try {
      const approvals = await this.getPendingApprovalsForUser(userId, institutionId);
      return approvals.length;
    } catch (error) {
      logger.error('academic/leaves', 'Error getting pending approval count', error);
      return 0;
    }
  }

  /**
   * Check if user can approve a specific leave
   */
  static async canUserApprove(
    userId: string,
    leaveId: string
  ): Promise<boolean> {
    try {
      // Define types for queries
      interface LeaveInfo {
        institution_id: string;
        leave_type_id: string;
        scope_level: string;
        status: string;
      }

      interface ProfileInfo {
        institution_id: string | null;
        is_super_admin: boolean;
      }

      interface UserRolePermissions {
        custom_role?: {
          permissions: Record<string, boolean>;
        } | null;
      }

      // Get the leave
      const { data: leave, error: leaveError } = await this.supabase
        .from('institution_leaves')
        .select('institution_id, leave_type_id, scope_level, status')
        .eq('id', leaveId)
        .single<LeaveInfo>();

      if (leaveError || !leave) return false;
      if (leave.status !== 'pending') return false;

      // NOTE: Intentionally uses profiles.institution_id (not user_institution_access).
      // Leave approval workflows are scoped to the user's primary institution profile
      // so that is_super_admin and institution membership can be checked in one query.
      // See AcademicPermissionHelper for the shared resolution utility.
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('institution_id, is_super_admin')
        .eq('id', userId)
        .single<ProfileInfo>();

      if (profileError || !profile) return false;

      // Super admin can approve any leave
      if (profile.is_super_admin) return true;

      // User must be from the same institution
      if (profile.institution_id !== leave.institution_id) return false;

      // Check user's roles and permissions
      const { data: userRoles, error: rolesError } = await this.supabase
        .from('user_roles')
        .select(
          `
          custom_role:custom_roles(permissions)
        `
        )
        .eq('user_id', userId);

      if (rolesError) return false;

      const typedUserRoles = (userRoles || []) as UserRolePermissions[];

      // Check if any role has leave approval permission
      return typedUserRoles.some((ur) => {
        const permissions = ur.custom_role?.permissions;
        if (!permissions) return false;
        return (
          permissions['leave.approve.institution'] ||
          permissions['leave.approve.department'] ||
          permissions[`leave.approve.${leave.scope_level}`]
        );
      });
    } catch (error) {
      logger.error('academic/leaves', 'Error checking user approval permission', error);
      return false;
    }
  }

  // =====================================================
  // APPROVAL WORKFLOW SETUP
  // =====================================================

  /**
   * Setup default approval chain for an institution
   */
  static async setupDefaultApprovalChain(
    institutionId: string
  ): Promise<LeaveApprovalChain[]> {
    try {
      const defaultChains: CreateApprovalChainDto[] = [
        {
          institution_id: institutionId,
          scope_level: 'department',
          chain_order: 1,
          approver_role: 'hod',
          approver_scope: 'same_department',
          is_required: true,
          can_skip_if_approved_by_higher: true
        },
        {
          institution_id: institutionId,
          scope_level: 'institution',
          chain_order: 1,
          approver_role: 'principal',
          approver_scope: 'any',
          is_required: true,
          can_skip_if_approved_by_higher: false
        }
      ];

      const { data, error } = await this.supabase
        .from('leave_approval_chains')
        .insert(defaultChains as any)
        .select();

      if (error) throw error;

      return (data || []) as LeaveApprovalChain[];
    } catch (error) {
      logger.error('academic/leaves', 'Error setting up default approval chain', error);
      throw error;
    }
  }

  /**
   * Reorder approval chain steps
   */
  static async reorderApprovalChain(
    chainId: string,
    newOrder: number
  ): Promise<LeaveApprovalChain> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('leave_approval_chains')
        .update({
          chain_order: newOrder,
          updated_at: new Date().toISOString()
        })
        .eq('id', chainId)
        .select()
        .single();

      if (error) throw error;

      return data as LeaveApprovalChain;
    } catch (error) {
      logger.error('academic/leaves', 'Error reordering approval chain', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEAVE CALENDAR (from leave-calendar-service.ts)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get leaves for a specific month (uses database function)
   */
  static async getLeavesForMonth(
    filters: LeaveCalendarFilters
  ): Promise<CalendarLeave[]> {
    // Validate date parameters to prevent invalid database queries (e.g., 0-00-01)
    if (!filters.year || !filters.month || filters.year < 1970 || filters.month < 1 || filters.month > 12) {
      logger.warn('academic/leaves', 'Invalid date parameters for leaves query', { year: filters.year, month: filters.month });
      return [];
    }

    try {
      const { data, error } = await (this.supabase as any).rpc('get_leaves_for_month', {
        p_institution_id: filters.institution_id,
        p_year: filters.year,
        p_month: filters.month,
        p_department_id: filters.department_id || null,
        p_semester_id: filters.semester_id || null,
        p_section_id: filters.section_id || null
      });

      if (error) {
        logger.error('academic/leaves', 'Database error fetching leaves for month', error);
        throw error;
      }

      return (data || []).map((row: any) => ({
        leave_id: row.leave_id,
        leave_name: row.leave_name,
        leave_type_name: row.leave_type_name,
        color_code: row.color_code,
        start_date: row.start_date,
        end_date: row.end_date,
        scope_level: row.scope_level,
        status: row.status
      }));
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching leaves for month', error);
      throw error;
    }
  }

  /**
   * Get calendar data with day-by-day breakdown
   */
  static async getMonthlyCalendarData(
    filters: LeaveCalendarFilters
  ): Promise<MonthlyCalendarData> {
    // Validate date parameters to prevent invalid date calculations
    if (!filters.year || !filters.month || filters.year < 1970 || filters.month < 1 || filters.month > 12) {
      logger.warn('academic/leaves', 'Invalid date parameters for calendar data', { year: filters.year, month: filters.month });
      return { year: filters.year || 0, month: filters.month || 0, days: [], total_working_days: 0, total_leave_days: 0 };
    }

    try {
      const leaves = await this.getLeavesForMonth(filters);

      // Generate all days of the month
      const daysInMonth = new Date(filters.year, filters.month, 0).getDate();
      const days: CalendarDayInfo[] = [];

      let totalWorkingDays = 0;
      let totalLeaveDays = 0;

      for (let day = 1; day <= daysInMonth; day++) {
        // Use local date construction to avoid timezone shifts
        const dateStr = `${filters.year}-${String(filters.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const date = new Date(dateStr + 'T00:00:00');
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0; // Only Sunday is weekend

        // Find leaves that include this day
        const dayLeaves = leaves.filter((leave) => {
          // Normalize dates to compare only date parts (not time)
          const leaveStart = new Date(leave.start_date + 'T00:00:00');
          const leaveEnd = new Date(leave.end_date + 'T23:59:59');
          const currentDate = new Date(dateStr + 'T12:00:00');
          return currentDate >= leaveStart && currentDate <= leaveEnd;
        });

        // Check if day is blocked (has approved leave)
        const isBlocked = dayLeaves.some((leave) => leave.status === 'approved');

        if (isBlocked) {
          totalLeaveDays++;
        } else if (!isWeekend) {
          totalWorkingDays++;
        }

        days.push({
          date: dateStr,
          leaves: dayLeaves,
          is_blocked: isBlocked,
          is_weekend: isWeekend
        });
      }

      return {
        year: filters.year,
        month: filters.month,
        days,
        total_working_days: totalWorkingDays,
        total_leave_days: totalLeaveDays
      };
    } catch (error) {
      logger.error('academic/leaves', 'Error generating calendar data', error);
      throw error;
    }
  }

  /**
   * Get working days count between two dates
   */
  static async getWorkingDays(
    institutionId: string,
    startDate: string,
    endDate: string,
    departmentId?: string,
    semesterId?: string,
    sectionId?: string
  ): Promise<{
    total_days: number;
    working_days: number;
    leave_days: number;
    weekend_days: number;
  }> {
    try {
      let totalDays = 0;
      let weekendDays = 0;
      let leaveDays = 0;
      const leaveDates = new Set<string>();

      // Get all approved leaves in the date range
      const { data: leaves, error } = (await this.supabase
        .from('institution_leaves')
        .select('start_date, end_date, scope_level, department_ids, semester_ids, section_ids')
        .eq('institution_id', institutionId)
        .eq('status', 'approved')
        .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`)) as {
        data: Array<{
          start_date: string;
          end_date: string;
          scope_level: LeaveScopeLevel;
          department_ids: string[] | null;
          semester_ids: string[] | null;
          section_ids: string[] | null;
        }> | null;
        error: any;
      };

      if (error) throw error;

      // Calculate days
      const current = new Date(startDate + 'T00:00:00');
      const endDateTime = new Date(endDate + 'T23:59:59');
      while (current <= endDateTime) {
        totalDays++;
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        const dayOfWeek = current.getDay();

        if (dayOfWeek === 0) { // Only Sunday is weekend
          weekendDays++;
        } else {
          // Check if this day has an approved leave
          const hasLeave = (leaves || []).some((leave) => {
            const leaveStart = new Date(leave.start_date + 'T00:00:00');
            const leaveEnd = new Date(leave.end_date + 'T23:59:59');

            if (current < leaveStart || current > leaveEnd) {
              return false;
            }

            // Check scope
            if (leave.scope_level === 'institution') {
              return true;
            }
            if (
              leave.scope_level === 'department' &&
              departmentId &&
              leave.department_ids?.includes(departmentId)
            ) {
              return true;
            }
            if (
              leave.scope_level === 'semester' &&
              semesterId &&
              leave.semester_ids?.includes(semesterId)
            ) {
              return true;
            }
            if (
              leave.scope_level === 'section' &&
              sectionId &&
              leave.section_ids?.includes(sectionId)
            ) {
              return true;
            }

            return false;
          });

          if (hasLeave && !leaveDates.has(dateStr)) {
            leaveDates.add(dateStr);
            leaveDays++;
          }
        }

        current.setDate(current.getDate() + 1);
      }

      const workingDays = totalDays - weekendDays - leaveDays;

      return {
        total_days: totalDays,
        working_days: workingDays,
        leave_days: leaveDays,
        weekend_days: weekendDays
      };
    } catch (error) {
      logger.error('academic/leaves', 'Error calculating working days', error);
      throw error;
    }
  }

  /**
   * Get leaves for a specific date
   */
  static async getLeavesForDate(
    institutionId: string,
    date: string,
    departmentId?: string,
    semesterId?: string,
    sectionId?: string
  ): Promise<CalendarLeave[]> {
    try {
      const query = this.supabase
        .from('institution_leaves')
        .select(
          `
          id,
          leave_name,
          start_date,
          end_date,
          scope_level,
          status,
          leave_type:leave_types(leave_type_name, color_code)
        `
        )
        .eq('institution_id', institutionId)
        .in('status', ['approved', 'pending'])
        .lte('start_date', date)
        .gte('end_date', date);

      const { data, error } = await query;

      if (error) throw error;

      // Filter by scope
      const filteredLeaves = (data || []).filter((leave: any) => {
        if (leave.scope_level === 'institution') return true;
        // Additional scope filtering would be applied here based on parameters
        return true;
      });

      return filteredLeaves.map((leave: any) => ({
        leave_id: leave.id,
        leave_name: leave.leave_name,
        leave_type_name: leave.leave_type?.leave_type_name || '',
        color_code: leave.leave_type?.color_code || '#6B7280',
        start_date: leave.start_date,
        end_date: leave.end_date,
        scope_level: leave.scope_level,
        status: leave.status
      }));
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching leaves for date', error);
      throw error;
    }
  }

  /**
   * Get leave dates for date picker highlighting
   */
  static async getLeaveDatesInRange(
    institutionId: string,
    startDate: string,
    endDate: string
  ): Promise<{ date: string; color: string; status: string }[]> {
    try {
      const { data: leaves, error } = await this.supabase
        .from('institution_leaves')
        .select(
          `
          start_date,
          end_date,
          status,
          leave_type:leave_types(color_code)
        `
        )
        .eq('institution_id', institutionId)
        .in('status', ['approved', 'pending'])
        .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);

      if (error) throw error;

      const dates: { date: string; color: string; status: string }[] = [];
      const dateSet = new Set<string>();

      (leaves || []).forEach((leave: any) => {
        const start = new Date(leave.start_date + 'T00:00:00');
        const end = new Date(leave.end_date + 'T23:59:59');
        const current = new Date(start);

        while (current <= end) {
          const year = current.getFullYear();
          const month = String(current.getMonth() + 1).padStart(2, '0');
          const day = String(current.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;

          if (
            !dateSet.has(dateStr) &&
            dateStr >= startDate &&
            dateStr <= endDate
          ) {
            dateSet.add(dateStr);
            dates.push({
              date: dateStr,
              color: leave.leave_type?.color_code || '#6B7280',
              status: leave.status
            });
          }

          current.setDate(current.getDate() + 1);
        }
      });

      return dates.sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching leave dates', error);
      throw error;
    }
  }

  /**
   * Get monthly leave summary (for dashboard widgets)
   */
  static async getMonthlyLeaveSummary(
    institutionId: string,
    year: number,
    month: number
  ): Promise<{
    total_leaves: number;
    approved_count: number;
    pending_count: number;
    by_type: { leave_type_name: string; count: number; color_code: string }[];
  }> {
    try {
      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      const { data: leaves, error } = await this.supabase
        .from('institution_leaves')
        .select(
          `
          status,
          leave_type:leave_types(leave_type_name, color_code)
        `
        )
        .eq('institution_id', institutionId)
        .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);

      if (error) throw error;

      const typeCount: Record<string, { count: number; color_code: string }> = {};
      let approvedCount = 0;
      let pendingCount = 0;

      (leaves || []).forEach((leave: any) => {
        if (leave.status === 'approved') approvedCount++;
        if (leave.status === 'pending') pendingCount++;

        const typeName = leave.leave_type?.leave_type_name || 'Unknown';
        if (!typeCount[typeName]) {
          typeCount[typeName] = {
            count: 0,
            color_code: leave.leave_type?.color_code || '#6B7280'
          };
        }
        typeCount[typeName].count++;
      });

      return {
        total_leaves: leaves?.length || 0,
        approved_count: approvedCount,
        pending_count: pendingCount,
        by_type: Object.entries(typeCount).map(([name, data]) => ({
          leave_type_name: name,
          count: data.count,
          color_code: data.color_code
        }))
      };
    } catch (error) {
      logger.error('academic/leaves', 'Error fetching monthly summary', error);
      throw error;
    }
  }

  /**
   * Check if attendance marking is blocked by an approved leave
   * Updated: 2025-01-16 - Added for leave-attendance integration
   *
   * Checks leave hierarchy in order:
   * 1. Institution-wide leaves (applies to all)
   * 2. Department-level leaves (applies to specific departments)
   * 3. Semester-level leaves (applies to specific semesters)
   * 4. Section-level leaves (applies to specific sections)
   *
   * @param params - Institution ID, date, and optional hierarchy filters
   * @returns Promise<AttendanceLeaveResult> - Whether attendance is allowed and leave details
   */
  static async checkLeaveBlockForAttendance(
    params: AttendanceLeaveCheck
  ): Promise<AttendanceLeaveResult> {
    try {
      const { institution_id, date, department_id, semester_id, section_id } = params;

      // Query approved leaves for the specific date
      const { data: leaves, error } = (await this.supabase
        .from('institution_leaves')
        .select(
          `
          id,
          leave_name,
          scope_level,
          department_ids,
          semester_ids,
          section_ids,
          leave_type:leave_types(leave_type_name, color_code)
        `
        )
        .eq('institution_id', institution_id)
        .eq('status', 'approved')
        .lte('start_date', date)
        .gte('end_date', date)) as {
        data: Array<{
          id: string;
          leave_name: string;
          scope_level: LeaveScopeLevel;
          department_ids: string[] | null;
          semester_ids: string[] | null;
          section_ids: string[] | null;
          leave_type: { leave_type_name: string; color_code: string } | null;
        }> | null;
        error: any;
      };

      if (error) {
        logger.error('academic/leaves', 'Error checking leave block for attendance', {
          error_code: error.code,
          error_message: error.message,
          error_details: error.details,
          error_hint: error.hint,
          params
        });
        throw error;
      }

      // No approved leaves on this date
      if (!leaves || leaves.length === 0) {
        return {
          allowed: true
        };
      }

      // Check for blocking leave in hierarchy order
      for (const leave of leaves) {
        let isBlocked = false;

        // Check scope level (priority order: institution > department > semester > section)
        switch (leave.scope_level) {
          case 'institution':
            // Institution-wide leaves block ALL attendance
            isBlocked = true;
            break;

          case 'department':
            // Block if department matches
            if (department_id && leave.department_ids?.includes(department_id)) {
              isBlocked = true;
            }
            break;

          case 'semester':
            // Block if semester matches
            if (semester_id && leave.semester_ids?.includes(semester_id)) {
              isBlocked = true;
            }
            break;

          case 'section':
            // Block if section matches
            if (section_id && leave.section_ids?.includes(section_id)) {
              isBlocked = true;
            }
            break;

          default:
            logger.warn('academic/leaves', 'Unknown leave scope level', {
              scope_level: leave.scope_level,
              leave_id: leave.id
            });
        }

        // If blocked, return leave details
        if (isBlocked) {
          const leaveInfo: LeaveBlockInfo = {
            is_blocked: true,
            leave_id: leave.id,
            leave_name: leave.leave_name,
            leave_type_name: leave.leave_type?.leave_type_name || 'Holiday',
            color_code: leave.leave_type?.color_code || '#6B7280'
          };

          return {
            allowed: false,
            reason: `Cannot mark attendance: ${leave.leave_name} (${leaveInfo.leave_type_name})`,
            leave: leaveInfo
          };
        }
      }

      // No blocking leave found for this specific scope
      return {
        allowed: true
      };
    } catch (error) {
      logger.error('academic/leaves', 'Exception in checkLeaveBlockForAttendance', {
        error_message: error instanceof Error ? error.message : 'Unknown error',
        error_stack: error instanceof Error ? error.stack : undefined,
        params
      });
      // On error, allow attendance marking (fail open for availability)
      // But log the error for investigation
      return {
        allowed: true,
        reason: 'Error checking leave status - allowing attendance'
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEAVE-ATTENDANCE INTEGRATION (from leave-attendance-integration.ts)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if attendance can be marked for a given date and scope
   * This is the main integration point with the attendance module
   */
  static async canMarkAttendance(
    params: AttendanceLeaveCheck
  ): Promise<AttendanceLeaveResult> {
    try {
      // Use the database function for efficient checking
      const { data, error } = await (this.supabase as any).rpc('is_date_blocked_by_leave', {
        p_institution_id: params.institution_id,
        p_date: params.date,
        p_department_id: params.department_id || null,
        p_semester_id: params.semester_id || null,
        p_section_id: params.section_id || null
      });

      if (error) {
        logger.error('academic/leaves', 'Database error checking leave block', error);
        // In case of error, allow attendance marking (fail-open)
        return { allowed: true };
      }

      if (data && data.length > 0 && data[0].is_blocked) {
        const leave = data[0];
        return {
          allowed: false,
          reason: `Attendance marking is blocked due to: ${leave.leave_name}`,
          leave: {
            is_blocked: true,
            leave_id: leave.leave_id,
            leave_name: leave.leave_name,
            leave_type_name: leave.leave_type_name,
            color_code: leave.color_code
          }
        };
      }

      return { allowed: true };
    } catch (error) {
      logger.error('academic/leaves', 'Error checking attendance block', error);
      // Fail-open: allow attendance if there's an error checking
      return { allowed: true };
    }
  }

  /**
   * Check multiple dates at once (for bulk attendance marking)
   */
  static async checkMultipleDates(
    institutionId: string,
    dates: string[],
    departmentId?: string,
    semesterId?: string,
    sectionId?: string
  ): Promise<Map<string, LeaveBlockInfo>> {
    const results = new Map<string, LeaveBlockInfo>();

    try {
      // Get all approved leaves that overlap with any of the dates
      const minDate = dates.reduce((a, b) => (a < b ? a : b));
      const maxDate = dates.reduce((a, b) => (a > b ? a : b));

      // Define type for leave data
      interface LeaveData {
        id: string;
        leave_name: string;
        start_date: string;
        end_date: string;
        scope_level: string;
        department_ids?: string[];
        semester_ids?: string[];
        section_ids?: string[];
        leave_type?: {
          leave_type_name: string;
          color_code: string;
        };
      }

      const { data: leaves, error } = await this.supabase
        .from('institution_leaves')
        .select(
          `
          id,
          leave_name,
          start_date,
          end_date,
          scope_level,
          department_ids,
          semester_ids,
          section_ids,
          leave_type:leave_types(leave_type_name, color_code)
        `
        )
        .eq('institution_id', institutionId)
        .eq('status', 'approved')
        .lte('start_date', maxDate)
        .gte('end_date', minDate);

      if (error) {
        logger.error('academic/leaves', 'Error fetching leaves for multiple dates', error);
        // Return empty results (fail-open)
        dates.forEach((date) => results.set(date, { is_blocked: false }));
        return results;
      }

      const typedLeaves = (leaves || []) as LeaveData[];

      // Check each date against the leaves
      for (const date of dates) {
        const dateObj = new Date(date);

        const blockingLeave = typedLeaves.find((leave) => {
          const leaveStart = new Date(leave.start_date);
          const leaveEnd = new Date(leave.end_date);

          // Check if date is within leave range
          if (dateObj < leaveStart || dateObj > leaveEnd) {
            return false;
          }

          // Check scope
          if (leave.scope_level === 'institution') {
            return true;
          }

          if (
            leave.scope_level === 'department' &&
            departmentId &&
            leave.department_ids?.includes(departmentId)
          ) {
            return true;
          }

          if (
            leave.scope_level === 'semester' &&
            semesterId &&
            leave.semester_ids?.includes(semesterId)
          ) {
            return true;
          }

          if (
            leave.scope_level === 'section' &&
            sectionId &&
            leave.section_ids?.includes(sectionId)
          ) {
            return true;
          }

          return false;
        });

        if (blockingLeave) {
          results.set(date, {
            is_blocked: true,
            leave_id: blockingLeave.id,
            leave_name: blockingLeave.leave_name,
            leave_type_name: blockingLeave.leave_type?.leave_type_name,
            color_code: blockingLeave.leave_type?.color_code
          });
        } else {
          results.set(date, { is_blocked: false });
        }
      }

      return results;
    } catch (error) {
      logger.error('academic/leaves', 'Error checking multiple dates', error);
      // Return all as non-blocked (fail-open)
      dates.forEach((date) => results.set(date, { is_blocked: false }));
      return results;
    }
  }

  /**
   * Get blocked dates for a date range (for calendar highlighting)
   */
  static async getBlockedDatesInRange(
    institutionId: string,
    startDate: string,
    endDate: string,
    departmentId?: string,
    semesterId?: string,
    sectionId?: string
  ): Promise<string[]> {
    try {
      // Define type for leave data
      interface BlockedLeaveData {
        start_date: string;
        end_date: string;
        scope_level: string;
        department_ids?: string[];
        semester_ids?: string[];
        section_ids?: string[];
      }

      const { data: leaves, error } = await this.supabase
        .from('institution_leaves')
        .select(
          `
          start_date,
          end_date,
          scope_level,
          department_ids,
          semester_ids,
          section_ids
        `
        )
        .eq('institution_id', institutionId)
        .eq('status', 'approved')
        .lte('start_date', endDate)
        .gte('end_date', startDate);

      if (error) {
        logger.error('academic/leaves', 'Error fetching blocked dates', error);
        return [];
      }

      const typedLeaves = (leaves || []) as BlockedLeaveData[];
      const blockedDates: Set<string> = new Set();
      const start = new Date(startDate);
      const end = new Date(endDate);

      for (const leave of typedLeaves) {
        const leaveStart = new Date(leave.start_date);
        const leaveEnd = new Date(leave.end_date);

        // Check scope match
        let scopeMatches = false;
        if (leave.scope_level === 'institution') {
          scopeMatches = true;
        } else if (
          leave.scope_level === 'department' &&
          (!departmentId || leave.department_ids?.includes(departmentId))
        ) {
          scopeMatches = true;
        } else if (
          leave.scope_level === 'semester' &&
          (!semesterId || leave.semester_ids?.includes(semesterId))
        ) {
          scopeMatches = true;
        } else if (
          leave.scope_level === 'section' &&
          (!sectionId || leave.section_ids?.includes(sectionId))
        ) {
          scopeMatches = true;
        }

        if (!scopeMatches) continue;

        // Add all dates in the leave range
        const current = new Date(Math.max(leaveStart.getTime(), start.getTime()));
        const rangeEnd = new Date(Math.min(leaveEnd.getTime(), end.getTime()));

        while (current <= rangeEnd) {
          blockedDates.add(current.toISOString().split('T')[0]);
          current.setDate(current.getDate() + 1);
        }
      }

      return Array.from(blockedDates).sort();
    } catch (error) {
      logger.error('academic/leaves', 'Error getting blocked dates', error);
      return [];
    }
  }

  /**
   * Check if a specific timetable slot can have attendance marked
   * This integrates with the attendance marking flow
   */
  static async canMarkSlotAttendance(
    institutionId: string,
    date: string,
    timetableSlotId: string
  ): Promise<AttendanceLeaveResult> {
    try {
      // Bridge: look up section/semester/department via student_attendance.
      // student_attendance.period_slot_id stores the slot key that maps to
      // timetable_data JSON, giving us all the hierarchy IDs we need.
      const { data: attendanceRef, error: attError } = await this.supabase
        .from('student_attendance')
        .select('section_id, semester_id, department_id')
        .eq('period_slot_id', timetableSlotId)
        .eq('institution_id', institutionId)  // scope to correct institution
        .limit(1)
        .maybeSingle();

      if (attError) {
        logger.error('academic/leaves', 'DB error resolving slot context for leave check', { timetableSlotId, error: attError });
        return { allowed: true };
      }
      if (!attendanceRef) {
        // No rows means slot has never been used; fail-open is intentional
        logger.warn('academic/leaves', 'No attendance record found for slot, skipping leave integration', { timetableSlotId });
        return { allowed: true };
      }

      // Extract scope IDs
      const sectionId = attendanceRef.section_id ?? undefined;
      const semesterId = attendanceRef.semester_id ?? undefined;
      const departmentId = attendanceRef.department_id ?? undefined;

      // Check if blocked
      return this.canMarkAttendance({
        institution_id: institutionId,
        date,
        department_id: departmentId,
        semester_id: semesterId,
        section_id: sectionId
      });
    } catch (error) {
      logger.error('academic/leaves', 'Error checking slot attendance', error);
      return { allowed: true };
    }
  }

  /**
   * Get leave information for display in attendance UI
   */
  static async getLeaveInfoForDate(
    institutionId: string,
    date: string,
    departmentId?: string,
    semesterId?: string,
    sectionId?: string
  ): Promise<LeaveBlockInfo | null> {
    try {
      const result = await this.canMarkAttendance({
        institution_id: institutionId,
        date,
        department_id: departmentId,
        semester_id: semesterId,
        section_id: sectionId
      });

      return result.leave || null;
    } catch (error) {
      logger.error('academic/leaves', 'Error getting leave info for date', error);
      return null;
    }
  }
}
