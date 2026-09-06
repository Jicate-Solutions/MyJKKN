-- ============================================================================
-- WORK-SIGNALS SPINE — Phase 0 (foundation, ships DARK: no surface changes)
-- ============================================================================
-- One canonical definition + one engine for a person's work-signals, so every
-- screen reads the SAME truth. Provider pattern: existing systems stay whole
-- and register their signals here. Decisions locked 2026-07-17:
--   • provider pattern (not a physical merge)
--   • per-screen time window (engine takes a date range)
--   • gentle empty state (values are honest zeros; the UI frames them)
--   • ranking is case-by-case (this self-scoped engine NEVER ranks; a separate
--     leadership-gated aggregate — later phase — is the only place comparison
--     is allowed)
--   • "track both" attribution: marking carries assigned AND personal numbers
-- ============================================================================

-- 1) REGISTRY ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_signal_types (
  signal_key       text PRIMARY KEY,
  label            text NOT NULL,
  description      text NOT NULL,
  category         text NOT NULL,            -- presence | feedback | improvement | coverage
  attribution_mode text NOT NULL DEFAULT 'single',  -- single | dual
  unit             text NOT NULL DEFAULT 'count',    -- count | ratio
  provider         text NOT NULL DEFAULT 'scf',      -- scf | ai_pulse | work_pulse | pde
  sort_order       int  NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.work_signal_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_signal_types_read ON public.work_signal_types;
CREATE POLICY work_signal_types_read ON public.work_signal_types
  FOR SELECT USING (is_active = true);  -- catalog is readable by any authenticated user

INSERT INTO public.work_signal_types
  (signal_key, label, description, category, attribution_mode, unit, provider, sort_order) VALUES
  ('sessions_marked',    'Sessions marked',    'Class sessions the facilitator is assigned to that had attendance marked (assigned) and, separately, sessions they personally marked (personal).', 'presence',    'dual',   'count', 'scf', 10),
  ('sessions_witnessed', 'Sessions witnessed', 'Marked sessions that received at least 3 student feedback confirmations.',                                    'feedback',    'single', 'count', 'scf', 20),
  ('pulses_run',         'Pulses run',         'Live feedback pulses the facilitator opened in class.',                                                      'feedback',    'single', 'count', 'scf', 30),
  ('lessons_linked',     'Lessons linked',     'Class sessions the facilitator linked to a lesson in the lesson spine.',                                     'improvement', 'single', 'count', 'scf', 40),
  ('notes_received',     'Notes received',     'AI improvement suggestions generated for the facilitator from session feedback.',                            'improvement', 'single', 'count', 'scf', 50),
  ('verdicts_given',     'Verdicts given',     'Suggestions the facilitator reviewed and gave a human verdict on.',                                          'improvement', 'single', 'count', 'scf', 60),
  ('votes_received',     'Votes received',     'Student Better/Same/Worse responses received on the facilitator''s loop notes (volume only).',              'feedback',    'single', 'count', 'scf', 70),
  ('marks_coverage',     'Marks coverage',     'Planned COE courses with internal marks entered vs expected this cycle. Course completeness, not a personal act.', 'coverage', 'single', 'ratio', 'scf', 80)
ON CONFLICT (signal_key) DO UPDATE SET
  label=EXCLUDED.label, description=EXCLUDED.description, category=EXCLUDED.category,
  attribution_mode=EXCLUDED.attribution_mode, unit=EXCLUDED.unit, provider=EXCLUDED.provider,
  sort_order=EXCLUDED.sort_order, updated_at=now();

REVOKE ALL ON public.work_signal_types FROM anon;
GRANT SELECT ON public.work_signal_types TO authenticated, service_role;

-- 2) ENGINE -----------------------------------------------------------------
-- Self-scoped canonical work-signals for the CALLER, over an arbitrary date
-- range (per-screen window). Reproduces fn_scf_my_pulse's 7 signals exactly,
-- and adds the "personally marked" number so marking carries BOTH attributions.
-- NEVER ranks or compares — presence/activity only. Cross-person + leadership
-- aggregation is a separate, permission-gated RPC (later phase).
CREATE OR REPLACE FUNCTION public.fn_work_signals_for(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
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
    -- Cannot key any signal to this caller. Surface an explicit unmatched flag
    -- (never a silent zero that reads like "did nothing").
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
          'value_personal', v.value_personal
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

REVOKE EXECUTE ON FUNCTION public.fn_work_signals_for(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_work_signals_for(date, date) TO authenticated, service_role;
