-- =====================================================================
-- Fix: "Approval Chain" card never renders on the reservation detail page
-- =====================================================================
-- The card reads resource_approvals straight from the browser client, so
-- RLS decides what it gets. The SELECT policy on that table allowed only:
--   • the approver — but ONLY their own row, so the chain collapsed to one
--     entry with no "Next" / "n of m" context;
--   • the booker;
--   • super admins.
-- Institution admins (the people working the Approvals queue) matched
-- nothing, the hook returned [] and the card self-hid. The reservation
-- itself is readable by all of those people (resource_reservations has a
-- staff-scoped policy), so they saw the booking but never who had to
-- approve it or where it was stuck.
--
-- Fix: gate on fn_can_read_reservation_comments(reservation_id) — the
-- predicate the comment thread and communications log already use — so the
-- chain is visible to exactly the same audience: the booker, every member
-- of the chain (the whole chain, not just their own row), and admin-class
-- staff scoped to the resource's institution. Super admin kept explicitly.
--
-- No recursion: fn_can_read_reservation_comments and the
-- is_reservation_approver it calls are SECURITY DEFINER, so their reads of
-- resource_reservations / resource_approvals never re-enter this policy.
-- =====================================================================

BEGIN;

DROP POLICY IF EXISTS resource_approvals_select ON public.resource_approvals;
DROP POLICY IF EXISTS approvals_select_involved ON public.resource_approvals;

CREATE POLICY resource_approvals_select
  ON public.resource_approvals
  FOR SELECT
  TO authenticated
  USING (
    approver_user_id = (SELECT auth.uid())
    OR (SELECT public.is_super_admin())
    OR public.fn_can_read_reservation_comments(reservation_id)
  );

COMMENT ON POLICY resource_approvals_select ON public.resource_approvals IS
  'Who may see a reservation''s approval chain: the booker, any approver on the chain (all rows, not just their own), and super_admin/admin/accounts with access to the resource''s institution — the same audience as the comment thread (fn_can_read_reservation_comments).';

COMMIT;
