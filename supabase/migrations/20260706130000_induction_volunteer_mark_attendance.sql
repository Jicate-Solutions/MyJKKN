-- 20260706130000_induction_volunteer_mark_attendance.sql
-- Senior Peer Mentor — attendance check-in for their own mentee group.
--
-- A Senior Peer Mentor (an appointed induction_feedback_volunteers row) may mark
-- present/absent/excused/od for a session — but ONLY for the learners in their own
-- induction_feedback_volunteer_group, for their own induction event. Mirrors the
-- authority + group-scoping of fn_induction_volunteer_submit_feedback exactly (the
-- proxy kiosk feedback writer), so the same guarantees hold:
--   • caller must be an ACTIVE mentor for THIS event
--   • each learner must be in the caller's group AND enrolled in the session's batch
--   • ineligible rows are SKIPPED, not RAISE-aborted (partial saves survive an
--     autobalance/removal race) — a mentor still cannot write outside their group
--   • DISTINCT ON dedupes a learner repeated in the payload
--
-- ANTI-CLOBBER (attendance-specific, stricter than the feedback path): a mentor may
-- set an UNMARKED row or correct their OWN prior mark, but never overwrites a mark
-- made by anyone else — in particular a staff/coordinator mark via
-- fn_induction_mark_day_attendance stays authoritative. Each fresher is in exactly
-- one mentor's group, so two mentors never contend for the same row.

CREATE OR REPLACE FUNCTION public.fn_induction_volunteer_mark_attendance(p_session_id uuid, p_marks jsonb)
 RETURNS integer
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_event UUID; v_sbatch UUID; v_inst UUID; v_my_learner UUID; v_vol UUID; v_n INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: not authenticated'; END IF;

  SELECT s.event_id, s.batch_id INTO v_event, v_sbatch
  FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: not an induction session'; END IF;

  -- AUTHORIZATION: caller is an ACTIVE appointed Senior Peer Mentor for THIS event.
  v_my_learner := get_my_learner_id();
  IF v_my_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: not a learner'; END IF;
  SELECT v.id INTO v_vol
  FROM public.induction_feedback_volunteers v
  WHERE v.event_id = v_event AND v.learner_id = v_my_learner AND v.is_active;
  IF v_vol IS NULL THEN
    RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: not an assigned Senior Peer Mentor for this induction';
  END IF;

  WITH valid AS (
    SELECT DISTINCT ON ((e->>'learner_id')::uuid)
           (e->>'learner_id')::uuid AS learner_id,
           (e->>'status')            AS status
    FROM jsonb_array_elements(p_marks) e
    WHERE (e->>'status') IN ('present','absent','excused','od')
      AND EXISTS (   -- in MY group
        SELECT 1 FROM public.induction_feedback_volunteer_group g
        WHERE g.volunteer_id = v_vol AND g.learner_id = (e->>'learner_id')::uuid)
      AND EXISTS (   -- enrolled + (if the session is batch-specific) in that batch
        SELECT 1 FROM public.induction_enrollment ie
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

-- Anon-lock (SECURITY DEFINER — Supabase grants anon EXECUTE by default). Authenticated
-- only; the in-body mentor gate does the real authorization.
REVOKE EXECUTE ON FUNCTION public.fn_induction_volunteer_mark_attendance(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_volunteer_mark_attendance(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
