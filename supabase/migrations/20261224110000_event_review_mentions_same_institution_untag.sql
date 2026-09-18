-- ─── Event review tags — same institution only, and untag ───────────────────
-- 2026-09-17  [BUG-006139 follow-up; same fix as 20261224103700 for bookings]
--
-- THE GAP (20261220096000). Event Review Comments tagging had the same two
-- problems the reservation thread had:
--   1. Any active staff member, from any college, could be tagged — and a tag
--      also opened the EVENT ROW (events_review_mention_read) and the
--      /events/tournament UI to them.
--   2. A tag could not be removed; revoking it meant deleting the comment.
--
-- THE FLOW THIS MIGRATION ENFORCES
--   Add comment → tag a team member → ONLY people of the event's institution
--   qualify → the tagged person can read and reply in that event's review
--   thread → the author may untag → access is revoked → the comment stays.
--
-- "Same institution" = the tagged person's profiles.institution_id equals
-- events.institution_id (every event has one — 55/55 on 2026-09-17). That is
-- the column events_auth_read already admits people by, so everyone who passes
-- this rule can already open the event: events_review_mention_read is DROPPED.
-- The three tags that existed when this was written were all same-institution,
-- so nobody loses access they were legitimately given.
--
-- All_jkkn-scoped events are NOT special-cased: the owning institution is
-- still the one whose team members can be tagged.
--
-- fn_can_be_tagged_in_event_review is left exactly as it is — it is the shared
-- "is this person staff" test the reservation rule also calls.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent. Depends on 20261220096000.
--
-- ci:allow-secdef-authenticated SELF-SCOPED: fn_is_event_review_mention and
-- fn_has_any_tournament_role take no user id and answer only about auth.uid()
-- (am *I* tagged / do *I* hold a tournament role); authenticated needs EXECUTE
-- because RLS policies and the tournament route guard call them as the
-- signed-in user. Same grants and reason as 20261220096000, which defined
-- them. The one function here that takes an arbitrary user id,
-- fn_can_be_tagged_on_event, is revoked from authenticated below.

-- ── 1. Who can be tagged on THIS event ──────────────────────────────────────
-- Takes an arbitrary user id, so NOT granted to authenticated. Callers: the
-- guard trigger (definer) and the review-mentions API route (service role).
CREATE OR REPLACE FUNCTION public.fn_can_be_tagged_on_event(
  p_user_id uuid,
  p_event_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.fn_can_be_tagged_in_event_review(p_user_id)
    AND EXISTS (
      SELECT 1
        FROM public.events e
        JOIN public.profiles p ON p.id = p_user_id
       WHERE e.id = p_event_id
         AND e.institution_id IS NOT NULL
         AND p.institution_id = e.institution_id
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_be_tagged_on_event(uuid, uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_be_tagged_on_event(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.fn_can_be_tagged_on_event(uuid, uuid) IS
  'May this user be tagged on this event''s review thread? Active team member (fn_can_be_tagged_in_event_review) whose profiles.institution_id is the event''s institution.';

-- ── 2. Guard trigger now enforces the institution ───────────────────────────
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

  IF NOT public.fn_can_be_tagged_on_event(NEW.mentioned_user_id, v_event_id) THEN
    RAISE EXCEPTION 'Only team members of this event''s institution can be tagged — learners never see this thread.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_event_review_comment_mention() FROM anon, PUBLIC;

-- ── 3. A tag counts only while the person is still in that institution ──────
-- Same signature, so fn_can_read_event_review_comments picks this up unchanged.
CREATE OR REPLACE FUNCTION public.fn_is_event_review_mention(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.event_review_comment_mentions m
      JOIN public.events e   ON e.id = m.event_id
      JOIN public.profiles p ON p.id = m.mentioned_user_id
     WHERE m.event_id = p_event_id
       AND m.mentioned_user_id = (SELECT auth.uid())
       AND p.institution_id = e.institution_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_event_review_mention(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_event_review_mention(uuid) TO authenticated, service_role;

-- ── 4. No more tag-based read of the event row ──────────────────────────────
DROP POLICY IF EXISTS events_review_mention_read ON public.events;

-- ── 5. Tournament UI entry: same institution rule for the tagged arm ────────
-- Live body of fn_has_any_tournament_role (verified identical to
-- 20261220096000 on 2026-09-17), with the tagged arm now institution-checked.
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
        -- tagged on the tournament's review thread, while still in its
        -- institution (2026-09-16; institution test 2026-09-17)
        OR EXISTS (
          SELECT 1
            FROM public.event_review_comment_mentions m
            JOIN public.profiles p ON p.id = m.mentioned_user_id
           WHERE m.event_id = e.id
             AND m.mentioned_user_id = auth.uid()
             AND p.institution_id = e.institution_id
        )
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_has_any_tournament_role() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_has_any_tournament_role() TO authenticated;

-- ── 6. Untag ────────────────────────────────────────────────────────────────
-- The comment's author removes a tag; a super admin may clean one up. Removing
-- the row IS the revocation. The comment is untouched.
GRANT DELETE ON public.event_review_comment_mentions TO authenticated;

DROP POLICY IF EXISTS event_review_comment_mentions_delete ON public.event_review_comment_mentions;
CREATE POLICY event_review_comment_mentions_delete ON public.event_review_comment_mentions
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR EXISTS (
      SELECT 1 FROM public.event_review_comments c
      WHERE c.id = comment_id
        AND c.author_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE public.event_review_comment_mentions IS
  'Team members tagged on an event review comment. A row admits mentioned_user_id to that event''s review thread while they remain in the event''s institution. Only same-institution staff can be tagged; the comment''s author can untag (delete the row), which revokes access and leaves the comment.';

-- ── 7. Assert the end state ─────────────────────────────────────────────────
DO $assert$
BEGIN
  IF has_table_privilege('authenticated', 'public.event_review_comment_mentions', 'UPDATE') THEN
    RAISE EXCEPTION 'event_review_comment_mentions: authenticated must not hold UPDATE';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.event_review_comment_mentions', 'DELETE') THEN
    RAISE EXCEPTION 'event_review_comment_mentions: authenticated cannot DELETE — untag would always fail';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'events_review_mention_read') THEN
    RAISE EXCEPTION 'events_review_mention_read is still present';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_can_be_tagged_on_event(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_can_be_tagged_on_event must not be executable by authenticated';
  END IF;
END
$assert$;

NOTIFY pgrst, 'reload schema';
