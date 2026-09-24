-- ─── Review Comments — learner in-charges of a TOURNAMENT may read and reply ──
-- 2026-09-24 · BUG-006176 (COO, 2026-09-18) · BUG-006135 (learner in-charge, 2026-09-16)
--
-- What was reported: "the review comments are not visible for the students
-- (learners incharges) check on this and rectify" — filed by the COO, the
-- reviewing authority, one minute after he posted a remark on
-- "JKKN100 CHESS & CARROM INDOOR SPORTS MEET 2026". The thread there holds 3
-- comments (COO + a staff in-charge, 16–18 Sep). Four of that tournament's
-- eight in-charges are learners and could not see any of them.
--
-- Why they could not: NOT a missing grant and NOT a missing row. It is the
-- deliberate rule of 20261220097000 (Director, 2026-09-16, decision 2): "An
-- IN-CHARGE sees the thread only if they are STAFF." The in-charge arm below
-- was ANDed with fn_can_be_tagged_in_event_review(), which refuses role
-- 'student'. The client hook refused learners a second time before asking.
--
-- The change: the in-charge arm now also admits an ACTIVE learner (role
-- 'student') who is an appointed in-charge of a SPORTS TOURNAMENT. Nothing
-- else moves:
--   · learner in-charges of any other event type — still refused
--     (production 2026-09-24: 1 lecture event has 1 learner in-charge);
--   · learner committee members — still refused (committee arm unchanged);
--   · course_participant / parent — still refused;
--   · tagging — learners still cannot BE tagged (fn_can_be_tagged_in_event_review
--     is not touched), so the mention arm is unchanged.
-- Blast radius on production 2026-09-24: 5 learners, on 2 tournaments.
--
-- Because every write policy on event_review_comments also calls this
-- function, an admitted learner in-charge can REPLY as well as read — the
-- card's stated purpose is "the reviewing authority's remarks and the
-- in-charge's replies". Closing another person's thread still needs
-- fn_is_event_review_admin(); deleting another person's comment still needs
-- super admin. Both are untouched.
--
-- Everything else in the function is the LIVE body (pg_get_functiondef read
-- from production 2026-09-24), unchanged.
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
    -- Runs this event: appointed in-charge — STAFF (2026-09-16), or an active
    -- LEARNER in-charge of a sports tournament (2026-09-24, BUG-006176) — or
    -- the person who created it. Neither is institution-tested: an in-charge
    -- may be borrowed from another college.
    OR (
      public.fn_is_event_incharge(p_event_id)
      AND (
        public.fn_can_be_tagged_in_event_review((SELECT auth.uid()))
        OR (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid())
              AND COALESCE(p.is_active, true)
              AND p.role = 'student'
          )
          AND EXISTS (
            SELECT 1 FROM public.events e
            WHERE e.id = p_event_id
              AND e.event_type = 'sports_tournament'
          )
        )
      )
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
  'May the caller see this event''s internal review thread, and post in it? Super admin; a STAFF in-charge of the event, or an active LEARNER in-charge of a sports tournament (BUG-006176); the event creator; a STAFF committee lead/member of the event; a holder of events.review_comments.view with access to the owning institution; or staff tagged on the thread. "Staff" = fn_can_be_tagged_in_event_review. Other learners never — deliberately does NOT admit events.view, which students hold.';

DO $$
BEGIN
  IF position('sports_tournament' IN pg_get_functiondef('public.fn_can_read_event_review_comments(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'fn_can_read_event_review_comments: tournament learner in-charge arm missing after apply';
  END IF;
  IF has_function_privilege('anon', 'public.fn_can_read_event_review_comments(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_can_read_event_review_comments: anon still holds EXECUTE';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
