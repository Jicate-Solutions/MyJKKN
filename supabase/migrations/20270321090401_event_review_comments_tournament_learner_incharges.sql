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
-- ── What an admitted learner in-charge can DO, stated in full ──────────────
-- Every policy on event_review_comments and event_review_comment_mentions
-- calls this one function, so admitting a learner to READ also admits them to
-- everything the per-row author tests then allow. Exhaustively:
--   · read every comment on that tournament's thread       (…_read)
--   · post a remark and reply                              (…_insert)
--   · edit or delete their OWN comments                    (…_update/_delete,
--                                                           author test)
--   · CLOSE or reopen a thread THEY raised — the guard trigger's resolve
--     branch admits OLD.author_id = auth.uid() (20261128090000,
--     fn_guard_event_review_comment). This is the author half of the close
--     rule; the admin half (fn_is_event_review_admin) still never admits a
--     learner, so closing a thread SOMEONE ELSE raised stays refused;
--   · see who has been TAGGED on the thread (event_review_comment_mentions_read,
--     20261220096000) — the tagged team members' names are shown on each
--     comment;
--   · TAG team members of the event's institution on their own comments, and
--     untag them (…_mentions_insert/_delete). A tag grants that team member
--     read access to the thread and sends them a notification. Learners still
--     cannot BE tagged (fn_can_be_tagged_on_event is not touched).
-- Deleting another person's comment still needs super admin. A read-only
-- learner would need a second function and every write policy re-pointed at
-- it; this file does not do that.
--
-- ── Drift guard ─────────────────────────────────────────────────────────────
-- CREATE OR REPLACE would silently revert any hand-applied change to either
-- function below. Section 0 therefore REFUSES to run unless each function's
-- live body (pg_proc.prosrc, the text between the dollar quotes, stored
-- verbatim) is byte-for-byte the body this file was built from — the
-- 20261220097000 body of fn_can_read_event_review_comments and the
-- 20261224110000 body of fn_guard_event_review_comment_mention — or already
-- this file's own body (a re-run). The builder read the live
-- pg_get_functiondef on 2026-09-24 and found it equal to 20261220097000; this
-- section turns that one-off reading into a check made at apply time. The md5s were taken by applying those
-- migrations verbatim to a local PostgreSQL 16 (see
-- __tests__/events/event-review-comments-learner-incharge.pg.test.ts, which
-- re-derives all four from the files and fails if any constant is stale).
--
-- ── Copy ────────────────────────────────────────────────────────────────────
-- fn_guard_event_review_comment_mention refused a learner tag with "learners
-- never see this thread" — false once learner in-charges read it. Its body is
-- the 20261224110000 body with that one sentence changed; the table comment on
-- event_review_comments ("never by students") is corrected the same way.
--
-- ci:allow-secdef-authenticated SELF-SCOPED: fn_can_read_event_review_comments
-- takes only an event id and answers whether auth.uid() may read that event's
-- thread. authenticated must hold EXECUTE because every RLS policy on
-- event_review_comments and event_review_comment_mentions calls it as the
-- signed-in user. fn_guard_event_review_comment_mention is a trigger function
-- and is granted to nobody.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent.

-- ── 0. Pre-flight: the live bodies are the ones this file was built from ────
DO $pre$
DECLARE
  v_read  text;
  v_guard text;
BEGIN
  SELECT md5(prosrc) INTO v_read FROM pg_proc
   WHERE oid = 'public.fn_can_read_event_review_comments(uuid)'::regprocedure;
  SELECT md5(prosrc) INTO v_guard FROM pg_proc
   WHERE oid = 'public.fn_guard_event_review_comment_mention()'::regprocedure;

  IF v_read IS DISTINCT FROM '613e26878f17298f7ed8adad9a3c5c4d'   -- 20261220097000
     AND v_read IS DISTINCT FROM '5062a84ed53b6238e2a3a2e088a6d5e4'               -- this file
  THEN
    RAISE EXCEPTION 'fn_can_read_event_review_comments: live body (md5 %) is neither the 20261220097000 body nor this file''s — it was changed outside the migrations. Refusing to overwrite it; reconcile first.', v_read;
  END IF;

  IF v_guard IS DISTINCT FROM '8af3e3131870b3799831100cce552245'  -- 20261224110000
     AND v_guard IS DISTINCT FROM 'd512178baed41951ddf6a227d977b2f7'             -- this file
  THEN
    RAISE EXCEPTION 'fn_guard_event_review_comment_mention: live body (md5 %) is neither the 20261224110000 body nor this file''s. Refusing to overwrite it; reconcile first.', v_guard;
  END IF;
END
$pre$;

-- ── 1. The read gate: one arm widened ───────────────────────────────────────
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

-- ── 2. The tag guard: one sentence changed ──────────────────────────────────
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
    RAISE EXCEPTION 'Only team members of this event''s institution can be tagged — learners cannot be tagged.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_event_review_comment_mention() FROM anon, PUBLIC;

-- ── 3. The table's own description ──────────────────────────────────────────
COMMENT ON TABLE public.event_review_comments IS
  'Internal review remarks on an event from the reviewing authority, and the coordinator''s replies. Two levels only (root + replies). Readable (and writable) by whoever fn_can_read_event_review_comments admits: super admins, the event''s staff in-charges, the learner in-charges of a sports tournament, the event creator, staff committee members, holders of events.review_comments.view with institution access, and team members tagged on the thread — never by other learners or by participants.';

-- ── 4. Assert the end state ─────────────────────────────────────────────────
-- By md5, not by a keyword: every arm must be this file's, not just the new one.
DO $post$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc
       WHERE oid = 'public.fn_can_read_event_review_comments(uuid)'::regprocedure)
     IS DISTINCT FROM '5062a84ed53b6238e2a3a2e088a6d5e4' THEN
    RAISE EXCEPTION 'fn_can_read_event_review_comments: deployed body is not this file''s after apply';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc
       WHERE oid = 'public.fn_guard_event_review_comment_mention()'::regprocedure)
     IS DISTINCT FROM 'd512178baed41951ddf6a227d977b2f7' THEN
    RAISE EXCEPTION 'fn_guard_event_review_comment_mention: deployed body is not this file''s after apply';
  END IF;
  IF has_function_privilege('anon', 'public.fn_can_read_event_review_comments(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_can_read_event_review_comments: anon still holds EXECUTE';
  END IF;
  IF has_function_privilege('anon', 'public.fn_guard_event_review_comment_mention()', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_guard_event_review_comment_mention: anon holds EXECUTE';
  END IF;
END
$post$;

NOTIFY pgrst, 'reload schema';
