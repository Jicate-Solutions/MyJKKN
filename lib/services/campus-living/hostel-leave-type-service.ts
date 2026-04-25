// Campus-living hostel leave type master CRUD service.
//
// Simpler than academic's LeaveManagementService — no activity-template logging
// for now (Campus Living doesn't have CampusLivingActivityTemplates). If needed
// later, follow the academic pattern and fire-and-forget log via
// logActivityClient (see lib/services/academic/leave-management-service.ts).
//
// All operations enforce RLS server-side. is_system=true rows can't be deleted
// via RLS (the DELETE policy has `AND NOT is_system`).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelLeaveType,
  CreateHostelLeaveTypeDto,
  UpdateHostelLeaveTypeDto,
  HostelLeaveTypeFilters,
  HostelLeaveTypeListResponse
} from '@/types/hostel-leave-types';

export class HostelLeaveTypeService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async getHostelLeaveTypes(
    filters: HostelLeaveTypeFilters = {}
  ): Promise<HostelLeaveTypeListResponse> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 100; // master-data lists are typically small
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('hostel_leave_types')
      .select('*', { count: 'exact' })
      .order('sort_order', { ascending: true })
      .order('leave_type_name', { ascending: true })
      .range(from, to);

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters.search) {
      query = query.or(
        `leave_type_name.ilike.%${filters.search}%,leave_type_code.ilike.%${filters.search}%`
      );
    }

    const { data, error, count } = await query;
    if (error) {
      logger.error('campus-living/leave-types', 'Database error listing', error);
      throw new Error(error.message || 'Failed to fetch hostel leave types');
    }

    const total = count ?? 0;
    return {
      data: (data ?? []) as HostelLeaveType[],
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Institution-aware listing for non-super-admin users.
   * Falls through to getHostelLeaveTypes(filters) if allInstitutions=true.
   */
  static async getHostelLeaveTypesWithAccess(
    filters: HostelLeaveTypeFilters,
    userInstitutionId: string | null | undefined,
    allInstitutions: boolean
  ): Promise<HostelLeaveTypeListResponse> {
    if (allInstitutions) {
      return this.getHostelLeaveTypes(filters);
    }
    if (!userInstitutionId) {
      return { data: [], metadata: { total: 0, page: 1, limit: filters.limit ?? 100, totalPages: 0 } };
    }
    return this.getHostelLeaveTypes({
      ...filters,
      institution_id: userInstitutionId
    });
  }

  /**
   * Active-only listing — consumed by UI that needs to let users PICK a leave
   * type (e.g. the leave-request form). Not used by the settings CRUD page.
   */
  static async getActiveHostelLeaveTypes(
    institutionId: string | undefined
  ): Promise<HostelLeaveType[]> {
    let q = this.supabase
      .from('hostel_leave_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('leave_type_name', { ascending: true });
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data, error } = await q;

    if (error) {
      logger.error('campus-living/leave-types', 'Database error listing active', error);
      throw new Error(error.message || 'Failed to fetch active hostel leave types');
    }
    return (data ?? []) as HostelLeaveType[];
  }

  static async getHostelLeaveType(id: string): Promise<HostelLeaveType> {
    const { data, error } = await this.supabase
      .from('hostel_leave_types')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      logger.error('campus-living/leave-types', 'Database error fetching one', error);
      throw new Error(error.message || 'Failed to fetch hostel leave type');
    }
    return data as HostelLeaveType;
  }

  static async createHostelLeaveType(
    dto: CreateHostelLeaveTypeDto
  ): Promise<HostelLeaveType> {
    const { data, error } = await this.supabase
      .from('hostel_leave_types')
      .insert([dto])
      .select()
      .single();
    if (error) {
      logger.error('campus-living/leave-types', 'Database error creating', error);
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.message || 'Failed to create hostel leave type'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }
    return data as HostelLeaveType;
  }

  static async updateHostelLeaveType(
    id: string,
    dto: UpdateHostelLeaveTypeDto
  ): Promise<HostelLeaveType> {
    const { data, error } = await this.supabase
      .from('hostel_leave_types')
      .update({
        ...dto,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      logger.error('campus-living/leave-types', 'Database error updating', error);
      const enhanced: Error & { code?: string; details?: string } = new Error(
        error.message || 'Failed to update hostel leave type'
      );
      enhanced.code = error.code;
      enhanced.details = error.details;
      throw enhanced;
    }
    return data as HostelLeaveType;
  }

  static async deleteHostelLeaveType(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('hostel_leave_types')
      .delete()
      .eq('id', id);
    if (error) {
      logger.error('campus-living/leave-types', 'Database error deleting', error);
      throw new Error(error.message || 'Failed to delete hostel leave type');
    }
  }

  static async bulkDeleteHostelLeaveTypes(
    ids: string[]
  ): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const id of ids) {
      try {
        await this.deleteHostelLeaveType(id);
        success.push(id);
      } catch (e) {
        logger.error('campus-living/leave-types', `Error deleting ${id}`, e);
        failed.push({
          id,
          error: e instanceof Error ? e.message : 'Unknown error'
        });
      }
    }
    return { success, failed };
  }

  /**
   * Checks whether a leave_type_code is already used within an institution
   * (or across all institutions when called by super_admin with
   * institutionId=undefined).
   *
   * Conventions:
   * - `institutionId: string | undefined` + truthy-guard on `.eq()` matches the
   *   campus-living service convention locked 2026-04-23 (empty-UUID blitz,
   *   PRs #358/#362/#363/#366). Prevents `invalid input syntax for type uuid`
   *   crash when a super_admin session (institution_id=null) hits this path.
   *   See memory: feedback_service_institution_id_signature_convention.md.
   * - `.maybeSingle()` matches PR #446 convention: read paths that may return
   *   0 rows must not throw PGRST116. A "code exists" check CAN return 0 rows
   *   — that's the whole point.
   */
  static async isHostelLeaveTypeCodeExists(
    institutionId: string | undefined,
    code: string,
    excludeId?: string
  ): Promise<boolean> {
    let q = this.supabase
      .from('hostel_leave_types')
      .select('id')
      .eq('leave_type_code', code);
    if (institutionId) q = q.eq('institution_id', institutionId);
    if (excludeId) q = q.neq('id', excludeId);
    q = q.limit(1);
    const { data, error } = await q.maybeSingle();
    if (error) {
      logger.error('campus-living/leave-types', 'Error checking code exists', error);
      return false;
    }
    return data !== null;
  }
}
