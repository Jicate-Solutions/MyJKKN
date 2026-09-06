-- ============================================================================
-- Fresher Induction — Volunteer-kiosk feedback proxy writer + self-RPC re-tag
-- File: 20260701091000_induction_submit_feedback_proxy.sql | Date: 2026-07-01
-- Spec: specs/induction-feedback-coverage-no-smartphone-2026-06-30.md (PR1, §C.2
--   + Director decisions 2026-06-30: own-login is AUTHORITATIVE and always wins).
--
-- Three functions:
--   (a) fn_induction_submit_feedback_proxy  — coordinator/volunteer bulk writer for
--       freshers on a SHARED device (covers the no-account 155). Tags rows
--       'volunteer_kiosk' + submitted_by=auth.uid(). ANTI-CLOBBER: never overwrites
--       a fresher's OWN-login submission (submitted_by IS NULL) — Postgres silently
--       skips that conflict row. May overwrite a prior kiosk row.
--   (b) fn_induction_submit_feedback (PATCH) — on its own-login overwrite it now ALSO
--       resets capture_method='phone', submitted_by=NULL, so an own-login submission
--       re-claims authority over any earlier kiosk row (own-login always wins).
--   (c) fn_induction_session_feedback_roster — per-learner existing feedback for a
--       session (rating/comment/method + is_self) so the kiosk dialog can show
--       "rated" and "self — locked" badges. View-gated, anon-locked.
-- All anon-locked. Mirrors fn_induction_mark_attendance (the attendance writer).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (a) Volunteer-kiosk proxy writer — bulk [{learner_id, rating, comment}].
--     Coordinator-gated; validates every picked fresher is enrolled + the session
--     applies to their batch; tags 'volunteer_kiosk'; refreshes value_score_avg.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_submit_feedback_proxy(
  p_session_id UUID, p_marks JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_event UUID; v_inst UUID; v_sbatch UUID; v_n INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_feedback_proxy: not authenticated'; END IF;

  SELECT s.event_id, s.batch_id INTO v_event, v_sbatch FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_feedback_proxy: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_feedback_proxy: not an induction session'; END IF;

  -- coordinator gate (identical to the attendance writer)
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_submit_feedback_proxy: not authorized';
  END IF;

  -- FILTER (don't abort): a row with an invalid rating / un-enrolled learner / wrong
  -- batch is silently skipped, so one stale pick on a SHARED device never loses the
  -- rest of the batch. DISTINCT ON dedupes a learner repeated in the payload (else
  -- ON CONFLICT "cannot affect row a second time" would abort the whole save). #1694 r3.
  WITH cleaned AS (
    SELECT (m->>'learner_id')::uuid AS learner_id,
           (m->>'rating')::int       AS rating,
           NULLIF(btrim(m->>'comment'), '') AS comment
    FROM jsonb_array_elements(p_marks) m
    WHERE (m->>'learner_id') IS NOT NULL
      AND (m->>'rating') IS NOT NULL
      AND (m->>'rating')::int BETWEEN 1 AND 5
  ),
  valid AS (
    SELECT DISTINCT ON (c.learner_id) c.learner_id, c.rating, c.comment
    FROM cleaned c
    WHERE EXISTS (   -- enrolled + (batch-specific session → only its batch)
      SELECT 1 FROM public.induction_enrollment ie
      WHERE ie.event_id = v_event AND ie.learner_id = c.learner_id
        AND (v_sbatch IS NULL OR ie.batch_id IS NOT DISTINCT FROM v_sbatch)
    )
    ORDER BY c.learner_id
  )
  -- ANTI-CLOBBER: the ON CONFLICT UPDATE only fires when the EXISTING submitted_by IS
  -- NOT NULL (a prior kiosk row). A fresher's own-login row (submitted_by IS NULL)
  -- makes the predicate false → Postgres silently skips it; a self-vote is never lost.
  INSERT INTO public.event_session_feedback
    (session_id, learner_id, event_id, institution_id, rating, comment, capture_method, submitted_by)
  SELECT p_session_id, v.learner_id, v_event, v_inst, v.rating, v.comment, 'volunteer_kiosk', auth.uid()
  FROM valid v
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    rating = EXCLUDED.rating, comment = EXCLUDED.comment,
    capture_method = 'volunteer_kiosk', submitted_by = EXCLUDED.submitted_by, updated_at = now()
  WHERE public.event_session_feedback.submitted_by IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- refresh value_score_avg for each picked learner (idempotent; a skipped self-row
  -- recomputes to the same value, so this is safe for clobber-skipped rows too).
  INSERT INTO public.induction_completion (event_id, learner_id, institution_id, value_score_avg, updated_at)
  SELECT v_event, picked.learner_id, v_inst,
         (SELECT round(avg(f.rating), 2) FROM public.event_session_feedback f
            WHERE f.event_id = v_event AND f.learner_id = picked.learner_id), now()
  -- #1694 r6 (MEDIUM): refresh value_score_avg ONLY for learners that actually have a
  -- feedback row for this event. An enrolled-but-FILTERED pick (invalid rating / wrong
  -- batch, dropped from `valid`) with no feedback row would otherwise upsert
  -- value_score_avg = NULL (avg over an empty set) — polluting the leading metric and
  -- creating a spurious completion row. The feedback-row EXISTS re-aligns `picked` with `valid`.
  FROM (SELECT DISTINCT (m->>'learner_id')::uuid AS learner_id
        FROM jsonb_array_elements(p_marks) m
        WHERE EXISTS (SELECT 1 FROM public.induction_enrollment ie
                      WHERE ie.event_id = v_event AND ie.learner_id = (m->>'learner_id')::uuid)
          AND EXISTS (SELECT 1 FROM public.event_session_feedback f
                      WHERE f.event_id = v_event AND f.learner_id = (m->>'learner_id')::uuid)) picked
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    value_score_avg = EXCLUDED.value_score_avg, updated_at = now();

  RETURN v_n;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_feedback_proxy(UUID, JSONB) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_feedback_proxy(UUID, JSONB) TO authenticated;

-- ----------------------------------------------------------------------------
-- (b) PATCH the existing student self-writer. Body is unchanged EXCEPT the
--     ON CONFLICT DO UPDATE now ALSO resets capture_method='phone', submitted_by=NULL
--     so an own-login submission re-claims authority over an earlier kiosk row
--     (own-login always wins; the coverage/bias meter re-counts it as 'phone').
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

  INSERT INTO public.event_session_feedback
    (session_id, learner_id, event_id, institution_id, rating, comment, capture_method, submitted_by)
  VALUES (p_session_id, v_learner, v_event, v_inst, p_rating, p_comment, 'phone', NULL)
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    rating = EXCLUDED.rating, comment = EXCLUDED.comment,
    -- own-login always wins: re-tag the row as authoritative 'phone' even if a
    -- volunteer had entered a kiosk row for this fresher first.
    capture_method = 'phone', submitted_by = NULL, updated_at = now()
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
-- (c) Per-learner existing feedback for a session (powers the kiosk dialog's
--     "rated" + "self — locked" badges). View-gated, anon-locked. is_self =
--     submitted_by IS NULL (own-login row — locked from kiosk overwrite).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_session_feedback_roster(p_session_id UUID)
RETURNS TABLE (
  learner_id     UUID,
  rating         INTEGER,
  comment        TEXT,
  capture_method TEXT,
  is_self        BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_event UUID; v_inst UUID;
BEGIN
  SELECT s.event_id INTO v_event FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_session_feedback_roster: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_session_feedback_roster: not an induction session'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_session_feedback_roster: not authorized';
  END IF;

  RETURN QUERY
  SELECT f.learner_id::uuid, f.rating::int, f.comment::text,
         f.capture_method::text, (f.submitted_by IS NULL)::boolean
  FROM public.event_session_feedback f
  WHERE f.session_id = p_session_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_feedback_roster(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_feedback_roster(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
