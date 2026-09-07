-- 2026-08-31 - The attendance dashboard stops counting learners nobody could mark.
--
-- WHY
-- ---
-- The Statistics tab's cards come from fn_attendance_dashboard_section_stats, which
-- counts a SECTION HEADCOUNT and subtracts whoever has a mark. It knows nothing about
-- timetables. So a learner in a section with no class scheduled today still lands in
-- "Not yet marked", mixing a real marking backlog with learners no staff member could
-- have marked -- and there is no way to tell which timetable an unmarked learner is on.
--
-- Measured on production, Monday 2026-08-31 (IST):
--   "Not yet marked" across all colleges   3,155  ->  2,044 genuinely pending
--   learners with no class scheduled today          1,111  (35% of the number)
--   JKKN Dental "Not yet marked"             357  ->      0  -- every one was noise
--
-- WHAT THIS ADDS
-- --------------
-- 1. fn_timetable_scheduled_sections(date) -- the single source of truth for "which
--    sections have a class on date D". Created because that question was already being
--    answered by a hand-rolled copy in TypeScript (getTodayPendingAttendance), and the
--    copy had drifted in three ways (see the DAY KEY note below). One resolver both
--    call paths read is the point of this migration, not an incidental refactor.
-- 2. Three columns on the stats RPC: scheduled_students, scheduled_marked and
--    scheduled_timetables, so the caller can split the backlog and name the timetables.
--
-- THE DAY KEY IS NOT UNIFORM -- this is what the TypeScript copy got wrong.
-- `timetable_data` is keyed differently per timetable_format:
--     regular -> weekday name   'MONDAY'         (95 active non-template)
--     batch   -> ISO date       '2026-03-02'     (25 -- 24 of them Dental's)
--     cycle   -> 'cycle-N' via get_cycle_for_date (59)
-- The TS resolver used `format === 'cycle' ? cycleKey : dayOfWeek`, so every `batch`
-- timetable was looked up by weekday against date-keyed data and matched NOTHING.
-- That is why Dental appeared to have almost no scheduled classes while marking 155
-- learners a day.
--
-- SECTIONS BIND TWO WAYS, and both must be honoured:
--     timetables.section_id        -- 200 `section`-type rows
--     slot -> 'section_ids' array  -- 196 `semester`-type rows, whose section_id is NULL
-- Reading only the column silently ignores half the estate's timetables.
--
-- The stats RPC's ROW GRAIN IS DELIBERATELY UNCHANGED (institution x department x
-- semester x section). Timetables attach to a section row as a JSONB array rather than
-- as extra rows: a section with two timetables today would otherwise be emitted twice
-- and double-count its learners, breaking the invariant that a parent is exactly the
-- sum of its children (see buildStatsHierarchy).
--
-- Return type changes, so the stats RPC is a DROP + CREATE. Dropping discards grants,
-- so they are re-asserted at the bottom -- including the anon revoke, because Supabase's
-- default privileges re-grant EXECUTE to anon on every newly created function in public.

-- ============================================================================
-- 1. The resolver
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_timetable_scheduled_sections(
  p_date date,
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE(
  institution_id uuid,
  section_id uuid,
  timetable_id uuid,
  timetable_name text,
  start_date date,
  end_date date,
  scheduled_periods integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH live AS (
    SELECT tt.id, tt.institution_id, tt.section_id, tt.timetable_name,
           tt.start_date, tt.end_date, tt.attendance_mode, tt.timetable_data,
           CASE tt.timetable_format
             -- A NULL cycle means the date has no classes at all (Sunday or an
             -- institution holiday); the CASE below yields NULL and the slot
             -- expansion then reads '{}'. get_cycle_for_date is STABLE, INVOKER and
             -- does not touch auth.uid(), so it is safe to call from the SECURITY
             -- DEFINER stats RPC further down.
             WHEN 'cycle' THEN
               CASE WHEN public.get_cycle_for_date(tt.id, p_date) IS NULL
                    THEN NULL
                    ELSE 'cycle-' || public.get_cycle_for_date(tt.id, p_date)::text
               END
             WHEN 'batch' THEN to_char(p_date, 'YYYY-MM-DD')
             -- NOT to_char(p_date,'DAY'): that is locale-sensitive (lc_time), so a
             -- server locale change would silently stop matching the 'MONDAY' keys.
             ELSE CASE EXTRACT(dow FROM p_date)::int
                    WHEN 0 THEN 'SUNDAY'    WHEN 1 THEN 'MONDAY'
                    WHEN 2 THEN 'TUESDAY'   WHEN 3 THEN 'WEDNESDAY'
                    WHEN 4 THEN 'THURSDAY'  WHEN 5 THEN 'FRIDAY'
                    ELSE 'SATURDAY'
                  END
           END AS day_key
    FROM public.timetables tt
    WHERE tt.is_active = true
      AND tt.is_template = false
      -- The window, applied here rather than trusting is_active alone: the nightly
      -- fn_deactivate_ended_timetables leaves up to a 15-minute gap after midnight IST,
      -- and nothing at all deactivates a timetable whose start_date is still ahead.
      AND (tt.start_date IS NULL OR tt.start_date <= p_date)
      AND (tt.end_date   IS NULL OR tt.end_date   >= p_date)
      AND (p_institution_id IS NULL OR tt.institution_id = p_institution_id)
  ),
  -- Day-wise classes have no period grid: two whole-day sessions (FN/AN) against the
  -- timetable's own section. Counted as one scheduled unit.
  sess AS (
    SELECT l.institution_id, l.section_id, l.id AS timetable_id, l.timetable_name,
           l.start_date, l.end_date, 1 AS scheduled_periods
    FROM live l
    WHERE l.attendance_mode = 'session_wise'
      AND l.section_id IS NOT NULL
  ),
  slots AS (
    SELECT l.institution_id, l.id AS timetable_id, l.timetable_name,
           l.start_date, l.end_date, l.section_id AS tt_section_id,
           per.slot
    FROM live l
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN l.day_key IS NOT NULL
            AND jsonb_typeof(l.timetable_data -> l.day_key) = 'object'
           THEN l.timetable_data -> l.day_key
           ELSE '{}'::jsonb END) AS per(period_key, slot)
    WHERE l.attendance_mode <> 'session_wise'
      -- A break is on the grid but is not a class; a slot with no course is an empty
      -- cell the planner left behind. Neither can be marked, so neither schedules a
      -- section. Mirrors the `!slot.is_break_slot && slot.course_id` guard in
      -- getTodayPendingAttendance.
      AND COALESCE((per.slot ->> 'is_break_slot')::boolean, false) = false
      AND NULLIF(per.slot ->> 'course_id', '') IS NOT NULL
  ),
  expanded AS (
    SELECT s.institution_id,
           COALESCE(sec.sid, s.tt_section_id) AS section_id,
           s.timetable_id, s.timetable_name, s.start_date, s.end_date
    FROM slots s
    LEFT JOIN LATERAL (
      -- Guarded cast: a malformed entry in section_ids must not abort the whole
      -- dashboard. Non-uuid text yields NULL and is dropped by the WHERE below.
      SELECT CASE
               WHEN e.val ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
               THEN e.val::uuid
             END AS sid
      FROM jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(s.slot -> 'section_ids') = 'array'
                  THEN s.slot -> 'section_ids' ELSE '[]'::jsonb END) AS e(val)
    ) sec ON true
  )
  SELECT ex.institution_id, ex.section_id, ex.timetable_id, ex.timetable_name,
         ex.start_date, ex.end_date, count(*)::integer
  FROM expanded ex
  WHERE ex.section_id IS NOT NULL
  GROUP BY ex.institution_id, ex.section_id, ex.timetable_id, ex.timetable_name,
           ex.start_date, ex.end_date

  UNION ALL

  SELECT se.institution_id, se.section_id, se.timetable_id, se.timetable_name,
         se.start_date, se.end_date, se.scheduled_periods
  FROM sess se;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_timetable_scheduled_sections(date, uuid)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_timetable_scheduled_sections(date, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_timetable_scheduled_sections(date, uuid)
  TO service_role;

COMMENT ON FUNCTION public.fn_timetable_scheduled_sections(date, uuid) IS
'Which sections have at least one markable class on p_date, and from which timetable. THE single source of truth for that question -- fn_attendance_dashboard_section_stats reads it, and the Pending Attendance list should too. Handles all three timetable_data day-key shapes (regular=weekday, batch=ISO date, cycle=cycle-N), both section bindings (timetables.section_id and slot.section_ids[]), skips break slots and course-less cells, and applies the start_date/end_date window rather than trusting is_active alone. SECURITY INVOKER: RLS on timetables gates a direct call, while a call from inside the SECURITY DEFINER stats RPC runs with that function''s rights.';

-- ============================================================================
-- 2. The stats RPC gains the scheduled split
-- ============================================================================
DROP FUNCTION IF EXISTS public.fn_attendance_dashboard_section_stats(
  date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION public.fn_attendance_dashboard_section_stats(
  p_date date,
  p_institution_id uuid DEFAULT NULL::uuid,
  p_academic_year_id uuid DEFAULT NULL::uuid,
  p_degree_id uuid DEFAULT NULL::uuid,
  p_department_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid,
  p_section_id uuid DEFAULT NULL::uuid,
  p_first_year_only boolean DEFAULT false)
 RETURNS TABLE(
   institution_id uuid, institution_name text,
   department_id uuid, department_name text,
   semester_id uuid, semester_name text,
   section_id uuid, section_name text,
   total_students bigint,
   -- The split of total_students by lifecycle_status. Emitted so the caller can
   -- render "498 active + 14 reserved" beneath the headcount instead of an
   -- unexplained 512 that disagrees with every other learner screen. They sum to
   -- total_students by construction: the three statuses ARE k_counted_statuses.
   active_students bigint,
   reserved_students bigint,
   admitted_students bigint,
   -- Timetable-driven split of the SAME headcount, added 2026-08-31.
   -- scheduled_students: learners on this row whose section has a markable class today.
   -- scheduled_marked:   of those, how many actually have a mark.
   -- The caller derives "not yet marked" as scheduled_students - scheduled_marked and
   -- "no class today" as total_students - scheduled_students.
   --
   -- scheduled_marked is counted SEPARATELY from `marked` and is not a substitute for
   -- it: 436 learners estate-wide are marked while their section has no class today
   -- (a mark recorded off-timetable), so scheduled_students - marked would go negative.
   scheduled_students bigint,
   scheduled_marked bigint,
   -- [{id,name,start_date,end_date,periods}] -- the timetables that scheduled this
   -- section today, so the UI can name them under the section instead of leaving
   -- "which timetable are these learners on?" unanswerable. '[]' means no class today.
   scheduled_timetables jsonb,
   present bigint, absent bigint, marked bigint,
   is_unplaced boolean, is_empty_view boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  -- Director decision 2026-08-11. One list, used by BOTH the roster and the
  -- marks CTE: widening only the roster would divide a wider learner set by a
  -- narrower present count and deflate every percentage.
  -- Typed as the enum, not text[]: `lifecycle_status = ANY (text[])` has no
  -- operator, and casting the column to text would forfeit
  -- idx_learners_profiles_institution_lifecycle.
  k_counted_statuses constant public.lifecycle_status[] :=
    ARRAY['active', 'reserved', 'admitted']::public.lifecycle_status[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_attendance_dashboard_section_stats: not authenticated';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('academic.attendance.dashboard.view')) THEN
    RAISE EXCEPTION 'fn_attendance_dashboard_section_stats: not authorized';
  END IF;

  RETURN QUERY
  WITH accessible AS (
    SELECT i.id
    FROM public.institutions i
    WHERE is_super_admin() OR role_has_institution_access(i.id)
  ),
  -- Which sections have a markable class today, and which timetables put it there.
  -- Grouped to ONE row per section so the join below cannot multiply roster rows.
  -- p_institution_id is passed through so an institution-filtered view does not
  -- resolve every college's timetables.
  sched AS (
    SELECT ts.section_id,
           jsonb_agg(
             jsonb_build_object(
               'id',         ts.timetable_id,
               'name',       ts.timetable_name,
               'start_date', ts.start_date,
               'end_date',   ts.end_date,
               'periods',    ts.scheduled_periods)
             ORDER BY ts.timetable_name) AS timetables
    FROM public.fn_timetable_scheduled_sections(p_date, p_institution_id) ts
    GROUP BY ts.section_id
  ),
  roster AS (
    SELECT lp.institution_id, lp.department_id, lp.semester_id, lp.section_id,
           count(*) AS total_students,
           -- Same scan, same GROUP BY: the split costs nothing beyond three
           -- counters. Filtering on the enum directly (not a text cast) for the
           -- same index reason as k_counted_statuses above.
           count(*) FILTER (WHERE lp.lifecycle_status = 'active')   AS active_students,
           count(*) FILTER (WHERE lp.lifecycle_status = 'reserved') AS reserved_students,
           count(*) FILTER (WHERE lp.lifecycle_status = 'admitted') AS admitted_students
    FROM public.learners_profiles lp
    WHERE lp.lifecycle_status = ANY (k_counted_statuses)
      AND lp.institution_id IN (SELECT a.id FROM accessible a)
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
      -- Hierarchy filters. Plain var-free predicates on the already-scanned
      -- learners_profiles row: no extra join, no subquery, so the roster plan
      -- is unchanged apart from being more selective.
      AND (p_degree_id IS NULL OR lp.degree_id = p_degree_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_program_id IS NULL OR lp.program_id = p_program_id)
      AND (p_semester_id IS NULL OR lp.semester_id = p_semester_id)
      AND (p_section_id IS NULL OR lp.section_id = p_section_id)
      -- First-year-only: admitted in the institution's current intake. Off by
      -- default, so this short-circuits to TRUE (sub-select never runs). The
      -- is_current set is ~one row per institution, so this is
      -- per-institution-correct.
      AND (NOT p_first_year_only
           OR lp.admission_year_id IN (
                SELECT ay.id FROM public.admission_years ay WHERE ay.is_current = true))
    GROUP BY 1, 2, 3, 4
  ),
  -- The same scope WITHOUT the first-year narrowing, institution-level only.
  -- Used solely to tell "this college has no first-year learners yet" (worth
  -- saying) apart from "this college is outside the filtered scope entirely"
  -- (not worth saying) -- so applying a department filter does not flood the
  -- list with a zero row for every other college.
  scope_institutions AS (
    SELECT DISTINCT lp.institution_id
    FROM public.learners_profiles lp
    WHERE lp.lifecycle_status = ANY (k_counted_statuses)
      AND lp.institution_id IN (SELECT a.id FROM accessible a)
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
      AND (p_degree_id IS NULL OR lp.degree_id = p_degree_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_program_id IS NULL OR lp.program_id = p_program_id)
      AND (p_semester_id IS NULL OR lp.semester_id = p_semester_id)
      AND (p_section_id IS NULL OR lp.section_id = p_section_id)
  ),
  marks AS (
    SELECT lp.institution_id, lp.department_id, lp.semester_id, lp.section_id,
           lp.id AS learner_id,
           sa.id::text || ':' || period.key AS period_instance,
           st ->> 'status' AS status
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(sa.attendance_data) = 'object'
           THEN sa.attendance_data ELSE '{}'::jsonb END) AS period
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(period.value -> 'students') = 'array'
           THEN period.value -> 'students' ELSE '[]'::jsonb END) AS st
    JOIN public.learners_profiles lp
      ON lp.id = CASE
                   WHEN (st ->> 'student_id') ~
                        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                   THEN (st ->> 'student_id')::uuid
                 END
     -- MUST mirror the roster's status set exactly (see k_counted_statuses).
     AND lp.lifecycle_status = ANY (k_counted_statuses)
    WHERE sa.attendance_date = p_date
      -- DELIBERATELY no accessible-set IN-subquery here: the planner turns it
      -- into a join that multiplies this JSONB expansion by the institution
      -- count (3,105 -> 43,470 rows; 1345ms vs 68ms). Redundant anyway -- output
      -- rows come only FROM roster, which is scoped.
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_academic_year_id IS NULL OR lp.academic_year_id = p_academic_year_id)
      -- The SAME hierarchy predicates must be applied here, not only in roster.
      -- present/absent are period-AVERAGED over the marks in this CTE; filtering
      -- only the roster would divide a narrowed roster by an unfiltered
      -- period_count and silently deflate every percentage. Same var-free shape
      -- as above, so the note about avoiding subqueries here still holds.
      AND (p_degree_id IS NULL OR lp.degree_id = p_degree_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_program_id IS NULL OR lp.program_id = p_program_id)
      AND (p_semester_id IS NULL OR lp.semester_id = p_semester_id)
      AND (p_section_id IS NULL OR lp.section_id = p_section_id)
      -- First-year-only -- MUST mirror the roster predicate so present/absent are
      -- averaged over the same narrowed learner set (see the note above).
      AND (NOT p_first_year_only
           OR lp.admission_year_id IN (
                SELECT ay.id FROM public.admission_years ay WHERE ay.is_current = true))
  ),
  tally AS (
    SELECT m.institution_id, m.department_id, m.semester_id, m.section_id,
           count(*) FILTER (WHERE m.status = 'Present') AS present_sum,
           count(*) FILTER (WHERE m.status = 'Absent')  AS absent_sum,
           count(DISTINCT m.period_instance)            AS period_count,
           -- Learners with ANY status recorded today. Deliberately NOT
           -- period-averaged: this is a headcount of who was reached, and it is
           -- the denominator the headline rate now divides by. Averaged present
           -- can never exceed it (present_sum <= marked * period_count), so the
           -- resulting rate is bounded at 100%.
           count(DISTINCT m.learner_id)                 AS marked_learners
    FROM marks m
    GROUP BY 1, 2, 3, 4
  )
  SELECT
    r.institution_id,
    COALESCE(i.name, 'Unknown Institution')::text,
    r.department_id,
    COALESCE(d.department_name, 'Unknown Department')::text,
    r.semester_id,
    COALESCE(sm.semester_name, 'Unknown Semester')::text,
    r.section_id,
    COALESCE(sc.section_name, 'Unknown Section')::text,
    r.total_students,
    r.active_students,
    r.reserved_students,
    r.admitted_students,
    -- Scheduling is resolved per SECTION and the roster already groups by section,
    -- so every learner on a scheduled row is scheduled -- no per-learner join needed.
    -- A row with section_id IS NULL ("Not yet placed") never matches sched, which is
    -- correct: a learner with no section cannot be on any timetable.
    CASE WHEN sh.section_id IS NOT NULL THEN r.total_students ELSE 0 END::bigint,
    CASE WHEN sh.section_id IS NOT NULL
         THEN LEAST(COALESCE(t.marked_learners, 0), r.total_students)
         ELSE 0 END::bigint,
    COALESCE(sh.timetables, '[]'::jsonb),
    CASE WHEN COALESCE(t.period_count, 0) > 1
         THEN round(t.present_sum::numeric / t.period_count)::bigint
         ELSE COALESCE(t.present_sum, 0) END,
    CASE WHEN COALESCE(t.period_count, 0) > 1
         THEN GREATEST(0, round((t.present_sum + t.absent_sum)::numeric / t.period_count)
                          - round(t.present_sum::numeric / t.period_count))::bigint
         ELSE COALESCE(t.absent_sum, 0) END,
    -- A learner cannot be "marked" without being on the roster that produced
    -- this row, so cap at total_students rather than let a stale mark for a
    -- since-moved learner push marked above the headcount.
    LEAST(COALESCE(t.marked_learners, 0), r.total_students)::bigint,
    (r.section_id IS NULL) AS is_unplaced,
    false AS is_empty_view
  FROM roster r
  LEFT JOIN tally t
    ON t.institution_id IS NOT DISTINCT FROM r.institution_id
   AND t.department_id  IS NOT DISTINCT FROM r.department_id
   AND t.semester_id    IS NOT DISTINCT FROM r.semester_id
   AND t.section_id     IS NOT DISTINCT FROM r.section_id
  -- Plain equality, NOT `IS NOT DISTINCT FROM`: a NULL section must not match the
  -- resolver's rows, and sched holds one row per section so this cannot fan out.
  LEFT JOIN sched sh ON sh.section_id = r.section_id
  LEFT JOIN public.institutions i  ON i.id  = r.institution_id
  LEFT JOIN public.departments  d  ON d.id  = r.department_id
  LEFT JOIN public.semesters    sm ON sm.id = r.semester_id
  LEFT JOIN public.sections     sc ON sc.id = r.section_id

  UNION ALL

  -- A college that holds counted learners in this scope but none once the view's
  -- narrowing is applied. Emitted as an explicit zero so the caller can render
  -- the reason; never silently dropped.
  SELECT
    si.institution_id,
    COALESCE(i2.name, 'Unknown Institution')::text,
    NULL::uuid, NULL::text,
    NULL::uuid, NULL::text,
    NULL::uuid, NULL::text,
    -- total_students, the active/reserved/admitted split, then the scheduled split,
    -- its timetable list, then present/absent/marked. This college contributes no rows.
    0::bigint, 0::bigint, 0::bigint, 0::bigint,
    0::bigint, 0::bigint, '[]'::jsonb,
    0::bigint, 0::bigint, 0::bigint,
    false AS is_unplaced,
    true  AS is_empty_view
  FROM scope_institutions si
  LEFT JOIN public.institutions i2 ON i2.id = si.institution_id
  WHERE NOT EXISTS (
    SELECT 1 FROM roster r2 WHERE r2.institution_id = si.institution_id
  );
END;
$function$;

-- Supabase's default `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON
-- FUNCTIONS TO anon` re-grants EXECUTE to anon on every newly created function,
-- separately from PUBLIC. The DROP above discarded the previous grants, so both
-- the revoke and the grants must be re-asserted here explicitly.
REVOKE EXECUTE ON FUNCTION public.fn_attendance_dashboard_section_stats(
  date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_attendance_dashboard_section_stats(
  date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_attendance_dashboard_section_stats(
  date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.fn_attendance_dashboard_section_stats(
  date, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean) IS
'Attendance dashboard section statistics. Counts learners whose lifecycle_status is active, reserved or admitted -- deliberately NOT gated on fee payment (Director decision 2026-08-11). Returns that headcount split three ways: by lifecycle status (active_students / reserved_students / admitted_students, so the card can say WHICH learners the total counted), and by whether a class is actually scheduled today (scheduled_students / scheduled_marked / scheduled_timetables, via fn_timetable_scheduled_sections, so "not yet marked" means a real marking backlog rather than learners nobody could have marked -- 1,111 of 3,155 estate-wide on 2026-08-31, and every one of Dental''s 357). Also returns marked (learners with any status recorded that date), is_unplaced for learners with no section yet, and is_empty_view for a college that has no learners once the view narrowing is applied.';
