-- =============================================================================
-- 20260816020000_work_signal_marked_same_day.sql
-- HOW MANY CLASSES WERE MARKED THE SAME DAY — the one instrument that can tell
-- whether a change to the marking screen makes marking LATER.
--
-- FILE ONLY / NOT APPLIED — Director-gated. Ships DELIBERATELY BEFORE the
-- lesson gate it is meant to measure: a before/after reading needs the BEFORE.
--
-- THE PROBLEM. `fn_work_signals_for` derives every marking number from
-- `sa.attendance_date` alone, so a class marked twenty-one days late is
-- indistinguishable from one marked in the room while it was happening. Nothing
-- anywhere in the estate currently measures the LAG between the class and the
-- act of marking it, which means a gate that quietly pushes marking to the
-- weekend would land, take effect, and leave no trace.
--
-- WHY NOT created_at (this is the trap, and it is a convincing one):
--   `student_attendance` holds one ROW PER DAY PER SECTION and packs the day's
--   periods into the `attendance_data` jsonb — measured 2026-08-08, ~2.74
--   periods per row. `created_at` is stamped when the FIRST period of that day
--   was inserted; every later period arrives by UPDATE and inherits it. A period
--   marked three weeks late therefore carries the punctual timestamp of period
--   one. `updated_at` is no better: it is client-supplied, and a live row was
--   observed where `updated_at` PRECEDES `created_at`.
--   The repo already knew this — 20260722160000_att_reconcile_v2 line 30 says
--   the marking timestamp is `marked_at` "(NOT the row created_at)".
--
-- THE CORRECT SOURCE is per-period: `marked_by_details.marked_at`, the natural
-- partner of `marked_by_details.marker_id` that this function ALREADY reads to
-- compute v_personal_marked. Same object, same period, same write.
--
-- WHAT THIS FILE CHANGES — four parts, all four load-bearing:
--   1. DECLARE v_personal_same_day.
--   2. A counting block placed immediately after the v_personal_marked SELECT
--      and MIRRORING its predicate exactly (same table, same window, same
--      marker test) so the two numbers can never drift apart. The only addition
--      is the day comparison.
--   3. One row in the inline VALUES list.
--   4. One row in the work_signal_types registry.
--   Parts 3 and 4 MUST land together — see the emitter note below.
--
-- 🔴 THE EMITTER IS AN INNER JOIN, AND IT IS ALREADY BITING. Signals are
--    emitted by joining work_signal_types against the inline VALUES list, so a
--    key registered WITHOUT a VALUES row is silently dropped — no error, no log,
--    no chip. `marks_coverage` has been active in the registry since
--    20260717170852 and has never appeared in VALUES: it has been dark its whole
--    life, and the existing battery could not see it because that battery
--    asserts a hardcoded key list. Verified live 2026-08-08: 14 active registry
--    rows, 13 VALUES rows. This file adds BOTH halves for its own key, and
--    __tests__/work-signals/registry-values-parity.test.ts now fails on any key
--    registered without an emitter — with marks_coverage pinned as the one
--    known, documented gap so a future fix must shrink that list deliberately.
--
-- BODY PROVENANCE. DDL reaches this database through the Management API and the
-- migration ledger does not always carry it, so six files define this function
-- and the newest file is not automatically what is running. The body below was
-- taken VERBATIM from `pg_get_functiondef` on production 2026-08-08 and was
-- verified byte-identical (whitespace-normalised, 7027 chars both sides) to
-- 20260731190000. Only the four parts above differ.
--
-- 🕐 `AT TIME ZONE 'Asia/Kolkata'` IS LOAD-BEARING, NOT DECORATION. Measured on
--    production 2026-08-08 over the trailing 30 days: IST reads 6,651 same-day
--    periods, UTC reads 6,673 — they DISAGREE on 22 periods. (An earlier reading
--    found them equal; that was a coincidence of marking hours, and it has
--    already stopped being true.) `attendance_date` is a calendar date in IST;
--    comparing it against a UTC-truncated instant credits a class marked at
--    02:30 IST to the previous day.
--
-- 🛡️ THE CAST IS GUARDED, DELIBERATELY. `marked_at` is client-written text
--    inside a jsonb blob. Across ALL 31,037 attributable periods on production
--    (2026-08-08) there are zero empty strings and zero non-ISO values, so the
--    guard changes no number today — but 1,028 of those periods carry a
--    marker_id with NO marked_at at all, which proves the field is not written
--    by every path. A single malformed value would make the cast RAISE, and
--    because WorkSignalsService resolves any error to null and the card renders
--    nothing on null, the entire My Pulse card would vanish estate-wide with no
--    error shown to anyone. A regex-guarded CASE (not a bare AND — Postgres does
--    not guarantee WHERE-clause evaluation order, so a sibling AND would not
--    reliably run before the cast) makes that failure impossible. It can only
--    ever REMOVE rows, so same_day <= personal_marked still holds by construction.
--
-- 🔢 WHAT THE NUMBER DOES NOT SAY. 526 of 8,896 periods in the trailing 30 days
--    (5.9%) carry no `marked_by_details` at all, spanning 2025-07-09 to
--    2026-08-07 — an ACTIVE second write path, not legacy residue. Those periods
--    are already excluded from v_personal_marked, so the two counters stay
--    internally consistent, but they are UNKNOWN, not late. The label counts a
--    positive act and makes no claim about the remainder; the description says
--    so in as many words. Nothing here may be read as an accusation.
--
-- ⚠️ TWO LIVE DEFINITIONS OF "ON TIME" NOW EXIST. `fn_att_reconcile_propose`
--    counts on-time as within 15 minutes of period start; this counts the
--    calendar day. A person can be green here and late there. Flagged for a
--    deliberate decision — NOT resolved in this file.
--
-- ⚠️ READ THE NEW CHIP AGAINST "you: N", NOT AGAINST THE BIG NUMBER.
--    `sessions_marked`'s headline is the ASSIGNED count (your classes, marked by
--    anyone); this new chip counts what the caller PERSONALLY marked. Side by
--    side the new number will look smaller for reasons that have nothing to do
--    with timeliness. Its true partner is the small "you:" number underneath.
--
-- SELF-SCOPED, NEVER RANKED. Like every signal in this engine: the caller's own
-- number only, no comparison, no score. It is an instrument, not an evaluation.
-- =============================================================================

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
  v_personal_same_day int := 0;
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
  v_acts_recorded     int := 0;
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

  -- Of those, how many were marked ON THE DAY OF THE CLASS (2026-08-08).
  -- The predicate above is MIRRORED EXACTLY — same table, same window, same
  -- marker test — so this can only ever be a subset of v_personal_marked and the
  -- two can never disagree about who marked what. The day comparison is the ONLY
  -- addition, and it is per-period: `marked_by_details.marked_at` is stamped for
  -- each period individually, unlike the row's created_at which belongs to
  -- whichever period of that day happened to be inserted first.
  --
  -- The CASE (not a bare AND) is deliberate: Postgres may evaluate WHERE
  -- conjuncts in any order, so only a CASE guarantees the format check runs
  -- BEFORE the cast. A value that is absent, null, or not ISO-dated is simply
  -- not counted — never an error, and never an accusation of lateness.
  SELECT count(*)::int INTO v_personal_same_day
  FROM public.student_attendance sa, jsonb_each(sa.attendance_data) AS period
  WHERE sa.attendance_date BETWEEN v_from AND v_to
    AND period.value->'marked_by_details'->>'marker_id' = v_uid::text
    AND CASE
          WHEN period.value->'marked_by_details'->>'marked_at' ~ '^\d{4}-\d{2}-\d{2}'
          THEN ((period.value->'marked_by_details'->>'marked_at')::timestamptz
                  AT TIME ZONE 'Asia/Kolkata')::date = sa.attendance_date
          ELSE false
        END;

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

  -- Acts recorded on re-explanation asks (two-sided close, 2026-07-31). An
  -- ACT, not a score: counts the caller's own "I acted on this" records in the
  -- window. CONTEXT, NEVER EVIDENCE — this number feeds no evaluation.
  SELECT count(*)::int INTO v_acts_recorded
  FROM public.clarification_acts ca
  WHERE ca.lead_email = v_email
    AND (ca.acted_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_from AND v_to;

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
        ('sessions_marked_same_day', v_personal_same_day, NULL::int),
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
        ('clarifications_open',  v_clarifications_open, NULL::int),
        ('clarification_acts_recorded', v_acts_recorded, NULL::int)
      ) AS v(key, value, value_personal) ON v.key = t.signal_key
      WHERE t.is_active
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_work_signals_for(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_work_signals_for(date, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Registry row. MUST land with the VALUES row above — a registered key with no
-- VALUES row is dropped by the emitter's inner join and goes dark (see the
-- marks_coverage note in the header).
--
-- sort_order 11 places this chip immediately after sessions_marked (10) so it is
-- read next to the "you: N" number it is a subset of, never next to the larger
-- assigned count. attribution_mode 'single' because there is no assigned
-- equivalent — nobody is assigned to mark something punctually on someone
-- else's behalf.
-- ---------------------------------------------------------------------------
INSERT INTO public.work_signal_types
  (signal_key, label, description, category, attribution_mode, unit, provider,
   sort_order, action_route, action_label, is_active)
VALUES
  ('sessions_marked_same_day', 'Marked same day',
   'Of the sessions you personally marked in this window, how many you marked on the day of the class itself (IST). It counts a positive act and says NOTHING about the rest: a session marked without a recorded marking time is UNKNOWN, not late, and is simply not counted here. Self-scoped, never ranked, never compared — this exists so the effect of changes to the marking screen on how promptly marking happens can be seen at all.',
   'presence', 'single', 'count', 'scf', 11,
   '/academic/attendance/mark', 'Mark a session', true)
ON CONFLICT (signal_key) DO UPDATE SET
  label=EXCLUDED.label, description=EXCLUDED.description, category=EXCLUDED.category,
  attribution_mode=EXCLUDED.attribution_mode, unit=EXCLUDED.unit, provider=EXCLUDED.provider,
  sort_order=EXCLUDED.sort_order, action_route=EXCLUDED.action_route,
  action_label=EXCLUDED.action_label, is_active=true, updated_at=now();

NOTIFY pgrst, 'reload schema';
