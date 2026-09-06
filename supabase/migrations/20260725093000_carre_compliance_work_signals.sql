-- ============================================================================
-- CARRE / compliance practice signals in the work-signals spine (ADDITIVE)
-- 2026-07-25 · Director decisions (interview): keep building; acts not scores;
-- Respect never represented; self-scoped (the engine NEVER ranks — its locked
-- Phase-0 decision stands untouched).
--
-- Adds 4 registry rows (provider 'carre') + extends fn_work_signals_for with
-- their counts. The dashboard card renders generically from the engine, so
-- these appear on faculty/HOD dashboards with NO UI change:
--   od_requests_handled  — OD/leave decisions the caller gave in the window
--   od_requests_waiting  — queue NOW waiting on the caller (window-independent)
--   correctives_open     — tracker corrective items the caller owns, still open
--   carre_audits_scored  — CARRE audit cycles the caller scored in the window
--
-- Goodhart guard: no latency/speed metric is rewarded — counts + queue depth
-- only. The paired OUTCOME lane stays the participant-side data (feedback,
-- audits), which volume cannot game.
-- ============================================================================

INSERT INTO public.work_signal_types
  (signal_key, label, description, category, attribution_mode, unit, provider, sort_order, action_route, action_label)
VALUES
  ('od_requests_handled', 'OD / leave decisions given',
   'Leave / on-duty requests the person decided (approved or rejected) in the window.',
   'coverage', 'single', 'count', 'carre', 90, '/academic/leave-onduty/approvals', 'Open approvals'),
  ('od_requests_waiting', 'OD / leave requests waiting on you',
   'Requests sitting in the person''s approval queue right now (not window-scoped).',
   'coverage', 'single', 'count', 'carre', 91, '/academic/leave-onduty/approvals', 'Decide now'),
  ('correctives_open', 'Corrective items you own (open)',
   'Compliance-tracker items assigned to the person that are not yet compliant.',
   'improvement', 'single', 'count', 'carre', 92, '/tracker', 'Open tracker'),
  ('carre_audits_scored', 'CARRE audits you scored',
   'CARRE culture-audit cycles the person submitted scores for in the window.',
   'improvement', 'single', 'count', 'carre', 93, '/audit/cycles', 'Open audits')
ON CONFLICT (signal_key) DO UPDATE SET
  label=EXCLUDED.label, description=EXCLUDED.description, category=EXCLUDED.category,
  attribution_mode=EXCLUDED.attribution_mode, unit=EXCLUDED.unit, provider=EXCLUDED.provider,
  sort_order=EXCLUDED.sort_order, action_route=EXCLUDED.action_route,
  action_label=EXCLUDED.action_label, updated_at=now();

CREATE OR REPLACE FUNCTION public.fn_work_signals_for(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_email text;
  v_uid   uuid := auth.uid();
  v_to    date := COALESCE(p_to,   (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_from  date := COALESCE(p_from, (now() AT TIME ZONE 'Asia/Kolkata')::date - 30);
  v_assigned_marked   int := 0;
  v_personal_marked   int := 0;
  v_witnessed         int := 0;
  v_pulses            int := 0;
  v_lessons           int := 0;
  v_notes             int := 0;
  v_verdicts          int := 0;
  v_votes             int := 0;
  v_last              timestamptz;
  v_od_handled        int := 0;
  v_od_waiting        int := 0;
  v_correctives_open  int := 0;
  v_carre_scored      int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_work_signals_for: not authenticated';
  END IF;
  IF v_from > v_to THEN
    RAISE EXCEPTION 'fn_work_signals_for: p_from (%) is after p_to (%)', v_from, v_to;
  END IF;

  SELECT lower(p.email) INTO v_email FROM public.profiles p WHERE p.id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object(
      'window', jsonb_build_object('from', v_from, 'to', v_to),
      'subject_matched', false,
      'signals', '[]'::jsonb
    );
  END IF;

  WITH sess AS (
    SELECT sa.attendance_date AS ad, period.key AS pid, period.value AS pv
    FROM public.student_attendance sa, jsonb_each(sa.attendance_data) AS period
    WHERE sa.attendance_date BETWEEN v_from AND v_to
  ),
  fac_sess AS (
    SELECT s.ad, s.pid
    FROM sess s
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(s.pv -> 'assigned_faculty') = 'array'  THEN s.pv -> 'assigned_faculty'
        WHEN jsonb_typeof(s.pv -> 'assigned_faculty') = 'object' THEN jsonb_build_array(s.pv -> 'assigned_faculty')
        ELSE '[]'::jsonb
      END) AS af(el)
    WHERE lower(COALESCE(af.el ->> 'faculty_email', '')) = v_email
  )
  SELECT
    count(*)::int,
    count(*) FILTER (
      WHERE (SELECT count(*) FROM public.session_feedback f
             WHERE f.attendance_date = fs.ad AND f.period_id = fs.pid
               AND lower(f.faculty_email) = v_email) >= 3
    )::int,
    max(fs.ad)::timestamptz
  INTO v_assigned_marked, v_witnessed, v_last
  FROM fac_sess fs;

  -- "Track both": sessions this caller PERSONALLY marked (marker attribution).
  SELECT count(*)::int INTO v_personal_marked
  FROM public.student_attendance sa, jsonb_each(sa.attendance_data) AS period
  WHERE sa.attendance_date BETWEEN v_from AND v_to
    AND period.value->'marked_by_details'->>'marker_id' = v_uid::text;

  SELECT count(*)::int INTO v_pulses FROM public.scf_live_pulse lp
    WHERE lower(lp.faculty_email) = v_email AND lp.attendance_date BETWEEN v_from AND v_to;
  SELECT count(*)::int INTO v_lessons FROM public.class_session_lesson csl
    JOIN public.profiles lb ON lb.id = csl.linked_by
    WHERE lower(lb.email) = v_email AND csl.attendance_date BETWEEN v_from AND v_to;
  SELECT count(*)::int INTO v_notes FROM public.scf_ai_suggestions sg
    WHERE lower(sg.faculty_email) = v_email AND sg.domain = 'session_feedback'
      AND sg.generated_at::date BETWEEN v_from AND v_to;
  SELECT count(*)::int INTO v_verdicts FROM public.scf_ai_suggestions sg
    WHERE lower(sg.faculty_email) = v_email AND sg.domain = 'session_feedback'
      AND sg.human_verdict_at IS NOT NULL AND sg.human_verdict_at::date BETWEEN v_from AND v_to;
  SELECT count(*)::int INTO v_votes FROM public.scf_note_resolution_votes rv
    JOIN public.scf_ai_suggestions sg ON sg.id = rv.suggestion_id
    WHERE lower(sg.faculty_email) = v_email AND sg.domain = 'session_feedback'
      AND rv.created_at::date BETWEEN v_from AND v_to;

  -- CARRE / compliance practice signals (2026-07-25). Deterministic ACTS only,
  -- self-scoped like everything above — never a score, never ranked, and the
  -- Respect pillar is deliberately NOT represented here (human-observed only).
  SELECT count(*)::int INTO v_od_handled
  FROM public.leave_onduty_approvals a
  WHERE a.approver_id = v_uid
    AND a.status::text IN ('approved','rejected')
    AND a.action_taken_at IS NOT NULL
    AND (a.action_taken_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_from AND v_to;

  -- "Waiting on you" is a NOW-state (queue depth), independent of the window.
  SELECT count(*)::int INTO v_od_waiting
  FROM public.leave_onduty_approvals a
  WHERE a.approver_id = v_uid AND a.status::text = 'pending';

  SELECT count(*)::int INTO v_correctives_open
  FROM public.tracker_items i
  JOIN public.tracker_item_assignees ta ON ta.item_id = i.id
  WHERE ta.assignee_id = v_uid AND i.is_active
    AND i.compliance_status NOT IN ('compliant','na');

  SELECT count(DISTINCT s.cycle_id)::int INTO v_carre_scored
  FROM public.care_audit_scores s
  JOIN public.audit_cycles c ON c.id = s.cycle_id
  WHERE s.scorer_id = v_uid
    AND c.frameworks @> ARRAY['CARRE']::text[]
    AND s.created_at::date BETWEEN v_from AND v_to;

  v_last := GREATEST(
    v_last,
    (SELECT max(lp.issued_at) FROM public.scf_live_pulse lp WHERE lower(lp.faculty_email) = v_email),
    (SELECT max(sg.human_verdict_at) FROM public.scf_ai_suggestions sg WHERE lower(sg.faculty_email) = v_email)
  );

  RETURN jsonb_build_object(
    'window', jsonb_build_object('from', v_from, 'to', v_to),
    'subject_matched', true,
    'last_signal_at', v_last,
    'signals', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', t.signal_key, 'label', t.label, 'category', t.category,
          'unit', t.unit, 'attribution', t.attribution_mode,
          'value', v.value,
          'value_personal', v.value_personal,
          'action_route', t.action_route,
          'action_label', t.action_label
        ) ORDER BY t.sort_order
      )
      FROM public.work_signal_types t
      JOIN (VALUES
        ('sessions_marked',    v_assigned_marked, v_personal_marked),
        ('sessions_witnessed', v_witnessed,       NULL::int),
        ('pulses_run',         v_pulses,          NULL::int),
        ('lessons_linked',     v_lessons,         NULL::int),
        ('notes_received',     v_notes,           NULL::int),
        ('verdicts_given',     v_verdicts,        NULL::int),
        ('votes_received',     v_votes,           NULL::int),
        ('od_requests_handled',  v_od_handled,       NULL::int),
        ('od_requests_waiting',  v_od_waiting,       NULL::int),
        ('correctives_open',     v_correctives_open, NULL::int),
        ('carre_audits_scored',  v_carre_scored,     NULL::int)
      ) AS v(key, value, value_personal) ON v.key = t.signal_key
      WHERE t.is_active
    )
  );
END;
$function$;

-- Re-assert the lock (CREATE OR REPLACE resets nothing, but the CI secdef gate
-- treats a replaced function as new — assert explicitly in THIS migration).
REVOKE EXECUTE ON FUNCTION public.fn_work_signals_for(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_work_signals_for(date, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
