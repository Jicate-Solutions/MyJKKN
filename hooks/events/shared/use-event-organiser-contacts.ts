// hooks/events/shared/use-event-organiser-contacts.ts
// Who to ring about an event — BUG-006129.
//
// The detail page showed when and where an event is, but never WHO to contact
// about it. The name was reachable (events.created_by, events.config->incharges)
// and the number was one join away (profiles.phone_number), so a reader who
// needed to ask a question had to leave the system to find out who to ask.
//
// Two sources, in priority order:
//   1. config->'incharges' — the appointed organisers. These are an ACCESS
//      GRANT (fn_is_event_incharge matches auth.uid() against member_id), so
//      whoever is listed is genuinely running the event.
//   2. events.created_by — whoever made it. The fallback, and often the only
//      one: on 2026-09-16, 36 of 56 events had NO created_by at all (the column
//      predates the create wizard writing it) and most have an empty incharges
//      array, so BOTH can be missing. The UI must read as "not recorded"
//      rather than pretending nobody organises the event.
//
// The in-charges array stores only {member_id, name} — no phone — so the number
// always comes from profiles, keyed by member_id. An in-charge entry whose
// member_id is absent (older rows stored a bare name) keeps its name and simply
// has no number to show.
//
// RLS: profiles_select_policy is `auth.uid() IS NOT NULL`, so any signed-in user
// can read these rows. No special grant is needed, and none is created here.

'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface OrganiserContact {
  /** profiles.id, when the person resolved to an account. */
  id: string | null;
  name: string;
  /** profiles.phone_number — null when the account has none on file. */
  phone: string | null;
  /** Why this person is listed. Drives the label the UI puts on them. */
  kind: 'incharge' | 'creator';
}

export interface EventOrganiserContacts {
  /** Appointed in-charges, in the order they were appointed. */
  incharges: OrganiserContact[];
  /** events.created_by, resolved. Null when the column is empty. */
  creator: OrganiserContact | null;
  /**
   * Who to actually show as THE contact: the first in-charge if there is one,
   * otherwise the creator. Null when the event records neither.
   */
  primary: OrganiserContact | null;
  isLoading: boolean;
}

export function useEventOrganiserContacts(
  createdBy: string | null | undefined,
  incharges: { member_id?: string; name?: string }[] | undefined,
): EventOrganiserContacts {
  // Stable key: the ids we need to resolve, sorted so re-renders that reorder
  // the array do not refetch.
  const ids = useMemo(() => {
    const out = new Set<string>();
    if (createdBy) out.add(createdBy);
    for (const i of incharges ?? []) if (i?.member_id) out.add(i.member_id);
    return [...out].sort();
  }, [createdBy, incharges]);

  const { data: byId, isLoading } = useQuery({
    queryKey: ['event-organiser-contacts', ids],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('id, full_name, phone_number')
        .in('id', ids);
      // A failed lookup must not blank the NAMES, which we already hold from
      // events.config — it only costs us the phone numbers.
      if (error) return new Map<string, { full_name: string | null; phone_number: string | null }>();
      return new Map<string, { full_name: string | null; phone_number: string | null }>(
        (data ?? []).map((p: any) => [p.id, { full_name: p.full_name, phone_number: p.phone_number }]),
      );
    },
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });

  return useMemo(() => {
    const lookup = byId ?? new Map();

    const resolvedIncharges: OrganiserContact[] = (incharges ?? [])
      .filter((i) => i && (i.name || i.member_id))
      .map((i) => {
        const p = i.member_id ? lookup.get(i.member_id) : undefined;
        return {
          id: i.member_id ?? null,
          // config->incharges[].name is what the appointer typed; the profile
          // is the authority when both exist.
          name: p?.full_name || i.name || 'Unnamed',
          phone: p?.phone_number ?? null,
          kind: 'incharge' as const,
        };
      });

    const creatorRow = createdBy ? lookup.get(createdBy) : undefined;
    const creator: OrganiserContact | null = createdBy
      ? {
          id: createdBy,
          name: creatorRow?.full_name || 'Unknown',
          phone: creatorRow?.phone_number ?? null,
          kind: 'creator',
        }
      : null;

    return {
      incharges: resolvedIncharges,
      creator,
      primary: resolvedIncharges[0] ?? creator,
      isLoading: ids.length > 0 && isLoading,
    };
  }, [byId, incharges, createdBy, ids.length, isLoading]);
}
