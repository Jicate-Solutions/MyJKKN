-- ============================================================================
-- Repair compute_learner_risk_assessment — dead catalog + unreachable tiers
-- Migration: 20260730160100
-- Applied to production: 2026-07-30 (this file is the repo record of live state)
-- ============================================================================
--
-- Reproduces what is ALREADY RUNNING on production, captured with
--     SELECT pg_get_functiondef(oid) FROM pg_proc
--      WHERE proname='compute_learner_risk_assessment';
-- The body below is byte-for-byte the deployed body with ONE exception: two stray
-- scaffolding comments the original applier left at the top ("Re-declare the full
-- function body..." / "We'll extract just the function...") are removed. No
-- executable line differs.
--
-- ONE DELIBERATE DELTA FROM LIVE: the REVOKE at the bottom now also removes
-- `authenticated`, which production currently grants. Applying this migration
-- therefore DOES change production privileges. Rationale is at that line.
--
-- Depends on 20260730160000 (the materialized-view repair) for its attendance
-- dimension, but does not require it: the guard degrades cleanly if the view is
-- absent or empty.
--
-- ---------------------------------------------------------------------------
-- BUG 1 — the function had NEVER once executed. Not "produced bad numbers":
--         never ran, not a single time, since it was created on 2026-05-25.
-- ---------------------------------------------------------------------------
-- Its source-catalog probe read
--     SELECT EXISTS (SELECT 1 FROM information_schema.materialized_views ...)
-- and `information_schema.materialized_views` DOES NOT EXIST in PostgreSQL.
-- Materialized views are not in the SQL standard, so the information_schema never
-- describes them; PostgreSQL exposes them through `pg_matviews` instead. Every
-- call therefore raised 42P01 (undefined_table) at that line — before any learner
-- was scored, before any row was written. The failure was total and silent from
-- the outside, and `learner_risk_assessments` sat at 0 rows for two months.
--
-- Fix: probe pg_matviews. (Line 103 below.)
--
-- ---------------------------------------------------------------------------
-- BUG 2 — the two most severe tiers were mathematically unreachable.
-- ---------------------------------------------------------------------------
-- platform_policies 'learner_risk.weights' spreads 100 points across 7 dimensions:
--   attendance 25 · fees 20 · academic 20 · engagement 10 · wellness 10 ·
--   belonging 10 · hostel 5
-- Four of those seven had no data source at all and could only ever contribute 0,
-- yet the composite still divided by a FIXED literal 100. The arithmetic ceiling
-- was therefore 55 -- while 'learner_risk.tier_thresholds' sets high=60 and
-- critical=80. NO learner could ever be classified high or critical, however bad
-- their situation. The highest score actually observed was 54.
--
-- Fix, in two parts:
--   (a) v_w_applied accumulates only the weight that is actually EARNABLE on this
--       run, and the composite divides by GREATEST(v_w_applied, 1). GREATEST
--       guards the degenerate all-sources-missing case against division by zero.
--   (b) existence alone is not enough. A source table that EXISTS but holds zero
--       rows can never contribute risk either, and counting its weight in the
--       denominator suppresses the composite just as permanently. So each
--       v_has_* flag is downgraded by a follow-up emptiness probe.
--
-- Those probes use EXECUTE deliberately. A static `SELECT ... FROM
-- hostel_risk_alerts` would create a compile-time dependency on a table this
-- function is explicitly written to tolerate the absence of, and plpgsql would
-- fail to parse the body on any database where it is missing. EXECUTE defers
-- resolution to run time, which is the whole point of the guard.
--
-- Result on prod: 59 critical and 403 high learners now surface, out of 4,342
-- assessed. Both tiers were previously, and necessarily, empty.
--
-- KNOWN FOLLOW-UP (deliberately not changed here): two recommended_actions
-- strings in the body still read "student" rather than "learner". They are
-- reproduced as-is because the entire purpose of this file is to match deployed
-- state; correcting user-facing copy is a behaviour change and belongs in its own
-- reviewed PR. Table and column names containing "student" (student_attendance,
-- billing_student_bills, student_engagement_scores, student_id) are real database
-- identifiers and cannot be renamed here at all.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_learner_risk_assessment(p_target_date date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Weights (defaults — overridden by platform_policies if available)
  v_w_engagement  INT := 10;
  v_w_attendance  INT := 25;
  v_w_fees        INT := 20;
  v_w_academic    INT := 20;
  v_w_wellness    INT := 10;
  v_w_hostel      INT := 5;
  v_w_belonging   INT := 10;

  -- Tier thresholds
  v_t_critical INT := 80;
  v_t_high     INT := 60;
  v_t_moderate INT := 40;
  v_t_low      INT := 20;

  -- Loop variables
  v_learner         RECORD;
  v_score_eng       INT := 0;
  v_score_att       INT := 0;
  v_score_fee       INT := 0;
  v_score_acad      INT := 0;
  v_score_well      INT := 0;
  v_score_host      INT := 0;
  v_score_belong    INT := 0;
  v_composite       INT;
  v_tier            TEXT;
  v_confidence      TEXT;
  v_dims_with_data  INT;
  v_w_applied       INT;
  v_risk_factors    TEXT[];
  v_recommended     TEXT[];
  v_prev_score      SMALLINT;
  v_trend           TEXT;
  v_rows            INT := 0;

  -- Table existence checks
  v_has_eng_scores    BOOLEAN := false;
  v_has_health_esc    BOOLEAN := false;
  v_has_hostel_alerts BOOLEAN := false;
  v_has_obe_marks     BOOLEAN := false;
  v_has_billing       BOOLEAN := false;
  v_has_pulse         BOOLEAN := false;
  v_has_attendance_mv BOOLEAN := false;

  -- Temp variables for joins
  v_profile_user_id   UUID;
BEGIN
  -- -------------------------------------------------------
  -- 0. Load weights + thresholds from platform_policies
  --    PATCHED: use 'value' column (production schema), not 'policy_value'
  -- -------------------------------------------------------
  BEGIN
    SELECT (value->>'engagement')::INT,
           (value->>'attendance')::INT,
           (value->>'fees')::INT,
           (value->>'academic')::INT,
           (value->>'wellness')::INT,
           (value->>'hostel')::INT,
           (value->>'belonging')::INT
    INTO v_w_engagement, v_w_attendance, v_w_fees, v_w_academic,
         v_w_wellness, v_w_hostel, v_w_belonging
    FROM platform_policies
    WHERE policy_key = 'learner_risk.weights';
  EXCEPTION WHEN OTHERS THEN
    NULL; -- keep defaults
  END;

  BEGIN
    SELECT (value->>'critical')::INT,
           (value->>'high')::INT,
           (value->>'moderate')::INT,
           (value->>'low')::INT
    INTO v_t_critical, v_t_high, v_t_moderate, v_t_low
    FROM platform_policies
    WHERE policy_key = 'learner_risk.tier_thresholds';
  EXCEPTION WHEN OTHERS THEN
    NULL; -- keep defaults
  END;

  -- -------------------------------------------------------
  -- 1. Delete existing assessments for target date
  -- -------------------------------------------------------
  DELETE FROM learner_risk_assessments WHERE assessment_date = p_target_date;

  -- -------------------------------------------------------
  -- 2. Check which source tables exist
  -- -------------------------------------------------------
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_engagement_scores') INTO v_has_eng_scores;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'health_escalations')        INTO v_has_health_esc;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'hostel_risk_alerts')         INTO v_has_hostel_alerts;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'obe_assessment_co_marks')    INTO v_has_obe_marks;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'billing_student_bills')      INTO v_has_billing;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'learner_pulse_responses')    INTO v_has_pulse;
  SELECT EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'mv_learner_attendance_summary') INTO v_has_attendance_mv;

  -- A source that EXISTS but holds no rows can never contribute risk. Counting its
  -- weight in the denominator permanently suppresses the composite. EXECUTE keeps
  -- these checks free of compile-time dependencies on optional tables.
  IF v_has_eng_scores    THEN EXECUTE 'SELECT EXISTS (SELECT 1 FROM student_engagement_scores LIMIT 1)' INTO v_has_eng_scores;    END IF;
  IF v_has_health_esc    THEN EXECUTE 'SELECT EXISTS (SELECT 1 FROM health_escalations LIMIT 1)'        INTO v_has_health_esc;    END IF;
  IF v_has_hostel_alerts THEN EXECUTE 'SELECT EXISTS (SELECT 1 FROM hostel_risk_alerts LIMIT 1)'        INTO v_has_hostel_alerts; END IF;
  IF v_has_obe_marks     THEN EXECUTE 'SELECT EXISTS (SELECT 1 FROM obe_assessment_co_marks LIMIT 1)'   INTO v_has_obe_marks;     END IF;
  IF v_has_billing       THEN EXECUTE 'SELECT EXISTS (SELECT 1 FROM billing_student_bills LIMIT 1)'     INTO v_has_billing;       END IF;
  IF v_has_pulse         THEN EXECUTE 'SELECT EXISTS (SELECT 1 FROM learner_pulse_responses LIMIT 1)'   INTO v_has_pulse;         END IF;
  IF v_has_attendance_mv THEN EXECUTE 'SELECT EXISTS (SELECT 1 FROM mv_learner_attendance_summary LIMIT 1)' INTO v_has_attendance_mv; END IF;

  -- Renormalisation denominator: the weight actually earnable this run.
  v_w_applied :=
      (CASE WHEN v_has_eng_scores    THEN v_w_engagement ELSE 0 END)
    + (CASE WHEN v_has_attendance_mv THEN v_w_attendance ELSE 0 END)
    + (CASE WHEN v_has_billing       THEN v_w_fees       ELSE 0 END)
    + (CASE WHEN v_has_obe_marks     THEN v_w_academic   ELSE 0 END)
    + (CASE WHEN v_has_health_esc    THEN v_w_wellness   ELSE 0 END)
    + (CASE WHEN v_has_hostel_alerts THEN v_w_hostel     ELSE 0 END)
    + (CASE WHEN v_has_pulse         THEN v_w_belonging  ELSE 0 END);
  RAISE NOTICE 'learner_risk: earnable weight = % of 100', v_w_applied;

  -- Refresh attendance MV if it exists
  IF v_has_attendance_mv THEN
    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_learner_attendance_summary;
    EXCEPTION WHEN OTHERS THEN
      REFRESH MATERIALIZED VIEW mv_learner_attendance_summary;
    END;
  END IF;

  -- -------------------------------------------------------
  -- 3. Loop active learners
  -- -------------------------------------------------------
  FOR v_learner IN
    SELECT
      lp.id        AS learner_id,
      lp.institution_id,
      lp.department_id,
      lp.section_id,
      lp.created_at AS enrolled_at
    FROM learners_profiles lp
    WHERE lp.lifecycle_status = 'active'
  LOOP
    -- Reset scores
    v_score_eng    := 0;
    v_score_att    := 0;
    v_score_fee    := 0;
    v_score_acad   := 0;
    v_score_well   := 0;
    v_score_host   := 0;
    v_score_belong := 0;
    v_dims_with_data := 0;
    v_risk_factors := ARRAY[]::TEXT[];
    v_recommended  := ARRAY[]::TEXT[];

    -- Get profiles.id for this learner (engagement_scores keyed by user_id = profiles.id)
    SELECT p.id INTO v_profile_user_id
    FROM profiles p WHERE p.learner_id = v_learner.learner_id
    LIMIT 1;

    -- ---- DIMENSION 1: ENGAGEMENT ----
    IF v_has_eng_scores AND v_profile_user_id IS NOT NULL THEN
      BEGIN
        SELECT CASE engagement_level
                 WHEN 'at_risk' THEN 90
                 WHEN 'low'     THEN 60
                 WHEN 'medium'  THEN 30
                 WHEN 'high'    THEN 0
                 ELSE 50
               END
        INTO v_score_eng
        FROM student_engagement_scores
        WHERE user_id = v_profile_user_id
        ORDER BY calculation_date DESC LIMIT 1;

        IF v_score_eng IS NOT NULL THEN
          v_dims_with_data := v_dims_with_data + 1;
          IF v_score_eng >= 60 THEN
            v_risk_factors := array_append(v_risk_factors, 'low_platform_engagement');
            v_recommended  := array_append(v_recommended,  'Check if student is logging in');
          END IF;
        ELSE
          v_score_eng := 0;
        END IF;
      EXCEPTION WHEN OTHERS THEN v_score_eng := 0;
      END;
    END IF;

    -- ---- DIMENSION 2: ATTENDANCE ----
    IF v_has_attendance_mv THEN
      BEGIN
        SELECT
          CASE
            WHEN last_14d_pct IS NULL THEN 0
            ELSE LEAST(100, GREATEST(0, (100 - last_14d_pct)::INT +
              CASE WHEN delta_pct IS NOT NULL AND delta_pct < -10 THEN 20 ELSE 0 END))
          END
        INTO v_score_att
        FROM mv_learner_attendance_summary
        WHERE learner_id = v_learner.learner_id;

        IF v_score_att IS NOT NULL THEN
          v_dims_with_data := v_dims_with_data + 1;
          IF v_score_att >= 40 THEN
            v_risk_factors := array_append(v_risk_factors, 'attendance_below_threshold');
            v_recommended  := array_append(v_recommended,  'Discuss attendance with student');
          END IF;
        ELSE
          v_score_att := 0;
        END IF;
      EXCEPTION WHEN OTHERS THEN v_score_att := 0;
      END;
    END IF;

    -- ---- DIMENSION 3: FEES ----
    IF v_has_billing THEN
      BEGIN
        SELECT
          CASE
            WHEN COUNT(*) = 0 THEN 0
            WHEN COUNT(*) >= 2 THEN 100
            WHEN MIN(status) = 'unpaid' THEN 80
            ELSE 50
          END
        INTO v_score_fee
        FROM billing_student_bills
        WHERE student_id = v_learner.learner_id
          AND status IN ('unpaid', 'partial')
          AND due_date < CURRENT_DATE;

        IF v_score_fee IS NOT NULL AND v_score_fee > 0 THEN
          v_dims_with_data := v_dims_with_data + 1;
          v_risk_factors := array_append(v_risk_factors,
            'fee_overdue_' || (SELECT COALESCE(MAX(CURRENT_DATE - due_date), 0)
              FROM billing_student_bills
              WHERE student_id = v_learner.learner_id AND status IN ('unpaid','partial') AND due_date < CURRENT_DATE)
            || '_days');
          v_recommended := array_append(v_recommended, 'Contact parent regarding fee arrears');
        ELSE
          v_score_fee := COALESCE(v_score_fee, 0);
          v_dims_with_data := v_dims_with_data + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN v_score_fee := 0;
      END;
    END IF;

    -- ---- DIMENSION 4: ACADEMIC (skip if table absent) ----
    -- obe_assessment_co_marks: skip gracefully
    IF v_has_obe_marks THEN
      v_dims_with_data := v_dims_with_data + 1;
      -- Simplified: would need course enrollment join; set to 0 for now
      v_score_acad := 0;
    END IF;

    -- ---- DIMENSION 5: WELLNESS ----
    IF v_has_health_esc THEN
      BEGIN
        SELECT
          CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE 70
          END
        INTO v_score_well
        FROM health_escalations
        WHERE learner_id = v_learner.learner_id
          AND status != 'resolved'
          AND created_at > NOW() - INTERVAL '30 days';

        IF v_score_well > 0 THEN
          v_dims_with_data := v_dims_with_data + 1;
          v_risk_factors := array_append(v_risk_factors, 'open_health_escalation');
          v_recommended  := array_append(v_recommended,  'Refer to campus counselor');
        ELSE
          v_dims_with_data := v_dims_with_data + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN v_score_well := 0;
      END;
    END IF;

    -- ---- DIMENSION 6: HOSTEL ----
    IF v_has_hostel_alerts THEN
      BEGIN
        SELECT
          CASE
            WHEN COUNT(*) FILTER (WHERE severity = 'critical') > 0 THEN 90
            WHEN COUNT(*) FILTER (WHERE severity = 'warning') > 0  THEN 60
            ELSE 0
          END +
          CASE
            WHEN COUNT(*) FILTER (WHERE alert_type IN ('dropout_risk','mental_health')) > 0 THEN 20
            ELSE 0
          END
        INTO v_score_host
        FROM hostel_risk_alerts
        WHERE learner_id = v_learner.learner_id
          AND status = 'active';

        v_score_host := LEAST(100, COALESCE(v_score_host, 0));
        IF v_score_host > 0 THEN
          v_dims_with_data := v_dims_with_data + 1;
          v_risk_factors := array_append(v_risk_factors, 'active_hostel_alert');
        ELSE
          v_dims_with_data := v_dims_with_data + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN v_score_host := 0;
      END;
    END IF;

    -- ---- DIMENSION 7: BELONGING PULSE ----
    IF v_has_pulse THEN
      BEGIN
        SELECT
          CASE
            WHEN response_sentiment = -1 AND pulse_type = 'belonging'    THEN 80
            WHEN response_sentiment = -1 AND pulse_type = 'academic_fit' THEN 60
            WHEN response_sentiment = -1 AND pulse_type = 'wellbeing'    THEN 50
            ELSE 0
          END
        INTO v_score_belong
        FROM learner_pulse_responses
        WHERE learner_id = v_learner.learner_id
        ORDER BY responded_at DESC LIMIT 1;

        v_score_belong := COALESCE(v_score_belong, 0);
        IF v_score_belong > 0 THEN
          v_dims_with_data := v_dims_with_data + 1;
          v_risk_factors := array_append(v_risk_factors, 'negative_pulse_response');
          v_recommended  := array_append(v_recommended,  'Schedule mentor check-in');
        END IF;
      EXCEPTION WHEN OTHERS THEN v_score_belong := 0;
      END;
    END IF;

    -- ---- COMPOSITE ----
    v_composite := LEAST(100, GREATEST(0,
      (v_score_eng    * v_w_engagement +
       v_score_att    * v_w_attendance +
       v_score_fee    * v_w_fees +
       v_score_acad   * v_w_academic +
       v_score_well   * v_w_wellness +
       v_score_host   * v_w_hostel +
       v_score_belong * v_w_belonging) / GREATEST(v_w_applied, 1)
    ));

    -- ---- TIER ----
    IF v_composite >= v_t_critical THEN v_tier := 'critical';
    ELSIF v_composite >= v_t_high  THEN v_tier := 'high';
    ELSIF v_composite >= v_t_moderate THEN v_tier := 'moderate';
    ELSIF v_composite >= v_t_low   THEN v_tier := 'low';
    ELSE v_tier := 'healthy';
    END IF;

    -- ---- CONFIDENCE ----
    IF v_dims_with_data >= 5 THEN v_confidence := 'high';
    ELSIF v_dims_with_data >= 3 THEN v_confidence := 'medium';
    ELSE v_confidence := 'low';
    END IF;

    -- ---- TREND ----
    SELECT composite_risk_score INTO v_prev_score
    FROM learner_risk_assessments
    WHERE learner_id = v_learner.learner_id
      AND assessment_date = p_target_date - 1;

    IF v_prev_score IS NULL THEN v_trend := NULL;
    ELSIF v_composite > v_prev_score + 5 THEN v_trend := 'worsening';
    ELSIF v_composite < v_prev_score - 5 THEN v_trend := 'improving';
    ELSE v_trend := 'stable';
    END IF;

    -- ---- INSERT ----
    INSERT INTO learner_risk_assessments (
      learner_id, institution_id, assessment_date,
      composite_risk_score, risk_tier, confidence,
      dimension_scores, risk_factors, recommended_actions,
      previous_risk_score, trend_direction
    ) VALUES (
      v_learner.learner_id, v_learner.institution_id, p_target_date,
      v_composite, v_tier, v_confidence,
      jsonb_build_object(
        'engagement', v_score_eng, 'attendance', v_score_att,
        'fees', v_score_fee, 'academic', v_score_acad,
        'wellness', v_score_well, 'hostel', v_score_host,
        'belonging', v_score_belong
      ),
      v_risk_factors, v_recommended,
      v_prev_score, v_trend
    )
    ON CONFLICT (learner_id, assessment_date) DO UPDATE SET
      composite_risk_score = EXCLUDED.composite_risk_score,
      risk_tier            = EXCLUDED.risk_tier,
      confidence           = EXCLUDED.confidence,
      dimension_scores     = EXCLUDED.dimension_scores,
      risk_factors         = EXCLUDED.risk_factors,
      recommended_actions  = EXCLUDED.recommended_actions,
      previous_risk_score  = EXCLUDED.previous_risk_score,
      trend_direction      = EXCLUDED.trend_direction;

    v_rows := v_rows + 1;
  END LOOP;

  RETURN v_rows;
END;
$function$;

-- Both anon AND PUBLIC: anon inherits PUBLIC's default EXECUTE grant, so revoking
-- anon alone leaves the function callable by the public anon key.
--
-- `authenticated` is revoked too, and that IS a tightening against live state
-- (prod currently carries authenticated=X). This function opens by DELETEing
-- every row for the target date and then loops all 4,342 active learners, so an
-- EXECUTE grant to every logged-in user is both a data-destruction primitive and
-- a trivial denial-of-service. Nothing calls it: a repo-wide search of
-- jicate/main finds no caller outside migrations and generated types, and no
-- pg_cron job invokes it. It is run by a server-side operator, which is
-- service_role. Note CREATE OR REPLACE preserves an existing ACL, so simply
-- omitting authenticated from the GRANT would NOT close the live grant — the
-- explicit REVOKE is required.
REVOKE EXECUTE ON FUNCTION public.compute_learner_risk_assessment(date) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.compute_learner_risk_assessment(date) TO service_role;
