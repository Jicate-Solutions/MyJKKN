-- ─── Review Comments — tag (mention) staff on an event's review thread ──────
-- 2026-09-16
--
-- The review thread (20261128090000, gated by 20261130090000) is readable by a
-- deliberately small audience: super admin, the event's in-charge and creator,
-- and holders of events.review_comments.view. A remark like "the hospitality
-- committee still hasn't confirmed rooms" usually needs someone OUTSIDE that
-- audience to act — and until now the only way to reach them was off-system.
--
-- Decision (Director, 2026-09-16): TAGGING GRANTS ACCESS.
--   · A tagged person can read and reply in that event's review thread from
--     then on, and receives an in-app notification.
--   · Only STAFF can be tagged. Learners never — the thread's whole premise is
--     that it is hidden from the students it is about.
--   · Access is per EVENT, not per comment: once pulled into the conversation,
--     you can follow the rest of it.
--
-- ── What "access" reaches, stated plainly ───────────────────────────────────
-- Being tagged admits a person to:
--   1. the review thread           — fn_can_read_event_review_comments
--   2. the event ROW itself        — events_review_mention_read, so the page
--                                    that hosts the thread can load it at all
--   3. the /events/tournament UI   — fn_has_any_tournament_role, the route
--                                    guard's fallback; per-event checks still
--                                    apply on every page and API
-- It does NOT grant manage rights, registrations (events.registrations.view),
-- budget/sponsor writes, or Messages. The tournament console keeps its own
-- per-event canView gate; a tagged person who fails it is shown the review
-- thread alone, not the console (see app/(routes)/events/tournament/[id]).
--
-- ── Who may tag ─────────────────────────────────────────────────────────────
-- Only the AUTHOR of the comment, and only while they can read the thread.
-- That is enforced here, not in the API route: the route inserts through the
-- caller's own session so RLS and the guard trigger below are the authority.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent.
--
-- ci:allow-secdef-authenticated SELF-SCOPED: fn_is_event_review_mention and
-- fn_has_any_tournament_role take no user id and answer only about auth.uid()
-- (am *I* tagged / do *I* hold a tournament role); authenticated needs EXECUTE
-- because RLS policies and the tournament route guard call them as the signed-in
-- user. fn_can_read_event_review_comments is the same shape and was already so.
-- The one function here that takes an arbitrary user id,
-- fn_can_be_tagged_in_event_review, is revoked from authenticated below.

-- ── 1. Table ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_review_comment_mentions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id         uuid NOT NULL
                       REFERENCES public.event_review_comments(id) ON DELETE CASCADE,
  -- Denormalised from the comment so the read gate can be a single indexed
  -- lookup. Never trusted from the client: the guard trigger overwrites it.
  event_id           uuid NOT NULL
                       REFERENCES public.events(id) ON DELETE CASCADE,
  mentioned_user_id  uuid NOT NULL
                       CONSTRAINT event_review_comment_mentions_mentioned_user_id_fkey
                       REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentioned_by       uuid NOT NULL DEFAULT auth.uid()
                       CONSTRAINT event_review_comment_mentions_mentioned_by_fkey
                       REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_review_comment_mentions_once UNIQUE (comment_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_review_comment_mentions_event_user
  ON public.event_review_comment_mentions (event_id, mentioned_user_id);

COMMENT ON TABLE public.event_review_comment_mentions IS
  'Staff tagged on an event review comment. A row here admits mentioned_user_id to that event''s review thread (fn_can_read_event_review_comments) and to the event row. Written only by the comment''s author; learners cannot be tagged.';

-- ── 2. Who can be tagged ────────────────────────────────────────────────────
-- Staff = an active profile whose role is not a learner-side role. Decided by
-- role, NOT by profiles.learner_id: on 2026-09-16 three faculty and two staff
-- rows carried a learner_id (former students now employed), and excluding them
-- would lock out real staff.
CREATE OR REPLACE FUNCTION public.fn_can_be_tagged_in_event_review(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND COALESCE(p.is_active, true)
      AND COALESCE(p.role, '') NOT IN ('student', 'course_participant', 'parent', '')
  );
$$;

-- NOT granted to authenticated. It takes an ARBITRARY user id, so a browser
-- caller could walk profile ids and learn who is active staff. Its two callers
-- do not need the grant: the guard trigger below runs as the definer, and the
-- review-mentions API route calls it with the service-role client.
REVOKE EXECUTE ON FUNCTION public.fn_can_be_tagged_in_event_review(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_be_tagged_in_event_review(uuid) TO service_role;

-- ── 3. Guard trigger ────────────────────────────────────────────────────────
-- Runs BEFORE the RLS WITH CHECK is evaluated, so the policy sees the row as
-- corrected here. Raises 42501 with a sentence — commentWriteMessage() passes a
-- guard's own sentence straight through to the user.
CREATE OR REPLACE FUNCTION public.fn_guard_event_review_comment_mention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  SELECT c.event_id INTO v_event_id
    FROM public.event_review_comments c
   WHERE c.id = NEW.comment_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'That comment no longer exists.' USING ERRCODE = '42501';
  END IF;

  -- The event is the comment's event, whatever the client sent.
  NEW.event_id := v_event_id;
  -- And the tagger is the session, whatever the client sent.
  NEW.mentioned_by := auth.uid();

  IF NOT public.fn_can_be_tagged_in_event_review(NEW.mentioned_user_id) THEN
    RAISE EXCEPTION 'Only staff can be tagged in review comments — learners never see this thread.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_event_review_comment_mention() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_event_review_comment_mentions_guard ON public.event_review_comment_mentions;
CREATE TRIGGER trg_event_review_comment_mentions_guard
  BEFORE INSERT ON public.event_review_comment_mentions
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_event_review_comment_mention();

-- ── 4. "Am I tagged on this event?" ─────────────────────────────────────────
-- SECURITY DEFINER so it reads the mentions table without passing through that
-- table's own SELECT policy — which calls fn_can_read_event_review_comments,
-- which calls this. Owner-privileged reads break that cycle.
CREATE OR REPLACE FUNCTION public.fn_is_event_review_mention(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_review_comment_mentions m
    WHERE m.event_id = p_event_id
      AND m.mentioned_user_id = (SELECT auth.uid())
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_event_review_mention(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_event_review_mention(uuid) TO authenticated, service_role;

-- ── 5. Widen the thread's read gate ─────────────────────────────────────────
-- Body is the live 20261130090000 definition, unchanged, plus the final arm.
-- Every policy on event_review_comments calls this function, so a tagged person
-- can now read, reply, and edit/delete their OWN replies — the author and admin
-- tests in those policies are untouched.
CREATE OR REPLACE FUNCTION public.fn_can_read_event_review_comments(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Owns the platform.
    public.is_super_admin()
    -- Runs this event: appointed in-charge, or the person who created it.
    OR public.fn_is_event_incharge(p_event_id)
    OR EXISTS (
         SELECT 1 FROM public.events e
         WHERE e.id = p_event_id
           AND e.created_by = (SELECT auth.uid())
       )
    -- Granted the section in Role Management, over an institution they can
    -- actually reach.
    OR (
      public.user_has_permission('events.review_comments.view')
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = p_event_id
          AND (
            public.role_has_institution_access(e.institution_id)
            OR e.institution_id IN (
                 SELECT p.institution_id
                   FROM public.profiles p
                  WHERE p.id = (SELECT auth.uid())
                    AND p.institution_id IS NOT NULL
               )
          )
      )
    )
    -- Added 2026-09-16: tagged on this event's thread. Not institution-tested —
    -- the point of tagging is to reach the person who can fix it, wherever
    -- they sit. Learners cannot hold this arm (the guard refuses to tag them).
    OR public.fn_is_event_review_mention(p_event_id);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_read_event_review_comments(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_read_event_review_comments(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_can_read_event_review_comments(uuid) IS
  'May the caller see this event''s internal review thread, and post in it? Super admin, the event in-charge, the event creator, a holder of events.review_comments.view with access to the owning institution, or a staff member tagged on the thread (event_review_comment_mentions). Deliberately does NOT admit events.view, which students hold.';

-- ── 6. RLS on the mentions table ────────────────────────────────────────────
ALTER TABLE public.event_review_comment_mentions ENABLE ROW LEVEL SECURITY;

-- Name `authenticated` explicitly: Supabase's default privileges hand it a
-- direct grant on every new table that survives revoking only anon/PUBLIC.
REVOKE ALL ON public.event_review_comment_mentions FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON public.event_review_comment_mentions TO authenticated;
GRANT ALL ON public.event_review_comment_mentions TO service_role;

DROP POLICY IF EXISTS event_review_comment_mentions_read ON public.event_review_comment_mentions;
CREATE POLICY event_review_comment_mentions_read ON public.event_review_comment_mentions
  FOR SELECT TO authenticated
  USING (public.fn_can_read_event_review_comments(event_id));

-- Only the comment's author tags, only on a thread they can read. No UPDATE or
-- DELETE policy: a tag is removed by deleting the comment (ON DELETE CASCADE).
DROP POLICY IF EXISTS event_review_comment_mentions_insert ON public.event_review_comment_mentions;
CREATE POLICY event_review_comment_mentions_insert ON public.event_review_comment_mentions
  FOR INSERT TO authenticated
  WITH CHECK (
    mentioned_by = (SELECT auth.uid())
    AND public.fn_can_read_event_review_comments(event_id)
    AND EXISTS (
      SELECT 1 FROM public.event_review_comments c
      WHERE c.id = comment_id
        AND c.author_id = (SELECT auth.uid())
    )
  );

-- ── 7. Let a tagged person load the event row ───────────────────────────────
-- Without this, a tagged colleague from another institution follows the
-- notification to a page that cannot read the event and says "not found".
DROP POLICY IF EXISTS events_review_mention_read ON public.events;
CREATE POLICY events_review_mention_read ON public.events
  FOR SELECT TO authenticated
  USING (public.fn_is_event_review_mention(id));

-- ── 8. Admit a tagged person into the /events/tournament UI ─────────────────
-- Live body of fn_has_any_tournament_role, unchanged, plus the final arm.
-- Entering the module still leaks nothing: every tournament page and API route
-- authorises per event.
CREATE OR REPLACE FUNCTION public.fn_has_any_tournament_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.event_type = 'sports_tournament'
      AND (
        -- in-charge (events.config->'incharges')
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(e.config->'incharges', '[]'::jsonb)) AS inc
          WHERE inc->>'member_id' = auth.uid()::text
        )
        -- committee lead / member
        OR EXISTS (
          SELECT 1 FROM public.event_committees mc
          WHERE mc.event_id = e.id
            AND (
              mc.lead_id = auth.uid()
              OR auth.uid() = ANY(mc.member_ids)
              OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                  AND p.full_name IS NOT NULL
                  AND (p.full_name = mc.lead_name OR p.full_name = ANY(mc.member_names))
              )
            )
        )
        -- checked-in volunteer
        OR EXISTS (
          SELECT 1 FROM public.event_volunteer_checkins v
          WHERE v.event_id = e.id AND v.member_id = auth.uid()
        )
        -- tagged on the tournament's review thread (2026-09-16)
        OR EXISTS (
          SELECT 1 FROM public.event_review_comment_mentions m
          WHERE m.event_id = e.id AND m.mentioned_user_id = auth.uid()
        )
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_has_any_tournament_role() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_has_any_tournament_role() TO authenticated;

-- ── 9. Assert the grants took ───────────────────────────────────────────────
DO $assert$
BEGIN
  IF has_table_privilege('authenticated', 'public.event_review_comment_mentions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.event_review_comment_mentions', 'DELETE') THEN
    RAISE EXCEPTION 'event_review_comment_mentions: authenticated must not hold UPDATE/DELETE';
  END IF;
  IF has_table_privilege('anon', 'public.event_review_comment_mentions', 'SELECT') THEN
    RAISE EXCEPTION 'event_review_comment_mentions is readable by anon';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.event_review_comment_mentions', 'INSERT') THEN
    RAISE EXCEPTION 'event_review_comment_mentions: authenticated cannot INSERT — tagging would always fail';
  END IF;
END
$assert$;

NOTIFY pgrst, 'reload schema';
