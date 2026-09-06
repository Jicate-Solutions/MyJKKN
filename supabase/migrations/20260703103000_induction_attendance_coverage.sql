-- 2026-07-03: Attendance-coverage read RPC for the induction coordinators' nudge.
-- Why: the live "Fresher Induction 2026" reached day 9 with ZERO attendance marks
-- while completion requires >=75% attendance — so every fresher was on track to
-- fail completion by construction. The sessions page needs a per-day
-- "past sessions vs fully-marked sessions" summary so coordinators see exactly
-- which past days still need back-marking (the Day-attendance bulk dialog makes
-- each day a one-minute pass).
-- Read-only + additive. Access gate mirrors fn_induction_day_roster
-- (super/admin OR induction.view+institution OR per-event coordinator).
--
-- v2 (same day, deep-review consensus fixes):
--   * "marked" was EXISTS >=1 row — 1 of 435 learners marked would hide the day
--     and fake completeness. Now a session counts as marked only when EVERY
--     rostered learner has an attendance row (marked >= roster; threshold-free —
--     absentees get rows too, so a fully-marked session covers its whole roster).
--   * "past" now gates on end_at (a session mid-run can't be fully marked yet).
--   * Row-missing vs NULL-institution split from the auth failure, and both
--     failure branches raise the SAME generic message (no existence oracle).
-- v3 (deep-review round 3):
--   * "marked" is now bounded to CURRENT roster membership — a stale attendance
--     row (learner later batch-moved or unenrolled) could otherwise push
--     marked >= roster while a rostered fresher stays unmarked.
--   * Rebutted with schema evidence (no code change): end_at is NOT NULL
--     (information_schema: is_nullable=NO, 0 null rows) so the NULL-end_at
--     "never past" edge cannot occur; induction_enrollment has NO status
--     column, and fn_induction_day_roster's eligibility is the same raw
--     (event_id, batch-match) predicate used for roster here — not inflated.

CREATE OR REPLACE FUNCTION public.fn_induction_attendance_coverage(p_event_id uuid)
RETURNS TABLE(day_number integer, past_sessions integer, marked_sessions integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  -- CONTRACT: every RAISE in this function is an authorization denial — the
  -- client classifies SQLSTATE P0001 from this RPC as "gate denied" (hide the
  -- banner) vs anything else as "coverage unavailable". Keep it that way.
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  -- One generic message for not-found / NULL-institution / gate-denied: a
  -- distinct "not an induction event" would let any authenticated caller probe
  -- which UUIDs are induction events (cross-tenant existence oracle).
  IF NOT FOUND OR v_inst IS NULL THEN
    RAISE EXCEPTION 'fn_induction_attendance_coverage: not authorized';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_attendance_coverage: not authorized';
  END IF;

  RETURN QUERY
  -- day_number is nullable (NULL = the "Unscheduled" bucket the UI shows as day 0).
  -- roster = enrolled learners the session applies to (combined batch_id IS NULL
  -- or exact batch match) — same eligibility rule as fn_induction_day_roster.
  -- roster=0 sessions count as marked (nothing to mark; keeps empty programs quiet).
  -- Roster deliberately binds to CURRENT enrollment with no enrolled_at bound:
  -- fn_induction_recompute_completion counts ALL batch sessions against a
  -- learner regardless of when they enrolled, so a late enrollee with blank
  -- past days genuinely fails completion — a back-marked day REOPENING for
  -- them is the banner agreeing with the completion rule (coordinator should
  -- mark their pre-enrollment days, typically Excused), not a bug.
  SELECT t.day_number::int,
         (count(*) FILTER (WHERE t.is_past))::int AS past_sessions,
         (count(*) FILTER (WHERE t.is_past AND t.marked >= t.roster))::int AS marked_sessions
  FROM (
    SELECT s.day_number,
           -- end_at is timestamptz NOT NULL (verified via information_schema on
           -- prod 2026-07-03: data_type='timestamp with time zone', is_nullable
           -- ='NO', 0 null rows) — no tz-mismatch or NULL-never-past edge here.
           (s.end_at < now()) AS is_past,
           -- bounded to current roster membership: stale rows from learners who
           -- were batch-moved/unenrolled after marking must not count toward
           -- "fully marked" (they could mask a still-unmarked rostered fresher)
           (SELECT count(DISTINCT a.learner_id)
            FROM public.event_session_attendance a
            WHERE a.session_id = s.id
              AND EXISTS (SELECT 1 FROM public.induction_enrollment e2
                          WHERE e2.event_id = p_event_id
                            AND e2.learner_id = a.learner_id
                            AND (s.batch_id IS NULL OR e2.batch_id = s.batch_id))) AS marked,
           -- DISTINCT matches the marked count's grain. induction_enrollment
           -- already has UNIQUE(event_id, learner_id), so this is belt-and-
           -- braces: the marked>=roster invariant no longer depends on a
           -- constraint defined elsewhere.
           (SELECT count(DISTINCT e.learner_id)
            FROM public.induction_enrollment e
            WHERE e.event_id = p_event_id
              AND (s.batch_id IS NULL OR e.batch_id = s.batch_id)) AS roster
    FROM public.event_sessions s
    WHERE s.event_id = p_event_id
  ) t
  GROUP BY t.day_number
  ORDER BY t.day_number NULLS FIRST;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_attendance_coverage(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_attendance_coverage(uuid) TO authenticated;
