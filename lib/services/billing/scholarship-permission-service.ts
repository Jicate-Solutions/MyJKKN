import { getSupabaseClient } from '@/lib/supabase/client';

export interface ScholarshipPermissions {
  role_name: string;
  role_key: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  user_count?: number;
}

export interface PermissionTemplate {
  id: string;
  name: string;
  description: string;
  permissions: {
    can_view: boolean;
    can_create: boolean;
    can_edit: boolean;
    can_delete: boolean;
    can_approve: boolean;
  };
}

// Map between our UI permission names and the actual JSONB keys in custom_roles.permissions
const PERMISSION_KEY_MAP: Record<string, string> = {
  can_view: 'billing.discounts.view',
  can_create: 'billing.discounts.create',
  can_edit: 'billing.discounts.edit',
  can_delete: 'billing.discounts.delete',
  can_approve: 'billing.discounts.approve'
};

export const PERMISSION_TEMPLATES: PermissionTemplate[] = [
  {
    id: 'full_access',
    name: 'Full Manager',
    description: 'Complete scholarship management access',
    permissions: {
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: true,
      can_approve: true
    }
  },
  {
    id: 'creator',
    name: 'Creator',
    description: 'Can create and edit scholarships (needs approval)',
    permissions: {
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: false,
      can_approve: false
    }
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Can review and approve scholarships',
    permissions: {
      can_view: true,
      can_create: false,
      can_edit: false,
      can_delete: false,
      can_approve: true
    }
  },
  {
    id: 'readonly',
    name: 'Read Only',
    description: 'View-only access to scholarships',
    permissions: {
      can_view: true,
      can_create: false,
      can_edit: false,
      can_delete: false,
      can_approve: false
    }
  },
  {
    id: 'no_access',
    name: 'No Access',
    description: 'Remove all scholarship permissions',
    permissions: {
      can_view: false,
      can_create: false,
      can_edit: false,
      can_delete: false,
      can_approve: false
    }
  }
];

export class ScholarshipPermissionService {
  /**
   * Get scholarship permissions for all roles.
   * Reads from custom_roles table and profiles table in the real database.
   */
  static async getAllScholarshipPermissions(): Promise<
    ScholarshipPermissions[]
  > {
    const supabase = getSupabaseClient();

    // Get all roles with their permissions JSONB
    const { data: rolesData, error: rolesError } = await supabase
      .from('custom_roles')
      .select('role_key, role_name, permissions');

    if (rolesError) {
      console.error(
        '[billing/scholarship-permissions] Failed to fetch custom_roles:',
        rolesError
      );
      throw rolesError;
    }

    if (!rolesData || rolesData.length === 0) {
      console.warn(
        '[billing/scholarship-permissions] No roles found in custom_roles table'
      );
      return [];
    }

    // Get user counts grouped by role from profiles
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('role');

    if (profilesError) {
      console.warn(
        '[billing/scholarship-permissions] Failed to fetch profiles for user counts:',
        profilesError
      );
      // Don't throw - user counts are supplementary, not critical
    }

    // Count users per role
    const roleUserCounts: Record<string, number> = {};
    if (profilesData) {
      for (const profile of profilesData) {
        if (profile.role) {
          roleUserCounts[profile.role] =
            (roleUserCounts[profile.role] || 0) + 1;
        }
      }
    }

    // Map roles to ScholarshipPermissions format
    const permissions: ScholarshipPermissions[] = rolesData.map(
      (role) => {
        const perms =
          (role.permissions as Record<string, boolean | string> | null) || {};

        return {
          role_name: role.role_name,
          role_key: role.role_key,
          can_view: perms[PERMISSION_KEY_MAP.can_view] === true,
          can_create: perms[PERMISSION_KEY_MAP.can_create] === true,
          can_edit: perms[PERMISSION_KEY_MAP.can_edit] === true,
          can_delete: perms[PERMISSION_KEY_MAP.can_delete] === true,
          can_approve: perms[PERMISSION_KEY_MAP.can_approve] === true,
          user_count: roleUserCounts[role.role_key] || 0
        };
      }
    );

    return permissions;
  }

  /**
   * Get scholarship permissions for a specific role.
   */
  static async getScholarshipPermissions(
    roleKey: string
  ): Promise<ScholarshipPermissions | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('custom_roles')
      .select('role_key, role_name, permissions')
      .eq('role_key', roleKey)
      .single();

    if (error) {
      console.error(
        `[billing/scholarship-permissions] Failed to fetch permissions for role ${roleKey}:`,
        error
      );
      throw error;
    }

    if (!data) return null;

    const perms =
      (data.permissions as Record<string, boolean | string> | null) || {};

    return {
      role_name: data.role_name,
      role_key: data.role_key,
      can_view: perms[PERMISSION_KEY_MAP.can_view] === true,
      can_create: perms[PERMISSION_KEY_MAP.can_create] === true,
      can_edit: perms[PERMISSION_KEY_MAP.can_edit] === true,
      can_delete: perms[PERMISSION_KEY_MAP.can_delete] === true,
      can_approve: perms[PERMISSION_KEY_MAP.can_approve] === true
    };
  }

  /**
   * Update scholarship permissions for a role by directly modifying the
   * custom_roles.permissions JSONB column. This ensures the same keys
   * are written that getAllScholarshipPermissions reads.
   */
  static async updateScholarshipPermissions(
    roleKey: string,
    newPermissions: {
      can_view: boolean;
      can_create: boolean;
      can_edit: boolean;
      can_delete: boolean;
      can_approve: boolean;
    }
  ): Promise<void> {
    const supabase = getSupabaseClient();

    // First, fetch the current permissions JSONB so we can merge
    const { data: roleData, error: fetchError } = await supabase
      .from('custom_roles')
      .select('permissions')
      .eq('role_key', roleKey)
      .single();

    if (fetchError) {
      console.error(
        `[billing/scholarship-permissions] Failed to fetch role ${roleKey} for update:`,
        fetchError
      );
      throw fetchError;
    }

    // Merge the existing permissions with the updated scholarship keys
    const existingPerms =
      (roleData?.permissions as Record<string, boolean> | null) || {};

    const updatedPerms: Record<string, boolean> = {
      ...existingPerms,
      [PERMISSION_KEY_MAP.can_view]: newPermissions.can_view,
      [PERMISSION_KEY_MAP.can_create]: newPermissions.can_create,
      [PERMISSION_KEY_MAP.can_edit]: newPermissions.can_edit,
      [PERMISSION_KEY_MAP.can_delete]: newPermissions.can_delete,
      [PERMISSION_KEY_MAP.can_approve]: newPermissions.can_approve
    };

    // Write back the merged permissions
    // Cast to the Json-compatible shape that Supabase expects
    const { error: updateError } = await supabase
      .from('custom_roles')
      .update({
        permissions: updatedPerms as { [key: string]: boolean }
      })
      .eq('role_key', roleKey);

    if (updateError) {
      console.error(
        `[billing/scholarship-permissions] Failed to update permissions for role ${roleKey}:`,
        updateError
      );
      throw updateError;
    }
  }

  /**
   * Apply a permission template to a role.
   * Uses direct JSONB update for reliability.
   */
  static async applyPermissionTemplate(
    roleKey: string,
    templateId: string
  ): Promise<void> {
    const template = PERMISSION_TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      throw new Error(`Permission template "${templateId}" not found`);
    }

    // Directly update the JSONB permissions - same code path for all templates
    await this.updateScholarshipPermissions(roleKey, template.permissions);
  }

  /**
   * Get permission summary statistics
   */
  static async getPermissionSummary(): Promise<{
    canCreate: number;
    canApprove: number;
    canView: number;
    noAccess: number;
  }> {
    const permissions = await this.getAllScholarshipPermissions();

    return {
      canCreate: permissions.filter((p) => p.can_create).length,
      canApprove: permissions.filter((p) => p.can_approve).length,
      canView: permissions.filter((p) => p.can_view).length,
      noAccess: permissions.filter((p) => !p.can_view && !p.can_create).length
    };
  }
}
