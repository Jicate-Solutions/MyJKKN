'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { HROrganizationService } from '@/lib/services/hr/hr-organization-service';
import type { HROrganizationSetIncludedPayload } from '@/types/hr-organizations';

const KEY = 'hr-organizations-admin';

export function useHROrganizationsAdmin(enabled = true) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [KEY],
    queryFn: () => HROrganizationService.adminList(supabase),
    enabled,
  });
}

/**
 * Toggle one institution in or out of the HR module.
 *
 * Invalidates EVERYTHING under 'hr-', not just this list. Excluding an
 * institution changes what fn_my_hr_organization_ids returns, and that function
 * backs 23 RLS policies across 11 tables — so staff lists, leave balances,
 * analytics, approval queues and directories all change at once. With staleTime
 * 5 min and no focus refetch, anything left un-invalidated would keep serving
 * rows for an institution that is no longer in HR.
 */
export function useSetHROrganizationIncluded() {
  const qc = useQueryClient();
  const supabase = createClientSupabaseClient();
  return useMutation({
    mutationFn: (payload: HROrganizationSetIncludedPayload) =>
      HROrganizationService.setIncluded(supabase, payload),
    onSuccess: () => {
      qc.invalidateQueries({
        predicate: (q) => String(q.queryKey[0] ?? '').startsWith('hr-'),
      });
    },
  });
}
