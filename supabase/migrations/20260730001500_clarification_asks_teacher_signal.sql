-- ============================================================================
-- Re-explanation asks become VISIBLE to the Senior Learner who taught (ADDITIVE)
-- 2026-07-30
--
-- THE GAP THIS CLOSES
-- `session_clarification_requests` (20260725133000, Lane C) has been recording
-- "I asked for a re-explanation of this session" since 2026-07-25 and is the
-- ONLY trace of a learner's ask in the platform. No surface anywhere reads it
-- for the person who taught the session, so the one human who could act on an
-- open ask never learns it exists. This migration adds the read side.
--
-- WHAT 'pending' MEANS — READ THIS BEFORE WRITING ANY COPY ON TOP OF IT
-- The outcome column is LEARNER-SELF-REPORTED (fn_clarification_outcome: the
-- same learner who asked reports what happened). 'pending' therefore means
-- "the learner has not yet reported back", NOT "the ask was ignored" and NOT
-- "the session lead refused". A pending row is an OPEN LOOP, never a fault, and
-- nothing built on this signal may present it as one. Acts-not-scores stands:
-- this is a count of open loops, never a score, never ranked, never compared.
--
-- ATTRIBUTION (there is no faculty column on the asks table)
-- A session's lead is resolved exactly the way the incumbent engine already
-- does it (fn_work_signals_for's own "witnessed" calc, and
-- fn_scf_freetext_carry_counts): session_feedback rows carry the session key
-- (attendance_date, period_id) plus faculty_email, and the caller is keyed by
-- lower(profiles.email) = lower(session_feedback.faculty_email). faculty_id
-- exists on session_feedback but holds a STAFF id, not profiles.id, so email is
-- the platform's join key here — session_feedback's own column comment says so.
-- Narrowed further by institution_id, and by course_code when BOTH sides know
-- it (NULL-safe), so an ask in one session is not attributed to whoever led a
-- different course in the same period slot.
--
-- CONTENTS
--   (a) fn_work_signals_for — REPLACED. Body reproduced verbatim from
--       20260725093000_carre_compliance_work_signals.sql (verified the LATEST
--       definition on jicate/main: three migrations define this function —
--       20260717170852, work_signal_types_action_route_deeplinks.sql (committed
--       2026-07-18) and 20260725093000 (2026-07-25) — and 20260725093000 is the
--       newest, so no later work is reverted here). ONE signal added; all 11
--       existing signals byte-identical.
--   (b) fn_scf_clarification_sessions_for_me — NEW. Per-session COUNTS ONLY.
--   (c) Two indexes serving the two new access paths.
--
-- PRIVACY STANCE: count-only, everywhere. Neither function returns student_id,
-- a name, or any timestamp finer than the date. A session lead learns THAT the
-- room asked and how the room reported back — never who asked.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (c) Indexes — added first so the functions below are planned against them.
--     The table ships with (student_id, attendance_date) and
--     (institution_id, attendance_date); neither serves either new access path.
-- ---------------------------------------------------------------------------

-- Serves the work-signal count: outcome = 'pending' AND asked_at > now() - 14d.
CREATE INDEX IF NOT EXISTS idx_session_clarification_outcome_asked
  ON public.session_clarification_requests (outcome, asked_at);

-- Serves the session-key join both new readers make against session_feedback.
CREATE INDEX IF NOT EXISTS idx_session_clarification_session_key
  ON public.session_clarification_requests (attendance_date, period_id);

-- ---------------------------------------------------------------------------
-- (a.1) Registry row — the shared <WorkSignalsCard> renders label + route
--       straight from this table (no hardcoded label map in the component), so
--       the chip appears on every work-signals surface with NO UI change.
-- ---------------------------------------------------------------------------
INSERT INTO public.work_signal_types
  (signal_key, label, description, category, attribution_mode, unit, provider, sort_order, action_route, action_label)
VALUES
  ('clarifications_open', 'Re-explanation asks open',
   'Learners in your sessions who asked for a re-explanation in the last 14 days and have not yet reported back what happened. An open loop, not a fault: the learner self-reports the outcome, so this number falls when they answer as well as when you revisit the topic.',
   'feedback', 'single', 'count', 'carre', 94,
   '/academic/session-feedback/faculty', 'Open session feedback')
ON CONFLICT (signal_key) DO UPDATE SET
  label=EXCLUDED.label, description=EXCLUDED.description, category=EXCLUDED.category,
  attribution_mode=EXCLUDED.attribution_mode, unit=EXCLUDED.unit, provider=EXCLUDED.provider,
  sort_order=EXCLUDED.sort_order, action_route=EXCLUDED.action_route,
  action_label=EXCLUDED.action_label, updated_at=now();

-- ---------------------------------------------------------------------------
-- (a.2) fn_work_signals_for — verbatim 20260725093000 body + ONE signal.
--       The ONLY edits vs that file: v_clarifications_open declaration, its
--       SELECT block, and its row in the final VALUES list. Everything else,
--       including all 11 existing signal keys, is unchanged.
-- ---------------------------------------------------------------------------
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
  v_clarifications_open int := 0;
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

  -- Re-explanation asks still open (2026-07-30). Like od_requests_waiting this
  -- is a NOW-state queue depth on a FIXED 14-day lookback, deliberately NOT the
  -- caller's window: an open loop does not stop being open because someone
  -- narrowed a date filter. 'pending' = the learner has not reported back yet;
  -- it is never evidence that anyone refused or ignored the ask.
  SELECT count(*)::int INTO v_clarifications_open
  FROM public.session_clarification_requests c
  WHERE c.outcome = 'pending'
    AND c.asked_at > now() - interval '14 days'
    AND EXISTS (
      SELECT 1 FROM public.session_feedback f
      WHERE f.attendance_date = c.attendance_date
        AND f.period_id       = c.period_id
        AND f.institution_id  = c.institution_id
        AND lower(f.faculty_email) = v_email
        AND (c.course_code IS NULL OR f.course_code IS NULL
             OR c.course_code = f.course_code)
    );

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
        ('carre_audits_scored',  v_carre_scored,     NULL::int),
        ('clarifications_open',  v_clarifications_open, NULL::int)
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

-- ---------------------------------------------------------------------------
-- (b) fn_scf_clarification_sessions_for_me — the per-session detail behind the
--     chip, for the CALLING session lead only. COUNT-ONLY by construction:
--     the only columns that leave this function are a date, a course label and
--     five integers. student_id is never selected, asked_at/outcome_at never
--     leave (no timestamp finer than the date), and there is no per-ask row.
--
--     Ambiguity guard: every output column name (attendance_date, course_code,
--     course_name) also names a real column on the tables read below, and in
--     PL/pgSQL a RETURNS TABLE column shadows them. The whole result is
--     therefore built in an aliased subquery whose output names cannot collide,
--     and the outer SELECT touches only that alias.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_clarification_sessions_for_me()
 RETURNS TABLE(attendance_date date, course_code text, course_name text,
               asks integer, still_open integer, re_explained integer,
               refused integer, unanswered integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '8s'
AS $function$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_clarification_sessions_for_me: not authenticated';
  END IF;

  SELECT lower(p.email) INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  -- No email = nothing to key on. Return an empty set, never an error: this
  -- feeds a decorative card that must simply not render.
  IF v_email IS NULL OR v_email = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT g.ad, g.cc, g.cn, g.n_asks, g.n_open, g.n_re, g.n_ref, g.n_un
  FROM (
    SELECT c.attendance_date                                        AS ad,
           COALESCE(m.cc, '—')                                      AS cc,
           max(m.cn)                                                AS cn,
           count(*)::int                                            AS n_asks,
           count(*) FILTER (WHERE c.outcome = 'pending')::int        AS n_open,
           count(*) FILTER (WHERE c.outcome = 're_explained')::int   AS n_re,
           count(*) FILTER (WHERE c.outcome = 'refused')::int        AS n_ref,
           count(*) FILTER (WHERE c.outcome = 'unanswered')::int     AS n_un
    FROM public.session_clarification_requests c
    JOIN (
      -- Exactly ONE row per session the caller led, so a session carrying
      -- several feedback rows can never multiply the ask counts below.
      SELECT DISTINCT ON (f.attendance_date, f.period_id, f.institution_id)
             f.attendance_date AS ad,
             f.period_id       AS pid,
             f.institution_id  AS inst,
             f.course_code     AS cc,
             f.course_name     AS cn
      FROM public.session_feedback f
      WHERE lower(f.faculty_email) = v_email
        AND f.attendance_date >= (current_date - 30)
      ORDER BY f.attendance_date, f.period_id, f.institution_id,
               f.course_code NULLS LAST, f.course_name NULLS LAST
    ) m
      ON  m.ad   = c.attendance_date
      AND m.pid  = c.period_id
      AND m.inst = c.institution_id
      -- NULL-safe course guard: narrows attribution when both sides know the
      -- course, never drops a row merely because one side does not.
      AND (c.course_code IS NULL OR m.cc IS NULL OR c.course_code = m.cc)
    WHERE c.asked_at >= now() - interval '30 days'
    GROUP BY c.attendance_date, COALESCE(m.cc, '—')
  ) g
  ORDER BY g.ad DESC, g.cc
  LIMIT 50;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_clarification_sessions_for_me() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_clarification_sessions_for_me() TO authenticated;

COMMENT ON FUNCTION public.fn_scf_clarification_sessions_for_me() IS
  'Self-scoped, COUNT-ONLY per-session view of re-explanation asks for the calling session lead (last 30 days, max 50 rows). Attribution: lower(profiles.email) = lower(session_feedback.faculty_email) on the (attendance_date, period_id, institution_id) session key, narrowed by course_code when both sides know it. Returns a date, a course label and five counts — never student_id, never a per-ask row, never a timestamp finer than the date. still_open counts LEARNER-SELF-REPORTED pending outcomes: an open loop, not a fault.';

NOTIFY pgrst, 'reload schema';
