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
// ── Learners are asked, not assumed ────────────────────────────────────────
// Until 2026-09-24 a learner was short-circuited to canView=false here before
// the round-trip. BUG-006176 (the COO, reviewing authority): the learner
// in-charges of a sports tournament must see his remarks. The SQL rule now
// admits exactly that one case — an active learner appointed in-charge of a
// sports tournament — and still refuses every other learner (other event
// types, committee members, the tagged arm). A second, stricter copy of the
// rule here would hide the card from the very people the database now lets
// in, so learners ask the same function as everyone else. They are still not
// asked the admin question: fn_is_event_review_admin never admits a learner.

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
  /**
   * The viewer is a learner. Almost every learner is refused, so a surface
   * that would paint a placeholder while the answer is pending should paint
   * nothing for them instead — otherwise every learner on every event page
   * sees a card-shaped skeleton flash and vanish.
   */
  isLearner: boolean;
}

export function useEventReviewCommentAccess(eventId: string): EventReviewCommentAccess {
  const { isSuperAdmin, isStudent, isLoading: permsLoading } = usePermissions();

  // Super admins pass both SQL functions unconditionally; skipping the
  // round-trip keeps the commonest reviewing path instant. Learners ask the
  // read question only (see the header).
  const enabled = !!eventId && !isSuperAdmin && !permsLoading;
  const adminEnabled = enabled && !isStudent;

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
    enabled: adminEnabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase.rpc('fn_is_event_review_admin');
      if (error) return false;
      return data === true;
    },
  });

  return {
    canView: isSuperAdmin || canRead === true,
    isReviewAdmin: isSuperAdmin || isAdmin === true,
    isSuperAdmin,
    isLoading:
      permsLoading || (enabled && readLoading) || (adminEnabled && adminLoading),
    isLearner: isStudent,
  };
}
