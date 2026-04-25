import { createClientSupabaseClient } from '@/lib/supabase/client';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  PrivilegeType,
  PrivilegeSourceType,
  PrivilegeGroup,
  PrivilegeMember,
  PrivilegeReview,
  ActivePrivilegeInfo,
  PrivilegeGroupFilters,
  PrivilegeMemberFilters,
  CreatePrivilegeGroupDto,
  UpdatePrivilegeGroupDto,
  AddMemberDto,
  BulkAddMembersDto,
  UpdateMemberStatusDto,
  CreateReviewDto,
  SubmitProgressReportDto,
} from '@/types/privileges';

/**
 * PrivilegeService — Exceptions & Privileges module service layer.
 * Manages privilege types, groups, members, reviews, and integration queries.
 *
 * Created: 2026-03-25
 */
export class PrivilegeService {
  // Cast to any because privilege tables are not yet in generated supabase.ts types
  // (tables exist in DB but types/supabase.ts hasn't been regenerated)
  private static get supabase() {
    return createClientSupabaseClient() as any;
  }

  /**
   * Service role client for server-side operations (cron jobs, admin tasks).
   * Bypasses RLS — use only in trusted server contexts.
   */
  private static getServiceClient() {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }

  // =====================
  // TYPE REGISTRY
  // =====================

  /**
   * Get all privilege types for an institution.
   * System types are listed first, then alphabetical by name.
   */
  static async getPrivilegeTypes(institutionId?: string): Promise<PrivilegeType[]> {
    try {
      let query = this.supabase
        .from('privilege_types')
        .select('*')
        .order('is_system', { ascending: false })
        .order('name', { ascending: true });

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error, status, statusText } = await query;

      if (error) {
        logger.error('academic/privileges', 'Failed to fetch privilege types', { error, status, statusText });
        throw new Error(`Failed to fetch privilege types: ${error.message}`);
      }

      logger.info('academic/privileges', `getPrivilegeTypes returned ${data?.length ?? 0} types`, { institutionId, status });
      return (data ?? []) as PrivilegeType[];
    } catch (err) {
      logger.error('academic/privileges', 'getPrivilegeTypes error', err);
      throw err;
    }
  }

  // =====================
  // SOURCE TYPE REGISTRY
  // =====================

  /**
   * Get all registered privilege source types, ordered by sort_order.
   * Cached 15 min in the hook — this registry rarely changes.
   */
  static async getSourceTypes(): Promise<PrivilegeSourceType[]> {
    const { data, error } = await this.supabase
      .from('privilege_source_types')
      .select('*')
      .order('sort_order');
    if (error) {
      logger.error('academic/privileges', 'getSourceTypes failed', error);
      throw new Error('Failed to load privilege source types');
    }
    return (data ?? []) as PrivilegeSourceType[];
  }

  // =====================
  // GROUP CRUD
  // =====================

  /**
   * Get paginated list of privilege groups with filters.
   * Includes joined privilege_group_types -> privilege_types and member count.
   */
  static async getGroups(
    filters: PrivilegeGroupFilters = {},
    institutionId?: string
  ): Promise<{
    data: PrivilegeGroup[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      const page = filters.page ?? 1;
      const limit = filters.limit ?? 20;
      const offset = (page - 1) * limit;

      // Build the main query
      let query = this.supabase
        .from('privilege_groups')
        .select(
          `*,
          privilege_group_types(*, privilege_types(*)),
          creator:profiles!privilege_groups_created_by_fkey(id, full_name)`,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Institution scoping (super_admin bypass)
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      // Apply filters
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.semester_id) {
        query = query.eq('semester_id', filters.semester_id);
      }
      if (typeof filters.is_template === 'boolean') {
        query = query.eq('is_template', filters.is_template);
      }
      if (filters.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }

      const { data, error, count } = await query;

      if (error) {
        logger.error('academic/privileges', 'Failed to fetch privilege groups', error);
        throw new Error('Failed to fetch privilege groups');
      }

      const groups = data ?? [];
      const total = count ?? 0;

      // Fetch member counts for each group in a single query
      if (groups.length > 0) {
        const groupIds = groups.map((g: any) => g.id);

        const { data: memberCounts, error: countError } = await this.supabase
          .from('privilege_members')
          .select('group_id')
          .in('group_id', groupIds)
          .eq('status', 'active');

        if (!countError && memberCounts) {
          const countMap: Record<string, number> = {};
          for (const row of memberCounts) {
            countMap[row.group_id] = (countMap[row.group_id] || 0) + 1;
          }
          for (const group of groups) {
            (group as any).member_count = countMap[(group as any).id] || 0;
          }
        }
      }

      return {
        data: groups as PrivilegeGroup[],
        metadata: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      logger.error('academic/privileges', 'getGroups error', err);
      throw err;
    }
  }

  /**
   * Get a single privilege group with full relations.
   */
  static async getGroup(id: string): Promise<PrivilegeGroup | null> {
    try {
      const { data, error } = await this.supabase
        .from('privilege_groups')
        .select(
          `*,
          privilege_group_types(*, privilege_types(*)),
          creator:profiles!privilege_groups_created_by_fkey(id, full_name)`
        )
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        logger.error('academic/privileges', 'Failed to fetch privilege group', error);
        throw new Error('Failed to fetch privilege group');
      }

      // Fetch member count
      const { count } = await this.supabase
        .from('privilege_members')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', id)
        .eq('status', 'active');

      if (data) {
        (data as any).member_count = count ?? 0;
      }

      return data as PrivilegeGroup;
    } catch (err) {
      logger.error('academic/privileges', 'getGroup error', err);
      throw err;
    }
  }

  /**
   * Create a new privilege group with linked privilege types.
   */
  static async createGroup(dto: CreatePrivilegeGroupDto): Promise<PrivilegeGroup> {
    try {
      // Insert the group
      const { data: group, error: groupError } = await this.supabase
        .from('privilege_groups')
        .insert({
          institution_id: dto.institution_id,
          name: dto.name,
          description: dto.description ?? null,
          reference_code: dto.reference_code,
          semester_id: dto.semester_id ?? null,
          status: 'active',
          is_template: dto.is_template ?? false,
          template_name: dto.template_name ?? null,
          created_by: dto.created_by,
          source_kind: dto.source_kind ?? 'manual',
          source_config: dto.source_config ?? {},
        })
        .select()
        .single();

      if (groupError || !group) {
        logger.error('academic/privileges', 'Failed to create privilege group', groupError);
        throw new Error(groupError?.message || 'Failed to create privilege group');
      }

      // Insert group_types M2M records
      if (dto.privilege_type_ids.length > 0) {
        const groupTypeRows = dto.privilege_type_ids.map((typeId) => ({
          group_id: group.id,
          type_id: typeId,
          config: dto.type_configs?.[typeId] ?? {},
        }));

        const { error: typesError } = await this.supabase
          .from('privilege_group_types')
          .insert(groupTypeRows);

        if (typesError) {
          logger.error('academic/privileges', 'Failed to link privilege types', typesError);
          // Group was created but types failed — log but don't throw
          // The group can still be edited to fix types
        }
      }

      logger.info('academic/privileges', 'Privilege group created', {
        groupId: group.id,
        name: dto.name,
        typeCount: dto.privilege_type_ids.length,
      });

      // Return the full group with relations
      return (await this.getGroup(group.id))!;
    } catch (err) {
      logger.error('academic/privileges', 'createGroup error', err);
      throw err;
    }
  }

  /**
   * Update a privilege group. If privilege_type_ids is provided,
   * replaces the existing group_types.
   */
  static async updateGroup(id: string, dto: UpdatePrivilegeGroupDto): Promise<PrivilegeGroup> {
    try {
      // Build update payload (only include provided fields)
      const updatePayload: Record<string, unknown> = {};
      if (dto.name !== undefined) updatePayload.name = dto.name;
      if (dto.description !== undefined) updatePayload.description = dto.description;
      if (dto.reference_code !== undefined) updatePayload.reference_code = dto.reference_code;
      if (dto.semester_id !== undefined) updatePayload.semester_id = dto.semester_id;
      if (dto.status !== undefined) updatePayload.status = dto.status;
      if (dto.is_template !== undefined) updatePayload.is_template = dto.is_template;
      if (dto.template_name !== undefined) updatePayload.template_name = dto.template_name;

      if (Object.keys(updatePayload).length > 0) {
        const { error: updateError } = await this.supabase
          .from('privilege_groups')
          .update(updatePayload)
          .eq('id', id);

        if (updateError) {
          logger.error('academic/privileges', 'Failed to update privilege group', updateError);
          throw new Error(updateError.message || 'Failed to update privilege group');
        }
      }

      // Replace privilege types if provided
      if (dto.privilege_type_ids) {
        // Delete existing
        const { error: deleteError } = await this.supabase
          .from('privilege_group_types')
          .delete()
          .eq('group_id', id);

        if (deleteError) {
          logger.error('academic/privileges', 'Failed to clear group types', deleteError);
        }

        // Insert new
        if (dto.privilege_type_ids.length > 0) {
          const groupTypeRows = dto.privilege_type_ids.map((typeId) => ({
            group_id: id,
            type_id: typeId,
            config: dto.type_configs?.[typeId] ?? {},
          }));

          const { error: insertError } = await this.supabase
            .from('privilege_group_types')
            .insert(groupTypeRows);

          if (insertError) {
            logger.error('academic/privileges', 'Failed to insert updated group types', insertError);
          }
        }
      }

      logger.info('academic/privileges', 'Privilege group updated', { groupId: id });

      return (await this.getGroup(id))!;
    } catch (err) {
      logger.error('academic/privileges', 'updateGroup error', err);
      throw err;
    }
  }

  /**
   * Soft-delete a privilege group by archiving it.
   * Throws if the group has active members.
   */
  static async deleteGroup(id: string): Promise<void> {
    try {
      // Check for active members
      const { count } = await this.supabase
        .from('privilege_members')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', id)
        .eq('status', 'active');

      if (count && count > 0) {
        throw new Error('Cannot delete group with active members. Revoke all members first.');
      }

      const { error } = await this.supabase
        .from('privilege_groups')
        .update({ status: 'archived' })
        .eq('id', id);

      if (error) {
        logger.error('academic/privileges', 'Failed to archive privilege group', error);
        throw new Error('Failed to delete privilege group');
      }

      logger.info('academic/privileges', 'Privilege group archived', { groupId: id });
    } catch (err) {
      logger.error('academic/privileges', 'deleteGroup error', err);
      throw err;
    }
  }

  // =====================
  // MEMBER MANAGEMENT
  // =====================

  /**
   * Get paginated list of privilege members with learner profile join.
   */
  static async getMembers(
    filters: PrivilegeMemberFilters = {},
    institutionId?: string
  ): Promise<{
    data: PrivilegeMember[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      const page = filters.page ?? 1;
      const limit = filters.limit ?? 50;
      const offset = (page - 1) * limit;

      let query = this.supabase
        .from('privilege_members')
        .select(
          `*,
          learner:profiles!privilege_members_learner_id_fkey(
            id, full_name, first_name, last_name, roll_number, student_photo_url, department_id
          ),
          group:privilege_groups!privilege_members_group_id_fkey(
            id, name, reference_code, status, institution_id
          )`,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Filter by group_id
      if (filters.group_id) {
        query = query.eq('group_id', filters.group_id);
      }

      // Filter by learner_id
      if (filters.learner_id) {
        query = query.eq('learner_id', filters.learner_id);
      }

      // Filter by status
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      // Institution scoping via the group's institution_id
      // We use the nested filter on the joined privilege_groups
      if (institutionId) {
        query = query.eq('group.institution_id', institutionId);
      }

      const { data, error, count } = await query;

      if (error) {
        logger.error('academic/privileges', 'Failed to fetch privilege members', error);
        throw new Error('Failed to fetch privilege members');
      }

      // If search filter is provided, filter on learner name client-side
      // (Supabase nested ILIKE on joined columns is unreliable)
      let results = (data ?? []) as PrivilegeMember[];
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        results = results.filter(
          (m) =>
            m.learner?.full_name?.toLowerCase().includes(searchLower) ||
            m.learner?.roll_number?.toLowerCase().includes(searchLower)
        );
      }

      const total = count ?? results.length;

      return {
        data: results,
        metadata: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      logger.error('academic/privileges', 'getMembers error', err);
      throw err;
    }
  }

  /**
   * Add a single member to a privilege group.
   * Checks for duplicate active membership.
   */
  static async addMember(dto: AddMemberDto): Promise<PrivilegeMember> {
    try {
      // Check if learner is already an active member of this group
      const { data: existing } = await this.supabase
        .from('privilege_members')
        .select('id')
        .eq('group_id', dto.group_id)
        .eq('learner_id', dto.learner_id)
        .eq('status', 'active')
        .maybeSingle();

      if (existing) {
        throw new Error('This learner is already an active member of this group');
      }

      const { data, error } = await this.supabase
        .from('privilege_members')
        .insert({
          group_id: dto.group_id,
          learner_id: dto.learner_id,
          status: 'active',
          start_date: dto.start_date ?? new Date().toISOString().split('T')[0],
          end_date: dto.end_date ?? null,
          created_by: dto.created_by,
        })
        .select(
          `*,
          learner:profiles!privilege_members_learner_id_fkey(
            id, full_name, first_name, last_name, roll_number, student_photo_url, department_id
          )`
        )
        .single();

      if (error) {
        logger.error('academic/privileges', 'Failed to add member', error);
        throw new Error(error.message || 'Failed to add member');
      }

      logger.info('academic/privileges', 'Member added to privilege group', {
        groupId: dto.group_id,
        learnerId: dto.learner_id,
      });

      // Auto-approve current month's renewal so the cron job doesn't
      // immediately pause brand-new members
      try {
        const now = new Date();
        const currentMonthStr = new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString().split('T')[0];

        await this.supabase
          .from('privilege_renewals')
          .upsert({
            member_id: data.id,
            month: currentMonthStr,
            status: 'approved',
            review_notes: 'Auto-approved on member creation',
          }, { onConflict: 'member_id,month' });

        logger.info('academic/privileges', 'Auto-approved renewal for new member', {
          memberId: data.id,
          month: currentMonthStr,
        });
      } catch (renewalErr) {
        // Non-fatal: member was still created, just log the warning
        logger.warn('academic/privileges', 'Failed to auto-approve renewal for new member', renewalErr);
      }

      return data as PrivilegeMember;
    } catch (err) {
      logger.error('academic/privileges', 'addMember error', err);
      throw err;
    }
  }

  /**
   * Bulk add members to a privilege group.
   * Returns summary of added, skipped, and errors.
   */
  static async bulkAddMembers(
    dto: BulkAddMembersDto
  ): Promise<{ added: number; skipped: number; errors: string[] }> {
    const result = { added: 0, skipped: 0, errors: [] as string[] };

    try {
      // Get existing active members of this group
      const { data: existingMembers } = await this.supabase
        .from('privilege_members')
        .select('learner_id')
        .eq('group_id', dto.group_id)
        .eq('status', 'active');

      const existingIds = new Set((existingMembers ?? []).map((m: any) => m.learner_id));

      // Filter out already-existing members
      const newLearnerIds = dto.learner_ids.filter((id) => {
        if (existingIds.has(id)) {
          result.skipped++;
          return false;
        }
        return true;
      });

      if (newLearnerIds.length === 0) {
        return result;
      }

      // Batch insert new members
      const rows = newLearnerIds.map((learnerId) => ({
        group_id: dto.group_id,
        learner_id: learnerId,
        status: 'active' as const,
        start_date: dto.start_date ?? new Date().toISOString().split('T')[0],
        end_date: dto.end_date ?? null,
        created_by: dto.created_by,
      }));

      const { error } = await this.supabase
        .from('privilege_members')
        .insert(rows);

      if (error) {
        logger.error('academic/privileges', 'Bulk add members failed', error);
        result.errors.push(error.message);
      } else {
        result.added = newLearnerIds.length;

        // Auto-approve current month's renewal for all newly added members
        // so the cron job doesn't immediately pause them
        try {
          // Fetch the newly inserted member IDs
          const { data: newMembers } = await this.supabase
            .from('privilege_members')
            .select('id')
            .eq('group_id', dto.group_id)
            .in('learner_id', newLearnerIds)
            .eq('status', 'active');

          if (newMembers && newMembers.length > 0) {
            const now = new Date();
            const currentMonthStr = new Date(now.getFullYear(), now.getMonth(), 1)
              .toISOString().split('T')[0];

            const renewalRows = newMembers.map((m: any) => ({
              member_id: m.id,
              month: currentMonthStr,
              status: 'approved',
              review_notes: 'Auto-approved on member creation',
            }));

            await this.supabase
              .from('privilege_renewals')
              .upsert(renewalRows, { onConflict: 'member_id,month' });

            logger.info('academic/privileges', 'Auto-approved renewals for bulk-added members', {
              count: newMembers.length,
              month: currentMonthStr,
            });
          }
        } catch (renewalErr) {
          // Non-fatal: members were still created
          logger.warn('academic/privileges', 'Failed to auto-approve renewals for bulk members', renewalErr);
        }
      }

      logger.info('academic/privileges', 'Bulk add members completed', result);

      return result;
    } catch (err) {
      logger.error('academic/privileges', 'bulkAddMembers error', err);
      result.errors.push(err instanceof Error ? err.message : 'Unknown error');
      return result;
    }
  }

  /**
   * Update a member's status (e.g., revoke, put under review).
   */
  static async updateMemberStatus(
    memberId: string,
    dto: UpdateMemberStatusDto
  ): Promise<PrivilegeMember> {
    try {
      const updatePayload: Record<string, unknown> = {
        status: dto.status,
        review_notes: dto.review_notes ?? null,
      };

      // If revoking, set revocation fields
      if (dto.status === 'revoked') {
        updatePayload.revoked_at = new Date().toISOString();
        updatePayload.revoked_by = dto.revoked_by ?? null;
        updatePayload.revoke_reason = dto.revoke_reason ?? null;
      }

      const { data, error } = await this.supabase
        .from('privilege_members')
        .update(updatePayload)
        .eq('id', memberId)
        .select(
          `*,
          learner:profiles!privilege_members_learner_id_fkey(
            id, full_name, first_name, last_name, roll_number, student_photo_url, department_id
          )`
        )
        .single();

      if (error) {
        logger.error('academic/privileges', 'Failed to update member status', error);
        throw new Error(error.message || 'Failed to update member status');
      }

      logger.info('academic/privileges', 'Member status updated', {
        memberId,
        newStatus: dto.status,
      });

      return data as PrivilegeMember;
    } catch (err) {
      logger.error('academic/privileges', 'updateMemberStatus error', err);
      throw err;
    }
  }

  // =====================
  // INTEGRATION QUERIES
  // =====================

  /**
   * Get active privileges for a single learner.
   * Used by dashboard badges and learner profile views.
   */
  static async getActivePrivilegesForLearner(learnerId: string): Promise<ActivePrivilegeInfo[]> {
    try {
      // Read from the unified view: serves manual groups AND lc_members-sourced
      // groups (e.g. Learners Council) with identical semantics.
      const { data: memberships, error: mErr } = await this.supabase
        .from('v_privilege_memberships_effective')
        .select('id, group_id, status, renewal_status, start_date, end_date')
        .eq('learner_id', learnerId)
        .eq('status', 'active')
        .in('renewal_status', ['active', 'pending_report', 'pending_review', 'paused']);

      if (mErr) {
        logger.error('academic/privileges', 'Failed to fetch learner privileges', mErr);
        throw new Error('Failed to fetch learner privileges');
      }

      if (!memberships || memberships.length === 0) return [];

      const groupIds: string[] = Array.from(
        new Set(memberships.map((m: any) => m.group_id).filter(Boolean)),
      );

      const { data: groups, error: gErr } = await this.supabase
        .from('privilege_groups')
        .select(
          `id, name, reference_code, status,
          privilege_group_types(
            config,
            privilege_type:privilege_types(key, name, category)
          )`,
        )
        .in('id', groupIds)
        .eq('status', 'active');

      if (gErr) {
        logger.error('academic/privileges', 'Failed to hydrate privilege groups', gErr);
        throw new Error('Failed to fetch learner privileges');
      }

      const groupsById = new Map<string, any>((groups ?? []).map((g: any) => [g.id, g]));

      return memberships
        .map((row: any) => {
          const group = groupsById.get(row.group_id);
          if (!group) return null;
          return {
            group_id: group.id,
            group_name: group.name,
            reference_code: group.reference_code,
            group_status: group.status,
            member_id: row.id,
            member_status: row.status,
            renewal_status: row.renewal_status ?? 'active',
            start_date: row.start_date,
            end_date: row.end_date,
            privilege_types: (group.privilege_group_types ?? []).map((gt: any) => ({
              key: gt.privilege_type?.key ?? '',
              name: gt.privilege_type?.name ?? '',
              category: gt.privilege_type?.category ?? 'other',
              config: gt.config ?? {},
            })),
          };
        })
        .filter((r: any): r is ActivePrivilegeInfo => r !== null);
    } catch (err) {
      logger.error('academic/privileges', 'getActivePrivilegesForLearner error', err);
      throw err;
    }
  }

  /**
   * Get all privilege memberships for a learner regardless of renewal_status.
   * Used by the monthly progress report page so learners can see their
   * renewal status and submit reports even when renewal_status != 'active'.
   */
  static async getLearnerPrivilegeMemberships(learnerId: string): Promise<
    Array<{
      member_id: string;
      group_id: string;
      group_name: string;
      reference_code: string;
      group_status: string;
      member_status: string;
      renewal_status: string;
      start_date: string;
      end_date: string | null;
    }>
  > {
    try {
      // Read from unified view — manual + lc_members-sourced surface identically.
      const { data: memberships, error: mErr } = await this.supabase
        .from('v_privilege_memberships_effective')
        .select('id, group_id, status, renewal_status, start_date, end_date')
        .eq('learner_id', learnerId)
        .eq('status', 'active')
        .in('renewal_status', ['active', 'pending_report', 'pending_review', 'paused']);

      if (mErr) {
        logger.error('academic/privileges', 'getLearnerPrivilegeMemberships error', mErr);
        throw new Error('Failed to fetch learner privilege memberships');
      }

      if (!memberships || memberships.length === 0) return [];

      const groupIds: string[] = Array.from(
        new Set(memberships.map((m: any) => m.group_id).filter(Boolean)),
      );

      const { data: groups, error: gErr } = await this.supabase
        .from('privilege_groups')
        .select('id, name, reference_code, status')
        .in('id', groupIds)
        .eq('status', 'active');

      if (gErr) {
        logger.error('academic/privileges', 'group hydration error', gErr);
        throw new Error('Failed to fetch learner privilege memberships');
      }

      const groupsById = new Map<string, any>((groups ?? []).map((g: any) => [g.id, g]));

      return memberships
        .map((row: any) => {
          const group = groupsById.get(row.group_id);
          if (!group) return null;
          return {
            member_id: row.id,
            group_id: group.id,
            group_name: group.name,
            reference_code: group.reference_code,
            group_status: group.status,
            member_status: row.status,
            renewal_status: row.renewal_status,
            start_date: row.start_date,
            end_date: row.end_date,
          };
        })
        .filter((r: any): r is NonNullable<typeof r> => r !== null);
    } catch (err) {
      logger.error('academic/privileges', 'getLearnerPrivilegeMemberships error', err);
      throw err;
    }
  }

  /**
   * Batch query: get active privileges for multiple learners.
   * Used by attendance page to resolve privileges for 60+ students at once.
   * Returns a Map keyed by learner_id.
   */
  static async getActivePrivilegesForLearners(
    learnerIds: string[]
  ): Promise<Map<string, ActivePrivilegeInfo[]>> {
    const resultMap = new Map<string, ActivePrivilegeInfo[]>();

    if (learnerIds.length === 0) return resultMap;

    try {
      // Read from unified view — includes lc_members-sourced memberships
      // (e.g. Learners Council) so attendance OD + dashboard badges see them.
      const { data: memberships, error: mErr } = await this.supabase
        .from('v_privilege_memberships_effective')
        .select('id, learner_id, group_id, status, renewal_status, start_date, end_date')
        .in('learner_id', learnerIds)
        .eq('status', 'active')
        .eq('renewal_status', 'active');

      if (mErr) {
        logger.error('academic/privileges', 'Failed to batch fetch learner privileges', mErr);
        throw new Error('Failed to fetch learner privileges');
      }

      if (!memberships || memberships.length === 0) return resultMap;

      const groupIds: string[] = Array.from(
        new Set(memberships.map((m: any) => m.group_id).filter(Boolean)),
      );

      const { data: groups, error: gErr } = await this.supabase
        .from('privilege_groups')
        .select(
          `id, name, reference_code, status,
          privilege_group_types(
            config,
            privilege_type:privilege_types(key, name, category)
          )`,
        )
        .in('id', groupIds)
        .eq('status', 'active');

      if (gErr) {
        logger.error('academic/privileges', 'batch group hydration failed', gErr);
        throw new Error('Failed to fetch learner privileges');
      }

      const groupsById = new Map<string, any>((groups ?? []).map((g: any) => [g.id, g]));

      for (const row of memberships as any[]) {
        const group = groupsById.get(row.group_id);
        if (!group) continue;

        const learnerId = row.learner_id as string;
        if (!resultMap.has(learnerId)) {
          resultMap.set(learnerId, []);
        }

        resultMap.get(learnerId)!.push({
          group_id: group.id,
          group_name: group.name,
          reference_code: group.reference_code,
          group_status: group.status,
          member_id: row.id,
          member_status: row.status,
          renewal_status: row.renewal_status || 'active',
          start_date: row.start_date,
          end_date: row.end_date,
          privilege_types: (group.privilege_group_types ?? []).map((gt: any) => ({
            key: gt.privilege_type?.key ?? '',
            name: gt.privilege_type?.name ?? '',
            category: gt.privilege_type?.category ?? 'other',
            config: gt.config ?? {},
          })),
        });
      }

      return resultMap;
    } catch (err) {
      logger.error('academic/privileges', 'getActivePrivilegesForLearners error', err);
      throw err;
    }
  }

  /**
   * Quick check: does this learner have an active privilege of a given type key?
   */
  static async hasPrivilegeType(learnerId: string, typeKey: string): Promise<boolean> {
    try {
      const privileges = await this.getActivePrivilegesForLearner(learnerId);
      // Only truly active renewal_status should grant privileges
      return privileges.some((p) =>
        p.renewal_status === 'active' &&
        p.privilege_types.some((t) => t.key === typeKey)
      );
    } catch (err) {
      logger.error('academic/privileges', 'hasPrivilegeType error', err);
      return false;
    }
  }

  // =====================
  // REVIEWS
  // =====================

  /**
   * Create a review record and apply member decisions (keep/revoke/under_review).
   */
  static async createReview(dto: CreateReviewDto): Promise<PrivilegeReview> {
    try {
      const membersKept = dto.member_decisions.filter((d) => d.decision === 'keep').length;
      const membersRevoked = dto.member_decisions.filter((d) => d.decision === 'revoke').length;

      // Insert the review record
      const { data: review, error: reviewError } = await this.supabase
        .from('privilege_reviews')
        .insert({
          group_id: dto.group_id,
          reviewer_id: dto.reviewer_id,
          review_date: dto.review_date ?? new Date().toISOString().split('T')[0],
          members_reviewed: dto.member_decisions.length,
          members_kept: membersKept,
          members_revoked: membersRevoked,
          notes: dto.notes ?? null,
        })
        .select()
        .single();

      if (reviewError || !review) {
        logger.error('academic/privileges', 'Failed to create review', reviewError);
        throw new Error(reviewError?.message || 'Failed to create review');
      }

      // Apply decisions to each member
      for (const decision of dto.member_decisions) {
        const statusMap: Record<string, string> = {
          keep: 'active',
          under_review: 'under_review',
          revoke: 'revoked',
        };

        const updatePayload: Record<string, unknown> = {
          status: statusMap[decision.decision],
          review_notes: decision.notes ?? null,
        };

        if (decision.decision === 'revoke') {
          updatePayload.revoked_at = new Date().toISOString();
          updatePayload.revoked_by = dto.reviewer_id;
          updatePayload.revoke_reason = decision.revoke_reason ?? 'Revoked during review';
        }

        const { error: memberError } = await this.supabase
          .from('privilege_members')
          .update(updatePayload)
          .eq('id', decision.member_id);

        if (memberError) {
          logger.error('academic/privileges', 'Failed to apply review decision', {
            memberId: decision.member_id,
            decision: decision.decision,
            error: memberError,
          });
        }
      }

      logger.info('academic/privileges', 'Review created and applied', {
        reviewId: review.id,
        groupId: dto.group_id,
        reviewed: dto.member_decisions.length,
        kept: membersKept,
        revoked: membersRevoked,
      });

      return review as PrivilegeReview;
    } catch (err) {
      logger.error('academic/privileges', 'createReview error', err);
      throw err;
    }
  }

  /**
   * Get review history for a group, ordered by most recent first.
   */
  static async getReviewHistory(groupId: string): Promise<PrivilegeReview[]> {
    try {
      const { data, error } = await this.supabase
        .from('privilege_reviews')
        .select(
          `*,
          reviewer:profiles!privilege_reviews_reviewer_id_fkey(id, full_name)`
        )
        .eq('group_id', groupId)
        .order('review_date', { ascending: false });

      if (error) {
        logger.error('academic/privileges', 'Failed to fetch review history', error);
        throw new Error('Failed to fetch review history');
      }

      return (data ?? []) as PrivilegeReview[];
    } catch (err) {
      logger.error('academic/privileges', 'getReviewHistory error', err);
      throw err;
    }
  }

  // =====================
  // TEMPLATES
  // =====================

  /**
   * Save an existing group as a reusable template.
   */
  static async saveAsTemplate(
    groupId: string,
    templateName: string
  ): Promise<PrivilegeGroup> {
    try {
      // Load the source group with its types
      const sourceGroup = await this.getGroup(groupId);
      if (!sourceGroup) {
        throw new Error('Source group not found');
      }

      // Extract type IDs and configs from the source
      const typeIds: string[] = [];
      const typeConfigs: Record<string, Record<string, unknown>> = {};

      if (sourceGroup.privilege_types) {
        for (const gt of sourceGroup.privilege_types) {
          typeIds.push(gt.type_id);
          if (gt.config && Object.keys(gt.config).length > 0) {
            typeConfigs[gt.type_id] = gt.config;
          }
        }
      }

      // Create a new group as template
      const template = await this.createGroup({
        institution_id: sourceGroup.institution_id,
        name: `[Template] ${sourceGroup.name}`,
        description: sourceGroup.description ?? undefined,
        reference_code: `TPL-${sourceGroup.reference_code}`,
        is_template: true,
        template_name: templateName,
        created_by: sourceGroup.created_by,
        privilege_type_ids: typeIds,
        type_configs: Object.keys(typeConfigs).length > 0 ? typeConfigs : undefined,
      });

      logger.info('academic/privileges', 'Template saved from group', {
        sourceGroupId: groupId,
        templateId: template.id,
        templateName,
      });

      return template;
    } catch (err) {
      logger.error('academic/privileges', 'saveAsTemplate error', err);
      throw err;
    }
  }

  /**
   * Create a new group from a template, with optional overrides.
   */
  static async createFromTemplate(
    templateId: string,
    overrides: Partial<CreatePrivilegeGroupDto>
  ): Promise<PrivilegeGroup> {
    try {
      const template = await this.getGroup(templateId);
      if (!template) {
        throw new Error('Template not found');
      }
      if (!template.is_template) {
        throw new Error('The specified group is not a template');
      }

      // Extract type IDs from template
      const typeIds = (template.privilege_types ?? []).map((gt) => gt.type_id);
      const typeConfigs: Record<string, Record<string, unknown>> = {};
      for (const gt of template.privilege_types ?? []) {
        if (gt.config && Object.keys(gt.config).length > 0) {
          typeConfigs[gt.type_id] = gt.config;
        }
      }

      // Create new group from template with overrides
      const newGroup = await this.createGroup({
        institution_id: overrides.institution_id ?? template.institution_id,
        name: overrides.name ?? template.name.replace('[Template] ', ''),
        description: overrides.description ?? template.description ?? undefined,
        reference_code: overrides.reference_code ?? `${template.reference_code.replace('TPL-', '')}-${Date.now()}`,
        semester_id: overrides.semester_id ?? template.semester_id ?? undefined,
        is_template: false,
        created_by: overrides.created_by ?? template.created_by,
        privilege_type_ids: overrides.privilege_type_ids ?? typeIds,
        type_configs: overrides.type_configs ?? (Object.keys(typeConfigs).length > 0 ? typeConfigs : undefined),
      });

      logger.info('academic/privileges', 'Group created from template', {
        templateId,
        newGroupId: newGroup.id,
      });

      return newGroup;
    } catch (err) {
      logger.error('academic/privileges', 'createFromTemplate error', err);
      throw err;
    }
  }

  // =====================
  // COMMITTEE / REVIEWERS
  // =====================

  static async getGroupReviewers(groupId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('privilege_group_reviewers')
      .select('*, reviewer:profiles!privilege_group_reviewers_reviewer_id_fkey(id, full_name, email)')
      .eq('group_id', groupId)
      .order('added_at', { ascending: true });
    if (error) { logger.error('academic/privileges', 'getGroupReviewers error', error); throw error; }
    return data ?? [];
  }

  static async addGroupReviewer(groupId: string, reviewerId: string, addedBy: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('privilege_group_reviewers')
      .insert({ group_id: groupId, reviewer_id: reviewerId, added_by: addedBy })
      .select('*, reviewer:profiles!privilege_group_reviewers_reviewer_id_fkey(id, full_name, email)')
      .single();
    if (error) { logger.error('academic/privileges', 'addGroupReviewer error', error); throw error; }
    return data;
  }

  static async removeGroupReviewer(groupId: string, reviewerId: string): Promise<void> {
    const { error } = await this.supabase
      .from('privilege_group_reviewers')
      .delete()
      .eq('group_id', groupId)
      .eq('reviewer_id', reviewerId);
    if (error) { logger.error('academic/privileges', 'removeGroupReviewer error', error); throw error; }
  }

  // =====================
  // PROGRESS REPORTS
  // =====================

  static async submitProgressReport(dto: SubmitProgressReportDto): Promise<any> {
    try {
      // Report is for the CURRENT month (what the learner worked on)
      // Renewal record is for the NEXT month (what we're approving them to continue into)
      // e.g., learner submits April report → renewal created for May → committee approves for May
      const now = new Date();
      // Report month = current month (what learner worked on)
      const reportMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      // Renewal month = next month (what we're approving for)
      const renewalMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0];

      // 1. Create progress report
      const { data: report, error: reportError } = await this.supabase
        .from('privilege_progress_reports')
        .insert({
          member_id: dto.member_id,
          report_month: reportMonth,
          app_url: dto.app_url || null,
          github_url: dto.github_url || null,
          description: dto.description,
          screenshot_url: dto.screenshot_url || null,
        })
        .select()
        .single();

      if (reportError) {
        logger.error('academic/privileges', 'submitProgressReport - report insert error', reportError);
        throw reportError;
      }

      // 2. Create/update renewal record for the NEXT month (what we're approving for)
      await this.supabase
        .from('privilege_renewals')
        .upsert({
          member_id: dto.member_id,
          month: renewalMonth,
          status: 'pending',
          report_id: report.id,
        }, { onConflict: 'member_id,month' });

      // 3. Update member renewal_status
      await this.supabase
        .from('privilege_members')
        .update({ renewal_status: 'pending_review' })
        .eq('id', dto.member_id);

      logger.info('academic/privileges', 'Progress report submitted', { memberId: dto.member_id, reportMonth, renewalMonth });
      return report;
    } catch (err) {
      logger.error('academic/privileges', 'submitProgressReport error', err);
      throw err;
    }
  }

  // =====================
  // RENEWAL REVIEW
  // =====================

  static async getRenewalsForMonth(groupId: string, month: string): Promise<any[]> {
    try {
      // Get ALL active members of the group (not just those with renewals)
      const { data: members, error: membersErr } = await this.supabase
        .from('privilege_members')
        .select(`
          id, learner_id, status, renewal_status, start_date,
          learner:profiles!privilege_members_learner_id_fkey(id, full_name, first_name, last_name, roll_number, student_photo_url)
        `)
        .eq('group_id', groupId)
        .in('status', ['active', 'under_review']);

      if (membersErr) { logger.error('academic/privileges', 'getRenewalsForMonth members error', membersErr); throw membersErr; }
      if (!members || members.length === 0) return [];

      // Get renewals for these members for this month
      const memberIds = members.map((m: any) => m.id);
      const { data: renewals } = await this.supabase
        .from('privilege_renewals')
        .select(`*, report:privilege_progress_reports(*), reviewer:profiles!privilege_renewals_reviewed_by_fkey(id, full_name)`)
        .eq('month', month)
        .in('member_id', memberIds);

      const renewalMap = new Map<string, any>((renewals || []).map((r: any) => [r.member_id, r]));

      // Combine: every member appears, with or without a renewal record
      return members.map((m: any) => {
        const renewal: any = renewalMap.get(m.id);
        return {
          id: renewal?.id || null,
          member_id: m.id,
          month,
          status: renewal?.status || 'pending',
          report_id: renewal?.report_id || null,
          reviewed_by: renewal?.reviewed_by || null,
          reviewed_at: renewal?.reviewed_at || null,
          review_notes: renewal?.review_notes || null,
          created_at: renewal?.created_at || null,
          member: m,
          report: renewal?.report || null,
          reviewer: renewal?.reviewer || null,
          has_report: !!renewal?.report_id,
        };
      });
    } catch (err) {
      logger.error('academic/privileges', 'getRenewalsForMonth error', err);
      throw err;
    }
  }

  /**
   * Review a renewal -- approve or deny.
   *
   * IMPORTANT: Updates BOTH privilege_renewals.status AND privilege_members.renewal_status.
   * These are intentionally denormalized for query performance (attendance checks renewal_status
   * on privilege_members, not via a JOIN to privilege_renewals).
   *
   * If one update fails, the state may be inconsistent. The auto-pause cron job (runs monthly)
   * will reconcile any inconsistencies by checking privilege_renewals as source of truth.
   */
  static async reviewRenewal(dto: {
    renewal_id: string;
    decision: 'approved' | 'denied';
    notes?: string;
    reviewed_by: string;
  }): Promise<any> {
    try {
      // 1. Update renewal record
      const { data: renewal, error } = await this.supabase
        .from('privilege_renewals')
        .update({
          status: dto.decision,
          reviewed_by: dto.reviewed_by,
          reviewed_at: new Date().toISOString(),
          review_notes: dto.notes || null,
        })
        .eq('id', dto.renewal_id)
        .select('*, member:privilege_members!privilege_renewals_member_id_fkey(id)')
        .single();

      if (error) { logger.error('academic/privileges', 'reviewRenewal update error', error); throw error; }

      if (!renewal?.member?.id) {
        logger.error('academic/privileges', 'reviewRenewal: member not found on renewal', { renewalId: dto.renewal_id });
        throw new Error('Renewal record not found or missing member reference');
      }

      // 2. Update member renewal_status based on decision
      const newStatus = dto.decision === 'approved' ? 'active' : 'paused';
      await this.supabase
        .from('privilege_members')
        .update({ renewal_status: newStatus })
        .eq('id', renewal.member.id);

      logger.info('academic/privileges', `Renewal ${dto.decision}`, { renewalId: dto.renewal_id });
      return renewal;
    } catch (err) {
      logger.error('academic/privileges', 'reviewRenewal error', err);
      throw err;
    }
  }

  static async getRenewalHistory(memberId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('privilege_renewals')
      .select('*, reviewer:profiles!privilege_renewals_reviewed_by_fkey(id, full_name)')
      .eq('member_id', memberId)
      .order('month', { ascending: false });
    if (error) { logger.error('academic/privileges', 'getRenewalHistory error', error); throw error; }
    return data ?? [];
  }

  static async getRenewalDashboard(groupId: string, month: string): Promise<any> {
    // Get all members of the group
    const { data: members } = await this.supabase
      .from('privilege_members')
      .select('id, renewal_status')
      .eq('group_id', groupId)
      .in('status', ['active', 'under_review']);

    if (!members) return { total_members: 0, approved: 0, pending_report: 0, pending_review: 0, paused: 0, denied: 0 };

    // Get renewals for this month
    const memberIds = members.map((m: any) => m.id);
    const { data: renewals } = await this.supabase
      .from('privilege_renewals')
      .select('member_id, status')
      .eq('month', month)
      .in('member_id', memberIds);

    const renewalMap = new Map((renewals || []).map((r: any) => [r.member_id, r.status]));

    return {
      total_members: members.length,
      approved: (renewals || []).filter((r: any) => r.status === 'approved').length,
      pending_report: members.filter((m: any) => !renewalMap.has(m.id) || m.renewal_status === 'pending_report').length,
      pending_review: members.filter((m: any) => m.renewal_status === 'pending_review').length,
      paused: members.filter((m: any) => m.renewal_status === 'paused').length,
      denied: (renewals || []).filter((r: any) => r.status === 'denied').length,
    };
  }

  /**
   * Get a cross-group renewal summary for the admin dashboard.
   * Counts all active privilege_members grouped by renewal_status.
   */
  static async getGlobalRenewalSummary(institutionId?: string): Promise<{
    active: number;
    pending_report: number;
    pending_review: number;
    paused: number;
  }> {
    const empty = { active: 0, pending_report: 0, pending_review: 0, paused: 0 };
    try {
      let memberQuery = this.supabase
        .from('privilege_members')
        .select('renewal_status')
        .eq('status', 'active');

      if (institutionId) {
        // Get groups for this institution first, then filter members at DB level
        const { data: groups } = await this.supabase
          .from('privilege_groups')
          .select('id')
          .eq('institution_id', institutionId);

        if (!groups || groups.length === 0) {
          return empty;
        }

        const groupIds = groups.map((g: any) => g.id);
        memberQuery = memberQuery.in('group_id', groupIds);
      }

      const { data: members, error } = await memberQuery;

      if (error) {
        logger.error('academic/privileges', 'getGlobalRenewalSummary error', error);
        return empty;
      }

      if (!members) return empty;

      return {
        active: members.filter((m: any) => m.renewal_status === 'active').length,
        pending_report: members.filter((m: any) => m.renewal_status === 'pending_report').length,
        pending_review: members.filter((m: any) => m.renewal_status === 'pending_review').length,
        paused: members.filter((m: any) => m.renewal_status === 'paused').length,
      };
    } catch (err) {
      logger.error('academic/privileges', 'getGlobalRenewalSummary error', err);
      return empty;
    }
  }

  /**
   * Search profiles by name or email for reviewer assignment.
   * Excludes profiles already assigned as reviewers for this group.
   */
  static async searchReviewerCandidates(groupId: string, query: string, institutionId?: string): Promise<any[]> {
    if (!query || query.length < 2) return [];

    try {
      // Get existing reviewer IDs to exclude
      const { data: existingReviewers } = await this.supabase
        .from('privilege_group_reviewers')
        .select('reviewer_id')
        .eq('group_id', groupId);

      const excludeIds = (existingReviewers || []).map((r: any) => r.reviewer_id);

      let q = this.supabase
        .from('profiles')
        .select('id, full_name, email')
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        // Only return staff/faculty/admin profiles — learners should not be reviewers
        .in('role', ['super_admin', 'admin', 'hod', 'faculty', 'staff', 'principal'])
        .limit(10);

      if (institutionId) {
        q = q.eq('institution_id', institutionId);
      }

      if (excludeIds.length > 0) {
        q = q.not('id', 'in', `(${excludeIds.join(',')})`);
      }

      const { data, error } = await q;
      if (error) { logger.error('academic/privileges', 'searchReviewerCandidates error', error); throw error; }
      return data ?? [];
    } catch (err) {
      logger.error('academic/privileges', 'searchReviewerCandidates error', err);
      return [];
    }
  }

  // =====================
  // AUTO-PAUSE CRON
  // =====================

  /**
   * Auto-pause members who don't have an approved privilege_renewals
   * record for the given month. Called by the monthly cron job.
   *
   * Uses service role client (bypasses RLS) since this runs server-side
   * without a user session.
   *
   * Logic:
   *   1. Find all privilege_members where status = 'active' AND
   *      renewal_status is NOT already 'paused'
   *   2. For each, check if a privilege_renewals record exists for the
   *      given month with status = 'approved'
   *   3. If NOT approved: set renewal_status = 'paused' and create a
   *      privilege_renewals record with status = 'auto_paused'
   *   4. Return { paused_count: N }
   */
  static async autoPauseExpiredRenewals(month: string): Promise<{ paused_count: number }> {
    const serviceClient = this.getServiceClient() as any;
    let pausedCount = 0;

    try {
      // 1. Get all active members whose renewal_status is not already paused
      const { data: activeMembers, error: membersError } = await serviceClient
        .from('privilege_members')
        .select('id, group_id, learner_id, renewal_status')
        .eq('status', 'active')
        .neq('renewal_status', 'paused');

      if (membersError) {
        logger.error('academic/privileges', 'autoPause: failed to fetch active members', membersError);
        throw new Error(`Failed to fetch active members: ${membersError.message}`);
      }

      if (!activeMembers || activeMembers.length === 0) {
        logger.info('academic/privileges', 'autoPause: no active members found', { month });
        return { paused_count: 0 };
      }

      const memberIds = activeMembers.map((m: any) => m.id);

      // 2. Get all approved renewals for this month in a single query
      const { data: approvedRenewals, error: renewalsError } = await serviceClient
        .from('privilege_renewals')
        .select('member_id')
        .eq('month', month)
        .eq('status', 'approved')
        .in('member_id', memberIds);

      if (renewalsError) {
        logger.error('academic/privileges', 'autoPause: failed to fetch renewals', renewalsError);
        throw new Error(`Failed to fetch renewals: ${renewalsError.message}`);
      }

      const approvedMemberIds = new Set(
        (approvedRenewals ?? []).map((r: any) => r.member_id)
      );

      // 3. Find members WITHOUT an approved renewal for this month
      const membersToPause = activeMembers.filter(
        (m: any) => !approvedMemberIds.has(m.id)
      );

      if (membersToPause.length === 0) {
        logger.info('academic/privileges', 'autoPause: all members have approved renewals', { month });
        return { paused_count: 0 };
      }

      // 4. Batch update renewal_status to 'paused'
      const pauseIds = membersToPause.map((m: any) => m.id);

      const { error: updateError } = await serviceClient
        .from('privilege_members')
        .update({ renewal_status: 'paused' })
        .in('id', pauseIds);

      if (updateError) {
        logger.error('academic/privileges', 'autoPause: failed to update members', updateError);
        throw new Error(`Failed to pause members: ${updateError.message}`);
      }

      // 5. Create auto_paused renewal records for each paused member
      const renewalRows = membersToPause.map((m: any) => ({
        member_id: m.id,
        month,
        status: 'auto_paused',
        review_notes: 'Auto-paused: no approved renewal for this month',
      }));

      const { error: insertError } = await serviceClient
        .from('privilege_renewals')
        .upsert(renewalRows, { onConflict: 'member_id,month' });

      if (insertError) {
        // Non-fatal: members are already paused, just log the error
        logger.error('academic/privileges', 'autoPause: failed to insert renewal records', insertError);
      }

      pausedCount = membersToPause.length;

      logger.info('academic/privileges', 'autoPause completed', {
        month,
        totalActive: activeMembers.length,
        alreadyApproved: approvedMemberIds.size,
        paused: pausedCount,
      });

      return { paused_count: pausedCount };
    } catch (err) {
      logger.error('academic/privileges', 'autoPauseExpiredRenewals error', err);
      throw err;
    }
  }
}
