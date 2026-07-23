-- ============================================================================
-- Fresher Induction — Day-level & whole-program feedback (dynamic scopes)
-- File: 20260730110000_induction_day_program_feedback.sql | Date: 2026-07-30
-- Adds 2 opt-in toggle columns on induction_programs + 2 new feedback tables
-- (mirroring event_session_feedback, phase 2b) + their DEFINER RPCs. Both
-- scopes default OFF — existing inductions are unaffected until a coordinator
-- opts in. Neither new scope feeds induction_completion.value_score_avg (that
-- stays session-feedback-only — the scorecard/loop already consume it as such).
-- ============================================================================

ALTER TABLE public.induction_programs
  ADD COLUMN IF NOT EXISTS feedback_day_enabled     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feedback_program_enabled BOOLEAN NOT NULL DEFAULT false;

-- ── event_day_feedback ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_day_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  day_number      INTEGER NOT NULL,
  learner_id      UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id  UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_day_feedback_event_day_learner_uniq UNIQUE (event_id, day_number, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_edf_event   ON public.event_day_feedback(event_id);
CREATE INDEX IF NOT EXISTS idx_edf_learner ON public.event_day_feedback(learner_id);

DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.event_day_feedback;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.event_day_feedback
  FOR EACH ROW EXECUTE FUNCTION public.induction_touch_updated_at();

ALTER TABLE public.event_day_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_day_feedback_admin ON public.event_day_feedback;
CREATE POLICY event_day_feedback_admin ON public.event_day_feedback FOR ALL
  USING (is_super_admin() OR is_admin()) WITH CHECK (is_super_admin() OR is_admin());

-- ── event_program_feedback ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_program_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id  UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_program_feedback_event_learner_uniq UNIQUE (event_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_epf_event   ON public.event_program_feedback(event_id);
CREATE INDEX IF NOT EXISTS idx_epf_learner ON public.event_program_feedback(learner_id);

DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.event_program_feedback;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.event_program_feedback
  FOR EACH ROW EXECUTE FUNCTION public.induction_touch_updated_at();

ALTER TABLE public.event_program_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_program_feedback_admin ON public.event_program_feedback;
CREATE POLICY event_program_feedback_admin ON public.event_program_feedback FOR ALL
  USING (is_super_admin() OR is_admin()) WITH CHECK (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 1. submit day feedback — self, must be enrolled in the event.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_submit_day_feedback(
  p_event_id UUID, p_day_number INTEGER, p_rating INTEGER, p_comment TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_learner UUID; v_inst UUID; v_fid UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_day_feedback: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_day_feedback: not a learner'; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'fn_induction_submit_day_feedback: rating must be 1-5'; END IF;

  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_day_feedback: not an induction event'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.induction_enrollment ie
    WHERE ie.event_id = p_event_id AND ie.learner_id = v_learner
  ) THEN
    RAISE EXCEPTION 'fn_induction_submit_day_feedback: not enrolled in this induction';
  END IF;

  INSERT INTO public.event_day_feedback (event_id, day_number, learner_id, institution_id, rating, comment)
  VALUES (p_event_id, p_day_number, v_learner, v_inst, p_rating, p_comment)
  ON CONFLICT (event_id, day_number, learner_id) DO UPDATE SET
    rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now()
  RETURNING id INTO v_fid;

  RETURN v_fid;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_day_feedback(UUID, INTEGER, INTEGER, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_day_feedback(UUID, INTEGER, INTEGER, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. coordinator per-day feedback summary.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_day_feedback_summary(p_event_id UUID)
RETURNS TABLE (day_number INTEGER, avg_rating NUMERIC, response_count INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_day_feedback_summary: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_day_feedback_summary: not authorized';
  END IF;

  RETURN QUERY
  SELECT f.day_number, round(avg(f.rating), 2)::numeric, count(*)::integer
  FROM public.event_day_feedback f
  WHERE f.event_id = p_event_id
  GROUP BY f.day_number;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_day_feedback_summary(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_day_feedback_summary(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. the fresher's OWN prior day ratings (pre-fill).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_my_day_feedback(p_event_id UUID)
RETURNS TABLE (day_number INTEGER, rating INTEGER, comment TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_my_day_feedback: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT f.day_number, f.rating, f.comment
  FROM public.event_day_feedback f
  WHERE f.event_id = p_event_id AND f.learner_id = v_learner;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_my_day_feedback(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_day_feedback(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. submit program (whole-induction) feedback — self, must be enrolled.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_submit_program_feedback(
  p_event_id UUID, p_rating INTEGER, p_comment TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_learner UUID; v_inst UUID; v_fid UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_program_feedback: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_program_feedback: not a learner'; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'fn_induction_submit_program_feedback: rating must be 1-5'; END IF;

  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_program_feedback: not an induction event'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.induction_enrollment ie
    WHERE ie.event_id = p_event_id AND ie.learner_id = v_learner
  ) THEN
    RAISE EXCEPTION 'fn_induction_submit_program_feedback: not enrolled in this induction';
  END IF;

  INSERT INTO public.event_program_feedback (event_id, learner_id, institution_id, rating, comment)
  VALUES (p_event_id, v_learner, v_inst, p_rating, p_comment)
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now()
  RETURNING id INTO v_fid;

  RETURN v_fid;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_program_feedback(UUID, INTEGER, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_program_feedback(UUID, INTEGER, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. coordinator program-wide feedback summary (single row).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_program_feedback_summary(p_event_id UUID)
RETURNS TABLE (avg_rating NUMERIC, response_count INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_program_feedback_summary: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_program_feedback_summary: not authorized';
  END IF;

  RETURN QUERY
  SELECT round(avg(f.rating), 2)::numeric, count(*)::integer
  FROM public.event_program_feedback f
  WHERE f.event_id = p_event_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_program_feedback_summary(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_program_feedback_summary(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. the fresher's OWN prior program rating (pre-fill).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_my_program_feedback(p_event_id UUID)
RETURNS TABLE (rating INTEGER, comment TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_my_program_feedback: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT f.rating, f.comment
  FROM public.event_program_feedback f
  WHERE f.event_id = p_event_id AND f.learner_id = v_learner;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_my_program_feedback(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_program_feedback(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. expose the two feedback-scope toggles on the fresher's enrollment read.
--    Changing a RETURNS TABLE column list requires DROP + recreate — CREATE OR
--    REPLACE cannot add/change output columns on an existing function.
--
--    IMPORTANT: this rebuild must start from the CURRENT live shape, not the
--    phase-3 original. Phase 4 (20260627220000_induction_phase4_referral_advocacy.sql)
--    already DROP+recreated this same function once to add `advocacy_score`
--    between value_score_avg and is_profile_complete. That column is read live
--    by my-induction/page.tsx (AdvocacyCard). Omitting it here would silently
--    regress the advocacy card on every fresher's page. The body below is the
--    phase-4 version verbatim, plus ONLY the two new trailing columns.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_induction_my_enrollments();

CREATE FUNCTION public.fn_induction_my_enrollments()
RETURNS TABLE (
  event_id               UUID,
  event_name             TEXT,
  institution_id         UUID,
  institution_name       TEXT,
  start_date             DATE,
  end_date               DATE,
  status                 TEXT,
  batch_id               UUID,
  batch_label            TEXT,
  sessions_total         INTEGER,
  sessions_attended      INTEGER,
  attendance_pct         NUMERIC,
  participation_complete BOOLEAN,
  value_score_avg        NUMERIC,
  advocacy_score         NUMERIC,
  is_profile_complete    BOOLEAN,
  profile_fields_total   INTEGER,
  profile_fields_filled  INTEGER,
  feedback_day_enabled     BOOLEAN,
  feedback_program_enabled BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_my_enrollments: not authenticated';
  END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id::uuid,
    e.name::text,
    e.institution_id::uuid,
    i.name::text,
    e.start_date::date,
    e.end_date::date,
    e.status::text,
    ie.batch_id::uuid,
    b.label::text,
    COALESCE(c.sessions_total, 0)::integer,
    COALESCE(c.sessions_attended, 0)::integer,
    COALESCE(c.attendance_pct, 0)::numeric,
    COALESCE(c.participation_complete, false)::boolean,
    c.value_score_avg::numeric,
    c.advocacy_score::numeric,
    COALESCE(lp.is_profile_complete, false)::boolean,
    4::integer,
    (
      (lp.college_email   IS NOT NULL AND btrim(lp.college_email) <> '')::int +
      (lp.academic_year_id IS NOT NULL)::int +
      (lp.semester_id      IS NOT NULL)::int +
      (lp.section_id       IS NOT NULL)::int
    )::integer,
    COALESCE(ip.feedback_day_enabled, false)::boolean,
    COALESCE(ip.feedback_program_enabled, false)::boolean
  FROM public.induction_enrollment ie
  JOIN public.events             e  ON e.id = ie.event_id
  JOIN public.institutions       i  ON i.id = e.institution_id
  LEFT JOIN public.induction_batches    b  ON b.id = ie.batch_id
  LEFT JOIN public.induction_completion c  ON c.event_id = ie.event_id AND c.learner_id = ie.learner_id
  LEFT JOIN public.learners_profiles    lp ON lp.id = ie.learner_id
  LEFT JOIN public.induction_programs   ip ON ip.event_id = ie.event_id
  WHERE ie.learner_id = v_learner
  ORDER BY e.start_date DESC NULLS LAST;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_my_enrollments() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_enrollments() TO authenticated;

NOTIFY pgrst, 'reload schema';
