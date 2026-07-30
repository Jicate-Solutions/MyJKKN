-- ============================================================================
-- Re-explanation asks — ATTRIBUTION HARDENING (follow-up to 20260730001500)
-- 2026-07-30 · fixes two MEDIUM attribution defects found by deep review.
--
-- 20260730001500 IS ALREADY APPLIED TO PROD. That file is history and is NOT
-- edited here; every correction lands in this new migration.
--
-- ── DEFECT 1 (MEDIUM, under-counting) ──────────────────────────────────────
-- The per-session RPC resolved a session's lead with
--   DISTINCT ON (attendance_date, period_id, institution_id) ... course_code
-- which keeps ONE ARBITRARY course per session key. The course guard then
-- compared the ask against that single survivor, so in a cross-listed slot
-- (one lead, two course codes in the same period) every ask belonging to the
-- DISCARDED course was silently dropped. The chip and the card also disagreed,
-- because the work-signal EXISTS scanned all rows while the card collapsed.
--
-- ── DEFECT 2 (MEDIUM, over-counting) ───────────────────────────────────────
-- The NULL-safe guard `(c.course_code IS NULL OR f.course_code IS NULL OR =)`
-- let an ask attach to EVERY lead holding a feedback row on that
-- (date, period, institution) whenever either side's course_code was NULL. In
-- a co-taught slot one lead saw another lead's open loops as their own.
--
-- ── THE FIX: ONE SHARED ATTRIBUTION DEFINITION ─────────────────────────────
-- Both readers now select from ONE view, so they cannot diverge by
-- construction (the old duplication is what let them disagree). Rules:
--   • both sides know the course  → attribute on EXACT course equality, to
--     every lead teaching that course in the slot. A semijoin on the FULL key
--     (date, period, institution, course_code) — nothing is collapsed first,
--     so a cross-listed slot keeps both courses.
--   • either side's course is NULL → attribute ONLY when the slot has exactly
--     ONE distinct lead (unambiguous). Otherwise the ask is attributed to
--     NOBODY rather than to everybody.
--   • course known on both sides but DIFFERENT → no attribution. A genuine
--     mismatch is not resolved by guessing.
-- COVERAGE COST, stated plainly: an ask in a co-taught slot where either side
-- lacks a course_code now appears on NO ONE's card. That is deliberate —
-- showing one lead another lead's open loops is worse than showing nothing,
-- and the institution-level CARRE evidence lane still counts every ask.
--
-- ── ALSO IN THIS MIGRATION (all LOW, from the same review) ─────────────────
--   • per-session grain: GROUP BY now carries period_id AND institution_id, so
--     two periods of one course on one day, or one course code across two
--     institutions, no longer merge into a single mislabelled row.
--   • unbounded scalar totals (asked_30d, still_open_30d) returned alongside
--     the <=50 rows, so the card headline stops under-reporting past 50.
--   • ONE IST-anchored boundary shape for both readers:
--     (now() AT TIME ZONE 'Asia/Kolkata')::date - N. The chip stays 14 days and
--     the card 30 — that difference is deliberate and labelled on both
--     surfaces — but the arithmetic is now identical in kind, so neither drifts
--     a day at IST midnight. The view pre-computes the ask's IST calendar date.
--   • is_active set explicitly on the registry row (the engine filters on it).
--
-- ── DELIBERATELY NOT DONE: small-count suppression ─────────────────────────
-- Review suggested a k-anonymity floor (hide rows where asks < 3), mirroring
-- fn_scf_freetext_carry_counts. Ruled AGAINST, deliberately:
--   • a lead must be able to see that ONE ask exists in order to act on it —
--     suppressing it breaks the exact loop this surface was built to close,
--     and a single unanswered ask is the case most worth revisiting;
--   • the payload is a low-stakes REQUEST ("please go over that again"), not a
--     score, a complaint, or an evaluation of the lead — the freetext carry
--     floor guards learners' written CONCERNS, which is a different risk class;
--   • the outcome is the learner's OWN self-report, and the learner chose to
--     record it knowing the loop exists.
-- The card copy is corrected instead: it now claims "No names are stored or
-- shown", which is exactly true, rather than implying re-identification is
-- impossible in a 4-person elective.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) The single shared attribution definition.
--    A VIEW, not duplicated SQL, so the chip and the card cannot disagree.
--    Carries NO learner identity: student_id is not selected here at all, so
--    nothing downstream can leak it even by mistake.
--    Horizon: 90 IST days — comfortably wider than the widest reader window
--    (30d). Widening a reader past 90 days REQUIRES widening this first.
--
--    The DROP is defensive, not required today (this view is new, so the
--    CREATE OR REPLACE below would succeed on its own). It is here because
--    CREATE OR REPLACE VIEW carries the SAME restriction that just broke the
--    function below — it cannot change an existing relation's column list — so
--    without the drop, the first future migration that adds or reorders a
--    column here would fail at apply time, in production, at whatever hour the
--    apply is gated to. Nothing depends on this view (both readers are plpgsql
--    and resolve it at execution time), so dropping it is free.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_clarification_ask_attribution;

CREATE OR REPLACE VIEW public.v_clarification_ask_attribution AS
WITH horizon AS (
  SELECT ((now() AT TIME ZONE 'Asia/Kolkata')::date - 90) AS since
),
fb AS (
  -- Every session-feedback row that names a lead, inside the horizon.
  SELECT f.attendance_date          AS ad,
         f.period_id                AS pid,
         f.institution_id           AS inst,
         lower(f.faculty_email)     AS lead_email,
         f.course_code              AS cc,
         f.course_name              AS cn
  FROM public.session_feedback f
  CROSS JOIN horizon h
  WHERE f.attendance_date >= h.since
    AND f.faculty_email IS NOT NULL
    AND f.faculty_email <> ''
),
slot AS (
  -- One row per session key: how many distinct leads, and (when there is
  -- exactly one) who. Drives the unambiguous-single-lead fallback.
  SELECT fb.ad, fb.pid, fb.inst,
         count(DISTINCT fb.lead_email) AS lead_n,
         min(fb.lead_email)            AS only_lead,
         bool_or(fb.cc IS NOT NULL)    AS any_course,
         min(fb.cc)                    AS any_cc,
         min(fb.cn)                    AS any_cn
  FROM fb
  GROUP BY fb.ad, fb.pid, fb.inst
),
ask AS (
  SELECT c.id, c.institution_id, c.attendance_date, c.period_id,
         c.course_code, c.outcome,
         -- IST calendar date of the ask: both readers filter on this, so the
         -- day boundary is computed ONCE, here, for everyone.
         (c.asked_at AT TIME ZONE 'Asia/Kolkata')::date AS asked_on_ist
  FROM public.session_clarification_requests c
  CROSS JOIN horizon h
  WHERE c.attendance_date >= h.since
),
strict_match AS (
  -- Both sides know the course: exact equality on the FULL key. Nothing is
  -- collapsed beforehand, so a cross-listed slot keeps every course (defect 1).
  SELECT a.id                AS ask_id,
         fb.lead_email       AS lead_email,
         a.institution_id    AS institution_id,
         a.attendance_date   AS attendance_date,
         a.period_id         AS period_id,
         a.course_code       AS course_code,
         min(fb.cn)          AS course_name,
         a.outcome           AS outcome,
         a.asked_on_ist      AS asked_on_ist
  FROM ask a
  JOIN fb
    ON  fb.ad   = a.attendance_date
    AND fb.pid  = a.period_id
    AND fb.inst = a.institution_id
  WHERE a.course_code IS NOT NULL
    AND fb.cc       IS NOT NULL
    AND fb.cc = a.course_code
  GROUP BY a.id, fb.lead_email, a.institution_id, a.attendance_date,
           a.period_id, a.course_code, a.outcome, a.asked_on_ist
),
sole_lead AS (
  -- Either side's course is NULL: attribute ONLY to an unambiguous single
  -- lead, never to every lead in the slot (defect 2).
  SELECT a.id                              AS ask_id,
         s.only_lead                       AS lead_email,
         a.institution_id                  AS institution_id,
         a.attendance_date                 AS attendance_date,
         a.period_id                       AS period_id,
         COALESCE(a.course_code, s.any_cc) AS course_code,
         s.any_cn                          AS course_name,
         a.outcome                         AS outcome,
         a.asked_on_ist                    AS asked_on_ist
  FROM ask a
  JOIN slot s
    ON  s.ad   = a.attendance_date
    AND s.pid  = a.period_id
    AND s.inst = a.institution_id
  WHERE s.lead_n = 1
    AND (a.course_code IS NULL OR NOT s.any_course)
    AND NOT EXISTS (SELECT 1 FROM strict_match sm WHERE sm.ask_id = a.id)
)
SELECT * FROM strict_match
UNION ALL
SELECT * FROM sole_lead;

COMMENT ON VIEW public.v_clarification_ask_attribution IS
  'THE single definition of "whose session was this re-explanation ask about". Both fn_work_signals_for (clarifications_open) and fn_scf_clarification_sessions_for_me read it, so the chip and the card cannot disagree. One row per (ask, attributed lead); exact course equality when both sides know the course, unambiguous-single-lead only when either side is NULL, no attribution on a genuine course mismatch. Carries NO learner identity. 90-IST-day horizon — widen this before widening any reader. Internal: no role holds SELECT; only the SECURITY DEFINER readers reach it.';

-- Supabase default privileges GRANT on every new relation, VIEWS INCLUDED.
-- This view is internal plumbing for two SECURITY DEFINER functions (which run
-- as the owner and are unaffected), so strip every client role: no direct
-- reader, no accidental exposure of the per-ask grain it exposes internally.
REVOKE ALL ON public.v_clarification_ask_attribution FROM anon, PUBLIC;
REVOKE ALL ON public.v_clarification_ask_attribution FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2) fn_work_signals_for — body reproduced VERBATIM from 20260730001500 (the
--    latest definition; verified before copying). The ONLY change is the
--    clarifications_open block, which now reads the shared view instead of
--    carrying its own copy of the attribution rules. All 12 signal keys and
--    every other calculation are byte-identical.
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

  -- Re-explanation asks still open. A NOW-state queue depth like
  -- od_requests_waiting on a FIXED 14 IST days, deliberately NOT the caller's
  -- window: an open loop does not stop being open because someone narrowed a
  -- date filter. 'pending' = the learner has not reported back yet; it is never
  -- evidence that anyone refused or ignored the ask.
  -- Attribution comes from the SHARED view, which is the same one the card
  -- reads — the two can no longer disagree (hardening, 2026-07-30).
  SELECT count(*)::int INTO v_clarifications_open
  FROM public.v_clarification_ask_attribution a
  WHERE a.lead_email = v_email
    AND a.outcome    = 'pending'
    AND a.asked_on_ist >= ((now() AT TIME ZONE 'Asia/Kolkata')::date - 14);

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

REVOKE EXECUTE ON FUNCTION public.fn_work_signals_for(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_work_signals_for(date, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) fn_scf_clarification_sessions_for_me — per-SESSION grain restored
--    (period_id + institution_id in the GROUP BY), scalar 30-day totals added
--    so the card headline no longer under-reports past the 50-row cap, and
--    attribution delegated wholly to the shared view.
--
--    STILL COUNT-ONLY. The columns that leave this function are a date, a
--    session-slot key, a course label and seven integers. period_id is a
--    timetable slot identifier, NOT a person — it is returned so the card can
--    key rows per session and so two periods of one course on one day stop
--    merging. student_id is never selected anywhere in this chain.
--
--    DROP FIRST — REQUIRED, do not "simplify" this away. The applied version in
--    20260730001500 returns a DIFFERENT row type (this one adds period_id and
--    the two 30-day scalars), and CREATE OR REPLACE cannot change the row type
--    defined by a function's OUT parameters: Postgres refuses with 42P13
--    ("cannot change return type of existing function"). The drop is safe here:
--    no database object depends on this function (the card reaches it over
--    PostgREST, which is late-bound), the grants and COMMENT are re-asserted
--    immediately after the CREATE below, and inside the migration's transaction
--    the gap between DROP and CREATE is invisible to any client.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_scf_clarification_sessions_for_me();

CREATE OR REPLACE FUNCTION public.fn_scf_clarification_sessions_for_me()
 RETURNS TABLE(attendance_date date, period_id text, course_code text,
               course_name text, asks integer, still_open integer,
               re_explained integer, refused integer, unanswered integer,
               asked_30d integer, still_open_30d integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '8s'
AS $function$
DECLARE
  v_email  text;
  v_since  date := ((now() AT TIME ZONE 'Asia/Kolkata')::date - 30);
  v_asked  int  := 0;
  v_open   int  := 0;
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

  -- Unbounded 30-day totals — computed over EVERY attributed ask, not just the
  -- <=50 rows below, so the card headline is honest for a heavy teaching load.
  SELECT count(*)::int,
         count(*) FILTER (WHERE a.outcome = 'pending')::int
    INTO v_asked, v_open
  FROM public.v_clarification_ask_attribution a
  WHERE a.lead_email = v_email
    AND a.asked_on_ist >= v_since;

  RETURN QUERY
  SELECT g.ad, g.pid, g.cc, g.cn,
         g.n_asks, g.n_open, g.n_re, g.n_ref, g.n_un,
         v_asked, v_open
  FROM (
    SELECT a.attendance_date                                      AS ad,
           a.period_id                                            AS pid,
           COALESCE(a.course_code, '—')                           AS cc,
           max(a.course_name)                                     AS cn,
           count(*)::int                                          AS n_asks,
           count(*) FILTER (WHERE a.outcome = 'pending')::int      AS n_open,
           count(*) FILTER (WHERE a.outcome = 're_explained')::int AS n_re,
           count(*) FILTER (WHERE a.outcome = 'refused')::int      AS n_ref,
           count(*) FILTER (WHERE a.outcome = 'unanswered')::int   AS n_un
    FROM public.v_clarification_ask_attribution a
    WHERE a.lead_email = v_email
      AND a.asked_on_ist >= v_since
    -- institution_id is grouped but not returned: it keeps one course code
    -- taught in two institutions from collapsing into a single row, without
    -- widening the surface the card renders.
    GROUP BY a.attendance_date, a.period_id, a.institution_id,
             COALESCE(a.course_code, '—')
  ) g
  ORDER BY g.ad DESC, g.cc, g.pid
  LIMIT 50;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_clarification_sessions_for_me() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_clarification_sessions_for_me() TO authenticated;

COMMENT ON FUNCTION public.fn_scf_clarification_sessions_for_me() IS
  'Self-scoped, COUNT-ONLY per-session view of re-explanation asks for the calling session lead (last 30 IST days, max 50 rows, plus unbounded 30-day scalar totals). Attribution comes entirely from v_clarification_ask_attribution, the SAME view the clarifications_open work signal reads, so the chip and the card cannot disagree. Returns a date, a timetable slot key, a course label and seven counts — never student_id, never a per-ask row, never a timestamp finer than the date. still_open counts LEARNER-SELF-REPORTED pending outcomes: an open loop, not a fault.';

-- ---------------------------------------------------------------------------
-- 4) Registry row — is_active asserted explicitly on BOTH paths. The engine
--    filters `WHERE t.is_active`, so relying on the column default would make
--    the chip's visibility depend on something this migration never states.
-- ---------------------------------------------------------------------------
INSERT INTO public.work_signal_types
  (signal_key, label, description, category, attribution_mode, unit, provider,
   sort_order, action_route, action_label, is_active)
VALUES
  ('clarifications_open', 'Re-explanation asks open',
   'Learners in your sessions who asked for a re-explanation in the last 14 days and have not yet reported back what happened. An open loop, not a fault: the learner self-reports the outcome, so this number falls when they answer as well as when you revisit the topic.',
   'feedback', 'single', 'count', 'carre', 94,
   '/academic/session-feedback/faculty', 'Open session feedback', true)
ON CONFLICT (signal_key) DO UPDATE SET
  label=EXCLUDED.label, description=EXCLUDED.description, category=EXCLUDED.category,
  attribution_mode=EXCLUDED.attribution_mode, unit=EXCLUDED.unit, provider=EXCLUDED.provider,
  sort_order=EXCLUDED.sort_order, action_route=EXCLUDED.action_route,
  action_label=EXCLUDED.action_label, is_active=true, updated_at=now();

NOTIFY pgrst, 'reload schema';
