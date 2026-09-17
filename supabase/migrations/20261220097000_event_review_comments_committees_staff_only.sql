-- ─── Review Comments — committee staff join, student in-charges leave ───────
-- 2026-09-16
--
-- Decisions (Director, 2026-09-16), on who reads an event's review thread:
--
--   1. STAFF committee leads and members of the event can read and reply.
--      A review remark ("hospitality hasn't confirmed rooms") is usually about
--      a committee's work, and the committee was the one group running the
--      event that could not see it.
--
--   2. An IN-CHARGE sees the thread only if they are STAFF. The in-charge
--      picker (member-picker-dialog) allows learners, and events.config
--      ->'incharges' does not record which kind of person was picked, so a
--      learner named in-charge was reading a thread whose premise is that
--      learners never see it.
--
--   3. Event coordinators: UNCHANGED — own college's events only, via the
--      events.review_comments.view key and role_has_institution_access.
--
-- "Staff" is fn_can_be_tagged_in_event_review() — the same test that decides
-- who can be tagged (active, role not student/course_participant/parent), so
-- "who may be brought in" and "who is let in by role" cannot drift apart.
--
-- Committee matching is fn_is_event_committee_member(), which — like every
-- committee check in this module — also matches by profiles.full_name against
-- lead_name/member_names. Two staff with the same full name on one committee
-- roster would both be admitted. That is the existing committee rule, reused
-- rather than reinvented; tightening it is a separate change.
--
-- Everything else in the function is the live 20261220096000 body, unchanged.
--
-- ci:allow-secdef-authenticated SELF-SCOPED: fn_can_read_event_review_comments
-- takes only an event id and answers whether auth.uid() may read that event's
-- thread. authenticated must hold EXECUTE because every RLS policy on
-- event_review_comments and event_review_comment_mentions calls it as the
-- signed-in user.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent.

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
    -- Runs this event: appointed in-charge — STAFF only (2026-09-16) — or the
    -- person who created it. Neither is institution-tested: an in-charge may
    -- be borrowed from another college.
    OR (
      public.fn_is_event_incharge(p_event_id)
      AND public.fn_can_be_tagged_in_event_review((SELECT auth.uid()))
    )
    OR EXISTS (
         SELECT 1 FROM public.events e
         WHERE e.id = p_event_id
           AND e.created_by = (SELECT auth.uid())
       )
    -- Works on this event: a STAFF committee lead or member (2026-09-16).
    OR (
      public.fn_is_event_committee_member(p_event_id)
      AND public.fn_can_be_tagged_in_event_review((SELECT auth.uid()))
    )
    -- Granted the section in Role Management, over an institution they can
    -- actually reach (event coordinators: own college only).
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
    -- Tagged on this event's thread. Learners cannot hold this arm — the tag
    -- guard refuses them.
    OR public.fn_is_event_review_mention(p_event_id);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_can_read_event_review_comments(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_read_event_review_comments(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_can_read_event_review_comments(uuid) IS
  'May the caller see this event''s internal review thread, and post in it? Super admin; a STAFF in-charge of the event; the event creator; a STAFF committee lead/member of the event; a holder of events.review_comments.view with access to the owning institution; or staff tagged on the thread. "Staff" = fn_can_be_tagged_in_event_review. Learners never — deliberately does NOT admit events.view, which students hold.';

NOTIFY pgrst, 'reload schema';
