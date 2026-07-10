// hooks/events/use-tournament-access.ts
// Per-tournament access model (Tournament In-charge, 2026-07).
//
//   full control  = sports.tournaments.manage  OR  listed as an event in-charge
//   view + tasks  = committee lead/member of the event
//   view only     = sports.tournaments.view
//
// In-charges live in events.config->'incharges' as [{member_id, name}] where
// member_id is the user's auth uid (profiles.id). The DB mirrors this model in
// fn_is_event_incharge() / fn_is_event_committee_member(), which back the RLS
// policies and the API gates — this hook only drives what the UI reveals.

'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { Event } from '@/types/events';

export interface EventIncharge {
  member_id: string;
  name: string;
}

/** Read the in-charge list off an already-loaded event row. */
export function getIncharges(event: Pick<Event, 'config'> | null | undefined): EventIncharge[] {
  const raw = (event?.config as Record<string, unknown> | null)?.incharges;
  return Array.isArray(raw) ? (raw as EventIncharge[]) : [];
}

export interface TournamentAccess {
  /** Full control: create/edit divisions, entries, fixtures, results, status. */
  canManage: boolean;
  /** Sees the tournament and all its details. */
  canView: boolean;
  /** Is the current user an in-charge of THIS tournament? */
  isIncharge: boolean;
  /** Is the current user a committee lead/member of this tournament? */
  isCommitteeMember: boolean;
  /** May only update committee tasks (committee member without manage rights). */
  isTaskOnly: boolean;
  /** Only holders of the manage permission may appoint/remove in-charges. */
  canAssignIncharge: boolean;
  isLoading: boolean;
}

export function useTournamentAccess(
  eventId: string,
  event?: Pick<Event, 'config'> | null
): TournamentAccess {
  const { profile } = useAuth();
  const { can, isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const profileId = profile?.id ?? null;
  const userName = profile?.full_name ?? null;

  const hasManagePerm = isSuperAdmin || can('sports.tournaments.manage');
  const hasViewPerm = isSuperAdmin || can('sports.tournaments.view');

  const isIncharge = useMemo(
    () => (!profileId ? false : getIncharges(event).some((i) => i.member_id === profileId)),
    [event, profileId]
  );

  // Committee membership for this event — mirrors fn_is_event_committee_member's
  // matching rules (uid in member_ids/lead_id, or profile full_name in the name arrays).
  const { data: isCommitteeMember = false, isLoading: membershipLoading } = useQuery({
    queryKey: ['tournament-committee-membership', eventId, profileId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data } = await (supabase as any)
        .from('event_committees')
        .select('lead_id, lead_name, member_ids, member_names')
        .eq('event_id', eventId);
      return (data ?? []).some((c: any) => {
        const ids: string[] = Array.isArray(c.member_ids) ? c.member_ids : [];
        const names: string[] = Array.isArray(c.member_names) ? c.member_names : [];
        return (
          c.lead_id === profileId ||
          ids.includes(profileId as string) ||
          (!!userName && (c.lead_name === userName || names.includes(userName)))
        );
      });
    },
    // Managers/in-charges already have full rights — skip the lookup for them.
    enabled: !!eventId && !!profileId && !hasManagePerm && !isIncharge,
    staleTime: 60_000,
  });

  const canManage = hasManagePerm || isIncharge;
  const effectiveMember = canManage ? false : isCommitteeMember;

  return {
    canManage,
    canView: canManage || hasViewPerm || effectiveMember,
    isIncharge,
    isCommitteeMember: effectiveMember,
    isTaskOnly: !canManage && effectiveMember,
    canAssignIncharge: hasManagePerm,
    isLoading: permsLoading || membershipLoading,
  };
}
