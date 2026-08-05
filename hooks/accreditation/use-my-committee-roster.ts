// hooks/accreditation/use-my-committee-roster.ts
// ============================================================================
// "Which committees am I on?" — the roster half of Director decision 8.
//
// Reads accreditation_committee_members through the ORDINARY browser client,
// with RLS on. That is the whole point: after
// supabase/migrations/20260809102300_committee_roster_access.sql, the
// members_select policy returns roster rows to a viewer either because they
// hold accreditation.naac.committees.view or because
// fn_user_is_committee_member(committee_id) is true. So for a viewer WITHOUT
// the permission — the only case this hook is used in — every row that comes
// back is, by construction, a committee they sit on.
//
// Deriving the gate from this read rather than from a separate claim is what
// keeps the page honest. RLS denial in this repo is silent (0 rows, error =
// null), so a gate computed any other way could admit someone the database
// then shows nothing to — an empty screen that reads as "no committees exist".
// Here the two cannot disagree: no rows means no entry, and the viewer is told
// why in words.
//
// No user_id filter, on purpose. The query does not need to know auth.uid():
// it is only ever enabled for a viewer who lacks the permission, and for that
// viewer RLS has already narrowed the table to their own committees. Filtering
// client-side on an id we would have to assume matches auth.uid() would add an
// assumption without adding a guarantee.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export const myCommitteeRosterKey = ['accreditation', 'committees', 'my-roster'] as const;

/**
 * Committee ids the signed-in viewer can read a roster row for.
 *
 * @param options.enabled Leave false while permissions are still resolving, and
 *   for viewers who already hold the permission — they do not need this read,
 *   and for them RLS would return every roster row on the platform.
 */
export function useMyCommitteeRoster(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;

  return useQuery({
    queryKey: myCommitteeRosterKey,
    queryFn: async (): Promise<string[]> => {
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase
        .from('accreditation_committee_members')
        .select('committee_id')
        // Matches AccreditationCommitteeService.listMembers() and
        // fn_user_is_committee_member(): is_active is this module's
        // current-membership flag, so the gate and the roster agree on who
        // counts as a sitting member.
        .eq('is_active', true);

      if (error) throw error;

      const ids = new Set<string>();
      for (const row of (data ?? []) as { committee_id: string | null }[]) {
        if (row.committee_id) ids.add(row.committee_id);
      }
      return [...ids];
    },
    enabled,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
