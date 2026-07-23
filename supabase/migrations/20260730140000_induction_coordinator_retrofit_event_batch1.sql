-- ============================================================================
-- Fresher Induction — coordinator retrofit, part 2: event-scoped RPCs (batch 1/2)
-- File: 20260730140000_induction_coordinator_retrofit_event_batch1.sql | Date: 2026-07-30
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_appoint_feedback_volunteer(p_event_id uuid, p_learner_id uuid, p_capacity integer DEFAULT 20)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID; v_id UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: not authorized';
  END IF;
  IF p_learner_id IS NULL THEN RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: learner_id required'; END IF;
  -- guard: never appoint a fresher of THIS induction as a mentor.
  IF EXISTS (SELECT 1 FROM public.induction_enrollment ie
             WHERE ie.event_id = p_event_id AND ie.learner_id = p_learner_id) THEN
    RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: that learner is a fresher in this induction';
  END IF;
  -- guard: the learner must be a MEMBER of this college (a profile in v_inst).
  -- Don't trust the client-supplied id — mirror the assignable query's JOIN so an
  -- out-of-college learner can't be appointed and then read this college's roster PII
  -- via fn_induction_my_feedback_group. (Closes the cross-tenant gap; review #1694.)
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.learner_id = p_learner_id AND p.institution_id = v_inst) THEN
    RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: that learner is not a member of this college';
  END IF;

  INSERT INTO public.induction_feedback_volunteers
    (event_id, learner_id, institution_id, capacity, is_active, appointed_by)
  VALUES (p_event_id, p_learner_id, v_inst, LEAST(GREATEST(COALESCE(p_capacity, 20), 1), 200), true, auth.uid())
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    is_active = true,
    capacity  = LEAST(GREATEST(COALESCE(p_capacity, 20), 1), 200),
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_assignable_peer_mentors(p_event_id uuid, p_query text DEFAULT NULL::text)
RETURNS TABLE(learner_id uuid, full_name text, register_number text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_assignable_peer_mentors: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_assignable_peer_mentors: not authorized';
  END IF;

  RETURN QUERY
  SELECT DISTINCT lp.id,   -- DISTINCT: a learner with >1 profile in the college appears once (review #1694)
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text
  FROM public.learners_profiles lp
  -- must have a login in THIS college (so they can actually use the mentor page)
  JOIN public.profiles p ON p.learner_id = lp.id AND p.institution_id = v_inst
  WHERE NOT EXISTS (  -- not a fresher being inducted here
          SELECT 1 FROM public.induction_enrollment ie
          WHERE ie.event_id = p_event_id AND ie.learner_id = lp.id)
    AND NOT EXISTS (  -- not already an active mentor on this event
          SELECT 1 FROM public.induction_feedback_volunteers v
          WHERE v.event_id = p_event_id AND v.learner_id = lp.id AND v.is_active)
    AND (
      p_query IS NULL OR p_query = ''
      OR btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')) ILIKE '%' || p_query || '%'
      OR lp.register_number ILIKE '%' || p_query || '%'
    )
  ORDER BY 2
  LIMIT 25;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_auto_enroll(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid; v_year integer; v_scope text; v_degree_filter text;
  v_inst_ids uuid[]; v_degree_ids uuid[]; v_dept_ids uuid[];
  v_multi boolean; v_count integer;
BEGIN
  SELECT institution_id, admission_year, enroll_scope, degree_type_filter,
         target_institution_ids, target_degree_ids, target_department_ids
    INTO v_inst, v_year, v_scope, v_degree_filter, v_inst_ids, v_degree_ids, v_dept_ids
  FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_auto_enroll: induction program not found for event %', p_event_id; END IF;
  v_multi := (v_inst_ids IS NOT NULL AND cardinality(v_inst_ids) > 0);

  IF v_multi THEN
    IF NOT (public._fn_induction_can_target_institutions(v_inst_ids)
            OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
      RAISE EXCEPTION 'fn_induction_auto_enroll: not authorized'; END IF;
  ELSE
    IF NOT (is_super_admin() OR is_admin()
            OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
            OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
      RAISE EXCEPTION 'fn_induction_auto_enroll: not authorized'; END IF;
  END IF;
  IF v_year IS NULL THEN RAISE EXCEPTION 'fn_induction_auto_enroll: induction has no admission_year set'; END IF;

  INSERT INTO public.induction_enrollment (event_id, learner_id, institution_id, source)
  SELECT p_event_id, lp.id, lp.institution_id, 'auto_admission_year'
  FROM public.learners_profiles lp
  JOIN public.admission_years ay ON ay.id = lp.admission_year_id
  LEFT JOIN public.degrees d ON d.id = lp.degree_id
  WHERE ay.year = v_year
    AND lp.lifecycle_status IN ('reserved','admitted','account')
    AND (
      (v_multi AND lp.institution_id = ANY(v_inst_ids)
         AND (v_degree_ids IS NULL OR cardinality(v_degree_ids)=0 OR lp.degree_id = ANY(v_degree_ids))
         AND (v_dept_ids IS NULL OR cardinality(v_dept_ids)=0 OR lp.department_id = ANY(v_dept_ids)))
      OR
      (NOT v_multi AND (v_scope='group' OR lp.institution_id = v_inst)
         AND (v_degree_filter IS NULL OR d.degree_type = v_degree_filter))
    )
  ON CONFLICT (event_id, learner_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_auto_split_batches(p_event_id uuid, p_num_batches integer DEFAULT 2)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst      UUID;
  v_batch_ids UUID[];
  v_loads     BIGINT[];
  v_assigned  INTEGER := 0;
  v_min_idx   INTEGER;
  v_label     TEXT;
  i           INTEGER;
  dept        RECORD;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'fn_induction_auto_split_batches: induction program not found for event %', p_event_id;
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_auto_split_batches: not authorized';
  END IF;
  IF p_num_batches < 1 OR p_num_batches > 12 THEN
    RAISE EXCEPTION 'fn_induction_auto_split_batches: num_batches must be 1..12';
  END IF;

  FOR i IN 1..p_num_batches LOOP
    v_label := chr(64 + i);
    INSERT INTO public.induction_batches (event_id, institution_id, label, fill_rule)
    VALUES (p_event_id, v_inst, v_label, 'by_department')
    ON CONFLICT (event_id, label) DO NOTHING;
  END LOOP;

  SELECT array_agg(id ORDER BY label) INTO v_batch_ids
  FROM public.induction_batches WHERE event_id = p_event_id;
  v_loads := array_fill(0::bigint, ARRAY[array_length(v_batch_ids,1)]);

  FOR dept IN
    SELECT lp.department_id AS dept_id, count(*) AS n
    FROM public.induction_enrollment ie
    JOIN public.learners_profiles lp ON lp.id = ie.learner_id
    WHERE ie.event_id = p_event_id
    GROUP BY lp.department_id
    ORDER BY count(*) DESC
  LOOP
    v_min_idx := 1;
    FOR i IN 2..array_length(v_loads,1) LOOP
      IF v_loads[i] < v_loads[v_min_idx] THEN v_min_idx := i; END IF;
    END LOOP;

    UPDATE public.induction_enrollment ie
    SET batch_id = v_batch_ids[v_min_idx]
    FROM public.learners_profiles lp
    WHERE ie.learner_id = lp.id
      AND ie.event_id = p_event_id
      AND lp.department_id IS NOT DISTINCT FROM dept.dept_id;

    v_loads[v_min_idx] := v_loads[v_min_idx] + dept.n;
    v_assigned := v_assigned + dept.n;
  END LOOP;

  RETURN v_assigned;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_autobalance_feedback_volunteers(p_event_id uuid, p_capacity integer DEFAULT NULL::integer)
RETURNS TABLE(enrolled integer, assigned integer, unassigned integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID; v_nvol INTEGER; v_enrolled INTEGER; v_assigned INTEGER;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_autobalance_feedback_volunteers: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_autobalance_feedback_volunteers: not authorized';
  END IF;

  SELECT count(*) INTO v_nvol
  FROM public.induction_feedback_volunteers
  WHERE event_id = p_event_id AND is_active;
  IF v_nvol = 0 THEN
    RAISE EXCEPTION 'fn_induction_autobalance_feedback_volunteers: no active feedback volunteers — appoint at least one first';
  END IF;

  -- full deterministic rebalance
  DELETE FROM public.induction_feedback_volunteer_group WHERE event_id = p_event_id;

  WITH active_vols AS (
    -- Effective per-mentor cap, clamped to [1,200] to bound slot generation: a direct
    -- RPC call with a huge p_capacity would otherwise materialize billions of slots →
    -- self-DoS (review #1694 r3 MEDIUM). p_capacity, WHEN PROVIDED, overrides per-run
    -- WITHOUT persisting (a per-mentor cap set elsewhere is never clobbered — r3 LOW);
    -- WHEN NULL, each mentor's own stored capacity drives balancing.
    SELECT id,
           LEAST(GREATEST(COALESCE(p_capacity, capacity), 1), 200) AS capacity,
           (row_number() OVER (ORDER BY created_at, id) - 1) AS vord
    FROM public.induction_feedback_volunteers
    WHERE event_id = p_event_id AND is_active
  ),
  -- each mentor contributes `capacity` slots; deal round-robin (round, then mentor
  -- order) so a mentor with capacity 1 takes exactly one fresher.
  ordered_slots AS (
    SELECT v.id AS volunteer_id,
           (row_number() OVER (ORDER BY gs.n, v.vord) - 1) AS slot_idx
    FROM active_vols v
    CROSS JOIN LATERAL generate_series(1, v.capacity) AS gs(n)
  ),
  ranked AS (
    SELECT ie.learner_id,
           (row_number() OVER (
              ORDER BY
                -- no-account FIRST (institution-scoped: a profile in ANOTHER college
                -- does NOT count as "has account" here — review #1694)
                (EXISTS (SELECT 1 FROM public.profiles p
                         WHERE p.learner_id = ie.learner_id AND p.institution_id = v_inst)),
                ie.batch_id NULLS FIRST,
                lp.first_name, lp.last_name, ie.learner_id
            ) - 1) AS rn
    FROM public.induction_enrollment ie
    JOIN public.learners_profiles lp ON lp.id = ie.learner_id
    WHERE ie.event_id = p_event_id
  ),
  assign AS (
    -- fresher rn → slot rn; freshers with rn >= total slots stay UNASSIGNED (surfaced below)
    SELECT r.learner_id, s.volunteer_id
    FROM ranked r
    JOIN ordered_slots s ON s.slot_idx = r.rn
  )
  INSERT INTO public.induction_feedback_volunteer_group (volunteer_id, event_id, learner_id)
  SELECT a.volunteer_id, p_event_id, a.learner_id FROM assign a
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    volunteer_id = EXCLUDED.volunteer_id, updated_at = now();
  GET DIAGNOSTICS v_assigned = ROW_COUNT;

  SELECT count(*) INTO v_enrolled
  FROM public.induction_enrollment WHERE event_id = p_event_id;

  -- Surface the coverage TRUTH: if capacity×mentors < enrolled, some freshers have NO
  -- owner. The UI warns when unassigned > 0 instead of implying full coverage
  -- (review #1694 HIGH: silent coverage gap).
  enrolled   := v_enrolled;
  assigned   := v_assigned;
  unassigned := v_enrolled - v_assigned;
  RETURN NEXT;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_day_feedback_summary(p_event_id uuid)
RETURNS TABLE(day_number integer, avg_rating numeric, response_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_day_feedback_summary: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_day_feedback_summary: not authorized';
  END IF;

  RETURN QUERY
  SELECT f.day_number, round(avg(f.rating), 2)::numeric, count(*)::integer
  FROM public.event_day_feedback f
  WHERE f.event_id = p_event_id
  GROUP BY f.day_number;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_day_roster(p_event_id uuid, p_day_number integer)
RETURNS TABLE(learner_id uuid, name text, register_number text, batch_label text, status text, is_mixed boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_day_roster: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_day_roster: not authorized';
  END IF;

  RETURN QUERY
  WITH day_sessions AS (
    SELECT s.id, s.batch_id FROM public.event_sessions s
    -- day_number is nullable (NULL = the "Unscheduled" bucket the UI shows as
    -- day 0) — IS NOT DISTINCT FROM matches NULL rows a plain `=` would silently drop.
    WHERE s.event_id = p_event_id AND s.day_number IS NOT DISTINCT FROM p_day_number
  ),
  eligible AS (
    -- a learner is on the day roster if at least one of the day's sessions
    -- applies to their batch (combined batch_id IS NULL, or an exact match)
    SELECT DISTINCT e.learner_id
    FROM public.induction_enrollment e
    JOIN day_sessions ds ON ds.batch_id IS NULL OR ds.batch_id = e.batch_id
    WHERE e.event_id = p_event_id
  ),
  marks AS (
    SELECT a.learner_id,
           count(DISTINCT a.status) AS distinct_statuses,
           min(a.status) AS one_status
    FROM public.event_session_attendance a
    JOIN day_sessions ds ON ds.id = a.session_id
    GROUP BY a.learner_id
  )
  SELECT el.learner_id::uuid,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         b.label::text,
         CASE WHEN m.distinct_statuses = 1 THEN m.one_status ELSE NULL END::text,
         COALESCE(m.distinct_statuses, 0) > 1
  FROM eligible el
  JOIN public.learners_profiles lp ON lp.id = el.learner_id
  JOIN public.induction_enrollment ie ON ie.event_id = p_event_id AND ie.learner_id = el.learner_id
  LEFT JOIN public.induction_batches b ON b.id = ie.batch_id
  LEFT JOIN marks m ON m.learner_id = el.learner_id
  ORDER BY 2;
END $function$;

-- AMENDED 2026-07-09 (deep-review PR #1911 CRITICAL — replay ordering): the emitter
-- below now carries the Binary Metric 6.3 codes 6.3.1/6.3.2 (Director decision
-- 2026-07-09) instead of the retired Criterion codes 5.1.3/7.2.1. This file sorts
-- AFTER 20260709034000_induction_naac_rekey_63.sql (which re-keyed catalog +
-- junction + this fn to 6.3.x on live prod), so on a clean replay the old array here
-- would have clobbered the emitter back to codes the catalog no longer holds —
-- evidence emitted at orphan codes. Behaviorally identical to prod's live definition.
CREATE OR REPLACE FUNCTION public.fn_induction_emit_naac_evidence(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prog    RECORD;
  v_period  TEXT;
  v_meta    JSONB;
  v_metric  TEXT;
  v_n       INTEGER := 0;
  v_rc      INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_emit_naac_evidence: not authenticated'; END IF;

  SELECT ip.id AS program_id, ip.institution_id, e.start_date, ay.academic_year_name
    INTO v_prog
  FROM public.induction_programs ip
  JOIN public.events e ON e.id = ip.event_id
  LEFT JOIN public.academic_years ay ON ay.id = ip.academic_year_id
  WHERE ip.event_id = p_event_id;
  IF v_prog.program_id IS NULL THEN RAISE EXCEPTION 'fn_induction_emit_naac_evidence: not an induction event'; END IF;

  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_prog.institution_id))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_emit_naac_evidence: not authorized';
  END IF;

  -- Prefer the linked academic-year LABEL (correct AY semantics — an Indian academic
  -- year spans two calendar years, so a Jan–May induction must not be labelled by its
  -- calendar start year). Fall back to an IST-normalised calendar-year label only when
  -- the program has no academic_year row.
  v_period := COALESCE(
    NULLIF(btrim(v_prog.academic_year_name), ''),
    CASE WHEN v_prog.start_date IS NULL THEN NULL
      ELSE extract(year FROM (v_prog.start_date AT TIME ZONE 'Asia/Kolkata'))::int::text || '-' ||
           right((extract(year FROM (v_prog.start_date AT TIME ZONE 'Asia/Kolkata'))::int + 1)::text, 2)
    END
  );

  -- Live rollup snapshot for the metadata (joins LIVE off the admission funnel).
  WITH freshers AS (
    SELECT ie.learner_id FROM public.induction_enrollment ie WHERE ie.event_id = p_event_id
  ),
  refs AS (  -- submitted/referrers = EFFORT (any JKKN college); only JOINED scoped to
             -- this college (match fn_induction_scorecard) for the NAAC evidence metadata.
    SELECT count(*) FILTER (WHERE al.id IS NOT NULL) AS submitted,
           count(*) FILTER (
             WHERE al.funnel_stage IN ('token_paid','confirmed','enrolled')
               AND al.institution_id = v_prog.institution_id
           ) AS joined,
           count(DISTINCT al.referred_by_id) FILTER (WHERE al.id IS NOT NULL) AS referrers
    FROM freshers f
    LEFT JOIN public.admission_leads al
      ON al.referred_by_id = f.learner_id AND al.source = 'referral'::lead_source
  ),
  comp AS (
    SELECT count(*) AS enrolled,
           count(*) FILTER (WHERE c.participation_complete) AS participation_complete,
           count(*) FILTER (WHERE c.outcome_complete) AS outcome_complete,
           round(avg(c.attendance_pct), 2) AS avg_attendance_pct,
           round(avg(c.value_score_avg), 2) AS avg_value,
           round(avg(c.advocacy_score), 2) AS avg_advocacy
    FROM public.induction_enrollment ie
    LEFT JOIN public.induction_completion c
      ON c.event_id = ie.event_id AND c.learner_id = ie.learner_id
    WHERE ie.event_id = p_event_id
  )
  SELECT jsonb_build_object(
    'event_id', p_event_id,
    'period_label', v_period,
    'enrolled', comp.enrolled,
    'participation_complete', comp.participation_complete,
    'outcome_complete', comp.outcome_complete,
    'avg_attendance_pct', comp.avg_attendance_pct,
    'avg_value_score', comp.avg_value,
    'avg_advocacy_score', comp.avg_advocacy,
    'referrers', refs.referrers,
    'referrals_submitted', refs.submitted,
    'referrals_joined', refs.joined,
    'snapshot_at', now()
  ) INTO v_meta
  FROM comp, refs;

  -- Don't write NAAC evidence for an induction that reached nobody. The UI hides the
  -- button at enrolled=0, but a direct RPC must not emit all-zero evidence rows.
  IF COALESCE((v_meta->>'enrolled')::int, 0) = 0 THEN
    RETURN 0;
  END IF;

  -- Upsert one evidence row per NAAC criterion (source row = the induction_programs
  -- satellite). Refresh metadata + mapped_at on conflict so re-running re-snapshots.
  FOREACH v_metric IN ARRAY ARRAY['6.3.1','6.3.2'] LOOP
    INSERT INTO public.quality_evidence_mappings
      (source_table, source_id, institution_id, body_code, metric_code,
       period_label, mapped_by, is_auto, metadata, mapped_at)
    VALUES
      ('induction_programs', v_prog.program_id, v_prog.institution_id, 'NAAC', v_metric,
       v_period, auth.uid(), true, v_meta, now())
    ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
      SET period_label = EXCLUDED.period_label,
          metadata     = EXCLUDED.metadata,
          mapped_by    = EXCLUDED.mapped_by,
          is_auto      = true,
          mapped_at    = now()
      -- never clobber a manually-curated (is_auto=false) evidence mapping for this key
      WHERE public.quality_evidence_mappings.is_auto;
    -- count ACTUAL writes only: the upsert is a no-op (ROW_COUNT 0) when a manual
    -- row blocked the update, so the caller/UI never reports a false success.
    GET DIAGNOSTICS v_rc = ROW_COUNT;
    v_n := v_n + v_rc;
  END LOOP;

  RETURN v_n;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_feedback_method_mix(p_event_id uuid)
RETURNS TABLE(enrolled integer, responders integer, response_rate numeric, n_phone integer, n_volunteer_kiosk integer, no_account_enrolled integer, bias_flag boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst       UUID;
  v_enrolled   INTEGER;
  v_responders INTEGER;
  v_phone      INTEGER;
  v_kiosk      INTEGER;
  v_no_account INTEGER;
  v_rate       NUMERIC;
  v_dominant   NUMERIC;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_feedback_method_mix: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_feedback_method_mix: not authorized';
  END IF;

  SELECT count(*) INTO v_enrolled
  FROM public.induction_enrollment e WHERE e.event_id = p_event_id;

  -- enrolled freshers with no login account IN THIS COLLEGE — the structural exclusion
  -- ceiling for the own-phone path. Institution-scoped: a profile in ANOTHER college
  -- does not let them self-submit here, so it must not count as "has account"
  -- (review #1694: cross-tenant no_account misclassification).
  SELECT count(*) INTO v_no_account
  FROM public.induction_enrollment e
  WHERE e.event_id = p_event_id
    AND NOT EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.learner_id = e.learner_id AND p.institution_id = v_inst);

  -- one row per distinct responder, attributed to phone if they EVER self-submitted.
  WITH per_learner AS (
    SELECT f.learner_id, bool_or(f.capture_method = 'phone') AS has_phone
    FROM public.event_session_feedback f
    WHERE f.event_id = p_event_id
      -- only still-enrolled learners (a since-unenrolled learner's old feedback must not
      -- push responders > enrolled / response_rate > 1.0 — review #1694 r4)
      AND EXISTS (SELECT 1 FROM public.induction_enrollment ie
                  WHERE ie.event_id = p_event_id AND ie.learner_id = f.learner_id)
    GROUP BY f.learner_id
  )
  SELECT count(*)::int,
         count(*) FILTER (WHERE has_phone)::int,
         count(*) FILTER (WHERE NOT has_phone)::int
  INTO v_responders, v_phone, v_kiosk
  FROM per_learner;

  v_rate := CASE WHEN v_enrolled = 0 THEN 0
                 ELSE round(v_responders::numeric / v_enrolled, 4) END;
  v_dominant := CASE WHEN v_responders = 0 THEN 0
                     ELSE round(greatest(v_phone, v_kiosk)::numeric / v_responders, 4) END;

  enrolled            := v_enrolled;
  responders          := v_responders;
  response_rate       := v_rate;
  n_phone             := v_phone;
  n_volunteer_kiosk   := v_kiosk;
  no_account_enrolled := v_no_account;
  bias_flag           := (v_rate < 0.5 OR v_dominant > 0.8);
  RETURN NEXT;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_list_feedback_volunteers(p_event_id uuid)
RETURNS TABLE(learner_id uuid, full_name text, register_number text, capacity integer, is_active boolean, group_size integer, captured integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_list_feedback_volunteers: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_list_feedback_volunteers: not authorized';
  END IF;

  RETURN QUERY
  SELECT v.learner_id,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         v.capacity,
         v.is_active,
         (SELECT count(*)::int FROM public.induction_feedback_volunteer_group g
            WHERE g.volunteer_id = v.id),
         (SELECT count(DISTINCT g.learner_id)::int
            FROM public.induction_feedback_volunteer_group g
            JOIN public.event_session_feedback f
              ON f.event_id = v.event_id AND f.learner_id = g.learner_id
            WHERE g.volunteer_id = v.id)
  FROM public.induction_feedback_volunteers v
  JOIN public.learners_profiles lp ON lp.id = v.learner_id
  WHERE v.event_id = p_event_id
  ORDER BY 2;
END $function$;

NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- ACL re-assertion (ADDED 2026-07-09, secdef-anon gate): this file re-creates
-- ten SECURITY DEFINER functions but originally asserted no ACLs — on a clean
-- replay it runs AFTER the earlier revokes, and Supabase's default privileges
-- hand anon EXECUTE straight back to every re-created function. Locks below
-- mirror prod's live grants exactly (verified 2026-07-09: EXECUTE =
-- authenticated + service_role on all ten; anon/PUBLIC excluded). Idempotent.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_induction_appoint_feedback_volunteer(uuid, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_appoint_feedback_volunteer(uuid, uuid, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_induction_assignable_peer_mentors(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_assignable_peer_mentors(uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_induction_auto_enroll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_auto_enroll(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_induction_auto_split_batches(uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_auto_split_batches(uuid, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_induction_autobalance_feedback_volunteers(uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_autobalance_feedback_volunteers(uuid, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_induction_day_feedback_summary(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_day_feedback_summary(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_induction_day_roster(uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_day_roster(uuid, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_induction_emit_naac_evidence(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_emit_naac_evidence(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_induction_feedback_method_mix(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_feedback_method_mix(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.fn_induction_list_feedback_volunteers(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_list_feedback_volunteers(uuid) TO authenticated, service_role;
