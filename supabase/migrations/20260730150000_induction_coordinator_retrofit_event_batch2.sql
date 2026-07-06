-- ============================================================================
-- Fresher Induction — coordinator retrofit, part 3: event-scoped RPCs (batch 2/2)
-- File: 20260730150000_induction_coordinator_retrofit_event_batch2.sql | Date: 2026-07-30
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_list_sessions(p_event_id uuid)
RETURNS TABLE(id uuid, day_number integer, session_order integer, batch_id uuid, batch_label text, start_at timestamp with time zone, end_at timestamp with time zone, title text, description text, venue_text text, venue_resource_id uuid, speaker_text text, outcome_text text, resource_links jsonb, status text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst UUID;
  v_is_coordinator BOOLEAN;
  v_my_learner UUID;
  v_my_batch UUID;
  v_enrolled BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_list_sessions: not authenticated'; END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_list_sessions: not an induction event'; END IF;

  v_is_coordinator := is_super_admin() OR is_admin()
    OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
    OR public.fn_induction_is_event_coordinator(p_event_id);  -- ADDED

  v_my_learner := get_my_learner_id();
  SELECT true, ie.batch_id INTO v_enrolled, v_my_batch
  FROM public.induction_enrollment ie
  WHERE ie.event_id = p_event_id AND ie.learner_id = v_my_learner;

  IF NOT v_is_coordinator AND NOT COALESCE(v_enrolled, false) THEN
    RAISE EXCEPTION 'fn_induction_list_sessions: not authorized';
  END IF;

  RETURN QUERY
  SELECT s.id::uuid, s.day_number::integer, s.session_order::integer,
         s.batch_id::uuid, b.label::text,
         s.start_at, s.end_at,
         s.title::text, s.description::text, s.venue_text::text,
         s.venue_resource_id::uuid,
         s.speaker_text::text, s.outcome_text::text,
         COALESCE(s.resource_links, '[]'::jsonb), s.status::text
  FROM public.event_sessions s
  LEFT JOIN public.induction_batches b ON b.id = s.batch_id
  WHERE s.event_id = p_event_id
    AND (v_is_coordinator OR v_my_batch IS NULL OR s.batch_id IS NULL OR s.batch_id = v_my_batch)
  ORDER BY s.day_number NULLS LAST, s.start_at NULLS LAST, s.session_order;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_mark_day_attendance(p_event_id uuid, p_day_number integer, p_marks jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_mark_day_attendance: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_mark_day_attendance: not authorized';
  END IF;

  WITH incoming AS (
    SELECT (m->>'learner_id')::uuid AS learner_id, (m->>'status') AS status
    FROM jsonb_array_elements(p_marks) m
  ),
  fanned AS (
    SELECT s.id AS session_id, i.learner_id, i.status
    FROM incoming i
    JOIN public.induction_enrollment ie ON ie.event_id = p_event_id AND ie.learner_id = i.learner_id
    JOIN public.event_sessions s
      ON s.event_id = p_event_id AND s.day_number IS NOT DISTINCT FROM p_day_number
     AND (s.batch_id IS NULL OR s.batch_id = ie.batch_id)
  )
  INSERT INTO public.event_session_attendance (session_id, learner_id, institution_id, status, marked_by, marked_at)
  SELECT session_id, learner_id, v_inst, status, auth.uid(), now() FROM fanned
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = now(), updated_at = now();

  PERFORM public.fn_induction_recompute_completion(p_event_id);
  RETURN jsonb_array_length(p_marks);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_program_feedback_summary(p_event_id uuid)
RETURNS TABLE(avg_rating numeric, response_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_program_feedback_summary: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_program_feedback_summary: not authorized';
  END IF;

  RETURN QUERY
  SELECT round(avg(f.rating), 2)::numeric, count(*)::integer
  FROM public.event_program_feedback f
  WHERE f.event_id = p_event_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_recompute_completion(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID; v_thr INTEGER; v_n INTEGER;
BEGIN
  SELECT institution_id, completion_attendance_pct INTO v_inst, v_thr
  FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_recompute_completion: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_recompute_completion: not authorized';
  END IF;

  WITH agg AS (
    SELECT e.learner_id, e.institution_id,
           count(s.id) AS total,
           count(a.id) FILTER (WHERE a.status IN ('present','od')) AS attended
    FROM public.induction_enrollment e
    LEFT JOIN public.event_sessions s
      ON s.event_id = e.event_id AND (s.batch_id IS NULL OR s.batch_id = e.batch_id)
    LEFT JOIN public.event_session_attendance a
      ON a.session_id = s.id AND a.learner_id = e.learner_id
    WHERE e.event_id = p_event_id
    GROUP BY e.learner_id, e.institution_id
  )
  INSERT INTO public.induction_completion
    (event_id, learner_id, institution_id, sessions_total, sessions_attended,
     attendance_pct, participation_complete, updated_at)
  SELECT p_event_id, agg.learner_id, agg.institution_id, agg.total, agg.attended,
         CASE WHEN agg.total = 0 THEN 0 ELSE round(100.0 * agg.attended / agg.total, 2) END,
         agg.total > 0 AND (CASE WHEN agg.total = 0 THEN 0 ELSE 100.0 * agg.attended / agg.total END) >= v_thr,
         now()
  FROM agg
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    sessions_total = EXCLUDED.sessions_total,
    sessions_attended = EXCLUDED.sessions_attended,
    attendance_pct = EXCLUDED.attendance_pct,
    participation_complete = EXCLUDED.participation_complete,
    updated_at = now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_remove_feedback_volunteer(p_event_id uuid, p_learner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_remove_feedback_volunteer: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_remove_feedback_volunteer: not authorized';
  END IF;
  DELETE FROM public.induction_feedback_volunteers
  WHERE event_id = p_event_id AND learner_id = p_learner_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_scorecard(p_event_id uuid)
RETURNS TABLE(dimension text, group_id uuid, group_label text, enrolled integer, value_rated integer, value_avg numeric, advocacy_given integer, advocacy_avg numeric, promoters integer, referred integer, referrals_submitted bigint, referrals_joined bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_scorecard: not authenticated'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_scorecard: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_scorecard: not authorized';
  END IF;

  RETURN QUERY
  WITH freshers AS (
    SELECT ie.learner_id, lp.department_id, ie.batch_id
    FROM public.induction_enrollment ie
    LEFT JOIN public.learners_profiles lp ON lp.id = ie.learner_id
    WHERE ie.event_id = p_event_id
  ),
  refs AS (  -- per-fresher referral stats, LIVE. submitted/referred = EFFORT (a referral
             -- to any JKKN college counts — the "refer anywhere" decision); only JOINED is
             -- institution-scoped, since a join fills THIS college's seat.
    SELECT al.referred_by_id AS learner_id,
           count(*)::bigint AS submitted,
           count(*) FILTER (
             WHERE al.funnel_stage IN ('token_paid','confirmed','enrolled')
               AND al.institution_id = v_inst
           )::bigint AS joined
    FROM public.admission_leads al
    WHERE al.source = 'referral'::lead_source
      AND al.referred_by_id IN (SELECT learner_id FROM freshers)
    GROUP BY al.referred_by_id
  ),
  base AS (
    SELECT f.learner_id, f.department_id, f.batch_id,
           c.value_score_avg, c.advocacy_score,
           COALESCE(r.submitted, 0) AS submitted,
           COALESCE(r.joined, 0)    AS joined
    FROM freshers f
    LEFT JOIN public.induction_completion c
      ON c.event_id = p_event_id AND c.learner_id = f.learner_id
    LEFT JOIN refs r ON r.learner_id = f.learner_id
  )
  -- program total
  SELECT 'total'::text, NULL::uuid, 'All departments'::text,
         count(*)::integer,
         count(*) FILTER (WHERE b.value_score_avg IS NOT NULL)::integer,
         round(avg(b.value_score_avg), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score IS NOT NULL)::integer,
         round(avg(b.advocacy_score), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score >= 9)::integer,
         count(*) FILTER (WHERE b.submitted >= 1)::integer,
         COALESCE(sum(b.submitted), 0)::bigint,
         COALESCE(sum(b.joined), 0)::bigint
  FROM base b
  UNION ALL
  -- by department
  SELECT 'department'::text, b.department_id,
         COALESCE(d.department_name, '— Unassigned —')::text,
         count(*)::integer,
         count(*) FILTER (WHERE b.value_score_avg IS NOT NULL)::integer,
         round(avg(b.value_score_avg), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score IS NOT NULL)::integer,
         round(avg(b.advocacy_score), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score >= 9)::integer,
         count(*) FILTER (WHERE b.submitted >= 1)::integer,
         COALESCE(sum(b.submitted), 0)::bigint,
         COALESCE(sum(b.joined), 0)::bigint
  FROM base b
  LEFT JOIN public.departments d ON d.id = b.department_id
  GROUP BY b.department_id, d.department_name
  UNION ALL
  -- by batch
  SELECT 'batch'::text, b.batch_id,
         COALESCE(ib.label, '— No batch —')::text,
         count(*)::integer,
         count(*) FILTER (WHERE b.value_score_avg IS NOT NULL)::integer,
         round(avg(b.value_score_avg), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score IS NOT NULL)::integer,
         round(avg(b.advocacy_score), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score >= 9)::integer,
         count(*) FILTER (WHERE b.submitted >= 1)::integer,
         COALESCE(sum(b.submitted), 0)::bigint,
         COALESCE(sum(b.joined), 0)::bigint
  FROM base b
  LEFT JOIN public.induction_batches ib ON ib.id = b.batch_id
  GROUP BY b.batch_id, ib.label
  ORDER BY 1, 3;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_session_feedback_summary(p_event_id uuid)
RETURNS TABLE(session_id uuid, avg_rating numeric, response_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_session_feedback_summary: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_session_feedback_summary: not authorized';
  END IF;

  RETURN QUERY
  SELECT f.session_id::uuid, round(avg(f.rating), 2)::numeric, count(*)::integer
  FROM public.event_session_feedback f
  WHERE f.event_id = p_event_id
  GROUP BY f.session_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_session_loop_summary(p_event_id uuid)
RETURNS TABLE(topic_key text, first_session_id uuid, input_avg numeric, input_responses integer, suggestion jsonb, rerun_avg numeric, raw_lift numeric, rtm_expected_avg numeric, net_effect numeric, measure_status text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_is_coord boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_session_loop_summary: not authenticated'; END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_session_loop_summary: not an induction event'; END IF;

  v_is_coord := is_super_admin() OR is_admin()
                OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
                OR public.fn_induction_is_event_coordinator(p_event_id);  -- ADDED

  RETURN QUERY
  SELECT e.topic_key, e.first_session_id, e.input_avg, e.input_responses, e.suggestion,
         e.rerun_avg, e.raw_lift, e.rtm_expected_avg, e.net_effect, e.measure_status
  FROM public.induction_session_effectiveness e
  WHERE e.event_id = p_event_id
    AND (
      v_is_coord
      OR EXISTS (
        SELECT 1 FROM public.event_session_speakers sp
        WHERE sp.profile_id = auth.uid()
          AND sp.session_id IN (e.first_session_id, e.rerun_session_id)
      )
    )
  ORDER BY e.net_effect DESC NULLS LAST, e.input_avg ASC;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_upsert_session(p_event_id uuid, p_session_id uuid, p_day_number integer, p_batch_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_title text, p_description text DEFAULT NULL::text, p_venue_text text DEFAULT NULL::text, p_speaker_text text DEFAULT NULL::text, p_outcome_text text DEFAULT NULL::text, p_resource_links jsonb DEFAULT '[]'::jsonb, p_session_order integer DEFAULT 1, p_venue_resource_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst          UUID;
  v_sid           UUID;
  v_existing_res  UUID;
  v_existing_text TEXT;
  v_venue_text    TEXT;
  v_res_name      TEXT;
  v_res_status    TEXT;
  v_res_inst      UUID;
  v_res_is_venue  BOOLEAN;
BEGIN
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED (this check only — NOT the venue-institution check below)
    RAISE EXCEPTION 'fn_induction_upsert_session: not authorized';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION 'fn_induction_upsert_session: title required'; END IF;
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'fn_induction_upsert_session: end must be after start';
  END IF;
  IF p_batch_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.induction_batches b WHERE b.id = p_batch_id AND b.event_id = p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_upsert_session: batch does not belong to this induction';
  END IF;

  IF p_session_id IS NOT NULL THEN
    SELECT es.venue_resource_id, es.venue_text
      INTO v_existing_res, v_existing_text
    FROM public.event_sessions es
    WHERE es.id = p_session_id AND es.event_id = p_event_id;
  END IF;

  IF p_venue_resource_id IS NULL THEN
    v_venue_text := NULL;
  ELSIF p_session_id IS NOT NULL AND p_venue_resource_id IS NOT DISTINCT FROM v_existing_res THEN
    v_venue_text := v_existing_text;
  ELSE
    SELECT r.name,
           r.status,
           r.institution_id,
           EXISTS (
             SELECT 1 FROM public.resource_parent_categories pc
             WHERE pc.id = r.parent_category_id
               AND lower(btrim(pc.name)) = 'spaces & venues'
           )
      INTO v_res_name, v_res_status, v_res_inst, v_res_is_venue
    FROM public.resources r
    WHERE r.id = p_venue_resource_id;

    IF v_res_name IS NULL THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: venue resource not found';
    END IF;
    IF NOT v_res_is_venue THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: resource is not a Spaces & Venues room';
    END IF;
    IF v_res_status IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: venue is not available';
    END IF;
    -- NOT touched: this gates whether the caller may use THIS VENUE (its own
    -- institution), an unrelated concern from "can this caller manage this induction."
    IF NOT (is_super_admin() OR is_admin() OR role_has_institution_access(v_res_inst)) THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: no access to that venue''s institution';
    END IF;
    v_venue_text := v_res_name;
  END IF;

  IF p_session_id IS NULL THEN
    INSERT INTO public.event_sessions
      (event_id, title, description, start_at, end_at, day_number, session_order,
       venue_text, venue_resource_id, speaker_text, outcome_text, resource_links,
       batch_id, status, created_by)
    VALUES
      (p_event_id, btrim(p_title), p_description, p_start_at, p_end_at, p_day_number,
       COALESCE(p_session_order, 1), v_venue_text, p_venue_resource_id, p_speaker_text,
       p_outcome_text, COALESCE(p_resource_links, '[]'::jsonb), p_batch_id, 'scheduled', auth.uid())
    RETURNING id INTO v_sid;
  ELSE
    UPDATE public.event_sessions SET
      title = btrim(p_title), description = p_description,
      start_at = p_start_at, end_at = p_end_at, day_number = p_day_number,
      session_order = COALESCE(p_session_order, session_order),
      venue_text = v_venue_text, venue_resource_id = p_venue_resource_id,
      speaker_text = p_speaker_text, outcome_text = p_outcome_text,
      resource_links = COALESCE(p_resource_links, '[]'::jsonb),
      batch_id = p_batch_id, updated_at = now()
    WHERE id = p_session_id AND event_id = p_event_id
    RETURNING id INTO v_sid;
    IF v_sid IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session: session not found for this induction'; END IF;
  END IF;
  RETURN v_sid;
END $function$;

NOTIFY pgrst, 'reload schema';
