-- perf(attendance): session-feedback rollup family — the two remaining slow staff-side
-- rollups rewritten set-based, PROVEN IDENTICAL, already applied to prod 2026-08-02
-- ~00:55 IST (night window) via Management API. This migration is the canonical record.
--
-- Measured on prod (night, quiet DB, live persona timing via request.jwt.claims):
--   fn_scf_confirmation_rollup  (super_admin, 14d, all institutions):
--       2,735ms avg (5 runs, was pg_stat mean 3,173ms x32 calls, platform worst)
--     ->  1,012ms avg (5 runs)                                    = 2.70x
--       one-institution shape: 380ms -> 193ms                     = 1.97x
--       Result values byte-identical pre/post swap: (99309,39157,6087,54065).
--   fn_scf_faculty_completion   (heaviest faculty, 31d window):
--       1,226ms avg -> 120ms avg (5 runs each)                    = 10.2x
--       second faculty: 1,062ms -> 114ms                          = 9.3x
--       (was pg_stat mean 2,812ms x19 calls; grazed the 8s bell at 7,952ms
--        during Saturday peak)
--   fn_scf_admin_faculty_summary: PARKED, not touched — already ~272-282ms at
--       night (188 rows) vs <300ms target; plan is fully set-based (hash anti
--       join); best candidate variant measured 271ms (~1.0x). Its 598ms pg_stat
--       mean is daytime congestion, not query cost.
--
-- Equivalence proof (md5 of sorted row-multiset, old vs new, same transaction
-- so now() is held constant):
--   fn_scf_faculty_completion:  25 personas x 4 window shapes = 100/100 identical
--   fn_scf_confirmation_rollup: 25 personas x 5 param shapes  = 125/125 identical
--     (55 data pairs across 11 gate-passing personas incl. 3 super_admins +
--      admin + permission-holding faculty; 70 pairs prove identical
--      authorization exceptions for denied personas)
--
-- What changed (mechanics only, zero answer changes):
--   confirmation_rollup:
--     1. is_super_admin()/role_has_institution_access() once per DISTINCT window
--        institution (incl. orphaned ids -> row-for-row identical verdicts),
--        not once per attendance row.
--     2. DISTINCT ON + 11MB external disk sort -> GROUP BY + min(session_end_local)
--        (DISTINCT ON ordered by session_end_local ASC IS the min).
--     3. 99k per-row EXISTS subplan probes -> one hash join against the window's
--        DISTINCT feedback keys (UNIQUE (student_id,attendance_date,period_id)
--        makes it multiplication-free).
--     4. fn_scf_safe_time once per PERIOD (OFFSET 0 fence), not per student row
--        (4.2k calls instead of 99k; this alone was ~800ms).
--     5. Present + uuid-shape filter pushed into C-level jsonpath emitting only
--        student_id strings (same predicate, same regex).
--   faculty_completion:
--     1. fn_get_policy_int/text resolved once per institution via a 14-row
--        materialized map (the fn_scf_pending_for_learner recipe) instead of
--        ~1.8k per-student/per-session calls (~0.65ms each = the whale).
--        COALESCE falls back to the original per-row call for NULL/unknown
--        institutions.
--     2. students array exploded once per session (lateral FILTER aggregate)
--        instead of twice.
--
-- Rollback: artifacts/ROLLBACK_scf-rollups_2026-08-02.sql (exact prior bodies).

-- fn_scf_confirmation_rollup: proven-identical rewrite of fn_scf_confirmation_rollup.
-- Changes vs v1 (all result-preserving):
--   1. is_super_admin()/role_has_institution_access() evaluated ONCE (per distinct
--      window institution) instead of per attendance row.
--   2. DISTINCT ON + 11MB external disk sort replaced by GROUP BY + min(session_end_local)
--      (identical: DISTINCT ON ordered by session_end_local ASC picks the min).
--   3. Per-present-mark EXISTS subplan (99k probes) replaced by one hash join against
--      the DISTINCT feedback keys of the window (unique constraint guarantees no dupes).
--   4. fn_scf_safe_time evaluated once per PERIOD (OFFSET 0 fence) instead of once per
--      student row (4.2k calls instead of 99k).
--   5. Present + uuid-shape filtering pushed into a C-level jsonpath that emits only
--      the student_id strings (same predicate: status == 'Present' AND like_regex uuid).
CREATE OR REPLACE FUNCTION public.fn_scf_confirmation_rollup(p_from date, p_to date, p_institution_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid, p_window_hours integer DEFAULT 48)
 RETURNS TABLE(total_present bigint, confirmed bigint, pending_within bigint, pending_overdue bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE v_super boolean; v_insts uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_confirmation_rollup: not authenticated';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('academic.attendance.dashboard.view')) THEN
    RAISE EXCEPTION 'fn_scf_confirmation_rollup: not authorized';
  END IF;

  -- Data scope resolved ONCE: same verdicts as the old per-row
  -- (is_super_admin() OR role_has_institution_access(sa.institution_id)) check,
  -- evaluated per DISTINCT institution present in the window (incl. orphaned ids,
  -- so verdicts match row-for-row). NULL institution rows stay visible
  -- (role_has_institution_access(NULL) = true).
  v_super := is_super_admin();
  IF NOT v_super THEN
    SELECT array_agg(x.iid) INTO v_insts
    FROM (SELECT DISTINCT sa.institution_id AS iid
          FROM public.student_attendance sa
          WHERE sa.attendance_date BETWEEN p_from AND p_to
            AND sa.institution_id IS NOT NULL) x
    WHERE role_has_institution_access(x.iid);
  END IF;

  RETURN QUERY
  WITH present_marks AS (
    -- One row per (date, period, student-id-text): same identity as the old
    -- DISTINCT ON; min(session_end_local) = the old ORDER BY session_end_local ASC
    -- pick (earliest class-end anchor for duplicate substitute/re-provisioned rows).
    SELECT sa.attendance_date,
           period.key AS period_id,
           (sid.j #>> '{}') AS student_text,
           min(pe.session_end_local) AS session_end_local
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(
                         CASE WHEN jsonb_typeof(sa.attendance_data) = 'object'
                              THEN sa.attendance_data
                              ELSE '{}'::jsonb END) AS period
    -- OFFSET 0: planner fence so fn_scf_safe_time runs once per period, not once
    -- per exploded student row. Same mixed 24h/12h parsing, same end-of-day
    -- fallback on unparseable values.
    CROSS JOIN LATERAL (
      SELECT sa.attendance_date
               + fn_scf_safe_time(period.value ->> 'end_time', TIME '23:59:59')
             AS session_end_local
      OFFSET 0) pe
    -- C-level filter, same predicate as the old SQL quals:
    -- status = 'Present' AND student_id matches the uuid-shape regex (the guard
    -- that keeps one malformed blob row from aborting the whole rollup).
    -- Emits ONLY the student_id string, so the executor never carries whole
    -- student objects. Non-array 'students' (incl. JSON null/scalar/object)
    -- explodes to nothing, exactly like the old CASE guard.
    CROSS JOIN LATERAL jsonb_path_query(
      CASE WHEN jsonb_typeof(period.value -> 'students') = 'array'
           THEN period.value -> 'students'
           ELSE '[]'::jsonb END,
      '$[*] ? (@.status == "Present" && @.student_id like_regex "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").student_id'
    ) AS sid(j)
    WHERE sa.attendance_date BETWEEN p_from AND p_to
      AND (p_institution_id IS NULL OR sa.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR sa.program_id     = p_program_id)
      AND (p_department_id  IS NULL OR sa.department_id  = p_department_id)
      AND (p_section_id     IS NULL OR sa.section_id     = p_section_id)
      AND (v_super OR sa.institution_id IS NULL OR sa.institution_id = ANY(v_insts))
    GROUP BY sa.attendance_date, period.key, (sid.j #>> '{}')
  ),
  scored AS (
    -- Confirmed = a session_feedback row for (student_id, attendance_date,
    -- period_id) — period-only, matching canonical fn_scf_confirmation_status
    -- exactly (see v1 note re: timetable_id). Hash join against the window's
    -- DISTINCT feedback keys replaces 99k per-row EXISTS probes; the UNIQUE
    -- constraint on (student_id, attendance_date, period_id) makes the join
    -- multiplication-free by construction, DISTINCT kept as belt-and-braces.
    SELECT pm.session_end_local,
           (fb.student_id IS NOT NULL) AS is_confirmed
    FROM present_marks pm
    LEFT JOIN (SELECT DISTINCT f.student_id, f.attendance_date, f.period_id
               FROM public.session_feedback f
               WHERE f.attendance_date BETWEEN p_from AND p_to) fb
      ON fb.student_id      = (pm.student_text)::uuid
     AND fb.attendance_date = pm.attendance_date
     AND fb.period_id       = pm.period_id
  )
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE is_confirmed)::bigint,
    count(*) FILTER (
      WHERE NOT is_confirmed
        AND (now() AT TIME ZONE 'Asia/Kolkata')
            <= session_end_local + make_interval(hours => GREATEST(p_window_hours, 1))
    )::bigint,
    count(*) FILTER (
      WHERE NOT is_confirmed
        AND (now() AT TIME ZONE 'Asia/Kolkata')
            >  session_end_local + make_interval(hours => GREATEST(p_window_hours, 1))
    )::bigint
  FROM scored;
END;
$function$;


REVOKE ALL ON FUNCTION public.fn_scf_confirmation_rollup(date, date, uuid, uuid, uuid, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.fn_scf_confirmation_rollup(date, date, uuid, uuid, uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_scf_confirmation_rollup(date, date, uuid, uuid, uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_scf_confirmation_rollup(date, date, uuid, uuid, uuid, uuid, integer) TO service_role;

-- fn_scf_faculty_completion: proven-identical rewrite of fn_scf_faculty_completion.
-- Changes vs v1 (all result-preserving):
--   1. fn_get_policy_int/fn_get_policy_text resolved ONCE per institution via a
--      14-row materialized map (the fn_scf_pending_for_learner recipe) instead of
--      once per Present student + twice per session (~1.8k policy calls -> ~28).
--      COALESCE falls back to the original per-row call for NULL/unknown institutions.
--   2. The students array is exploded ONCE per session (lateral FILTER aggregate)
--      instead of twice (separate present_count / confirmed_count subqueries).
CREATE OR REPLACE FUNCTION public.fn_scf_faculty_completion(p_from date, p_to date)
 RETURNS TABLE(attendance_date date, timetable_id uuid, period_id text, course_code text, course_name text, present_count integer, confirmed_count integer, pending_count integer, completion_pct numeric, within_window boolean, start_time text, end_time text, gate_mode text, session_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE v_email text; v_start date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_faculty_completion: not authenticated'; END IF;
  SELECT lower(p.email) INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RETURN; END IF;
  -- Forward-only floor (Director 2026-07-05): sessions before this date are never
  -- marked incomplete/overdue (grandfathered as neutral 'open').
  v_start := COALESCE(NULLIF(public.fn_get_policy_text('session_feedback.enforcement_start_date','2026-07-05',NULL),'')::date, '2026-07-05'::date);

  RETURN QUERY
  WITH pol AS MATERIALIZED (
    -- Per-institution policy map, resolved once (identical values by
    -- construction; fn_get_policy_int/text never return NULL thanks to their
    -- non-NULL defaults, so COALESCE below only fires on a join miss).
    SELECT i.id AS institution_id,
           public.fn_get_policy_int('session_feedback.window_hours', 48, i.id)  AS hours,
           public.fn_get_policy_text('session_feedback.gate_mode', 'visibility', i.id) AS gmode
    FROM public.institutions i
  ),
  sess AS (
    SELECT sa.id AS att_id, sa.institution_id, sa.attendance_date, sa.timetable_id,
           period.key AS period_id, period.value AS pv,
           -- Decision #11 window end, anchored to IST wall-clock exactly as before:
           -- class day at IST midnight + the institution's window_hours.
           ((sa.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
             + make_interval(hours => COALESCE(pol.hours,
                 public.fn_get_policy_int('session_feedback.window_hours', 48, sa.institution_id)))) AS deadline,
           -- Gate mode for THIS session's institution (institution override
           -- shadows the global default). Default 'visibility' matches the seeded row.
           COALESCE(pol.gmode,
                 public.fn_get_policy_text('session_feedback.gate_mode', 'visibility', sa.institution_id)) AS gmode
    FROM public.student_attendance sa
    LEFT JOIN pol ON pol.institution_id = sa.institution_id,
         jsonb_each(sa.attendance_data) AS period
    WHERE sa.attendance_date BETWEEN p_from AND p_to
      AND lower(period.value -> 'assigned_faculty' ->> 'faculty_email') = v_email
      -- Decision #10 (outage): a super-admin-declared feedback outage for this
      -- date [, institution][, period] removes the whole session from the faculty's
      -- completion view — no red for a day the feedback system was down.
      AND NOT EXISTS (
        SELECT 1 FROM public.scf_outage_days o
        WHERE o.outage_date = sa.attendance_date
          AND (o.institution_id IS NULL OR o.institution_id = sa.institution_id)
          AND (o.period_id      IS NULL OR o.period_id      = period.key))
  ),
  counted AS (
    -- ONE explosion of the students array per session. Outer WHERE = the old
    -- present_count predicate (Present + not excused per Decision #12); the
    -- FILTER adds the old confirmed_count predicate on top (same feedback probe,
    -- same uuid-shape CASE guard so a malformed blob id can never raise 22P02).
    SELECT s.att_id, s.institution_id, s.attendance_date, s.timetable_id,
           s.period_id, s.pv, s.deadline, s.gmode,
           x.present_count, x.confirmed_count
    FROM sess s
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS present_count,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM public.session_feedback f
               WHERE f.student_id = CASE
                       WHEN (st.value ->> 'student_id') ~
                            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                       THEN (st.value ->> 'student_id')::uuid END
                 AND f.attendance_date = s.attendance_date
                 AND f.period_id      = s.period_id
                 -- Key the confirmation match on the FULL session identity
                 -- (see v1 note re: shared period slots).
                 AND f.timetable_id   = s.timetable_id
                 -- Decision #11: only feedback submitted within window_hours
                 -- of the class confirms attendance.
                 AND f.created_at    <= s.deadline))::int AS confirmed_count
      FROM jsonb_array_elements(s.pv -> 'students') st
      WHERE st.value ->> 'status' = 'Present'
        -- Decision #12 (approved leave/OD): an excused student is not
        -- "present-owing-feedback", so drop them from both counts.
        AND NOT EXISTS (
          SELECT 1 FROM public.leave_onduty_attendance_updates lou
          WHERE lou.attendance_record_id = s.att_id
            AND lou.student_id::text     = (st.value ->> 'student_id')
            AND lou.period_slot_id       = s.period_id)
    ) x
  ),
  derived AS (
    SELECT c.*,
      (c.present_count - c.confirmed_count) AS pending_ct,
      (now() <= c.deadline) AS win
    FROM counted c
    WHERE c.present_count > 0
  )
  SELECT d.attendance_date, d.timetable_id, d.period_id,
         d.pv ->> 'course_code', d.pv ->> 'course_name',
         d.present_count, d.confirmed_count, d.pending_ct,
         CASE WHEN d.present_count = 0 THEN 0
              ELSE round((d.confirmed_count::numeric / d.present_count) * 100, 0) END,
         d.win,
         d.pv ->> 'start_time', d.pv ->> 'end_time',
         d.gmode,
         -- DERIVED enforcement status, unchanged (see v1 note: 'incomplete' is
         -- inert until the gate_mode config flips to 'hard').
         CASE
           WHEN d.pending_ct <= 0            THEN 'complete'
           WHEN d.attendance_date < v_start THEN 'open'  -- pre-rule: neutral, never red
           WHEN d.gmode = 'hard' AND d.win   THEN 'incomplete'
           WHEN d.win                        THEN 'open'
           ELSE                                   'overdue'
         END
  FROM derived d
  -- Chronological within a day: sort on the PARSED time-of-day (see v1 note).
  ORDER BY d.attendance_date DESC,
           public.fn_scf_to_time_or_null(d.pv ->> 'start_time') ASC NULLS LAST;
END;
$function$;


REVOKE ALL ON FUNCTION public.fn_scf_faculty_completion(date, date) FROM anon;
REVOKE ALL ON FUNCTION public.fn_scf_faculty_completion(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_scf_faculty_completion(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_scf_faculty_completion(date, date) TO service_role;
