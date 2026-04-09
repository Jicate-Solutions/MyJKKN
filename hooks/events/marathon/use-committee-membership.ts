// hooks/events/marathon/use-committee-membership.ts
// Checks if the current user is a committee lead or member in any committee
// of a given marathon event.
//
// Committee members/leads get limited access to:
// - See the event in the sidebar
// - Access the committees page (scoped to their committees)
// - Update their own assigned tasks
//
// This is per-event — a user might be a committee member in event A but not event B.

'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface CommitteeMembership {
  /** Is the current user a committee lead or member in any committee of this event? */
  isMember: boolean;
  /** IDs of committees where the user is lead */
  leadCommitteeIds: string[];
  /** IDs of committees where the user is a member */
  memberCommitteeIds: string[];
  /** All committee IDs (lead + member) the user belongs to */
  allCommitteeIds: string[];
  /** Name of the user (used to match against member_names arrays) */
  userName: string | null;
  /** Is loading */
  isLoading: boolean;
}

export function useCommitteeMembership(eventId: string): CommitteeMembership {
  const { profile } = useAuth();
  const profileId = profile?.id ?? null;
  const userName = profile?.full_name ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ['committee-membership', eventId, profileId],
    queryFn: async () => {
      if (!eventId || !profileId) {
        return { leadIds: [], memberIds: [] };
      }

      const supabase = createClientSupabaseClient();

      // Fetch all committees for this event
      const { data: committees, error } = await (supabase as any)
        .from('marathon_committees')
        .select('id, lead_id, lead_name, member_ids, member_names')
        .eq('event_id', eventId);

      if (error || !committees) {
        return { leadIds: [], memberIds: [] };
      }

      const leadIds: string[] = [];
      const memberIds: string[] = [];

      for (const c of committees) {
        // Match as lead by profile ID or by name (since committees may store names only)
        const isLeadById = c.lead_id === profileId;
        const isLeadByName = userName && c.lead_name === userName;
        if (isLeadById || isLeadByName) {
          leadIds.push(c.id);
          continue;
        }

        // Match as member by profile ID (member_ids array) or by name (member_names array)
        const memberIdArr: string[] = Array.isArray(c.member_ids) ? c.member_ids : [];
        const memberNameArr: string[] = Array.isArray(c.member_names) ? c.member_names : [];

        const isMemberById = memberIdArr.includes(profileId);
        const isMemberByName = userName && memberNameArr.includes(userName);

        if (isMemberById || isMemberByName) {
          memberIds.push(c.id);
        }
      }

      return { leadIds, memberIds };
    },
    enabled: !!eventId && !!profileId,
    staleTime: 60_000, // 1 minute cache
  });

  const leadCommitteeIds = data?.leadIds ?? [];
  const memberCommitteeIds = data?.memberIds ?? [];
  const allCommitteeIds = [...leadCommitteeIds, ...memberCommitteeIds];

  return {
    isMember: allCommitteeIds.length > 0,
    leadCommitteeIds,
    memberCommitteeIds,
    allCommitteeIds,
    userName,
    isLoading,
  };
}
