// lib/services/academic/leave-approval-service.ts
// Leave Approval Service for managing approval workflows
// Created: 2025-12-16
//
// Access Control: Uses profiles.institution_id (NOT user_institution_access)

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  LeaveApproval,
  LeaveApprovalChain,
  CreateApprovalChainDto,
  UpdateApprovalChainDto,
  PendingApproval,
  ProcessApprovalDto,
  InstitutionLeave,
  LeaveScopeLevel
} from '@/types/leaves';

export class LeaveApprovalService {
  private static supabase = createClientSupabaseClient();

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

      // Get user profile
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
}
