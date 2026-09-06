-- =====================================================================
-- Migration: work-signals deep-link empty states (Phase 1.1)
-- Date: 2026-07-18
-- =====================================================================
-- Director decision (2026-07-18): every ZERO work-signal — and the whole-card
-- empty state — in <WorkSignalsCard> becomes a "start here" link to the page
-- where that work begins ("ALL zeros link somewhere", even downstream signals
-- point to the closest relevant page).
--
-- This migration:
--   1) Adds action_route (+ optional action_label) to the work_signal_types
--      registry (the 8-row source of truth).
--   2) Seeds each of the 8 signals with its route + a short CTA label.
--   3) Patches fn_work_signals_for so each signal's jsonb carries action_route /
--      action_label — the card deep-links with NO second fetch.
--
-- Anon stays locked out of the registry + RPC (unchanged from Phase 0).

-- ---------------------------------------------------------------------
-- 1) Registry columns
-- ---------------------------------------------------------------------
ALTER TABLE public.work_signal_types
  ADD COLUMN IF NOT EXISTS action_route TEXT,
  ADD COLUMN IF NOT EXISTS action_label TEXT;

COMMENT ON COLUMN public.work_signal_types.action_route IS
  'Route the WorkSignalsCard deep-links a zero/empty signal to ("start here"). Nullable = no link. Added 2026-07-18 (Phase 1.1).';
COMMENT ON COLUMN public.work_signal_types.action_label IS
  'Optional short CTA label for the deep-link (card falls back to "Start here"). Added 2026-07-18 (Phase 1.1).';

-- ---------------------------------------------------------------------
-- 2) Seed routes (director-specified 2026-07-18). Routes verified to exist
--    on jicate/main: app/(routes)/academic/attendance/mark/page.tsx and
--    app/(routes)/academic/session-feedback/faculty/page.tsx. There is no
--    standalone marks page (only the marks-coverage API), so marks_coverage
--    points at the session-feedback faculty page where that widget renders.
-- ---------------------------------------------------------------------
UPDATE public.work_signal_types SET action_route='/academic/attendance/mark',          action_label='Mark a session'  WHERE signal_key='sessions_marked';
UPDATE public.work_signal_types SET action_route='/academic/attendance/mark',          action_label='Link a lesson'   WHERE signal_key='lessons_linked';
UPDATE public.work_signal_types SET action_route='/academic/session-feedback/faculty', action_label='Run a pulse'     WHERE signal_key='pulses_run';
UPDATE public.work_signal_types SET action_route='/academic/session-feedback/faculty', action_label='Review AI notes' WHERE signal_key='verdicts_given';
UPDATE public.work_signal_types SET action_route='/academic/session-feedback/faculty', action_label='Give feedback'   WHERE signal_key='sessions_witnessed';
UPDATE public.work_signal_types SET action_route='/academic/session-feedback/faculty', action_label='Review notes'    WHERE signal_key='notes_received';
UPDATE public.work_signal_types SET action_route='/academic/session-feedback/faculty', action_label='Open feedback'   WHERE signal_key='votes_received';
UPDATE public.work_signal_types SET action_route='/academic/session-feedback/faculty', action_label='Open feedback'   WHERE signal_key='marks_coverage';

-- ---------------------------------------------------------------------
-- 3) fn_work_signals_for — emit action_route / action_label per signal
--    (identical to Phase 0 body except the two new jsonb keys in the final
--     jsonb_agg). Self-scoped (auth.uid()->email), SECURITY DEFINER, anon
--     REVOKE'd, 20s statement timeout — all unchanged.
-- ---------------------------------------------------------------------
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
        ('votes_received',     v_votes,           NULL::int)
      ) AS v(key, value, value_personal) ON v.key = t.signal_key
      WHERE t.is_active
    )
  );
END;
$function$;

-- Anon lockdown re-asserted (Supabase default-grants anon EXECUTE on replace).
REVOKE EXECUTE ON FUNCTION public.fn_work_signals_for(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_work_signals_for(date, date) TO authenticated;
