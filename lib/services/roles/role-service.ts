import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  CustomRole,
  CustomRoleCreate,
  CustomRoleUpdate,
  SYSTEM_ROLES
} from '@/types/auth';
import { toast } from 'react-hot-toast';
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/constants/profile';

export class RoleService {
  private static supabase = createClientSupabaseClient();

  /**
   * Ensures that the super_admin role exists with all permissions enabled
   */
  static async ensureSuperAdminRole(): Promise<void> {
    try {
      // First check if super_admin role exists
      const { data: existingSuperAdmin, error: checkError } =
        await this.supabase
          .from('custom_roles')
          .select('*')
          .eq('role_key', SYSTEM_ROLES.SUPER_ADMIN)
          .maybeSingle();

      if (checkError) throw checkError;

      // If role doesn't exist, create it with all permissions
      if (!existingSuperAdmin) {
        // Get all permission keys from permission categories
        const allPermissions: Record<string, boolean> = {};

        // Set all permissions to true
        const { data: permissions } = await this.supabase
          .from('permissions')
          .select('permission_key');

        if (permissions) {
          permissions.forEach((perm) => {
            allPermissions[perm.permission_key] = true;
          });
        }

        // Create super_admin role
        const superAdminRole: CustomRoleCreate = {
          role_key: SYSTEM_ROLES.SUPER_ADMIN,
          role_name: 'Super Administrator',
          description: 'Full system access with all permissions',
          permissions: allPermissions,
          is_system_role: true
        };

        const { error: createError } = await this.supabase
          .from('custom_roles')
          .insert([superAdminRole]);

        if (createError) throw createError;
      }
      // If role exists but doesn't have permissions set correctly, update them
      else if (
        existingSuperAdmin &&
        (!existingSuperAdmin.permissions ||
          Object.values(existingSuperAdmin.permissions).some(
            (p) => p === false
          ))
      ) {
        // Get all permission keys
        const allPermissions: Record<string, boolean> = {};

        // Set all permissions to true
        const { data: permissions } = await this.supabase
          .from('permissions')
          .select('permission_key');

        if (permissions) {
          permissions.forEach((perm) => {
            allPermissions[perm.permission_key] = true;
          });
        }

        // Update super_admin role permissions
        const { error: updateError } = await this.supabase
          .from('custom_roles')
          .update({ permissions: allPermissions })
          .eq('role_key', SYSTEM_ROLES.SUPER_ADMIN);

        if (updateError) throw updateError;
      }
    } catch (error) {
      console.error('Error ensuring super_admin role:', error);
    }
  }

  /**
   * Get all custom roles
   */
  static async getAllRoles(): Promise<CustomRole[]> {
    try {
      const { data, error } = await this.supabase
        .from('custom_roles')
        .select('*')
        .order('role_name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching roles:', error);
      throw error;
    }
  }

  /**
   * Get a role by its key
   */
  static async getRoleByKey(roleKey: string): Promise<CustomRole | null> {
    try {
      const { data, error } = await this.supabase
        .from('custom_roles')
        .select('*')
        .eq('role_key', roleKey)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error(`Error fetching role with key ${roleKey}:`, error);
      throw error;
    }
  }

  /**
   * Create a new role
   */
  static async createRole(role: CustomRoleCreate): Promise<CustomRole> {
    try {
      // Set default permissions if not provided
      const roleData = {
        ...role,
        permissions: role.permissions || DEFAULT_ROLE_PERMISSIONS
      };

      const { data, error } = await this.supabase
        .from('custom_roles')
        .insert([roleData])
        .select()
        .single();

      if (error) throw error;
      toast.success(`Role ${role.role_name} created successfully`);
      return data;
    } catch (error) {
      console.error('Error creating role:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create role'
      );
      throw error;
    }
  }

  /**
   * Update an existing role
   */
  static async updateRole(
    roleKey: string,
    updates: CustomRoleUpdate
  ): Promise<CustomRole> {
    try {
      // Super admin check
      if (roleKey === 'super_admin') {
        // For super_admin, we don't allow permission changes
        // Only allow name and description updates
        const filteredUpdates: CustomRoleUpdate = {
          role_name: updates.role_name,
          description: updates.description
        };

        const { data, error } = await this.supabase
          .from('custom_roles')
          .update(filteredUpdates)
          .eq('role_key', roleKey)
          .select()
          .single();

        if (error) throw error;
        toast.success(`Super Admin role details updated`);
        return data;
      }

      // For all other roles, proceed with the update
      const { data, error } = await this.supabase
        .from('custom_roles')
        .update(updates)
        .eq('role_key', roleKey)
        .select()
        .single();

      if (error) throw error;
      toast.success(`Role updated successfully`);
      return data;
    } catch (error) {
      console.error(`Error updating role ${roleKey}:`, error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update role'
      );
      throw error;
    }
  }

  /**
   * Delete a role
   */
  static async deleteRole(roleKey: string): Promise<void> {
    try {
      // First check if it's a system role
      const { data: role } = await this.supabase
        .from('custom_roles')
        .select('is_system_role')
        .eq('role_key', roleKey)
        .single();

      if (role?.is_system_role) {
        throw new Error('Cannot delete system roles');
      }

      // Check if any users have this role
      const { count } = await this.supabase
        .from('profiles')
        .select('id', { count: 'exact' })
        .eq('role', roleKey);

      if (count && count > 0) {
        throw new Error(
          `Cannot delete role that is assigned to ${count} users`
        );
      }

      const { error } = await this.supabase
        .from('custom_roles')
        .delete()
        .eq('role_key', roleKey);

      if (error) throw error;
      toast.success('Role deleted successfully');
    } catch (error) {
      console.error(`Error deleting role ${roleKey}:`, error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete role'
      );
      throw error;
    }
  }

  /**
   * Get available roles for assignment
   */
  static async getAssignableRoles(): Promise<CustomRole[]> {
    try {
      const { data, error } = await this.supabase
        .from('custom_roles')
        .select('*')
        .order('role_name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching assignable roles:', error);
      throw error;
    }
  }
}
