-- Migration: 20260710120000_induction_mentorship_academic_year_lifecycle.sql
-- P2c-1 — Senior Peer Mentor mentorships are bound to the freshers' FIRST
-- academic year and auto-close once that year has ended, so a mentor never
-- carries into the freshers' second year.
--
-- Substrate reality (surveyed 2026-07-06):
--   * induction_feedback_volunteers is induction-EVENT-scoped; the event's
--     induction_programs.academic_year_id is NULL in practice, and
--     academic_years.is_active is NOT a single-current-year flag (41 rows are
--     "active" across 11 colleges). So neither can drive a reliable auto-close.
--   * induction_programs.admission_year (an intake integer, e.g. 2026) DOES map
--     deterministically to the institution's academic_years row whose start_date
--     year = admission_year (e.g. AY "2026-2027", end_date 2027-05-31).
-- We therefore stamp the resolved academic_year_id on each mentorship row and
-- end it once that year's end_date has passed. For the live 2026 induction the
-- year ends 2027-05-31, so this migration closes nothing today — it only makes
-- the "then ends" half of the lifecycle correct going forward.

-- ── 1. Lifecycle columns on the mentorship row ──────────────────────────────
ALTER TABLE public.induction_feedback_volunteers
  ADD COLUMN IF NOT EXISTS academic_year_id uuid REFERENCES public.academic_years(id),
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_reason text;

COMMENT ON COLUMN public.induction_feedback_volunteers.academic_year_id IS
  'The freshers'' first academic year this mentorship belongs to (resolved from the induction event''s admission_year). Its end_date is when the mentorship auto-closes.';
COMMENT ON COLUMN public.induction_feedback_volunteers.ended_at IS
  'When the mentorship ended (auto at academic-year end, or manual). NULL = still active for the year.';

-- ── 2. Resolver: a mentorship''s academic year from the event''s admission_year ─
CREATE OR REPLACE FUNCTION public.fn_induction_mentorship_academic_year(p_event_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ay.id
  FROM public.induction_programs ip
  JOIN public.academic_years ay
    ON ay.institution_id = ip.institution_id
   AND EXTRACT(YEAR FROM ay.start_date) = ip.admission_year
  WHERE ip.event_id = p_event_id
  ORDER BY ay.start_date DESC
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_mentorship_academic_year(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_mentorship_academic_year(uuid) TO authenticated;

-- ── 3. Backfill existing mentorships ────────────────────────────────────────
UPDATE public.induction_feedback_volunteers v
SET academic_year_id = public.fn_induction_mentorship_academic_year(v.event_id)
WHERE v.academic_year_id IS NULL;

-- ── 4. Stamp academic_year_id on appointment ────────────────────────────────
-- (Adds academic-year resolution to the appoint RPC; everything else unchanged
--  from 20260706143000_induction_peer_mentor_eligibility era.)
CREATE OR REPLACE FUNCTION public.fn_induction_appoint_feedback_volunteer(p_event_id uuid, p_learner_id uuid, p_capacity integer DEFAULT 20)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID; v_id UUID; v_ay UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: not authorized';
  END IF;
  IF p_learner_id IS NULL THEN RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: learner_id required'; END IF;
  -- guard: never appoint a fresher of THIS induction as a mentor.
  IF EXISTS (SELECT 1 FROM public.induction_enrollment ie
             WHERE ie.event_id = p_event_id AND ie.learner_id = p_learner_id) THEN
    RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: that learner is a fresher in this induction';
  END IF;
  -- guard: the learner must be a MEMBER of this college (a profile in v_inst).
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.learner_id = p_learner_id AND p.institution_id = v_inst) THEN
    RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: that learner is not a member of this college';
  END IF;

  v_ay := public.fn_induction_mentorship_academic_year(p_event_id);

  INSERT INTO public.induction_feedback_volunteers
    (event_id, learner_id, institution_id, capacity, is_active, appointed_by, academic_year_id)
  VALUES (p_event_id, p_learner_id, v_inst, LEAST(GREATEST(COALESCE(p_capacity, 20), 1), 200), true, auth.uid(), v_ay)
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    is_active = true,
    capacity  = LEAST(GREATEST(COALESCE(p_capacity, 20), 1), 200),
    -- re-appointing clears a prior end and re-stamps the year (idempotent).
    ended_at = NULL,
    ended_reason = NULL,
    academic_year_id = COALESCE(EXCLUDED.academic_year_id, public.induction_feedback_volunteers.academic_year_id),
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_appoint_feedback_volunteer(uuid, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_appoint_feedback_volunteer(uuid, uuid, integer) TO authenticated;

-- ── 5. Auto-close: end mentorships whose academic year has passed ───────────
-- Called by the daily rollover cron (service role). Sets is_active=false +
-- ended_at, and releases the closed mentors' freshers (deletes the group rows)
-- so those freshers are no longer shown as owned. Idempotent.
CREATE OR REPLACE FUNCTION public.fn_induction_close_ended_mentorships()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n integer;
BEGIN
  WITH closed AS (
    UPDATE public.induction_feedback_volunteers v
    SET is_active = false,
        ended_at = now(),
        ended_reason = 'academic_year_end',
        updated_at = now()
    FROM public.academic_years ay
    WHERE v.academic_year_id = ay.id
      AND ay.end_date < CURRENT_DATE
      AND v.ended_at IS NULL
    RETURNING v.id
  )
  SELECT count(*) INTO v_n FROM closed;

  -- Release the freshers of every ended mentorship (idempotent — nothing to
  -- delete on subsequent runs once the groups are cleared).
  DELETE FROM public.induction_feedback_volunteer_group g
  USING public.induction_feedback_volunteers v
  WHERE g.volunteer_id = v.id AND v.ended_at IS NOT NULL;

  RETURN v_n;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_close_ended_mentorships() FROM anon, PUBLIC;
-- Cron uses the service role; no authenticated/anon grant is intended.

-- ── 6. Lifecycle GATE on the mentor write RPCs ──────────────────────────────
-- Belt-and-suspenders alongside the cron: even before the daily close runs, a
-- mentor whose academic year has ended (or whose row is already ended) cannot
-- mark attendance or submit feedback. Fail-open only when the year is
-- unresolved (academic_year_id NULL) so an un-stamped legacy row isn't blocked.
-- NOTE: both function bodies below are the LIVE definitions with ONLY the P2c
-- gate injected before the training gate — every other statement (incl. the
-- induction_completion rollup in submit_feedback) is preserved byte-for-byte.
CREATE OR REPLACE FUNCTION public.fn_induction_volunteer_mark_attendance(p_session_id uuid, p_marks jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  -- P2c LIFECYCLE GATE: mentorship ends at the freshers's first-year end.
  IF EXISTS (
    SELECT 1 FROM public.induction_feedback_volunteers v
    LEFT JOIN public.academic_years ay ON ay.id = v.academic_year_id
    WHERE v.id = v_vol
      AND (v.ended_at IS NOT NULL OR (ay.end_date IS NOT NULL AND ay.end_date < CURRENT_DATE))
  ) THEN
    RAISE EXCEPTION 'fn_induction_volunteer_mark_attendance: this Senior Peer Mentor assignment has ended for the academic year';
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
END $function$
;
REVOKE EXECUTE ON FUNCTION public.fn_induction_volunteer_mark_attendance(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_volunteer_mark_attendance(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_volunteer_submit_feedback(p_session_id uuid, p_marks jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  -- P2c LIFECYCLE GATE: mentorship ends at the freshers's first-year end.
  IF EXISTS (
    SELECT 1 FROM public.induction_feedback_volunteers v
    LEFT JOIN public.academic_years ay ON ay.id = v.academic_year_id
    WHERE v.id = v_vol
      AND (v.ended_at IS NOT NULL OR (ay.end_date IS NOT NULL AND ay.end_date < CURRENT_DATE))
  ) THEN
    RAISE EXCEPTION 'fn_induction_volunteer_submit_feedback: this Senior Peer Mentor assignment has ended for the academic year';
  END IF;

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
END $function$
;
REVOKE EXECUTE ON FUNCTION public.fn_induction_volunteer_submit_feedback(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_volunteer_submit_feedback(uuid, jsonb) TO authenticated;
