-- Updated: 2026-07-25 - Fix fn_carre_item_evidence academic A4 block: >110s timeout → ~1s.
-- Root cause: fb→attendance join re-detoasted each student_attendance.attendance_data JSONB
-- once per matching feedback pair (~480k detoasts). New shape scans attendance ONCE,
-- jsonb_each's each row once, hash-joins period keys against the (small) feedback set,
-- and aggregates per session — also yielding the doctrine-native "median session reach".
-- Semantics: submitted counted per session from session_feedback (distinct learners),
-- clamped to present (LEAST) — validated against the exact per-student intersect:
-- present 160,916 vs 160,029 · submitted 98,834 vs 98,831 · sessions 5,262 (2026-07-25).
-- authenticated role runs with statement_timeout=8s; this block now fits with headroom.

CREATE OR REPLACE FUNCTION public.fn_carre_item_evidence(p_cycle_id uuid)
 RETURNS TABLE(parameter_code text, evidence text, cap smallint, basis jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '15s'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_module text;
  v_is_lead boolean;
  -- shared probes
  v_recog_90d int;
  v_od_pending int;
  v_od_oldest_days int;
  v_od_decided_30d int;
  -- academic probes
  v_fb_present int; v_fb_submitted int; v_fb_sessions int; v_fb_median_pct int;
  v_sugg_total int; v_sugg_verdicted int;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT c.module_key, (c.lead_auditor_id = v_uid)
    INTO v_module, v_is_lead
  FROM public.audit_cycles c
  WHERE c.id = p_cycle_id AND c.frameworks @> ARRAY['CARRE']::text[];

  IF v_module IS NULL AND v_is_lead IS NULL THEN RETURN; END IF;  -- not a CARRE cycle

  -- Leadership OR the cycle's own lead auditor (the person scoring it).
  IF NOT (COALESCE(v_is_lead,false) OR is_super_admin() OR is_admin()
          OR user_has_permission('audit.cycle.view')) THEN
    RETURN;
  END IF;

  -- ── RS: always present, always human-only ────────────────────────────────
  RETURN QUERY
  SELECT ('CARRE-RS' || i)::text,
         'Dignity is human-observed only. No machine evidence exists for this item, and none ever will — the sealed participant lane and your own observation are the only sources.'::text,
         NULL::smallint,
         jsonb_build_object('machine_evidence', false)
  FROM generate_series(1,5) i;

  IF v_module IS NULL THEN RETURN; END IF;

  -- ── Recognition stream (module-scoped, 90d) → R-items ────────────────────
  SELECT count(*)::int INTO v_recog_90d
  FROM public.campus_living_recognition r
  WHERE r.fired_at >= now() - interval '90 days'
    AND CASE v_module
          WHEN 'campus-living'    THEN r.module IN ('mess','housekeeping','community','maintenance','events')
          WHEN 'academic'         THEN r.module = 'academic'
          WHEN 'learners-council' THEN r.module = 'learners-council'
          ELSE false
        END;

  IF v_recog_90d = 0 THEN
    RETURN QUERY
    SELECT ('CARRE-R' || i)::text,
           'The measured recognition stream shows ZERO events for this module in 90 days — recognition exists in design only. Doctrine cap: 2 (score 3 needs visible+consistent practice; 4 needs measured data). Override only with observed, nameable practice.'::text,
           2::smallint,
           jsonb_build_object('recognition_events_90d', 0)
    FROM generate_series(1,5) i;
  ELSE
    RETURN QUERY
    SELECT ('CARRE-R' || i)::text,
           format('Measured recognition stream: %s events in 90 days for this module.', v_recog_90d)::text,
           NULL::smallint,
           jsonb_build_object('recognition_events_90d', v_recog_90d)
    FROM generate_series(1,5) i;
  END IF;

  -- ── OD / leave responsiveness → A3 (fast loops), all three modules ───────
  SELECT count(*) FILTER (WHERE a.status::text = 'pending'),
         COALESCE(max((now()::date - ap.created_at::date)) FILTER (WHERE a.status::text = 'pending'), 0),
         count(*) FILTER (WHERE a.status::text IN ('approved','rejected')
                          AND a.action_taken_at >= now() - interval '30 days')
    INTO v_od_pending, v_od_oldest_days, v_od_decided_30d
  FROM public.leave_onduty_approvals a
  JOIN public.leave_onduty_applications ap ON ap.id = a.application_id;

  RETURN QUERY
  SELECT 'CARRE-A3'::text,
         format('Institution OD/leave loop: %s requests pending (oldest %s days); %s decided in 30 days. A participant''s ask that sits unanswered is a slow loop they personally feel.',
                v_od_pending, v_od_oldest_days, v_od_decided_30d)::text,
         NULL::smallint,
         jsonb_build_object('od_pending', v_od_pending, 'od_oldest_days', v_od_oldest_days, 'od_decided_30d', v_od_decided_30d);

  -- ── Academic-only: feedback participation (A4) + voice→verdict (E5) ──────
  IF v_module = 'academic' THEN
    -- Per-session aggregate: attendance scanned ONCE (jsonb_each once per row),
    -- period keys hash-joined against feedback sessions; never re-detoast per pair.
    WITH fb AS (
      SELECT DISTINCT sf.attendance_date, sf.period_id
      FROM public.session_feedback sf
      WHERE sf.attendance_date >= (current_date - 30)
    ),
    pres AS (
      SELECT sa.attendance_date, per.key AS period_id,
             sum(jsonb_array_length(jsonb_path_query_array(
               per.value, '$.students[*] ? (@.status == "Present")')))::int AS present_n
      FROM public.student_attendance sa
      CROSS JOIN LATERAL jsonb_each(sa.attendance_data) per
      JOIN fb ON fb.attendance_date = sa.attendance_date AND fb.period_id = per.key
      WHERE sa.attendance_date >= (current_date - 30)
      GROUP BY 1, 2
    ),
    sub AS (
      SELECT sf.attendance_date, sf.period_id, count(DISTINCT sf.student_id)::int AS submitted_n
      FROM public.session_feedback sf
      WHERE sf.attendance_date >= (current_date - 30)
      GROUP BY 1, 2
    )
    SELECT sum(p.present_n)::int,
           sum(LEAST(s.submitted_n, p.present_n))::int,
           count(*)::int,
           round(100 * percentile_cont(0.5) WITHIN GROUP
             (ORDER BY LEAST(s.submitted_n::numeric / NULLIF(p.present_n, 0), 1)))::int
      INTO v_fb_present, v_fb_submitted, v_fb_sessions, v_fb_median_pct
    FROM pres p
    JOIN sub s ON s.attendance_date = p.attendance_date AND s.period_id = p.period_id;

    IF COALESCE(v_fb_present,0) >= 3 THEN
      RETURN QUERY
      SELECT 'CARRE-A4'::text,
             format('Feedback loop reach (30d, sessions that ran the loop): the MEDIAN session reaches %s%% of present learners; overall %s%% (%s of %s present, %s sessions). A4 asks whether the MEDIAN participant is reached.',
                    v_fb_median_pct,
                    round(v_fb_submitted::numeric / NULLIF(v_fb_present,0) * 100),
                    v_fb_submitted, v_fb_present, v_fb_sessions)::text,
             NULL::smallint,
             jsonb_build_object('present', v_fb_present, 'submitted', v_fb_submitted,
                                'sessions', v_fb_sessions, 'median_reach_pct', v_fb_median_pct,
                                'method', 'per-session aggregate; submitted clamped to present');
    END IF;

    SELECT count(*)::int, count(*) FILTER (WHERE s.human_verdict IS NOT NULL)::int
      INTO v_sugg_total, v_sugg_verdicted
    FROM public.scf_ai_suggestions s
    WHERE s.created_at >= now() - interval '90 days';

    IF COALESCE(v_sugg_total,0) > 0 THEN
      RETURN QUERY
      SELECT 'CARRE-E5'::text,
             format('Voice→change machinery (90d): %s improvement suggestions generated from learner feedback, %s received a human verdict. E5 asks whether voice actually changes the system.',
                    v_sugg_total, v_sugg_verdicted)::text,
             NULL::smallint,
             jsonb_build_object('suggestions_90d', v_sugg_total, 'verdicted', v_sugg_verdicted);
    END IF;
  END IF;

  -- ── Learners-council-only: the sealed participant lane, k-floored ────────
  IF v_module = 'learners-council' THEN
    RETURN QUERY
    SELECT r.parameter_code,
           format('Sealed participant voice (k≥3): %s scorers, median %s (lane: %s). This is measured participant experience for this exact item.',
                  r.scorers, r.median_score, r.lane)::text,
           NULL::smallint,
           to_jsonb(r)
    FROM public.fn_carre_participant_rollup(p_cycle_id) r;
  END IF;
END;
$function$;

-- Anon lock: CREATE OR REPLACE counts as NEW to the secdef-anon-revoke gate — re-assert.
REVOKE EXECUTE ON FUNCTION public.fn_carre_item_evidence(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_carre_item_evidence(uuid) TO authenticated;
