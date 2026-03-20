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
 * Get users by role key filtered by institution and department
 */
export function useUsersByRole(
  roleKey: string | null,
  institutionId?: string,
  departmentId?: string
) {
  return useQuery({
    queryKey: [...KEYS.usersByRole(roleKey || ''), institutionId, departmentId],
    queryFn: async (): Promise<UserWithRole[]> => {
      if (!roleKey) {
        return [];
      }

      let query = supabase
        .from('profiles')
        .select('id, full_name, email, role, avatar_url, institution_id, department_id')
        .eq('role', roleKey);

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
    enabled: !!roleKey,
  });
}
