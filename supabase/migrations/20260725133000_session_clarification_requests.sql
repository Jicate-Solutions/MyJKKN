-- =============================================================================
-- 20260725133000_session_clarification_requests.sql
-- CARRE evidence instrumentation — Lane C: CLARIFICATION REQUESTS (ask → outcome).
-- Backlog: specs/carre-evidence-instrumentation-backlog-2026-07-25.md (item 2).
-- LC brief C4: topics assigned without explanation; re-explanation refused to
-- on-duty attendees. Today NO trace of "learner asked → what happened" exists.
--
-- MODEL: after submitting session feedback (the confirmation moment on
-- /learners/class-feedback), a learner can record "I asked for a re-explanation
-- of this session", and later self-report what happened (re_explained / refused
-- / unanswered). This is the LEARNER'S OWN record of their own act — it mirrors
-- the fn_scf_set_verdict self-report pattern (20260628010000): the same human
-- who acted reports the outcome; nothing is machine-scored, nobody is ranked,
-- and nothing is ever auto-applied to anyone's record (acts-not-scores).
--
-- IDENTITY (same as session_feedback, verified 2026-06-15):
--   learner: auth.uid() = profiles.id -> learners_profiles.profile_id ->
--            learners_profiles.id == student_attendance blob students[].student_id
--
-- ACCESS:
--   • learner: SELECT own rows only (RLS); writes ONLY via the two RPCs below.
--   • leadership: SELECT via audit.cycle.view + institution scope (RLS).
--   • no direct INSERT/UPDATE/DELETE policies — writes are RPC-only.
--
-- ADDITIVE + DARK: new table + 2 locked RPCs. Touches nothing existing.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_clarification_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL,
  student_id       uuid NOT NULL,          -- learners_profiles.id (same key as session_feedback)
  attendance_date  date NOT NULL,
  period_id        text NOT NULL,          -- attendance_data key (same as session_feedback)
  course_code      text,                   -- resolved server-side from the attendance blob
  asked_at         timestamptz NOT NULL DEFAULT now(),
  outcome          text NOT NULL DEFAULT 'pending'
                     CHECK (outcome IN ('pending','re_explained','refused','unanswered')),
  outcome_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, attendance_date, period_id)   -- one ask per learner per session
);

CREATE INDEX IF NOT EXISTS idx_session_clarification_student
  ON public.session_clarification_requests (student_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_session_clarification_inst
  ON public.session_clarification_requests (institution_id, attendance_date);

COMMENT ON TABLE public.session_clarification_requests IS
  'One row per (learner, session) recording that the learner asked for a re-explanation and — self-reported by the SAME learner — what happened (pending/re_explained/refused/unanswered). student_id = learners_profiles.id. Writes only via fn_clarification_ask / fn_clarification_outcome. Lane C of specs/carre-evidence-instrumentation-backlog-2026-07-25.md.';

-- ---------------------------------------------------------------------------
-- 2) RLS — learner reads OWN rows; leadership reads via audit.cycle.view.
--    NO write policies: all writes flow through the SECURITY DEFINER RPCs.
-- ---------------------------------------------------------------------------
ALTER TABLE public.session_clarification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_clarification_learner_own ON public.session_clarification_requests;
CREATE POLICY session_clarification_learner_own ON public.session_clarification_requests
  FOR SELECT TO authenticated
  USING (student_id = (SELECT lp.id FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid()));

DROP POLICY IF EXISTS session_clarification_leadership_read ON public.session_clarification_requests;
CREATE POLICY session_clarification_leadership_read ON public.session_clarification_requests
  FOR SELECT TO authenticated
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('audit.cycle.view')
        AND role_has_institution_access(institution_id))
  );

-- Supabase default privileges GRANT ALL on new public tables to anon /
-- authenticated / service_role — strip that back to read-only for authenticated
-- and nothing for anon/PUBLIC, so direct writes fail LOUDLY at the grant layer
-- (not just silently at RLS). Writes flow only through the RPCs below.
REVOKE ALL ON public.session_clarification_requests FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.session_clarification_requests FROM authenticated;
GRANT SELECT ON public.session_clarification_requests TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) fn_clarification_ask — the learner records "I asked for a re-explanation".
--    Learners only; caller must have been marked Present in the session (same
--    blob validation as fn_scf_submit_feedback). One row per session per
--    learner: a second ask upserts (bumps updated_at), never duplicates, and
--    never resets an already-reported outcome.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_clarification_ask(
  p_attendance_date date,
  p_timetable_id    uuid,
  p_period_id       text
)
RETURNS public.session_clarification_requests
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lp      uuid;
  v_inst    uuid;
  v_period  jsonb;
  v_present boolean;
  v_row     public.session_clarification_requests;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_clarification_ask: not authenticated';
  END IF;

  -- Learners only (a team member has no learners_profiles row).
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN
    RAISE EXCEPTION 'fn_clarification_ask: only learners can record a clarification request';
  END IF;

  -- Locate the session's period entry in the attendance blob.
  SELECT sa.institution_id, sa.attendance_data -> p_period_id
    INTO v_inst, v_period
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id
    AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  LIMIT 1;

  IF v_period IS NULL THEN
    RAISE EXCEPTION 'fn_clarification_ask: no such session (timetable/date/period)';
  END IF;

  -- The caller must appear as Present in that period.
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_period -> 'students') st
    WHERE (st ->> 'student_id')::uuid = v_lp
      AND st ->> 'status' = 'Present'
  ) INTO v_present;

  IF NOT v_present THEN
    RAISE EXCEPTION 'fn_clarification_ask: caller was not marked Present in this session';
  END IF;

  INSERT INTO public.session_clarification_requests (
    institution_id, student_id, attendance_date, period_id, course_code
  )
  VALUES (
    v_inst, v_lp, p_attendance_date, p_period_id, v_period ->> 'course_code'
  )
  ON CONFLICT (student_id, attendance_date, period_id) DO UPDATE SET
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_clarification_ask(date,uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_clarification_ask(date,uuid,text) TO authenticated;

COMMENT ON FUNCTION public.fn_clarification_ask(date,uuid,text) IS
  'Learner-only: records (upserts) "I asked for a re-explanation of this session". Validates Present-in-blob. One row per (learner, session); re-asks bump updated_at only. Lane C, specs/carre-evidence-instrumentation-backlog-2026-07-25.md.';

-- ---------------------------------------------------------------------------
-- 4) fn_clarification_outcome — the SAME learner self-reports what happened.
--    Mirrors the SCF verdict pattern: this is the learner's own record; no
--    machine scoring, no third-party write. Outcome is one of the three
--    self-reportable states; 'pending' is the default, not a reportable value.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_clarification_outcome(
  p_attendance_date date,
  p_period_id       text,
  p_outcome         text
)
RETURNS public.session_clarification_requests
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lp  uuid;
  v_row public.session_clarification_requests;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_clarification_outcome: not authenticated';
  END IF;

  IF p_outcome NOT IN ('re_explained','refused','unanswered') THEN
    RAISE EXCEPTION 'fn_clarification_outcome: invalid outcome "%" — must be re_explained, refused, or unanswered', p_outcome;
  END IF;

  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN
    RAISE EXCEPTION 'fn_clarification_outcome: only learners can report a clarification outcome';
  END IF;

  UPDATE public.session_clarification_requests
     SET outcome    = p_outcome,
         outcome_at = now(),
         updated_at = now()
   WHERE student_id = v_lp
     AND attendance_date = p_attendance_date
     AND period_id = p_period_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'fn_clarification_outcome: no clarification request found for this session — record the ask first';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_clarification_outcome(date,text,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_clarification_outcome(date,text,text) TO authenticated;

COMMENT ON FUNCTION public.fn_clarification_outcome(date,text,text) IS
  'Learner-only self-report of what happened after their own clarification ask (re_explained/refused/unanswered). Owner-scoped by learners_profiles lookup — a learner can only ever touch their own row. Lane C, specs/carre-evidence-instrumentation-backlog-2026-07-25.md.';
