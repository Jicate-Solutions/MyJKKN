import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  CustomRole,
  CustomRoleCreate,
  CustomRoleUpdate,
  SYSTEM_ROLES
} from '@/types/auth';
import { toast } from 'react-hot-toast';
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/constants/permissions';

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
  static async getRoleByKey(key: string): Promise<CustomRole | null> {
    const { data, error } = await this.supabase
      .from('custom_roles')
      .select('*')
      .eq('role_key', key)
      .limit(1) // Fetch the first match
      .maybeSingle(); // Use maybeSingle to return null if no rows are found

    if (error) {
      console.error(`Error fetching role by key "${key}":`, error);
      // Don't throw the error, just return null to be handled by the caller
      return null;
    }
    return data;
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
   * Validate permissions object to ensure it's properly formatted
   */
  private static validatePermissions(
    permissions: Record<string, boolean> | undefined
  ): Record<string, boolean> {
    // If permissions are undefined, return empty object
    if (!permissions) {
      console.warn('Empty permissions object received, using empty object');
      return {};
    }

    // Validate permissions object structure
    const validatedPermissions: Record<string, boolean> = {};

    try {
      Object.entries(permissions).forEach(([key, value]) => {
        // Ensure all values are boolean
        validatedPermissions[key] = Boolean(value);
      });

      console.log(
        'Validated permissions object with',
        Object.keys(validatedPermissions).length,
        'keys'
      );
      return validatedPermissions;
    } catch (err) {
      console.error('Error validating permissions:', err);
      return {};
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

        if (error) {
          console.error('Error updating super admin role:', error);
          throw error;
        }

        toast.success(`Super Admin role details updated`);
        return data;
      }

      // For all other roles, proceed with the update

      // First do a direct check of the role existence

      const { data: existingRole, error: fetchError } = await this.supabase
        .from('custom_roles')
        .select('*')
        .eq('role_key', roleKey)
        .single();

      if (fetchError) {
        console.error('Error fetching role:', fetchError);
        throw new Error(`Role ${roleKey} not found or could not be accessed`);
      }

      if (!existingRole) {
        throw new Error(`Role with key ${roleKey} not found`);
      }

      // Create a clean basic update
      const basicUpdates: any = {
        role_name: updates.role_name || existingRole.role_name,
        description: updates.description || existingRole.description
      };

      // First update the basic info

      const { error: basicUpdateError } = await this.supabase
        .from('custom_roles')
        .update(basicUpdates)
        .eq('role_key', roleKey);

      if (basicUpdateError) {
        console.error('Error updating basic role info:', basicUpdateError);
        throw basicUpdateError;
      }

      // If permissions are included, update them separately
      if (updates.permissions) {
        // Clean up permissions - convert everything to boolean
        const cleanPermissions: Record<string, boolean> = {};

        Object.entries(updates.permissions).forEach(([key, value]) => {
          cleanPermissions[key] = Boolean(value);
        });

        // Create a simple clean object for the permissions update
        const permissionUpdate = {
          permissions: cleanPermissions
        };

        // Update just the permissions
        const { error: permUpdateError } = await this.supabase
          .from('custom_roles')
          .update(permissionUpdate)
          .eq('role_key', roleKey);

        if (permUpdateError) {
          console.error('Error updating permissions:', permUpdateError);
          throw permUpdateError;
        }
      }

      // Fetch the updated role to return
      const { data: updatedRole, error: finalFetchError } = await this.supabase
        .from('custom_roles')
        .select('*')
        .eq('role_key', roleKey)
        .single();

      if (finalFetchError) {
        console.error('Error fetching updated role:', finalFetchError);
        throw finalFetchError;
      }

      return updatedRole;
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

  /**
   * Migrate legacy permissions to the new format
   * This maps old permission keys like 'view_users' to new format like 'users.view'
   */
  static async migratePermissions(): Promise<void> {
    try {
      // Get all roles
      const { data: roles, error } = await this.supabase
        .from('custom_roles')
        .select('*');

      if (error) throw error;
      if (!roles || roles.length === 0) return;

      // Permission mapping from old to new format
      const permissionMapping: Record<string, string> = {
        // User Management
        view_users: 'users.view',
        manage_users: 'users.edit',
        assign_roles: 'roles.assign',
        manage_roles: 'roles.edit',

        // Applications
        view_applications: 'applications.view',
        manage_applications: 'applications.edit',
        manage_application_categories: 'applications.categories.edit',
        view_api_guidelines: 'application_hub.guidelines.view',

        // Organizations
        view_institutions: 'organizations.institutions.view',
        view_degrees: 'organizations.degrees.view',
        view_departments: 'organizations.departments.view',
        view_programs: 'organizations.programs.view',
        view_courses: 'organizations.courses.view',
        view_semesters: 'organizations.semesters.view',
        view_sections: 'organizations.sections.view',
        view_course_mappings: 'organizations.course_mappings.view',

        // Staff
        view_staff_categories: 'staff.categories.view',
        view_staff: 'staff.view',
        manage_staff: 'staff.edit',

        // Academic
        view_academic_years: 'academic.years.view',
        manage_timetables: 'academic.timetables.edit',

        // Resources
        view_physical_resources_dashboard: 'physical_resources.dashboard.view',
        view_physical_resources: 'physical_resources.view',
        view_physical_resources_categories:
          'physical_resources.categories.view',
        view_physical_resources_reservations:
          'physical_resources.reservations.view',
        view_physical_resources_policies: 'physical_resources.policies.view',
        view_physical_resources_reports: 'physical_resources.reports.view',
        view_physical_resources_requests: 'physical_resources.requests.view',

        // System
        manage_api: 'system.api.edit'
      };

      // Update each role
      for (const role of roles) {
        const oldPermissions = role.permissions || {};
        const newPermissions: Record<string, boolean> = { ...oldPermissions };

        // Add new permissions based on old ones
        for (const [oldKey, newKey] of Object.entries(permissionMapping)) {
          if (oldPermissions[oldKey]) {
            newPermissions[newKey] = true;

            // For edit permissions, also add view permissions
            if (newKey.endsWith('.edit')) {
              const viewKey = newKey.replace('.edit', '.view');
              newPermissions[viewKey] = true;
            }

            // For manage permissions, derive create permissions
            if (oldKey.startsWith('manage_')) {
              const createKey = newKey.replace('.edit', '.create');
              newPermissions[createKey] = true;
            }
          }
        }

        // Update the role with new permissions
        await this.supabase
          .from('custom_roles')
          .update({ permissions: newPermissions })
          .eq('id', role.id);
      }

      toast.success('Permissions successfully migrated to new format');
    } catch (error) {
      console.error('Error migrating permissions:', error);
      toast.error('Failed to migrate permissions');
    }
  }

  /**
   * Check if a user has specific action permission for a module
   */
  static async checkActionPermission(
    userId: string,
    module: string,
    action: string
  ): Promise<boolean> {
    try {
      // Get user's role
      const { data: profile, error: profileError } = await this.supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;
      if (!profile) return false;

      // Get role permissions
      const role = await this.getRoleByKey(profile.role);
      if (!role) return false;

      // Check for super admin (has all permissions)
      if (role.role_key === SYSTEM_ROLES.SUPER_ADMIN) return true;

      const permissions = role.permissions || {};
      const permissionKey = `${module}.${action}`;

      // Check for specific permission
      return !!permissions[permissionKey];
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }
}
