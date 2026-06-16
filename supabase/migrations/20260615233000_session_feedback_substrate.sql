-- =============================================================================
-- 20260615233000_session_feedback_substrate.sql
-- Post-Class Feedback → Attendance Gate + Principal Escalation — SUBSTRATE.
-- Spec: specs/post-class-feedback-attendance-gate-2026-06-15.md
-- =============================================================================
-- MODEL (Director, 2026-06-15): HARD GATE — a learner's attendance is only
-- *confirmed* once their post-class feedback exists. Until then: present-pending
-- (never silently absent).
--
-- GROUND TRUTH (live-verified 2026-06-15): attendance is a faculty-owned JSONB
-- blob on `student_attendance.attendance_data`, keyed by period_id; each period
-- holds students[]{student_id,status}, course_*, and assigned_faculty{faculty_id,
-- faculty_email}. There is NO per-student confirmed flag and the blob is faculty-
-- owned, so confirmation is DERIVED (Present-in-blob AND feedback-row-exists) —
-- we NEVER mutate attendance_data.
--
-- IDENTITY (verified against a 2026-06-15 row):
--   learner: auth.uid()=profiles.id -> learners_profiles.profile_id ->
--            learners_profiles.id == blob students[].student_id
--   faculty: auth.uid()=profiles.id -> profiles.email == blob
--            assigned_faculty.faculty_email  (faculty_id is a STAFF id, not a
--            profiles.id — email is the reliable join)
--
-- This migration is ADDITIVE and SAFE: new tables + locked RPCs only. It does
-- NOT touch student_attendance, and does NOT change the official attendance %
-- (consolidation). The "does present-pending count toward the official %"
-- question (spec §8) is a separate, Director-gated change.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_feedback (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL,
  student_id       uuid NOT NULL,                  -- learners_profiles.id (== blob student_id)
  attendance_date  date NOT NULL,
  timetable_id     uuid NOT NULL,
  period_id        text NOT NULL,                  -- attendance_data key
  section_id       uuid,
  course_id        uuid,
  course_code      text,
  course_name      text,
  faculty_id       uuid,                           -- assigned_faculty.faculty_id (staff id)
  faculty_email    text,                           -- assigned_faculty.faculty_email (join key)
  understood       smallint NOT NULL CHECK (understood BETWEEN 1 AND 5),
  checklist        jsonb NOT NULL DEFAULT '{}'::jsonb,
  free_text        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, attendance_date, period_id)
);

CREATE INDEX IF NOT EXISTS idx_session_feedback_student ON public.session_feedback (student_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_session_feedback_faculty ON public.session_feedback (faculty_email, attendance_date);
CREATE INDEX IF NOT EXISTS idx_session_feedback_inst    ON public.session_feedback (institution_id, attendance_date);

COMMENT ON TABLE public.session_feedback IS
  'One post-class feedback row per (learner, session). student_id = learners_profiles.id (matches student_attendance blob). Confirmation of attendance is DERIVED (Present-in-blob AND a row here); the attendance blob is never mutated. Spec: specs/post-class-feedback-attendance-gate-2026-06-15.md';

CREATE TABLE IF NOT EXISTS public.session_feedback_checklist_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid,                            -- NULL = platform default
  item_key        text NOT NULL,
  label           text NOT NULL,
  sort_order      int NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, item_key)
);

COMMENT ON TABLE public.session_feedback_checklist_config IS
  'Configurable post-class checklist items. institution_id NULL = platform default set. Read by the learner feedback form; admin editing is a later lane.';

-- Seed the platform-default checklist (idempotent).
INSERT INTO public.session_feedback_checklist_config (institution_id, item_key, label, sort_order)
VALUES
  (NULL, 'notebooklm_used',       'NotebookLM was used properly in this class',        10),
  (NULL, 'objectives_clear',      'The learning objectives were clear',                 20),
  (NULL, 'could_follow',          'I could follow the pace of the class',               30),
  (NULL, 'materials_shared',      'Class materials / resources were shared',            40),
  (NULL, 'doubts_addressed',      'My doubts were addressed',                           50)
ON CONFLICT (institution_id, item_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) RLS — learner owns own rows; everyone else reads via the anonymizing RPCs.
-- ---------------------------------------------------------------------------
ALTER TABLE public.session_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_feedback_checklist_config ENABLE ROW LEVEL SECURITY;

-- Learner can read their own feedback rows. (Writes flow ONLY through the
-- SECURITY DEFINER RPC below — there is no direct INSERT/UPDATE policy.)
DROP POLICY IF EXISTS session_feedback_learner_own ON public.session_feedback;
CREATE POLICY session_feedback_learner_own ON public.session_feedback
  FOR SELECT TO authenticated
  USING (student_id = (SELECT lp.id FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid()));

DROP POLICY IF EXISTS session_feedback_super_admin_all ON public.session_feedback;
CREATE POLICY session_feedback_super_admin_all ON public.session_feedback
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR p.is_super_admin = true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.role = 'super_admin' OR p.is_super_admin = true)));

-- Checklist config is readable by all authenticated users (the form needs it).
DROP POLICY IF EXISTS session_feedback_config_read ON public.session_feedback_checklist_config;
CREATE POLICY session_feedback_config_read ON public.session_feedback_checklist_config
  FOR SELECT TO authenticated
  USING (true);

GRANT SELECT ON public.session_feedback TO authenticated;
GRANT SELECT ON public.session_feedback_checklist_config TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) RPCs (all SECURITY DEFINER, REVOKE anon/PUBLIC + GRANT authenticated)
-- ---------------------------------------------------------------------------

-- 3a) Submit feedback — the ONLY write path. Verifies the caller was Present in
--     the session blob, resolves course/faculty server-side, upserts the row.
CREATE OR REPLACE FUNCTION public.fn_scf_submit_feedback(
  p_attendance_date date,
  p_timetable_id    uuid,
  p_period_id       text,
  p_understood      smallint,
  p_checklist       jsonb DEFAULT '{}'::jsonb,
  p_free_text       text  DEFAULT NULL
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
  v_row      public.session_feedback;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: not authenticated';
  END IF;
  IF p_understood IS NULL OR p_understood < 1 OR p_understood > 5 THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: understood must be 1..5';
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

  -- The caller must appear as Present in that period.
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_period -> 'students') st
    WHERE (st ->> 'student_id')::uuid = v_lp
      AND st ->> 'status' = 'Present'
  ) INTO v_present;

  IF NOT v_present THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: caller was not marked Present in this session';
  END IF;

  INSERT INTO public.session_feedback (
    institution_id, student_id, attendance_date, timetable_id, period_id,
    section_id, course_id, course_code, course_name, faculty_id, faculty_email,
    understood, checklist, free_text
  )
  VALUES (
    v_inst, v_lp, p_attendance_date, p_timetable_id, p_period_id,
    NULLIF(v_period ->> 'section_id','')::uuid,
    NULLIF(v_period ->> 'course_id','')::uuid,
    v_period ->> 'course_code',
    v_period ->> 'course_name',
    NULLIF(v_period -> 'assigned_faculty' ->> 'faculty_id','')::uuid,
    v_period -> 'assigned_faculty' ->> 'faculty_email',
    p_understood, COALESCE(p_checklist,'{}'::jsonb), p_free_text
  )
  ON CONFLICT (student_id, attendance_date, period_id) DO UPDATE SET
    understood = EXCLUDED.understood,
    checklist  = EXCLUDED.checklist,
    free_text  = EXCLUDED.free_text,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_submit_feedback(date,uuid,text,smallint,jsonb,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_submit_feedback(date,uuid,text,smallint,jsonb,text) TO authenticated;

-- 3b) Pending: sessions where the caller was Present but has NO feedback yet.
CREATE OR REPLACE FUNCTION public.fn_scf_pending_for_learner(p_lookback_days int DEFAULT 30)
RETURNS TABLE (
  attendance_date date, timetable_id uuid, period_id text, section_id uuid,
  course_id uuid, course_code text, course_name text,
  faculty_name text, period_name text, start_time text, end_time text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_pending_for_learner: not authenticated'; END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT sa.attendance_date, sa.timetable_id, period.key AS period_id,
         NULLIF(period.value ->> 'section_id','')::uuid AS section_id,
         NULLIF(period.value ->> 'course_id','')::uuid AS course_id,
         period.value ->> 'course_code'  AS course_code,
         period.value ->> 'course_name'  AS course_name,
         period.value -> 'assigned_faculty' ->> 'faculty_name' AS faculty_name,
         period.value ->> 'period_name'  AS period_name,
         period.value ->> 'start_time'   AS start_time,
         period.value ->> 'end_time'     AS end_time
  FROM public.student_attendance sa,
       jsonb_each(sa.attendance_data) AS period
  WHERE sa.attendance_date >= (CURRENT_DATE - p_lookback_days)
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(period.value -> 'students') st
      WHERE (st ->> 'student_id')::uuid = v_lp AND st ->> 'status' = 'Present'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.session_feedback f
      WHERE f.student_id = v_lp AND f.attendance_date = sa.attendance_date AND f.period_id = period.key
    )
  ORDER BY sa.attendance_date DESC, period.value ->> 'start_time';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(int) TO authenticated;

-- 3c) Confirmation status: per Present session, confirmed (feedback exists) or pending.
CREATE OR REPLACE FUNCTION public.fn_scf_confirmation_status(p_from date, p_to date)
RETURNS TABLE (
  attendance_date date, timetable_id uuid, period_id text,
  course_code text, course_name text, confirmed boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_confirmation_status: not authenticated'; END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT sa.attendance_date, sa.timetable_id, period.key,
         period.value ->> 'course_code', period.value ->> 'course_name',
         EXISTS (
           SELECT 1 FROM public.session_feedback f
           WHERE f.student_id = v_lp AND f.attendance_date = sa.attendance_date AND f.period_id = period.key
         ) AS confirmed
  FROM public.student_attendance sa,
       jsonb_each(sa.attendance_data) AS period
  WHERE sa.attendance_date BETWEEN p_from AND p_to
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(period.value -> 'students') st
      WHERE (st ->> 'student_id')::uuid = v_lp AND st ->> 'status' = 'Present'
    )
  ORDER BY sa.attendance_date DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_confirmation_status(date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_confirmation_status(date,date) TO authenticated;

-- 3d) Faculty summary: anonymized aggregate over the caller's OWN sessions.
CREATE OR REPLACE FUNCTION public.fn_scf_faculty_summary(p_from date, p_to date)
RETURNS TABLE (
  attendance_date date, period_id text, course_code text, course_name text,
  responses bigint, avg_understood numeric, low_understanding bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_faculty_summary: not authenticated'; END IF;
  SELECT p.email INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT f.attendance_date, f.period_id, f.course_code, f.course_name,
         count(*)::bigint AS responses,
         round(avg(f.understood)::numeric, 2) AS avg_understood,
         count(*) FILTER (WHERE f.understood <= 2)::bigint AS low_understanding
  FROM public.session_feedback f
  WHERE lower(f.faculty_email) = lower(v_email)
    AND f.attendance_date BETWEEN p_from AND p_to
  GROUP BY f.attendance_date, f.period_id, f.course_code, f.course_name
  ORDER BY f.attendance_date DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_faculty_summary(date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_faculty_summary(date,date) TO authenticated;

-- 3e) Principal escalations: institution sessions breaching the understanding
--     threshold (avg < 3 with >= 3 responses). v1 threshold hardcoded.
CREATE OR REPLACE FUNCTION public.fn_scf_principal_escalations(p_from date, p_to date)
RETURNS TABLE (
  attendance_date date, period_id text, course_code text, course_name text,
  faculty_email text, responses bigint, avg_understood numeric, low_understanding bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_principal_escalations: not authenticated'; END IF;
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator']) OR p.is_super_admin = true)
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_principal_escalations: not authorized';
  END IF;

  RETURN QUERY
  SELECT f.attendance_date, f.period_id, f.course_code, f.course_name, f.faculty_email,
         count(*)::bigint AS responses,
         round(avg(f.understood)::numeric, 2) AS avg_understood,
         count(*) FILTER (WHERE f.understood <= 2)::bigint AS low_understanding
  FROM public.session_feedback f
  WHERE (v_super OR f.institution_id = v_inst)
    AND f.attendance_date BETWEEN p_from AND p_to
  GROUP BY f.attendance_date, f.period_id, f.course_code, f.course_name, f.faculty_email
  HAVING count(*) >= 3 AND avg(f.understood) < 3
  ORDER BY avg(f.understood) ASC, f.attendance_date DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_principal_escalations(date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_principal_escalations(date,date) TO authenticated;

-- PostgREST must see the new tables + functions immediately.
NOTIFY pgrst, 'reload schema';
