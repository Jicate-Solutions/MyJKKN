-- 20260706150100_induction_training_gate.sql
-- Senior Peer Mentor — P2b training GATE: the two mentor WRITE RPCs refuse until the
-- caller's training is complete (is_trained). Read RPCs are untouched, so an untrained
-- mentor still SEES their group (Director: "sees group but attendance + feedback locked").
-- Only ONE new statement is added to each (the is_trained EXISTS check right after the
-- mentor-authorization block); everything else is the shipped body verbatim.

-- ── attendance write ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_volunteer_mark_attendance(p_session_id uuid, p_marks jsonb)
 RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_event UUID; v_sbatch UUID; v_inst UUID; v_my_learner UUID; v_vol UUID; v_n INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: not authenticated'; END IF;
  SELECT s.event_id, s.batch_id INTO v_event, v_sbatch FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: not an induction session'; END IF;

  v_my_learner := get_my_learner_id();
  IF v_my_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: not a learner'; END IF;
  SELECT v.id INTO v_vol FROM public.induction_feedback_volunteers v
  WHERE v.event_id = v_event AND v.learner_id = v_my_learner AND v.is_active;
  IF v_vol IS NULL THEN
    RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: not an assigned Senior Peer Mentor for this induction';
  END IF;

  -- P2b TRAINING GATE
  IF NOT EXISTS (SELECT 1 FROM public.induction_feedback_volunteers WHERE id = v_vol AND is_trained) THEN
    RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: your Senior Peer Mentor training is not complete yet';
  END IF;

  WITH valid AS (
    SELECT DISTINCT ON ((e->>'learner_id')::uuid)
           (e->>'learner_id')::uuid AS learner_id, (e->>'status') AS status
    FROM jsonb_array_elements(p_marks) e
    WHERE (e->>'status') IN ('present','absent','excused','od')
      AND EXISTS (SELECT 1 FROM public.induction_feedback_volunteer_group g
                  WHERE g.volunteer_id = v_vol AND g.learner_id = (e->>'learner_id')::uuid)
      AND EXISTS (SELECT 1 FROM public.induction_enrollment ie
                  WHERE ie.event_id = v_event AND ie.learner_id = (e->>'learner_id')::uuid
                    AND (v_sbatch IS NULL OR ie.batch_id IS NOT DISTINCT FROM v_sbatch))
    ORDER BY (e->>'learner_id')::uuid
  )
  INSERT INTO public.event_session_attendance
    (session_id, learner_id, institution_id, status, marked_by, marked_at)
  SELECT p_session_id, v.learner_id, v_inst, v.status, auth.uid(), now()
  FROM valid v
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = now(), updated_at = now()
  WHERE public.event_session_attendance.marked_by IS NULL
     OR public.event_session_attendance.marked_by = auth.uid();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_volunteer_mark_attendance(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_volunteer_mark_attendance(uuid, jsonb) TO authenticated;

-- ── feedback write (shipped body verbatim + the one gate statement) ───────────
CREATE OR REPLACE FUNCTION public.fn_induction_volunteer_submit_feedback(p_session_id uuid, p_marks jsonb)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_event UUID; v_sbatch UUID; v_inst UUID; v_my_learner UUID; v_vol UUID; v_n INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_submit_feedback: not authenticated'; END IF;
  SELECT s.event_id, s.batch_id INTO v_event, v_sbatch FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_submit_feedback: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_submit_feedback: not an induction session'; END IF;

  v_my_learner := get_my_learner_id();
  IF v_my_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_submit_feedback: not a learner'; END IF;
  SELECT v.id INTO v_vol FROM public.induction_feedback_volunteers v
  WHERE v.event_id = v_event AND v.learner_id = v_my_learner AND v.is_active;
  IF v_vol IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_submit_feedback: not an assigned feedback volunteer'; END IF;

  -- P2b TRAINING GATE
  IF NOT EXISTS (SELECT 1 FROM public.induction_feedback_volunteers WHERE id = v_vol AND is_trained) THEN
    RAISE EXCEPTION 'fn_induction_volunteer_submit_feedback: your Senior Peer Mentor training is not complete yet';
  END IF;

  WITH valid AS (
    SELECT DISTINCT ON ((e->>'learner_id')::uuid)
           (e->>'learner_id')::uuid AS learner_id, (e->>'rating')::int AS rating,
           NULLIF(btrim(coalesce(e->>'comment','')), '') AS comment
    FROM jsonb_array_elements(p_marks) e
    WHERE (e->>'rating') IS NOT NULL AND (e->>'rating')::int BETWEEN 1 AND 5
      AND EXISTS (SELECT 1 FROM public.induction_feedback_volunteer_group g
                  WHERE g.volunteer_id = v_vol AND g.learner_id = (e->>'learner_id')::uuid)
      AND EXISTS (SELECT 1 FROM public.induction_enrollment ie
                  WHERE ie.event_id = v_event AND ie.learner_id = (e->>'learner_id')::uuid
                    AND (v_sbatch IS NULL OR ie.batch_id IS NOT DISTINCT FROM v_sbatch))
    ORDER BY (e->>'learner_id')::uuid
  )
  INSERT INTO public.event_session_feedback
    (session_id, learner_id, event_id, institution_id, rating, comment, capture_method, submitted_by)
  SELECT p_session_id, v.learner_id, v_event, v_inst, v.rating, v.comment, 'volunteer_kiosk', auth.uid()
  FROM valid v
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    rating = EXCLUDED.rating, comment = EXCLUDED.comment,
    capture_method = 'volunteer_kiosk', submitted_by = EXCLUDED.submitted_by, updated_at = now()
  WHERE public.event_session_feedback.submitted_by IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  INSERT INTO public.induction_completion (event_id, learner_id, institution_id, value_score_avg, updated_at)
  SELECT v_event, picked.learner_id, v_inst,
         (SELECT round(avg(f.rating), 2) FROM public.event_session_feedback f
            WHERE f.event_id = v_event AND f.learner_id = picked.learner_id),
         now()
  FROM (
    SELECT DISTINCT (e->>'learner_id')::uuid AS learner_id
    FROM jsonb_array_elements(p_marks) e
    WHERE (e->>'rating') IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.induction_feedback_volunteer_group g
                  WHERE g.volunteer_id = v_vol AND g.learner_id = (e->>'learner_id')::uuid)
      AND EXISTS (SELECT 1 FROM public.event_session_feedback f
                  WHERE f.event_id = v_event AND f.learner_id = (e->>'learner_id')::uuid)
  ) picked
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    value_score_avg = EXCLUDED.value_score_avg, updated_at = now();

  RETURN v_n;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_volunteer_submit_feedback(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_volunteer_submit_feedback(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
