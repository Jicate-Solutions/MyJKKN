'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// Must match the fail-closed sentinel returned by public.ims_indent_dept_scope()
// for a department-scoped user whose profile has no department_id.
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export interface ImsDeptScope {
  /** The department the current user is restricted to, or null if not scoped. */
  departmentId: string | null;
  /** True when the user's role restricts IMS to a single department AND that
   *  department is set on their profile. */
  isScoped: boolean;
  /** True when the user is department-scoped but has NO department on their
   *  profile (fail-closed: they see nothing until an admin sets it). */
  scopedNoDept: boolean;
}

/**
 * Resolves whether the current user is department-scoped for IMS, reusing the
 * exact server-side RLS helper (public.ims_indent_dept_scope) so the dashboard
 * branch and the row-level data filtering can never drift apart.
 *
 * Returns:
 *   - real uuid   → scoped to that department  (isScoped = true)
 *   - zero uuid   → scoped but no department   (scopedNoDept = true)
 *   - null        → not scoped (normal user)
 */
export function useImsDeptScope() {
  return useQuery<ImsDeptScope>({
    queryKey: ['ims-dept-scope'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc('ims_indent_dept_scope');
      if (error) throw error;

      const deptId = (data as string | null) ?? null;
      const scopedNoDept = deptId === ZERO_UUID;
      const isScoped = !!deptId && !scopedNoDept;

      return {
        departmentId: isScoped ? deptId : null,
        isScoped,
        scopedNoDept,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
