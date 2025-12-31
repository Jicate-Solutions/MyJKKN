import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface Role {
  id: string;
  role_key: string;
  role_name: string;
  description?: string;
  is_system_role: boolean;
  permissions: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface UseRolesParams {
  includeSystemRoles?: boolean;
  isActive?: boolean;
}

export function useRoles({
  includeSystemRoles = true,
  isActive = true
}: UseRolesParams = {}) {
  // Memoize the supabase client to prevent re-creation on every render
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  return useQuery({
    queryKey: ['roles', { includeSystemRoles, isActive }],
    queryFn: async () => {
      let query = (supabase as any).from('custom_roles').select('*').order('role_name');

      // Filter by system roles if specified
      if (!includeSystemRoles) {
        query = query.eq('is_system_role', false);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching roles:', error);
        throw error;
      }

      return data as Role[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 3
  });
}
