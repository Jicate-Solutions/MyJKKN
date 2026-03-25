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
   * Get scholarship permissions for all roles
   */
  static async getAllScholarshipPermissions(): Promise<
    ScholarshipPermissions[]
  > {
    try {
      const supabase = getSupabaseClient();

      // Get all roles with their scholarship permissions
      const { data: rolesData, error: rolesError } = await (supabase as any)
        .from('custom_roles')
        .select('role_key, role_name, permissions');

      if (rolesError) throw rolesError;

      // Get user counts for each role
      const { data: userCounts, error: countsError } = await (supabase as any)
        .from('profiles')
        .select('role')
        .neq('role', null);

      if (countsError) throw countsError;

      // Count users by role
      const roleUserCounts = userCounts.reduce(
        (acc: Record<string, number>, user: { role: string }) => {
          acc[user.role] = (acc[user.role] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      // Map to scholarship permissions format
      const permissions: ScholarshipPermissions[] = rolesData.map(
        (role: any) => ({
          role_name: role.role_name,
          role_key: role.role_key,
          can_view:
            role.permissions?.['billing.discounts.view'] === true ||
            role.permissions?.['billing.discounts.view'] === 'true',
          can_create:
            role.permissions?.['billing.discounts.create'] === true ||
            role.permissions?.['billing.discounts.create'] === 'true',
          can_edit:
            role.permissions?.['billing.discounts.edit'] === true ||
            role.permissions?.['billing.discounts.edit'] === 'true',
          can_delete:
            role.permissions?.['billing.discounts.delete'] === true ||
            role.permissions?.['billing.discounts.delete'] === 'true',
          can_approve:
            role.permissions?.['billing.discounts.approve'] === true ||
            role.permissions?.['billing.discounts.approve'] === 'true',
          user_count: roleUserCounts[role.role_key] || 0
        })
      );

      return permissions;
    } catch (error) {
      console.error('Error fetching scholarship permissions:', error);
      throw error;
    }
  }

  /**
   * Get scholarship permissions for a specific role
   */
  static async getScholarshipPermissions(
    roleKey: string
  ): Promise<ScholarshipPermissions | null> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await (supabase as any).rpc(
        'get_scholarship_permissions',
        {
          target_role_key: roleKey
        }
      );

      if (error) throw error;

      return data?.[0] || null;
    } catch (error) {
      console.error('Error fetching role permissions:', error);
      throw error;
    }
  }

  /**
   * Update scholarship permissions for a role
   */
  static async updateScholarshipPermissions(
    roleKey: string,
    permissions: {
      can_view: boolean;
      can_create: boolean;
      can_edit: boolean;
      can_delete: boolean;
      can_approve: boolean;
    }
  ): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      const { error } = await (supabase as any).rpc('update_scholarship_permissions', {
        target_role_key: roleKey,
        ...permissions
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error updating scholarship permissions:', error);
      throw error;
    }
  }

  /**
   * Apply a permission template to a role
   */
  static async applyPermissionTemplate(
    roleKey: string,
    templateId: string
  ): Promise<void> {
    const template = PERMISSION_TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      throw new Error(`Permission template ${templateId} not found`);
    }

    try {
      let functionName: string;

      switch (templateId) {
        case 'full_access':
          functionName = 'grant_full_scholarship_access';
          break;
        case 'creator':
          functionName = 'grant_scholarship_creator_access';
          break;
        case 'reviewer':
          functionName = 'grant_scholarship_reviewer_access';
          break;
        case 'readonly':
          functionName = 'grant_scholarship_readonly_access';
          break;
        case 'no_access':
          functionName = 'revoke_scholarship_access';
          break;
        default:
          // For custom templates, use the generic update function
          return this.updateScholarshipPermissions(
            roleKey,
            template.permissions
          );
      }

      const supabase = getSupabaseClient();
      const { error } = await (supabase as any).rpc(functionName, {
        target_role_key: roleKey
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error applying permission template:', error);
      throw error;
    }
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
    try {
      const permissions = await this.getAllScholarshipPermissions();

      return {
        canCreate: permissions.filter((p) => p.can_create).length,
        canApprove: permissions.filter((p) => p.can_approve).length,
        canView: permissions.filter((p) => p.can_view).length,
        noAccess: permissions.filter((p) => !p.can_view && !p.can_create).length
      };
    } catch (error) {
      console.error('Error getting permission summary:', error);
      throw error;
    }
  }
}
