-- =============================================================================
-- 20260625190300_scf_live_pulse.sql
-- Live Pulse Check — a live in-class poll that FUELS the session-feedback loop.
-- Spec: specs/live-pulse-check-2026-06-25.md (12 Director decisions, 2026-06-25)
-- =============================================================================
-- The Live Pulse Check is a THIN in-class UX over the EXISTING feedback write
-- path. Each student response calls fn_scf_submit_feedback (the loop's only
-- write path) — inheriting the present-gate (#4/#7), the one-per-class
-- latest-wins dedup (#3/#8), the async "done" state (#3), AND feeding the loop
-- identically (AI synthesis, escalation #1623, carry-forward #1624,
-- self-improving #1625 all run unchanged).
--
-- Adds ONLY:
--   1. session_feedback.source       — capture channel ('async'|'live_poll')
--   2. scf_live_pulse table           — the live lifecycle / totals state
--   3. fn_scf_submit_feedback         — extended with p_source (ONE fn, back-compat)
--   4. fn_scf_open_pulse              — assigned faculty OR HOD/admin OF THAT institution (#5/#10)
--   5. fn_scf_open_pulse_for_learner  — a learner's open pulses (only Present sessions) (#4/#7)
--   6. fn_scf_pulse_totals            — anon aggregate for the teacher's live view (#2), k>=3 floor
--
-- Auto-close (#6) is LAZY: a pulse is "open" iff is_open AND auto_close_at > now()
-- (auto_close_at = issued_at + 240 min). No cron. fn_scf_open_pulse serialises
-- concurrent opens for one class with a txn advisory lock (no duplicate opens).
--
-- Hardening folded from the 2026-06-25 3-lens adversarial review:
--   - institution gate via role_has_institution_access (no cross-tenant access)
--   - k>=3 anonymity floor on the totals breakdown (no small-N de-anon, decision #2)
--   - advisory-lock the open path (no duplicate simultaneously-open pulses)
--   - NULL-email guard on totals; present_count aggregated across attendance rows
--   - live_poll source downgraded to async if no pulse is open (honest analytics)
--
-- SAFETY: additive. The new column has a default; the fn change is back-compatible
-- (existing 6-arg named-arg callers resolve to the new 7-arg fn → source='async').
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) session_feedback.source  (idempotent, safe on existing rows)
-- ---------------------------------------------------------------------------
ALTER TABLE public.session_feedback ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.session_feedback ALTER COLUMN source SET DEFAULT 'async';
UPDATE public.session_feedback SET source = 'async' WHERE source IS NULL;
ALTER TABLE public.session_feedback ALTER COLUMN source SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_feedback_source_chk') THEN
    ALTER TABLE public.session_feedback
      ADD CONSTRAINT session_feedback_source_chk CHECK (source IN ('async','live_poll'));
  END IF;
END $$;

COMMENT ON COLUMN public.session_feedback.source IS
  'Capture channel for this feedback row: ''async'' (after-class page) or ''live_poll'' (in-class Live Pulse Check). A capture-channel LABEL — not proof a pulse was open (fn_scf_submit_feedback downgrades live_poll->async when no pulse is open). Latest write wins.';

-- ---------------------------------------------------------------------------
-- 2) scf_live_pulse — the live lifecycle / totals state only. Created BEFORE
--    fn_scf_submit_feedback (which now references it). Writes flow ONLY through
--    the SECURITY DEFINER RPCs below (no table grants to authenticated).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scf_live_pulse (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid,
  timetable_id    uuid NOT NULL,
  attendance_date date NOT NULL,
  period_id       text NOT NULL,
  course_code     text,
  course_name     text,
  faculty_email   text,                              -- assigned faculty (the owner)
  is_open         boolean     NOT NULL DEFAULT true,
  issued_at       timestamptz NOT NULL DEFAULT now(),
  auto_close_at   timestamptz NOT NULL,              -- issued_at + 240 min (#6)
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scf_live_pulse_class
  ON public.scf_live_pulse (timetable_id, attendance_date, period_id);
CREATE INDEX IF NOT EXISTS idx_scf_live_pulse_open
  ON public.scf_live_pulse (is_open, auto_close_at);

COMMENT ON TABLE public.scf_live_pulse IS
  'One row per in-class Live Pulse Check. Holds ONLY the live lifecycle (is_open + auto_close_at), class context, and totals anchor. Student answers live in session_feedback (source=live_poll) via fn_scf_submit_feedback — this table never stores feedback content. Spec: specs/live-pulse-check-2026-06-25.md';

ALTER TABLE public.scf_live_pulse ENABLE ROW LEVEL SECURITY;

-- Reads + writes go through the definer RPCs; only super_admin gets a direct
-- table policy (support/debug). No table-level grant to authenticated.
DROP POLICY IF EXISTS scf_live_pulse_super_admin_all ON public.scf_live_pulse;
CREATE POLICY scf_live_pulse_super_admin_all ON public.scf_live_pulse
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR p.is_super_admin = true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR p.is_super_admin = true)));

-- ---------------------------------------------------------------------------
-- 3) Extend the ONLY write path with p_source. DROP+CREATE (PG cannot
--    CREATE OR REPLACE across a changed arg list). Re-REVOKE/GRANT below.
--    Verified: no db object depends on the fn; the sole caller uses named args;
--    only one overload exists — so this is back-compatible (7th arg defaults).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_scf_submit_feedback(date,uuid,text,smallint,jsonb,text);

CREATE OR REPLACE FUNCTION public.fn_scf_submit_feedback(
  p_attendance_date date,
  p_timetable_id    uuid,
  p_period_id       text,
  p_understood      smallint,
  p_checklist       jsonb DEFAULT '{}'::jsonb,
  p_free_text       text  DEFAULT NULL,
  p_source          text  DEFAULT 'async'
)
RETURNS public.session_feedback
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lp       uuid;
  v_period   jsonb;
  v_present  boolean;
  v_inst     uuid;
  v_src      text;
  v_row      public.session_feedback;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: not authenticated';
  END IF;
  IF p_understood IS NULL OR p_understood < 1 OR p_understood > 5 THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: understood must be 1..5';
  END IF;
  v_src := COALESCE(p_source, 'async');
  IF v_src NOT IN ('async','live_poll') THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: source must be async|live_poll';
  END IF;

  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: caller is not a learner';
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
    RAISE EXCEPTION 'fn_scf_submit_feedback: no such session (timetable/date/period)';
  END IF;

  -- The caller must appear as Present in that period (the present-gate, inherited
  -- by the live path — there is no way to write feedback for a session you weren't
  -- marked Present in).
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_period -> 'students') st
    WHERE (st ->> 'student_id')::uuid = v_lp
      AND st ->> 'status' = 'Present'
  ) INTO v_present;

  IF NOT v_present THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: caller was not marked Present in this session';
  END IF;

  -- Honest source label (#6): a 'live_poll' tag is only kept if a pulse is
  -- actually open for this class right now; otherwise downgrade to 'async'.
  IF v_src = 'live_poll' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.scf_live_pulse lp
      WHERE lp.timetable_id = p_timetable_id
        AND lp.attendance_date = p_attendance_date
        AND lp.period_id = p_period_id
        AND lp.is_open = true
        AND lp.auto_close_at > now()
    ) THEN
      v_src := 'async';
    END IF;
  END IF;

  INSERT INTO public.session_feedback (
    institution_id, student_id, attendance_date, timetable_id, period_id,
    section_id, course_id, course_code, course_name, faculty_id, faculty_email,
    understood, checklist, free_text, source
  )
  VALUES (
    v_inst, v_lp, p_attendance_date, p_timetable_id, p_period_id,
    NULLIF(v_period ->> 'section_id','')::uuid,
    NULLIF(v_period ->> 'course_id','')::uuid,
    v_period ->> 'course_code',
    v_period ->> 'course_name',
    NULLIF(v_period -> 'assigned_faculty' ->> 'faculty_id','')::uuid,
    v_period -> 'assigned_faculty' ->> 'faculty_email',
    p_understood, COALESCE(p_checklist,'{}'::jsonb), p_free_text, v_src
  )
  ON CONFLICT (student_id, attendance_date, period_id) DO UPDATE SET
    understood = EXCLUDED.understood,
    checklist  = EXCLUDED.checklist,
    free_text  = EXCLUDED.free_text,
    source     = EXCLUDED.source,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_submit_feedback(date,uuid,text,smallint,jsonb,text,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_submit_feedback(date,uuid,text,smallint,jsonb,text,text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) fn_scf_open_pulse — assigned faculty OR an HOD/admin WITH access to the
--    class's institution opens a pulse for a class from today's timetable
--    (#5/#10). Advisory-locked + idempotent: returns the existing open,
--    non-expired pulse for the class if one exists (no duplicate opens).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_open_pulse(
  p_attendance_date date,
  p_timetable_id    uuid,
  p_period_id       text
)
RETURNS public.scf_live_pulse
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email      text;
  v_role_ok    boolean;
  v_is_faculty boolean;
  v_pv         jsonb;
  v_inst       uuid;
  v_existing   public.scf_live_pulse;
  v_row        public.scf_live_pulse;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_open_pulse: not authenticated'; END IF;
  SELECT lower(p.email),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator'])
          OR p.is_super_admin = true)
    INTO v_email, v_role_ok
  FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RAISE EXCEPTION 'fn_scf_open_pulse: no profile'; END IF;

  SELECT sa.institution_id, sa.attendance_data -> p_period_id
    INTO v_inst, v_pv
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id
    AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  LIMIT 1;
  IF v_pv IS NULL THEN RAISE EXCEPTION 'fn_scf_open_pulse: no such session (timetable/date/period)'; END IF;

  v_is_faculty := (lower(v_pv -> 'assigned_faculty' ->> 'faculty_email') IS NOT DISTINCT FROM v_email);
  -- Institution gate: a privileged role only counts if it has access to THIS
  -- class's institution (super-admin bypasses). No cross-tenant pulses.
  IF NOT (v_is_faculty
          OR (COALESCE(v_role_ok, false)
              AND (public.is_super_admin() OR public.role_has_institution_access(v_inst)))) THEN
    RAISE EXCEPTION 'fn_scf_open_pulse: only the assigned faculty or an HOD/admin of this institution can open a pulse';
  END IF;

  -- Serialise concurrent opens for the SAME class so two callers cannot both
  -- create an open pulse (txn-scoped; released at commit/rollback).
  PERFORM pg_advisory_xact_lock(hashtext(p_timetable_id::text || '|' || p_attendance_date::text || '|' || p_period_id));

  -- Idempotent: reuse an already-open, non-expired pulse for this exact class.
  SELECT * INTO v_existing
  FROM public.scf_live_pulse lp
  WHERE lp.timetable_id = p_timetable_id
    AND lp.attendance_date = p_attendance_date
    AND lp.period_id = p_period_id
    AND lp.is_open = true
    AND lp.auto_close_at > now()
  ORDER BY lp.issued_at DESC
  LIMIT 1;
  IF v_existing.id IS NOT NULL THEN RETURN v_existing; END IF;

  INSERT INTO public.scf_live_pulse (
    institution_id, timetable_id, attendance_date, period_id,
    course_code, course_name, faculty_email, is_open, issued_at, auto_close_at, created_by
  )
  VALUES (
    v_inst, p_timetable_id, p_attendance_date, p_period_id,
    v_pv ->> 'course_code', v_pv ->> 'course_name',
    v_pv -> 'assigned_faculty' ->> 'faculty_email',
    true, now(), now() + interval '240 minutes', auth.uid()
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_open_pulse(date,uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_open_pulse(date,uuid,text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) fn_scf_open_pulse_for_learner — open pulses for sessions where the CALLER
--    is marked Present (#4/#7). The student answers via
--    fn_scf_submit_feedback(p_source=>'live_poll'); this RPC is discovery only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_open_pulse_for_learner()
RETURNS TABLE (
  pulse_id         uuid,
  attendance_date  date,
  timetable_id     uuid,
  period_id        text,
  course_code      text,
  course_name      text,
  faculty_email    text,
  issued_at        timestamptz,
  auto_close_at    timestamptz,
  already_answered boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_open_pulse_for_learner: not authenticated'; END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.id::uuid,
         p.attendance_date::date,
         p.timetable_id::uuid,
         p.period_id::text,
         p.course_code::text,
         p.course_name::text,
         p.faculty_email::text,
         p.issued_at::timestamptz,
         p.auto_close_at::timestamptz,
         EXISTS (
           SELECT 1 FROM public.session_feedback f
           WHERE f.student_id = v_lp
             AND f.attendance_date = p.attendance_date
             AND f.period_id = p.period_id
             AND f.timetable_id = p.timetable_id   -- match the pulse's exact class grain
         )::boolean AS already_answered
  FROM public.scf_live_pulse p
  WHERE p.is_open = true
    AND p.auto_close_at > now()
    AND EXISTS (
      SELECT 1 FROM public.student_attendance sa
      WHERE sa.timetable_id = p.timetable_id
        AND sa.attendance_date = p.attendance_date
        AND sa.attendance_data ? p.period_id
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(sa.attendance_data -> p.period_id -> 'students') st
          WHERE (st ->> 'student_id')::uuid = v_lp AND st ->> 'status' = 'Present'
        )
    )
  ORDER BY p.issued_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_open_pulse_for_learner() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_open_pulse_for_learner() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) fn_scf_pulse_totals — the teacher's live view (#2): TOTALS ONLY, never who
--    answered what. Aggregates ALL feedback for the pulse's class (async +
--    live_poll — the same row per #3). k>=3 anonymity floor: the understanding
--    distribution + checklist tallies are suppressed (NULL) until >=3 answers,
--    so a single early responder's answer is never exposed (decision #2).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_pulse_totals(p_pulse_id uuid)
RETURNS TABLE (
  is_open          boolean,
  auto_close_at    timestamptz,
  present_count    int,
  response_count   int,
  suppressed       boolean,   -- true when response_count < 3 (granular fields NULL)
  avg_understood   numeric,
  dist             jsonb,     -- {"1":n,...,"5":n} or NULL when suppressed
  checklist_counts jsonb      -- {item_key:n} or NULL when suppressed
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email      text;
  v_role_ok    boolean;
  v_is_faculty boolean;
  v_p          public.scf_live_pulse;
  v_present    int;
  v_responses  int;
  v_suppress   boolean;
  v_k          constant int := 3;   -- anonymity floor (matches the loop's >=3 rule)
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_pulse_totals: not authenticated'; END IF;
  SELECT * INTO v_p FROM public.scf_live_pulse WHERE id = p_pulse_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'fn_scf_pulse_totals: no such pulse'; END IF;

  SELECT lower(pr.email),
         (pr.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator'])
          OR pr.is_super_admin = true)
    INTO v_email, v_role_ok
  FROM public.profiles pr WHERE pr.id = auth.uid();
  IF v_email IS NULL THEN RAISE EXCEPTION 'fn_scf_pulse_totals: no profile'; END IF;

  v_is_faculty := (lower(v_p.faculty_email) IS NOT DISTINCT FROM v_email);
  IF NOT (v_is_faculty
          OR (COALESCE(v_role_ok, false)
              AND (public.is_super_admin() OR public.role_has_institution_access(v_p.institution_id)))) THEN
    RAISE EXCEPTION 'fn_scf_pulse_totals: not authorized';
  END IF;

  -- present_count: aggregate Present across ALL attendance rows carrying this
  -- period key (not a single LIMIT-1 row).
  SELECT count(*)::int INTO v_present
  FROM public.student_attendance sa,
       jsonb_array_elements(COALESCE(sa.attendance_data -> v_p.period_id -> 'students', '[]'::jsonb)) st
  WHERE sa.timetable_id = v_p.timetable_id
    AND sa.attendance_date = v_p.attendance_date
    AND sa.attendance_data ? v_p.period_id
    AND st ->> 'status' = 'Present';

  SELECT count(*)::int INTO v_responses
  FROM public.session_feedback f
  WHERE f.timetable_id = v_p.timetable_id
    AND f.attendance_date = v_p.attendance_date
    AND f.period_id = v_p.period_id;

  v_suppress := (v_responses < v_k);

  RETURN QUERY
  WITH fb AS (
    SELECT f.understood, f.checklist
    FROM public.session_feedback f
    WHERE f.timetable_id = v_p.timetable_id
      AND f.attendance_date = v_p.attendance_date
      AND f.period_id = v_p.period_id
  ),
  d AS (
    SELECT jsonb_object_agg(g.lvl::text, g.cnt) AS dist_obj
    FROM (
      SELECT s.lvl, (SELECT count(*) FROM fb WHERE fb.understood = s.lvl)::int AS cnt
      FROM generate_series(1,5) AS s(lvl)
    ) g
  ),
  ck AS (
    SELECT jsonb_object_agg(cfg.item_key, cfg.cnt) AS cc
    FROM (
      SELECT c.item_key,
             (SELECT count(*) FROM fb WHERE (fb.checklist ->> c.item_key) = 'true')::int AS cnt
      FROM (SELECT DISTINCT item_key FROM public.session_feedback_checklist_config WHERE is_active = true) c
    ) cfg
  )
  SELECT (v_p.is_open AND v_p.auto_close_at > now())::boolean,
         v_p.auto_close_at::timestamptz,
         v_present::int,
         v_responses::int,
         v_suppress::boolean,
         CASE WHEN v_suppress THEN NULL ELSE (SELECT round(avg(understood)::numeric, 2) FROM fb) END::numeric,
         CASE WHEN v_suppress THEN NULL ELSE (SELECT dist_obj FROM d) END::jsonb,
         CASE WHEN v_suppress THEN NULL ELSE (SELECT COALESCE(cc, '{}'::jsonb) FROM ck) END::jsonb;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_pulse_totals(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_pulse_totals(uuid) TO authenticated;

-- PostgREST must see the new column + table + functions immediately.
NOTIFY pgrst, 'reload schema';
