-- ─── Reservation comment tags — the booker can always be tagged ─────────────
--
-- THE GAP (20261224103700). "Same institution only" compares the tagged
-- person's college with the BOOKED ROOM's college. For a cross-college booking
-- (an event in college A holding a hall in college B) the person who raised
-- the booking is, by definition, from another college — so the one person the
-- thread exists to talk to ("say what the booker still has to do") could not
-- be tagged. The event review thread does not have this problem because it
-- compares against the event's own institution, which is the organizer's.
--
-- THE RULE NOW. A person may be tagged on a booking's comments when EITHER
--   • they are an active team member of the booked resource's institution
--     (unchanged), OR
--   • they are the person who raised the booking (resource_reservations.user_id),
--     whatever their college and whatever their role — they already hold read
--     access to this thread by right (fn_can_read_reservation_comments), so the
--     tag grants nothing new; it only sends them the alert.
--
-- The read-time re-check (fn_is_reservation_comment_mention) gains the same
-- clause so a booker's tag never reads as "expired" if they change college.
--
-- ci:allow-secdef-authenticated SELF-SCOPED: fn_is_reservation_comment_mention
-- takes no user id and answers only "am *I* (auth.uid()) tagged on this
-- booking?". fn_can_be_tagged_on_reservation stays revoked from authenticated.

-- ── 1. Who can be tagged on THIS booking ────────────────────────────────────
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
    -- The person who raised the booking — any college, any role.
    EXISTS (
      SELECT 1
        FROM public.resource_reservations rr
        JOIN public.profiles p ON p.id = rr.user_id
       WHERE rr.id = p_reservation_id
         AND rr.user_id = p_user_id
         AND COALESCE(p.is_active, true)
    )
    OR (
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
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_be_tagged_on_reservation(uuid, uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_be_tagged_on_reservation(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.fn_can_be_tagged_on_reservation(uuid, uuid) IS
  'May this user be tagged on this booking''s comments? Either the person who raised the booking (any institution, any role), or an active team member (fn_can_be_tagged_in_event_review) whose profiles.institution_id is the booked resource''s institution.';

-- ── 2. Guard trigger — same check, message names both cases ─────────────────
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
    RAISE EXCEPTION 'Only the person who raised this booking or team members of its institution can be tagged.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_reservation_comment_mention() FROM anon, PUBLIC;

-- ── 3. A tag counts while they are still in that institution — or the booker ─
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
       AND (p.institution_id = r.institution_id OR rr.user_id = m.mentioned_user_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_reservation_comment_mention(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_reservation_comment_mention(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.resource_reservation_comment_mentions IS
  'People tagged on a reservation comment. A row admits mentioned_user_id to that booking''s comment thread while they remain in the booked resource''s institution (the booker is admitted regardless). Taggable: the person who raised the booking, or same-institution staff; the comment''s author can untag (delete the row), which revokes access and leaves the comment.';

-- ── 4. Assert the end state ─────────────────────────────────────────────────
DO $assert$
BEGIN
  IF has_function_privilege('authenticated', 'public.fn_can_be_tagged_on_reservation(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_can_be_tagged_on_reservation must not be executable by authenticated';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_is_reservation_comment_mention(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_is_reservation_comment_mention must be executable by authenticated — the read gate calls it';
  END IF;
END
$assert$;
