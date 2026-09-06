-- ============================================================================
-- Fresher Induction — Phase 2b: per-session feedback (the value signal)
-- File: 20260627200000_induction_phase2b_feedback.sql  | Date: 2026-06-27
-- Spec: specs/induction-program-module-2026-06-27.md (decision 6 + value funnel)
-- Adds event_session_feedback (events-generic, RLS admin-only + access via RPCs)
--   + submit RPC (student self, enrollment+batch gated) + coordinator summary RPC.
--   Submitting updates induction_completion.value_score_avg (the leading metric).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_session_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES public.event_sessions(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  institution_id  UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_session_feedback_session_learner_uniq UNIQUE (session_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_esf_session ON public.event_session_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_esf_event   ON public.event_session_feedback(event_id);
CREATE INDEX IF NOT EXISTS idx_esf_learner ON public.event_session_feedback(learner_id);

DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.event_session_feedback;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.event_session_feedback
  FOR EACH ROW EXECUTE FUNCTION public.induction_touch_updated_at();

-- raw table locked; access via the DEFINER RPCs below
ALTER TABLE public.event_session_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_session_feedback_admin ON public.event_session_feedback;
CREATE POLICY event_session_feedback_admin ON public.event_session_feedback FOR ALL
  USING (is_super_admin() OR is_admin()) WITH CHECK (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 1. submit feedback — student self, must be enrolled + session must apply to
--    their batch. Upserts, then refreshes their value_score_avg.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_submit_feedback(
  p_session_id UUID, p_rating INTEGER, p_comment TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner UUID; v_event UUID; v_sbatch UUID; v_inst UUID; v_ebatch UUID; v_fid UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_feedback: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_feedback: not a learner'; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'fn_induction_submit_feedback: rating must be 1-5'; END IF;

  SELECT s.event_id, s.batch_id INTO v_event, v_sbatch FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_feedback: session not found'; END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_feedback: not an induction session'; END IF;

  SELECT ie.batch_id INTO v_ebatch FROM public.induction_enrollment ie
  WHERE ie.event_id = v_event AND ie.learner_id = v_learner;
  IF NOT FOUND THEN RAISE EXCEPTION 'fn_induction_submit_feedback: not enrolled in this induction'; END IF;
  IF v_sbatch IS NOT NULL AND v_sbatch IS DISTINCT FROM v_ebatch THEN
    RAISE EXCEPTION 'fn_induction_submit_feedback: this session is not for your batch';
  END IF;

  INSERT INTO public.event_session_feedback (session_id, learner_id, event_id, institution_id, rating, comment)
  VALUES (p_session_id, v_learner, v_event, v_inst, p_rating, p_comment)
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now()
  RETURNING id INTO v_fid;

  -- refresh the learner's value_score_avg (leading metric)
  INSERT INTO public.induction_completion (event_id, learner_id, institution_id, value_score_avg, updated_at)
  VALUES (v_event, v_learner, v_inst, (
    SELECT round(avg(f.rating), 2) FROM public.event_session_feedback f
    WHERE f.event_id = v_event AND f.learner_id = v_learner), now())
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    value_score_avg = EXCLUDED.value_score_avg, updated_at = now();

  RETURN v_fid;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_feedback(UUID, INTEGER, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_feedback(UUID, INTEGER, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. coordinator per-session feedback summary — avg rating + response count.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_session_feedback_summary(p_event_id UUID)
RETURNS TABLE (session_id UUID, avg_rating NUMERIC, response_count INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_session_feedback_summary: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_session_feedback_summary: not authorized';
  END IF;

  RETURN QUERY
  SELECT f.session_id::uuid, round(avg(f.rating), 2)::numeric, count(*)::integer
  FROM public.event_session_feedback f
  WHERE f.event_id = p_event_id
  GROUP BY f.session_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_feedback_summary(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_feedback_summary(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
