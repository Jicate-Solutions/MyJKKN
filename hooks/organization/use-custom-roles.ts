/**
 * Custom Roles React Query Hooks
 *
 * Provides hooks for fetching custom roles and users by role
 */

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

const supabase = createClientSupabaseClient();

// =====================================================
// QUERY KEYS
// =====================================================

const KEYS = {
  all: ['custom-roles'] as const,
  lists: () => [...KEYS.all, 'list'] as const,
  usersByRole: (roleKey: string) => [...KEYS.all, 'users', roleKey] as const,
  institutionApprovers: (institutionId: string) =>
    [...KEYS.all, 'institution-approvers', institutionId] as const,
};

// =====================================================
// CUSTOM ROLE TYPES
// =====================================================

export interface CustomRole {
  id: string;
  role_key: string;
  role_name: string;
  description: string | null;
  is_system_role: boolean;
  permissions: any;
  created_at: string;
  updated_at: string;
}

export interface UserWithRole {
  id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  institution_id: string | null;
  department_id: string | null;
}

// =====================================================
// HOOKS
// =====================================================

/**
 * Get all custom roles except student role
 */
export function useCustomRolesForApproval() {
  return useQuery({
    queryKey: KEYS.lists(),
    queryFn: async (): Promise<CustomRole[]> => {
      const { data, error } = await supabase
        .from('custom_roles')
        .select('*')
        .neq('role_key', 'student') // Exclude student role
        .order('role_name', { ascending: true });

      if (error) {
        console.error('Failed to fetch custom roles:', error);
        return []; // Return empty array on error
      }

      return (data || []) as CustomRole[];
    },
  });
}

/**
 * Get users by role key(s) filtered by institution and optionally department.
 * Accepts a single role key or an array of role keys to fetch users across multiple roles.
 */
export function useUsersByRole(
  roleKey: string | string[] | null,
  institutionId?: string,
  departmentId?: string
) {
  // Normalize to array for consistent handling
  const roleKeys = roleKey
    ? (Array.isArray(roleKey) ? roleKey : [roleKey])
    : [];

  return useQuery({
    queryKey: [...KEYS.usersByRole(roleKeys.join(',')), institutionId, departmentId],
    queryFn: async (): Promise<UserWithRole[]> => {
      if (roleKeys.length === 0) {
        return [];
      }

      let query = supabase
        .from('profiles')
        .select('id, full_name, email, role, avatar_url, institution_id, department_id')
        .in('role', roleKeys);

      // Filter by institution if provided
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      // Filter by department if provided - but also include users with null department_id
      // since many users may not have department assigned
      if (departmentId) {
        query = query.or(`department_id.eq.${departmentId},department_id.is.null`);
      }

      query = query.order('full_name', { ascending: true });

      const { data, error } = await query;

      if (error) {
        console.error('Failed to fetch users by role:', error);
        return []; // Return empty array on error
      }

      return (data || []) as UserWithRole[];
    },
    enabled: roleKeys.length > 0,
  });
}

/**
 * Get every non-student user in the given institution in a single query.
 *
 * Used by the Approval Flow Builder so admins can pick ANY staff/faculty/HOD
 * as an approver without pre-selecting a role. The step model still carries
 * role_name / approver_role — those are derived from the first approver's
 * profile.role at selection time (see approval-flow-builder.tsx).
 *
 * RLS already scopes profiles.institution_id visibility, so callers don't
 * need to worry about cross-institutional leakage.
 */
export function useInstitutionApprovers(institutionId?: string | null) {
  return useQuery({
    queryKey: KEYS.institutionApprovers(institutionId ?? ''),
    queryFn: async (): Promise<UserWithRole[]> => {
      if (!institutionId) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, avatar_url, institution_id, department_id')
        .eq('institution_id', institutionId)
        .neq('role', 'student')
        .order('full_name', { ascending: true });

      if (error) {
        console.error('Failed to fetch institution approvers:', error);
        return [];
      }

      return (data || []) as UserWithRole[];
    },
    enabled: !!institutionId,
  });
}
