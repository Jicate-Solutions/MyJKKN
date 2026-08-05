// hooks/accreditation/use-my-committee-roster.ts
// ============================================================================
// "Which committees am I on, and until when?" — the roster half of Director
// decision 8, now carrying the term dates Director decision 7 turns on.
//
// Reads accreditation_committee_members through the ORDINARY browser client,
// with RLS on. That is the whole point: after
// supabase/migrations/20260809102300_committee_roster_access.sql, the
// members_select policy returns roster rows to a viewer either because they
// hold accreditation.naac.committees.view or because
// fn_user_is_committee_member(committee_id) is true. So for a viewer WITHOUT
// the permission — the only case this hook is used in — every row that comes
// back is, by construction, a seat of their own.
//
// Deriving the gate from this read rather than from a separate claim is what
// keeps the page honest. RLS denial in this repo is silent (0 rows, error =
// null), so a gate computed any other way could admit someone the database
// then shows nothing to — an empty screen that reads as "no committees exist".
//
// WHY term_end IS NOW SELECTED. 20260809103100_committee_term_expiry.sql cuts
// a member off on their term end date, and adds one disjunct to members_select
// so an EXPIRED member can still read their own seat row. Without that, an
// expired member would be indistinguishable from someone never appointed and
// would get the generic "you are not on any roster" refusal — a lie. With it,
// the rows coming back are no longer all live seats, so this hook must return
// the date and let decideCommittee*Access() split them. A caller that treated
// every returned row as an open door would admit an expired member to a page
// the database then refuses: precisely the blank screen this lane exists to
// end.
//
// No user_id filter, on purpose. The query does not need to know auth.uid():
// it is only ever enabled for a viewer who lacks the permission, and for that
// viewer RLS has already narrowed the table to their own seats. Filtering
// client-side on an id we would have to assume matches auth.uid() would add an
// assumption without adding a guarantee.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export const myCommitteeRosterKey = ['accreditation', 'committees', 'my-roster'] as const;

/** One seat the signed-in viewer holds — live or expired. */
export interface MyCommitteeSeat {
  committeeId: string;
  /**
   * Last day of the term, INCLUSIVE, as the plain `YYYY-MM-DD` Postgres hands
   * back. Null is legal and means "no end date" — after
   * 20260809103100 the column is NOT NULL, but a row restored from an older
   * backup could still carry one, and the SQL treats NULL as still-current on
   * purpose (fail open, never a silent lockout). The gate mirrors that.
   */
  termEnd: string | null;
}

/**
 * Seats the signed-in viewer can read a roster row for.
 *
 * @param options.enabled Leave false while permissions are still resolving, and
 *   for viewers who already hold the permission — they do not need this read,
 *   and for them RLS would return every roster row on the platform.
 */
export function useMyCommitteeRoster(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;

  return useQuery({
    queryKey: myCommitteeRosterKey,
    queryFn: async (): Promise<MyCommitteeSeat[]> => {
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase
        .from('accreditation_committee_members')
        .select('committee_id, term_end')
        // Matches AccreditationCommitteeService.listMembers() and
        // fn_user_is_committee_member(): is_active is this module's
        // current-membership flag, so the gate and the roster agree on who
        // counts as a sitting member. term_end is NOT filtered here — an
        // expired seat has to come back so the viewer can be told the date.
        .eq('is_active', true);

      if (error) throw error;

      // One committee, one seat. A member re-appointed after a break has two
      // rows; keep the one that runs longest, so a live re-appointment is
      // never hidden behind an old expired term. A null term_end wins outright
      // — it is the open-ended one.
      const bySeat = new Map<string, string | null>();
      for (const row of (data ?? []) as {
        committee_id: string | null;
        term_end: string | null;
      }[]) {
        if (!row.committee_id) continue;
        if (!bySeat.has(row.committee_id)) {
          bySeat.set(row.committee_id, row.term_end);
          continue;
        }
        const held = bySeat.get(row.committee_id) ?? null;
        if (held === null) continue;
        if (row.term_end === null || row.term_end > held) {
          bySeat.set(row.committee_id, row.term_end);
        }
      }

      return [...bySeat].map(([committeeId, termEnd]) => ({ committeeId, termEnd }));
    },
    enabled,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
