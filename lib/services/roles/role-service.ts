import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { Database } from '@/types/database.types';
import {
  CustomRole,
  CustomRoleCreate,
  CustomRoleUpdate,
  SYSTEM_ROLES
} from '@/types/auth';
import { toast } from 'react-hot-toast';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_CATEGORIES } from '@/lib/constants/permissions';

// Database types for custom_roles table
type CustomRoleRow = Database['public']['Tables']['custom_roles']['Row'];
type CustomRoleInsert = Database['public']['Tables']['custom_roles']['Insert'];
type CustomRoleDbUpdate = Database['public']['Tables']['custom_roles']['Update'];

/**
 * Billing permission tiers per system role.
 * Only the keys that differ from the default (no billing access) need to be listed.
 * 'administrator' is handled separately — it receives all permissions.
 */
const SYSTEM_ROLE_BILLING_PERMISSIONS: Record<string, Record<string, boolean>> = {
  // Principal: view all + approve discounts/refunds + reports
  [SYSTEM_ROLES.PRINCIPAL]: {
    'billing.schedule.view': true,
    'billing.receipts.view': true,
    'billing.discounts.view': true,
    'billing.discounts.approve': true,
    'billing.refunds.view': true,
    'billing.refunds.approve': true,
    'billing.invoices.view': true,
    'billing.reports.view': true,
  },
  // HOD: view schedule/receipts/invoices/reports + approve discounts
  [SYSTEM_ROLES.HOD]: {
    'billing.schedule.view': true,
    'billing.receipts.view': true,
    'billing.discounts.view': true,
    'billing.discounts.approve': true,
    'billing.invoices.view': true,
    'billing.reports.view': true,
  },
  // Faculty: view schedule + receipts + invoices (own institution)
  [SYSTEM_ROLES.FACULTY]: {
    'billing.schedule.view': true,
    'billing.receipts.view': true,
    'billing.invoices.view': true,
  },
  // Staff: view schedule + receipts + invoices
  [SYSTEM_ROLES.STAFF]: {
    'billing.schedule.view': true,
    'billing.receipts.view': true,
    'billing.invoices.view': true,
  },
  // Student: view own billing data (sidebar relabeling handles isolation)
  [SYSTEM_ROLES.STUDENT]: {
    'billing.schedule.view': true,
    'billing.receipts.view': true,
    'billing.invoices.view': true,
  },
  // Parent: read-only (schedule + invoices)
  [SYSTEM_ROLES.PARENT]: {
    'billing.schedule.view': true,
    'billing.invoices.view': true,
  },
  // Guest and Driver: no billing access
  [SYSTEM_ROLES.GUEST]: {},
  [SYSTEM_ROLES.DRIVER]: {},
};

export class RoleService {
  private static get supabase() { return createClientSupabaseClient(); }

  /**
   * Convert database row to CustomRole format
   */
  private static toCustomRole(row: CustomRoleRow): CustomRole {
    return {
      id: row.id,
      institution_id: (row as any).institution_id ?? null,
      role_key: row.role_key,
      role_name: row.role_name,
      description: row.description,
      is_system_role: row.is_system_role ?? false,
      permissions: (row.permissions as Record<string, boolean>) || {},
      created_at: row.created_at ?? new Date().toISOString(),
      updated_at: row.updated_at ?? new Date().toISOString(),
      created_by: row.created_by
    };
  }

  /**
   * Build a permissions object with all known permission keys set to true.
   * Derives keys from PERMISSION_CATEGORIES constant.
   */
  private static getAllPermissionsEnabled(): Record<string, boolean> {
    const allPermissions: Record<string, boolean> = {};
    for (const category of PERMISSION_CATEGORIES) {
      for (const perm of category.permissions) {
        allPermissions[perm.key] = true;
      }
    }
    return allPermissions;
  }

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
        const allPermissions = this.getAllPermissionsEnabled();

        // Create super_admin role
        const insertData: CustomRoleInsert = {
          role_key: SYSTEM_ROLES.SUPER_ADMIN,
          role_name: 'Super Administrator',
          description: 'Full system access with all permissions',
          permissions: allPermissions as any,
          is_system_role: true
        };

        const { error: createError } = await (this.supabase as any)
          .from('custom_roles')
          .insert([insertData]);

        if (createError) {
          console.error('[RoleService] Error creating super_admin role:', createError);
          throw createError;
        }
      }
      // If role exists but doesn't have permissions set correctly, update them
      else if (existingSuperAdmin) {
        const currentPermissions = (existingSuperAdmin as any).permissions as Record<string, boolean> | null;

        if (
          !currentPermissions ||
          Object.values(currentPermissions).some((p) => p === false)
        ) {
          const allPermissions = this.getAllPermissionsEnabled();

          // Update super_admin role permissions
          const updateData: CustomRoleDbUpdate = {
            permissions: allPermissions as any
          };

          const { error: updateError } = await (this.supabase as any)
            .from('custom_roles')
            .update(updateData)
            .eq('role_key', SYSTEM_ROLES.SUPER_ADMIN);

          if (updateError) {
            console.error('[RoleService] Error updating super_admin role:', updateError);
            throw updateError;
          }
        }
      }
    } catch (error) {
      console.error('Error ensuring super_admin role:', error);
    }
  }

  /**
   * Ensures all system roles exist with the correct billing permission tiers.
   *
   * Idempotent — safe to call multiple times. Existing permissions are never
   * removed; only missing billing keys are added.
   *
   * Call this after ensureSuperAdminRole() from any admin-authenticated context
   * (e.g., the role-management page on mount, or a dedicated /api/roles/init route).
   */
  static async ensureAllSystemRoles(): Promise<void> {
    const systemRoles = [
      { key: SYSTEM_ROLES.ADMINISTRATOR, name: 'Administrator', desc: 'Full access to all features (same as Super Admin)' },
      { key: SYSTEM_ROLES.PRINCIPAL,     name: 'Principal',     desc: 'View all and approve discounts/refunds' },
      { key: SYSTEM_ROLES.HOD,           name: 'Head of Department', desc: 'View and approve discounts for own department' },
      { key: SYSTEM_ROLES.FACULTY,       name: 'Faculty',       desc: 'View schedules, receipts and invoices' },
      { key: SYSTEM_ROLES.STAFF,         name: 'Staff',         desc: 'View schedules, receipts and invoices' },
      { key: SYSTEM_ROLES.STUDENT,       name: 'Student',       desc: 'View own billing information' },
      { key: SYSTEM_ROLES.PARENT,        name: 'Parent',        desc: 'Read-only access to schedules and invoices' },
      { key: SYSTEM_ROLES.GUEST,         name: 'Guest',         desc: 'Limited access — dashboard and profile only' },
      { key: SYSTEM_ROLES.DRIVER,        name: 'Driver',        desc: 'Transport access only' },
    ];

    for (const roleSpec of systemRoles) {
      try {
        const billingPerms = SYSTEM_ROLE_BILLING_PERMISSIONS[roleSpec.key] ?? {};

        const { data: existing, error: checkError } = await (this.supabase as any)
          .from('custom_roles')
          .select('permissions')
          .eq('role_key', roleSpec.key)
          .maybeSingle();

        if (checkError) {
          console.error(`[RoleService] Error checking ${roleSpec.key} role:`, checkError);
          continue;
        }

        if (!existing) {
          // Role doesn't exist — create it
          const basePermissions: Record<string, boolean> =
            roleSpec.key === SYSTEM_ROLES.ADMINISTRATOR
              ? this.getAllPermissionsEnabled()                     // admin = all perms
              : { ...DEFAULT_ROLE_PERMISSIONS, ...billingPerms };  // others = base + billing tier

          const insertData: CustomRoleInsert = {
            role_key: roleSpec.key,
            role_name: roleSpec.name,
            description: roleSpec.desc,
            permissions: basePermissions as any,
            is_system_role: true,
          };

          const { error: insertError } = await (this.supabase as any)
            .from('custom_roles')
            .insert([insertData]);

          if (insertError) {
            console.error(`[RoleService] Error creating ${roleSpec.key} role:`, insertError);
          }
        } else {
          // Role exists — add any missing billing keys (never remove existing ones)
          const currentPerms = ((existing as any).permissions as Record<string, boolean>) || {};
          const missingBillingKeys = Object.keys(billingPerms).filter(k => !(k in currentPerms));

          if (roleSpec.key === SYSTEM_ROLES.ADMINISTRATOR) {
            // Administrator should always have all permissions
            const allPerms = this.getAllPermissionsEnabled();
            const missingAllKeys = Object.keys(allPerms).filter(k => !(k in currentPerms));
            if (missingAllKeys.length > 0) {
              const updatedPerms = { ...currentPerms, ...allPerms };
              const { error: updateError } = await (this.supabase as any)
                .from('custom_roles')
                .update({ permissions: updatedPerms as any })
                .eq('role_key', roleSpec.key);
              if (updateError) {
                console.error(`[RoleService] Error updating administrator permissions:`, updateError);
              }
            }
          } else if (missingBillingKeys.length > 0) {
            const updatedPerms = { ...currentPerms };
            for (const key of missingBillingKeys) {
              updatedPerms[key] = billingPerms[key];
            }
            const { error: updateError } = await (this.supabase as any)
              .from('custom_roles')
              .update({ permissions: updatedPerms as any })
              .eq('role_key', roleSpec.key);
            if (updateError) {
              console.error(`[RoleService] Error updating ${roleSpec.key} billing permissions:`, updateError);
            }
          }
        }
      } catch (err) {
        console.error(`[RoleService] Unexpected error for ${roleSpec.key}:`, err);
      }
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

      if (error) {
        console.error('[RoleService] Error fetching roles:', error);
        throw error;
      }
      
      return data ? data.map(row => this.toCustomRole(row)) : [];
    } catch (error) {
      console.error('[RoleService] Error in getAllRoles:', error);
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
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[RoleService] Error fetching role by key "${key}":`, error);
      return null;
    }
    
    return data ? this.toCustomRole(data) : null;
  }

  /**
   * Create a new role
   */
  static async createRole(role: CustomRoleCreate): Promise<CustomRole> {
    try {
      // Set default permissions if not provided
      const insertData: CustomRoleInsert = {
        role_key: role.role_key,
        role_name: role.role_name,
        description: role.description ?? null,
        permissions: (role.permissions || DEFAULT_ROLE_PERMISSIONS) as any,
        is_system_role: role.is_system_role ?? false,
        institution_id: role.institution_id ?? null
      } as any;

      const { data, error } = await (this.supabase as any)
        .from('custom_roles')
        .insert([insertData])
        .select()
        .single();

      if (error) {
        console.error('[RoleService] Error creating role:', error);
        throw error;
      }
      
      toast.success(`Role ${role.role_name} created successfully`);
      return this.toCustomRole(data);
    } catch (error) {
      console.error('[RoleService] Error in createRole:', error);
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
        const updateData: CustomRoleDbUpdate = {
          role_name: updates.role_name,
          description: updates.description ?? null
        };

        const { data, error } = await (this.supabase as any)
          .from('custom_roles')
          .update(updateData)
          .eq('role_key', roleKey)
          .select()
          .single();

        if (error) {
          console.error('[RoleService] Error updating super admin role:', error);
          throw error;
        }

        toast.success(`Super Admin role details updated`);
        return this.toCustomRole(data);
      }

      // For all other roles, proceed with the update

      // First check if role exists
      const { data: existingRole, error: fetchError } = await this.supabase
        .from('custom_roles')
        .select('*')
        .eq('role_key', roleKey)
        .single();

      if (fetchError) {
        console.error('[RoleService] Error fetching role:', fetchError);
        throw new Error(`Role ${roleKey} not found or could not be accessed`);
      }

      if (!existingRole) {
        throw new Error(`Role with key ${roleKey} not found`);
      }

      // Create basic update
      const existingRoleData = this.toCustomRole(existingRole);
      const basicUpdateData: CustomRoleDbUpdate = {
        role_name: updates.role_name ?? existingRoleData.role_name,
        description: updates.description ?? existingRoleData.description
      };

      // Update the basic info
      const { error: basicUpdateError } = await (this.supabase as any)
        .from('custom_roles')
        .update(basicUpdateData)
        .eq('role_key', roleKey);

      if (basicUpdateError) {
        console.error('[RoleService] Error updating basic role info:', basicUpdateError);
        throw basicUpdateError;
      }

      // If permissions are included, update them separately
      if (updates.permissions) {
        // Clean up permissions - convert everything to boolean
        const cleanPermissions: Record<string, boolean> = {};

        Object.entries(updates.permissions).forEach(([key, value]) => {
          cleanPermissions[key] = Boolean(value);
        });

        // Update just the permissions
        const permUpdateData: CustomRoleDbUpdate = {
          permissions: cleanPermissions as any
        };

        const { error: permUpdateError } = await (this.supabase as any)
          .from('custom_roles')
          .update(permUpdateData)
          .eq('role_key', roleKey);

        if (permUpdateError) {
          console.error('[RoleService] Error updating permissions:', permUpdateError);
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
        console.error('[RoleService] Error fetching updated role:', finalFetchError);
        throw finalFetchError;
      }

      return this.toCustomRole(updatedRole);
    } catch (error) {
      console.error(`[RoleService] Error updating role ${roleKey}:`, error);
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
      const { data: role, error: roleError } = await (this.supabase as any)
        .from('custom_roles')
        .select('is_system_role')
        .eq('role_key', roleKey)
        .single();

      if (roleError) {
        console.error('[RoleService] Error fetching role for deletion:', roleError);
        throw roleError;
      }

      if (role?.is_system_role) {
        throw new Error('Cannot delete system roles');
      }

      // Check if any users have this role
      const { count, error: countError } = await this.supabase
        .from('profiles')
        .select('id', { count: 'exact' })
        .eq('role', roleKey);

      if (countError) {
        console.error('[RoleService] Error checking role usage:', countError);
        throw countError;
      }

      if (count && count > 0) {
        throw new Error(
          `Cannot delete role that is assigned to ${count} users`
        );
      }

      const { error } = await this.supabase
        .from('custom_roles')
        .delete()
        .eq('role_key', roleKey);

      if (error) {
        console.error('[RoleService] Error deleting role:', error);
        throw error;
      }
      
      toast.success('Role deleted successfully');
    } catch (error) {
      console.error(`[RoleService] Error in deleteRole ${roleKey}:`, error);
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

      if (error) {
        console.error('[RoleService] Error fetching assignable roles:', error);
        throw error;
      }
      
      return data ? data.map(row => this.toCustomRole(row)) : [];
    } catch (error) {
      console.error('[RoleService] Error in getAssignableRoles:', error);
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
        const currentPerms = (role as any).permissions as Record<string, boolean> | null;
        const oldPermissions = currentPerms || {};
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
        const updateData: CustomRoleDbUpdate = {
          permissions: newPermissions as any
        };

        const { error: updateError } = await (this.supabase as any)
          .from('custom_roles')
          .update(updateData)
          .eq('id', (role as any).id);

        if (updateError) {
          console.error(`[RoleService] Error migrating role ${(role as any).id}:`, updateError);
        }
      }

      toast.success('Permissions successfully migrated to new format');
    } catch (error) {
      console.error('[RoleService] Error migrating permissions:', error);
      toast.error('Failed to migrate permissions');
    }
  }

  /**
   * Check if a user has specific action permission for a module.
   * Uses merged permissions from all assigned roles (multi-role support).
   */
  static async checkActionPermission(
    userId: string,
    module: string,
    action: string
  ): Promise<boolean> {
    try {
      // Check if user is super admin by profile flag
      const { data: profile, error: profileError } = await (this.supabase as any)
        .from('profiles')
        .select('role, is_super_admin')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('[RoleService] Error fetching profile:', profileError);
        throw profileError;
      }

      if (!profile) return false;

      // Check for super admin (by flag or role key)
      if (
        (profile as any).is_super_admin === true ||
        (profile as any).role === SYSTEM_ROLES.SUPER_ADMIN
      ) {
        return true;
      }

      // Get merged permissions from all assigned roles
      const { UserRolesService } = await import('@/lib/services/users/user-roles-service');
      const mergedPermissions = await UserRolesService.getMergedPermissions(userId);

      const permissionKey = `${module}.${action}`;
      return !!mergedPermissions[permissionKey];
    } catch (error) {
      console.error('[RoleService] Error checking permission:', error);
      return false;
    }
  }
}
