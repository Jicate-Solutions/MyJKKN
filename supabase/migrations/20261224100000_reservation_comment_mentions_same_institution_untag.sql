-- ─── Reservation comment tags — same institution only, and untag ────────────
-- 2026-09-17  [BUG-006139, review follow-up on PR #3863]
--
-- THE GAP (20261224090000). Two problems with tagging as first shipped:
--   1. Anyone who was staff could be tagged, from any college. A mistaken pick
--      exposed the whole booking discussion — and, through two extra read
--      policies, the booking and resource rows — across institutions.
--   2. A tag could not be removed. authenticated held no DELETE on the
--      mentions table, so revoking a mistaken grant meant deleting the comment.
--
-- THE FLOW THIS MIGRATION ENFORCES
--   Add comment → tag a team member → ONLY people of the booking's institution
--   qualify → the tagged person can read and reply in that booking's thread →
--   the author may untag → access is revoked → the comment stays.
--
-- "Same institution" = the tagged person's profiles.institution_id equals the
-- booked resource's institution_id. profiles.institution_id is deliberately
-- the test, not staff.institution_id: it is what the existing
-- reservation/resource SELECT policies use, so everyone who passes this rule
-- can already open the booking page. That is why the two cross-institution
-- read policies added in 20261224090000 are DROPPED here — they existed only
-- to serve tags this rule no longer allows.
--
-- The rule is also re-checked at READ time, not only when tagging: a person
-- who moves to another institution loses the thread without anyone having to
-- untag them.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent. Depends on 20261224090000.

-- ── 1. Who can be tagged on THIS booking ────────────────────────────────────
-- Takes an arbitrary user id, so NOT granted to authenticated (a browser could
-- otherwise walk ids and learn who works where). Callers: the guard trigger
-- (runs as definer) and the comment-mentions API route (service role).
CREATE OR REPLACE FUNCTION public.fn_can_be_tagged_on_reservation(
  p_user_id uuid,
  p_reservation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- A team member, never a learner — the same staff rule as the event thread.
    public.fn_can_be_tagged_in_event_review(p_user_id)
    AND EXISTS (
      SELECT 1
        FROM public.resource_reservations rr
        JOIN public.resources r ON r.id = rr.resource_id
        JOIN public.profiles p  ON p.id = p_user_id
       WHERE rr.id = p_reservation_id
         AND r.institution_id IS NOT NULL
         AND p.institution_id = r.institution_id
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_be_tagged_on_reservation(uuid, uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_be_tagged_on_reservation(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.fn_can_be_tagged_on_reservation(uuid, uuid) IS
  'May this user be tagged on this booking''s comments? Active team member (fn_can_be_tagged_in_event_review) whose profiles.institution_id is the booked resource''s institution.';

-- ── 2. Guard trigger now enforces the institution ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_guard_reservation_comment_mention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id uuid;
BEGIN
  SELECT c.reservation_id INTO v_reservation_id
    FROM public.resource_reservation_comments c
   WHERE c.id = NEW.comment_id;

  IF v_reservation_id IS NULL THEN
    RAISE EXCEPTION 'That comment no longer exists.' USING ERRCODE = '42501';
  END IF;

  -- The booking is the comment's booking, whatever the client sent.
  NEW.reservation_id := v_reservation_id;
  -- And the tagger is the session, whatever the client sent.
  NEW.mentioned_by := auth.uid();

  IF NOT public.fn_can_be_tagged_on_reservation(NEW.mentioned_user_id, v_reservation_id) THEN
    RAISE EXCEPTION 'Only team members of this booking''s institution can be tagged.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_reservation_comment_mention() FROM anon, PUBLIC;

-- ── 3. A tag counts only while the person is still in that institution ──────
-- Same signature, so fn_can_read_reservation_comments picks this up unchanged.
CREATE OR REPLACE FUNCTION public.fn_is_reservation_comment_mention(p_reservation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.resource_reservation_comment_mentions m
      JOIN public.resource_reservations rr ON rr.id = m.reservation_id
      JOIN public.resources r              ON r.id = rr.resource_id
      JOIN public.profiles p               ON p.id = m.mentioned_user_id
     WHERE m.reservation_id = p_reservation_id
       AND m.mentioned_user_id = (SELECT auth.uid())
       AND p.institution_id = r.institution_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_reservation_comment_mention(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_reservation_comment_mention(uuid) TO authenticated, service_role;

-- ── 4. No more cross-institution reads of the booking or resource ───────────
DROP POLICY IF EXISTS reservations_comment_mention_read ON public.resource_reservations;
DROP POLICY IF EXISTS resources_reservation_mention_read ON public.resources;
DROP FUNCTION IF EXISTS public.fn_is_resource_reservation_mention(uuid);

-- ── 5. Untag ────────────────────────────────────────────────────────────────
-- The comment's author removes a tag; a super admin may clean one up. Removing
-- the row IS the revocation: the read gate asks whether a row exists. The
-- comment is untouched.
GRANT DELETE ON public.resource_reservation_comment_mentions TO authenticated;

DROP POLICY IF EXISTS reservation_comment_mentions_delete ON public.resource_reservation_comment_mentions;
CREATE POLICY reservation_comment_mentions_delete ON public.resource_reservation_comment_mentions
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.resource_reservation_comments c
      WHERE c.id = comment_id
        AND c.author_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE public.resource_reservation_comment_mentions IS
  'Team members tagged on a reservation comment. A row admits mentioned_user_id to that booking''s comment thread while they remain in the booked resource''s institution. Only same-institution staff can be tagged; the comment''s author can untag (delete the row), which revokes access and leaves the comment.';

-- ── 6. Assert the end state ─────────────────────────────────────────────────
DO $assert$
BEGIN
  IF has_table_privilege('authenticated', 'public.resource_reservation_comment_mentions', 'UPDATE') THEN
    RAISE EXCEPTION 'resource_reservation_comment_mentions: authenticated must not hold UPDATE';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.resource_reservation_comment_mentions', 'DELETE') THEN
    RAISE EXCEPTION 'resource_reservation_comment_mentions: authenticated cannot DELETE — untag would always fail';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE policyname IN ('reservations_comment_mention_read', 'resources_reservation_mention_read')) THEN
    RAISE EXCEPTION 'cross-institution booking/resource read policies are still present';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_can_be_tagged_on_reservation(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_can_be_tagged_on_reservation must not be executable by authenticated';
  END IF;
END
$assert$;

NOTIFY pgrst, 'reload schema';
