// hooks/events/shared/use-event-review-comment-access.ts
//
// May the viewer see this event's internal review thread, and may they close a
// thread in it?
//
// ── Why this asks the database instead of computing it here ────────────────
// The read rule counts four different things — super admin, the
// events.review_comments.view key (institution-scoped), the event's in-charge
// (events.config->'incharges') and the event's creator — and two of them are
// per-EVENT, not per-user. Reimplementing that in TypeScript would be a second
// copy of the rule, free to drift from the RLS policy that actually enforces
// it, on a card whose whole point is that the wrong people cannot read it.
//
// So the hook calls fn_can_read_event_review_comments — literally the same
// function the SELECT policy calls. It is SECURITY DEFINER, granted to
// `authenticated`, and only ever reveals the caller's own authority. Widening
// the rule in SQL updates the UI at the same instant.
//
// ── Students are refused before the round-trip ─────────────────────────────
// The requirement was explicit: participants and learners never see this. A
// student is therefore short-circuited to canView=false here rather than being
// asked about, which also means a student who somehow appears in an event's
// in-charge list (nothing stops a coordinator typing one in) does not get a
// window into the review channel. RLS remains the real gate — it would hand
// them rows in that one case — so this is the layer that honours the rule as
// written, not merely a courtesy.

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { usePermissions } from '@/hooks/use-permissions';

const KEYS = {
  read: (eventId: string) => ['event-review-comments', 'can-read', eventId] as const,
  admin: () => ['event-review-comments', 'is-review-admin'] as const,
};

export interface EventReviewCommentAccess {
  /** Render the card at all — and, identically, may they post in it. */
  canView: boolean;
  /**
   * Admin half of the close rule. A thread can ALSO be closed by whoever raised
   * it, which is per-row and so is decided in the card, not here.
   */
  isReviewAdmin: boolean;
  /**
   * Deliberately separate from isReviewAdmin. Closing a thread is open to the
   * whole admin class; deleting somebody else's comment is a super admin's
   * cleanup power alone, and the DELETE policy says exactly that. Painting the
   * Delete button on isReviewAdmin would show it to an administrator whose
   * every click the database then refuses.
   */
  isSuperAdmin: boolean;
  /** True until the answer is known — treat as "not yet", never as "no". */
  isLoading: boolean;
}

export function useEventReviewCommentAccess(eventId: string): EventReviewCommentAccess {
  const { isSuperAdmin, isStudent, isLoading: permsLoading } = usePermissions();

  // Super admins pass both SQL functions unconditionally; skipping the
  // round-trip keeps the commonest reviewing path instant. Students are refused
  // outright (see the header) and never ask.
  const enabled = !!eventId && !isSuperAdmin && !isStudent && !permsLoading;

  const { data: canRead, isLoading: readLoading } = useQuery({
    queryKey: KEYS.read(eventId),
    enabled,
    // Authority changes when someone is appointed an in-charge or given a role,
    // which happens on another screen and rarely. Don't re-ask on window focus.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Cast the CLIENT, not the args: the generated Database type enumerates
      // every RPC by name and this function postdates the last generation, so
      // the function-name overload rejects it. Same escape hatch the rest of
      // the events hooks use.
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase.rpc('fn_can_read_event_review_comments', {
        p_event_id: eventId,
      });
      // A failed authority check is NOT a grant. Answer "no" — the policy is
      // the real gate, so the worst case is a hidden card, never a leak.
      if (error) return false;
      return data === true;
    },
  });

  const { data: isAdmin, isLoading: adminLoading } = useQuery({
    queryKey: KEYS.admin(),
    // Not event-scoped: the function asks only about the caller's own roles, so
    // one answer serves every event this session opens.
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase.rpc('fn_is_event_review_admin');
      if (error) return false;
      return data === true;
    },
  });

  return {
    canView: !isStudent && (isSuperAdmin || canRead === true),
    isReviewAdmin: isSuperAdmin || isAdmin === true,
    isSuperAdmin,
    isLoading: permsLoading || (enabled && (readLoading || adminLoading)),
  };
}
