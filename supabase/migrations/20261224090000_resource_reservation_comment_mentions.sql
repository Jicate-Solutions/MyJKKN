-- ─── Reservation comments — tag (mention) team members on a booking thread ───
-- 2026-09-17  [BUG-006139]
--
-- THE REQUIREMENT. "Provide the tag facility so that the concerned can be
-- directly communicated." The reservation thread (20261129140000) reaches the
-- booker, the request's approvers and resource admins. A remark like "the hall
-- needs the principal's sign-off first" usually names someone OUTSIDE that
-- audience — and until now the only way to reach them was off-system.
--
-- Same model as the event review thread (20261220096000), decided there by the
-- Director on 2026-09-16: TAGGING GRANTS ACCESS.
--   · A tagged person is notified, and can read and reply in THAT booking's
--     thread from then on (per reservation, not per comment).
--   · Only team members (staff) can be tagged. The staff test is the same
--     function the event thread uses, fn_can_be_tagged_in_event_review, so
--     "who counts as staff" is decided in exactly one place.
--   · Only the AUTHOR of a comment tags on it, and only while they can read the
--     thread. Unlike the event thread, the booker IS in this audience, so a
--     booker can tag the person whose sign-off they are waiting on. That is the
--     point of the channel.
--
-- ── What "access" reaches, stated plainly ───────────────────────────────────
-- Being tagged admits a person to:
--   1. the booking's comment thread — fn_can_read_reservation_comments
--   2. the reservation ROW           — reservations_comment_mention_read
--   3. that booking's RESOURCE row   — resources_reservation_mention_read
-- (2) and (3) matter only for a person from another institution; same-
-- institution staff can already read both. Without them the notification
-- leads to "Reservation Not Found".
-- It does NOT grant approving, cancelling, editing the booking, or closing
-- threads raised by others (fn_is_reservation_comment_admin is untouched).
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent. Depends on 20261129140000 and 20261220096000.
--
-- ci:allow-secdef-authenticated SELF-SCOPED: fn_is_reservation_comment_mention
-- and fn_is_resource_reservation_mention take no user id and answer only about
-- auth.uid() (am *I* tagged); authenticated needs EXECUTE because RLS policies
-- call them as the signed-in user.

-- ── 1. Table ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_reservation_comment_mentions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id         uuid NOT NULL
                       REFERENCES public.resource_reservation_comments(id) ON DELETE CASCADE,
  -- Denormalised from the comment so the read gate is one indexed lookup.
  -- Never trusted from the client: the guard trigger overwrites it.
  reservation_id     uuid NOT NULL
                       REFERENCES public.resource_reservations(id) ON DELETE CASCADE,
  mentioned_user_id  uuid NOT NULL
                       CONSTRAINT resource_reservation_comment_mentions_mentioned_user_id_fkey
                       REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentioned_by       uuid NOT NULL DEFAULT auth.uid()
                       CONSTRAINT resource_reservation_comment_mentions_mentioned_by_fkey
                       REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_reservation_comment_mentions_once UNIQUE (comment_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_reservation_comment_mentions_reservation_user
  ON public.resource_reservation_comment_mentions (reservation_id, mentioned_user_id);

-- fn_is_resource_reservation_mention starts from "my tags", and it runs once
-- per resources row any list query scans.
CREATE INDEX IF NOT EXISTS idx_reservation_comment_mentions_user
  ON public.resource_reservation_comment_mentions (mentioned_user_id);

COMMENT ON TABLE public.resource_reservation_comment_mentions IS
  'Team members tagged on a reservation comment. A row here admits mentioned_user_id to that booking''s comment thread (fn_can_read_reservation_comments), the reservation row and its resource row. Written only by the comment''s author; learners cannot be tagged.';

-- ── 2. Guard trigger ────────────────────────────────────────────────────────
-- Runs BEFORE the RLS WITH CHECK, so the policy sees the corrected row. Raises
-- 42501 with a sentence, which commentWriteMessage() passes to the user.
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

  IF NOT public.fn_can_be_tagged_in_event_review(NEW.mentioned_user_id) THEN
    RAISE EXCEPTION 'Only team members can be tagged on a booking.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_reservation_comment_mention() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_reservation_comment_mentions_guard ON public.resource_reservation_comment_mentions;
CREATE TRIGGER trg_reservation_comment_mentions_guard
  BEFORE INSERT ON public.resource_reservation_comment_mentions
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_reservation_comment_mention();

-- ── 3. "Am I tagged on this booking / on a booking of this resource?" ───────
-- SECURITY DEFINER so they read the mentions table without passing through its
-- own SELECT policy (which calls fn_can_read_reservation_comments, which calls
-- the first of these) — and, for the second, without the resources ↔
-- resource_reservations policy cycle a plain sub-select would create.
CREATE OR REPLACE FUNCTION public.fn_is_reservation_comment_mention(p_reservation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.resource_reservation_comment_mentions m
    WHERE m.reservation_id = p_reservation_id
      AND m.mentioned_user_id = (SELECT auth.uid())
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_reservation_comment_mention(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_reservation_comment_mention(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_is_resource_reservation_mention(p_resource_id uuid)
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
     WHERE rr.resource_id = p_resource_id
       AND m.mentioned_user_id = (SELECT auth.uid())
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_resource_reservation_mention(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_resource_reservation_mention(uuid) TO authenticated, service_role;

-- ── 4. Widen the thread's read gate ─────────────────────────────────────────
-- Body is the live 20261129140000 definition, unchanged, plus the final arm.
-- Every policy on resource_reservation_comments calls this function, so a
-- tagged person can read, reply, and edit/delete their OWN comments — the
-- author and admin tests in those policies are untouched.
CREATE OR REPLACE FUNCTION public.fn_can_read_reservation_comments(p_reservation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- The person who raised the booking. They are the audience.
    EXISTS (
      SELECT 1 FROM public.resource_reservations rr
      WHERE rr.id = p_reservation_id
        AND rr.user_id = (SELECT auth.uid())
    )
    -- Anyone on the approval chain for this request.
    OR public.is_reservation_approver(p_reservation_id)
    -- Admin-class staff, scoped to the resource's institution. Mirrors
    -- resource_reservations_select_staff_scoped so the thread is visible to
    -- exactly the staff who can already open the request from the queue.
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role = ANY (ARRAY['super_admin', 'admin', 'accounts'])
      )
      AND EXISTS (
        SELECT 1
          FROM public.resource_reservations rr
          JOIN public.resources r ON r.id = rr.resource_id
         WHERE rr.id = p_reservation_id
           AND public.role_has_institution_access(r.institution_id)
      )
    )
    -- Added 2026-09-17 [BUG-006139]: tagged on this booking's thread. Not
    -- institution-tested — tagging exists to reach whoever can clear the
    -- blocker, wherever they sit. Learners cannot hold this arm (the guard
    -- refuses to tag them).
    OR public.fn_is_reservation_comment_mention(p_reservation_id);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_read_reservation_comments(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_read_reservation_comments(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_can_read_reservation_comments(uuid) IS
  'May the caller see this reservation''s comment thread, and post in it? The booker, any approver on the request (via is_reservation_approver), super_admin/admin/accounts with access to the resource''s institution, or a team member tagged on the thread (resource_reservation_comment_mentions). Deliberately narrower than reservations_select_institution, which lets every profile in a college read every booking in it.';

-- ── 5. RLS on the mentions table ────────────────────────────────────────────
ALTER TABLE public.resource_reservation_comment_mentions ENABLE ROW LEVEL SECURITY;

-- Name `authenticated` explicitly: Supabase's default privileges hand it a
-- direct grant on every new table that survives revoking only anon/PUBLIC.
REVOKE ALL ON public.resource_reservation_comment_mentions FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON public.resource_reservation_comment_mentions TO authenticated;
GRANT ALL ON public.resource_reservation_comment_mentions TO service_role;

DROP POLICY IF EXISTS reservation_comment_mentions_read ON public.resource_reservation_comment_mentions;
CREATE POLICY reservation_comment_mentions_read ON public.resource_reservation_comment_mentions
  FOR SELECT TO authenticated
  USING (public.fn_can_read_reservation_comments(reservation_id));

-- Only the comment's author tags, only on a thread they can read. No UPDATE or
-- DELETE policy: a tag is removed by deleting the comment (ON DELETE CASCADE).
DROP POLICY IF EXISTS reservation_comment_mentions_insert ON public.resource_reservation_comment_mentions;
CREATE POLICY reservation_comment_mentions_insert ON public.resource_reservation_comment_mentions
  FOR INSERT TO authenticated
  WITH CHECK (
    mentioned_by = (SELECT auth.uid())
    AND public.fn_can_read_reservation_comments(reservation_id)
    AND EXISTS (
      SELECT 1 FROM public.resource_reservation_comments c
      WHERE c.id = comment_id
        AND c.author_id = (SELECT auth.uid())
    )
  );

-- ── 6. Let a tagged person open the booking page ────────────────────────────
DROP POLICY IF EXISTS reservations_comment_mention_read ON public.resource_reservations;
CREATE POLICY reservations_comment_mention_read ON public.resource_reservations
  FOR SELECT TO authenticated
  USING (public.fn_is_reservation_comment_mention(id));

DROP POLICY IF EXISTS resources_reservation_mention_read ON public.resources;
CREATE POLICY resources_reservation_mention_read ON public.resources
  FOR SELECT TO authenticated
  USING (public.fn_is_resource_reservation_mention(id));

-- ── 7. Assert the grants took ───────────────────────────────────────────────
DO $assert$
BEGIN
  IF has_table_privilege('authenticated', 'public.resource_reservation_comment_mentions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.resource_reservation_comment_mentions', 'DELETE') THEN
    RAISE EXCEPTION 'resource_reservation_comment_mentions: authenticated must not hold UPDATE/DELETE';
  END IF;
  IF has_table_privilege('anon', 'public.resource_reservation_comment_mentions', 'SELECT') THEN
    RAISE EXCEPTION 'resource_reservation_comment_mentions is readable by anon';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.resource_reservation_comment_mentions', 'INSERT') THEN
    RAISE EXCEPTION 'resource_reservation_comment_mentions: authenticated cannot INSERT — tagging would always fail';
  END IF;
END
$assert$;

NOTIFY pgrst, 'reload schema';
