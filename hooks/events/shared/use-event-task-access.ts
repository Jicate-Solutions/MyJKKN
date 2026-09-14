// hooks/events/shared/use-event-task-access.ts
//
// May the viewer SEE, and may they EDIT, this event's Pending Tasks card?
//
// ── Why this asks the database instead of computing it here ────────────────
// The card is rendered on four consoles that each resolve "who runs this event"
// differently:
//
//   /events/[id]                    events.config->'incharges'
//   /events/tournament/[id]         useTournamentAccess().isIncharge
//   /events/marathon/[id]/dashboard useMarathonAccess() — not even event-scoped
//   /events/induction/[id]          induction_event_coordinators (its own table)
//
// Reimplementing the rule in TypeScript for each of them is four copies of one
// rule and four chances to drift from the RLS policy that actually enforces it —
// the "fixed one layer, broke the one alongside" defect this repo has hit before
// (page gate · RLS · RPC · API route).
//
// So the hook calls fn_can_manage_event_level_tasks — literally the same
// function the event_tasks_event_level_write policy calls. It is SECURITY
// DEFINER, granted to `authenticated`, and only ever reveals the caller's own
// authority. The button therefore appears exactly when the write would succeed,
// and widening the rule in SQL updates the UI at the same instant.
//
// ── The read gate stays client-side ────────────────────────────────────────
// `isStudent` comes from usePermissions rather than from a second RPC: the card
// is hidden for students purely as a courtesy (an internal work list is not
// their business), and the real protection is fn_can_read_event_tasks on the
// SELECT policy, which returns them nothing regardless of what renders.

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';

const KEYS = {
  manage: (eventId: string) => ['event-tasks', 'can-manage', eventId] as const,
};

export interface EventTaskAccess {
  /** Render the card at all. False for students. */
  canView: boolean;
  /** Render the Add / tick / delete controls. Mirrors the write policy exactly. */
  canManage: boolean;
  /** True until the authority answer is known — treat as "not yet", never as "no". */
  isLoading: boolean;
}

export function useEventTaskAccess(eventId: string): EventTaskAccess {
  const { isSuperAdmin, isStudent, isLoading: permsLoading } = usePermissions();

  // Super admins pass the SQL function too, but they pass it unconditionally —
  // skipping the round-trip for them keeps the commonest admin path instant.
  const enabled = !!eventId && !isSuperAdmin && !isStudent && !permsLoading;

  const { data, isLoading } = useQuery({
    queryKey: KEYS.manage(eventId),
    enabled,
    // Authority changes only when someone is appointed an in-charge, which is
    // rare and happens on another screen. Don't re-ask on every window focus.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Cast the CLIENT, not the args: the generated Database type enumerates
      // every RPC by name, and this function was added after those types were
      // last generated, so `rpc('fn_can_manage_event_level_tasks')` is rejected
      // on the function-name overload. Same escape hatch the events services use.
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase.rpc('fn_can_manage_event_level_tasks', {
        p_event_id: eventId,
      });

      // A failed authority check is NOT a grant. Swallow the error and answer
      // "no" — the RLS policy is the real gate, so the worst case here is a
      // hidden button, never an unauthorised write.
      if (error) return false;
      return data === true;
    },
  });

  return {
    canView: !isStudent,
    canManage: isSuperAdmin || data === true,
    isLoading: permsLoading || (enabled && isLoading),
  };
}
