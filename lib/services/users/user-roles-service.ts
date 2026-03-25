/**
 * UserRolesService - Multi-Role Management Service
 *
 * This service handles all operations related to user role assignments,
 * including assigning multiple roles, managing primary roles, and
 * calculating merged permissions using Union (OR) logic.
 *
 * @created 2025-11-28
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  UserRoleAssignment,
  UserRoleAssignmentInsert,
  CustomRole
} from '@/types/auth';
import { toast } from 'react-hot-toast';

export class UserRolesService {
  /**
   * Get all roles assigned to a user with full role details
   * Uses the database function get_user_roles_with_details for optimized query
   */
  static async getUserRoles(userId: string): Promise<UserRoleAssignment[]> {
    try {
      const supabase = createClientSupabaseClient();

      // Use the database function for optimized query
      const { data, error } = await (supabase as any).rpc(
        'get_user_roles_with_details',
        {
          p_user_id: userId
        }
      );

      if (error) {
        console.error('[users/roles] Error fetching user roles:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('[users/roles] Failed to get user roles:', error);
      throw error;
    }
  }

  /**
   * Get the primary role for a user
   */
  static async getPrimaryRole(
    userId: string
  ): Promise<UserRoleAssignment | null> {
    try {
      const roles = await this.getUserRoles(userId);
      return roles.find((r) => r.is_primary) || roles[0] || null;
    } catch (error) {
      console.error('[users/roles] Failed to get primary role:', error);
      throw error;
    }
  }

  /**
   * Batch fetch roles for multiple users at once
   * Returns a map of userId -> UserRoleAssignment[]
   */
  static async getBatchUserRoles(
    userIds: string[]
  ): Promise<Record<string, UserRoleAssignment[]>> {
    if (!userIds || userIds.length === 0) {
      return {};
    }

    try {
      const supabase = createClientSupabaseClient();

      // Fetch all user_roles with their custom_roles data for the given user IDs
      const { data, error } = await supabase
        .from('user_roles')
        .select(
          `
          id,
          user_id,
          role_id,
          is_primary,
          assigned_at,
          assigned_by,
          custom_roles!inner (
            role_key,
            role_name,
            description,
            permissions
          )
        `
        )
        .in('user_id', userIds)
        .order('is_primary', { ascending: false })
        .order('assigned_at', { ascending: true });

      if (error) {
        console.error('[users/roles] Error batch fetching user roles:', error);
        throw error;
      }

      // Group roles by user_id
      const rolesByUser: Record<string, UserRoleAssignment[]> = {};

      // Initialize all users with empty arrays
      for (const userId of userIds) {
        rolesByUser[userId] = [];
      }

      // Populate with fetched data
      if (data) {
        for (const item of data as any) {
          const customRole = item.custom_roles as any;
          const assignment: UserRoleAssignment = {
            id: item.id,
            user_id: item.user_id,
            role_id: item.role_id,
            is_primary: item.is_primary,
            assigned_at: item.assigned_at,
            assigned_by: item.assigned_by,
            role_key: customRole?.role_key,
            role_name: customRole?.role_name,
            role_description: customRole?.description,
            permissions: customRole?.permissions
          };

          if (!rolesByUser[item.user_id]) {
            rolesByUser[item.user_id] = [];
          }
          rolesByUser[item.user_id].push(assignment);
        }
      }

      console.log(
        `[users/roles] Batch fetched roles for ${userIds.length} users`
      );
      return rolesByUser;
    } catch (error) {
      console.error('[users/roles] Failed to batch fetch user roles:', error);
      throw error;
    }
  }

  /**
   * Assign roles to a user (replaces existing roles)
   *
   * @param userId - The user to assign roles to
   * @param roleIds - Array of custom_role IDs to assign
   * @param primaryRoleId - Which role should be marked as primary
   * @param assignedBy - The user performing the assignment
   */
  static async assignRoles(
    userId: string,
    roleIds: string[],
    primaryRoleId: string,
    assignedBy?: string
  ): Promise<void> {
    if (!roleIds || roleIds.length === 0) {
      throw new Error('At least one role must be assigned');
    }

    if (!roleIds.includes(primaryRoleId)) {
      throw new Error('Primary role must be one of the assigned roles');
    }

    try {
      const supabase = createClientSupabaseClient();

      // Delete existing role assignments for this user
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        console.error(
          '[users/roles] Error deleting existing roles:',
          deleteError
        );
        throw deleteError;
      }

      // Create new role assignments
      const assignments: UserRoleAssignmentInsert[] = roleIds.map((roleId) => ({
        user_id: userId,
        role_id: roleId,
        is_primary: roleId === primaryRoleId,
        assigned_by: assignedBy || null
      }));

      const { error: insertError } = await supabase 
        .from('user_roles')
        .insert(assignments as any);

      if (insertError) {
        console.error('[users/roles] Error inserting new roles:', insertError);
        throw insertError;
      }

      console.log(
        `[users/roles] Successfully assigned ${roleIds.length} roles to user ${userId}`
      );
    } catch (error) {
      console.error('[users/roles] Failed to assign roles:', error);
      throw error;
    }
  }

  /**
   * Add a role to a user (without removing existing roles)
   */
  static async addRole(
    userId: string,
    roleId: string,
    isPrimary: boolean = false,
    assignedBy?: string
  ): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();

      // If this should be primary, unset other primary roles first
      if (isPrimary) {
        await (supabase as any)
          .from('user_roles')
          .update({ is_primary: false })
          .eq('user_id', userId)
          .eq('is_primary', true);
      }

      const { error } = await (supabase as any).from('user_roles').insert({
        user_id: userId,
        role_id: roleId,
        is_primary: isPrimary,
        assigned_by: assignedBy || null
      });

      if (error) {
        // If it's a unique constraint violation, the role is already assigned
        if (error.code === '23505') {
          throw new Error('This role is already assigned to the user');
        }
        throw error;
      }

      console.log(`[users/roles] Added role ${roleId} to user ${userId}`);
    } catch (error) {
      console.error('[users/roles] Failed to add role:', error);
      throw error;
    }
  }

  /**
   * Remove a role from a user
   */
  static async removeRole(userId: string, roleId: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();

      // Check if this is the only role
      const { count, error: countError } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (countError) throw countError;

      if (count && count <= 1) {
        throw new Error(
          'Cannot remove the last role. Users must have at least one role.'
        );
      }

      // Check if this is the primary role
      const { data: roleToRemove, error: fetchError } = await supabase
        .from('user_roles')
        .select('is_primary')
        .eq('user_id', userId)
        .eq('role_id', roleId)
        .single();

      if (fetchError) throw fetchError;

      // Delete the role assignment
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role_id', roleId);

      if (deleteError) throw deleteError;

      // If we removed the primary role, set another role as primary
      if ((roleToRemove as any)?.is_primary) {
        const { data: remainingRoles, error: remainingError } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', userId)
          .order('assigned_at', { ascending: true })
          .limit(1);

        if (remainingError) throw remainingError;

        if (remainingRoles && remainingRoles.length > 0) {
          await (supabase as any)
            .from('user_roles')
            .update({ is_primary: true })
            .eq('id', (remainingRoles as any)[0].id);
        }
      }

      console.log(`[users/roles] Removed role ${roleId} from user ${userId}`);
    } catch (error) {
      console.error('[users/roles] Failed to remove role:', error);
      throw error;
    }
  }

  /**
   * Set the primary role for a user
   */
  static async setPrimaryRole(userId: string, roleId: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();

      // First, verify the role is assigned to this user
      const { data: existingRole, error: checkError } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .eq('role_id', roleId)
        .single();

      if (checkError || !existingRole) {
        throw new Error('This role is not assigned to the user');
      }

      // Unset all primary flags for this user
      await (supabase as any)
        .from('user_roles')
        .update({ is_primary: false })
        .eq('user_id', userId);

      // Set the new primary role
      const { error: updateError } = await (supabase as any)
        .from('user_roles')
        .update({ is_primary: true })
        .eq('user_id', userId)
        .eq('role_id', roleId);

      if (updateError) throw updateError;

      console.log(
        `[users/roles] Set primary role ${roleId} for user ${userId}`
      );
    } catch (error) {
      console.error('[users/roles] Failed to set primary role:', error);
      throw error;
    }
  }

  /**
   * Get merged permissions for a user using Union (OR) logic
   * If ANY role grants a permission, the user has that permission
   *
   * Can use either client-side calculation or database function
   */
  static async getMergedPermissions(
    userId: string,
    useDbFunction: boolean = true
  ): Promise<Record<string, boolean>> {
    try {
      const supabase = createClientSupabaseClient();

      if (useDbFunction) {
        // Use the optimized database function
        const { data, error } = await (supabase as any).rpc(
          'get_user_merged_permissions',
          {
            p_user_id: userId
          }
        );

        if (error) {
          console.warn(
            '[users/roles] DB function failed, falling back to client-side:',
            error
          );
          return this.getMergedPermissionsClientSide(userId);
        }

        return data || {};
      }

      return this.getMergedPermissionsClientSide(userId);
    } catch (error) {
      console.error('[users/roles] Failed to get merged permissions:', error);
      throw error;
    }
  }

  /**
   * Client-side implementation of permission merging
   * Used as fallback if database function fails
   */
  private static async getMergedPermissionsClientSide(
    userId: string
  ): Promise<Record<string, boolean>> {
    try {
      const roles = await this.getUserRoles(userId);
      const merged: Record<string, boolean> = {};

      for (const assignment of roles) {
        const permissions = assignment.permissions || {};
        for (const [key, value] of Object.entries(permissions)) {
          // Union (OR) logic: if ANY role grants permission, user has it
          if (value === true) {
            merged[key] = true;
          } else if (merged[key] !== true) {
            merged[key] = value;
          }
        }
      }

      return merged;
    } catch (error) {
      console.error(
        '[users/roles] Failed to calculate client-side permissions:',
        error
      );
      throw error;
    }
  }

  /**
   * Check if a user has a specific permission
   */
  static async hasPermission(
    userId: string,
    permission: string
  ): Promise<boolean> {
    try {
      const permissions = await this.getMergedPermissions(userId);
      return permissions[permission] === true;
    } catch (error) {
      console.error('[users/roles] Failed to check permission:', error);
      return false;
    }
  }

  /**
   * Check if a user has any of the specified permissions
   */
  static async hasAnyPermission(
    userId: string,
    permissions: string[]
  ): Promise<boolean> {
    try {
      const userPermissions = await this.getMergedPermissions(userId);
      return permissions.some((p) => userPermissions[p] === true);
    } catch (error) {
      console.error('[users/roles] Failed to check permissions:', error);
      return false;
    }
  }

  /**
   * Check if a user has all of the specified permissions
   */
  static async hasAllPermissions(
    userId: string,
    permissions: string[]
  ): Promise<boolean> {
    try {
      const userPermissions = await this.getMergedPermissions(userId);
      return permissions.every((p) => userPermissions[p] === true);
    } catch (error) {
      console.error('[users/roles] Failed to check permissions:', error);
      return false;
    }
  }

  /**
   * Get all available roles (for role selector)
   */
  static async getAvailableRoles(
    institutionId?: string
  ): Promise<CustomRole[]> {
    try {
      const supabase = createClientSupabaseClient();

      const query = supabase
        .from('custom_roles')
        .select('*')
        .order('role_name', { ascending: true });

      // Note: custom_roles may not have institution_id filter
      // This can be extended based on your requirements

      const { data, error } = await query;

      if (error) throw error;

      // Type assertion: permissions is stored as Json but should be typed as Record<string, boolean>
      return (data || []) as CustomRole[];
    } catch (error) {
      console.error('[users/roles] Failed to get available roles:', error);
      throw error;
    }
  }

  /**
   * Get users by role ID
   */
  static async getUsersByRole(
    roleId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ userId: string; userName: string; email: string }[]> {
    try {
      const supabase = createClientSupabaseClient();

      const query = supabase
        .from('user_roles')
        .select(
          `
          user_id,
          profiles!inner (
            full_name,
            email
          )
        `
        )
        .eq('role_id', roleId);

      if (options?.limit) {
        query.limit(options.limit);
      }

      if (options?.offset) {
        query.range(options.offset, options.offset + (options.limit || 10) - 1);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((item: any) => ({
        userId: item.user_id,
        userName: item.profiles?.full_name || 'Unknown',
        email: item.profiles?.email || ''
      }));
    } catch (error) {
      console.error('[users/roles] Failed to get users by role:', error);
      throw error;
    }
  }

  /**
   * Bulk assign roles to multiple users
   */
  static async bulkAssignRoles(
    userIds: string[],
    roleIds: string[],
    primaryRoleId: string,
    assignedBy?: string
  ): Promise<{
    success: string[];
    failed: { userId: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { userId: string; error: string }[] = [];

    for (const userId of userIds) {
      try {
        await this.assignRoles(userId, roleIds, primaryRoleId, assignedBy);
        success.push(userId);
      } catch (error) {
        failed.push({
          userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    if (success.length > 0) {
      toast.success(`Successfully updated roles for ${success.length} user(s)`);
    }

    if (failed.length > 0) {
      toast.error(`Failed to update roles for ${failed.length} user(s)`);
    }

    return { success, failed };
  }
}
