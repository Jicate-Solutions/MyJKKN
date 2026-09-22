-- ============================================================================
-- Shift timings — Role and Individual overrides
-- 2026-09-21
-- ----------------------------------------------------------------------------
-- WHY. The Override tab could narrow the general week by staff type, gender
-- and employment category only. HR also needs "everyone holding THIS role"
-- (a Security Guard works 08:00–20:00 whatever their category) and "THIS
-- person" (one team member on reduced hours).
--
-- THE SHAPE. Two more staff_scope values on the same table, each with its own
-- discriminator column: 'role' → role_key (custom_roles.role_key, the text
-- convention every HR flow already uses), 'staff' → staff_id. Exactly one
-- discriminator per row, CHECK-enforced. A person has one gender, so a staff
-- row always carries applicable_gender = 'all'.
--
-- THE LADDER, in fn_shift_timing_pick — the ONE resolver (never reintroduce a
-- local copy):
--     staff > role > category > teaching|non_teaching
-- each level gender-exact before gender-'all', then effective_from DESC. A
-- person who holds two roles that both have an override gets the more
-- recently effective one (decided 2026-09-21). The work-pattern day mask still
-- applies on top of whichever row wins: the pattern is WHICH DAYS, the
-- override is WHICH HOURS.
--
-- SIX CALLERS pass the resolved attributes to pick. Every one of them now also
-- passes the staff id and the person's role keys, including
-- fn_hr_attendance_period_projection — the salary register's denominator. Left
-- out, a person on a four-day override week would be paid against six.
-- fn_shift_timing_coverage resolves per category with no staff row and passes
-- NULLs: a person or role row only ever ADDS coverage, so the warning it
-- drives stays correct.
--
-- SIGNATURES. Adding a parameter creates a new overload rather than replacing
-- the function (memory: project-shift-timings-gender-scope), so pick, the
-- writer and the remover are DROPped and re-created; the six wrappers keep
-- their signatures and are CREATE OR REPLACEd from the live bodies.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columns and shape
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.hr_shift_timings
  ADD COLUMN IF NOT EXISTS role_key text,
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.hr_shift_timings.role_key IS
  'custom_roles.role_key this week applies to. Non-null iff staff_scope = ''role''.';
COMMENT ON COLUMN public.hr_shift_timings.staff_id IS
  'The one team member this week applies to. Non-null iff staff_scope = ''staff''; such a row always has applicable_gender = ''all''.';

ALTER TABLE public.hr_shift_timings
  DROP CONSTRAINT IF EXISTS hr_shift_timings_staff_scope_check;
ALTER TABLE public.hr_shift_timings
  ADD CONSTRAINT hr_shift_timings_staff_scope_check
  CHECK (staff_scope = ANY (ARRAY['teaching','non_teaching','category','role','staff']));

-- One discriminator per scope, and none for the general weeks.
ALTER TABLE public.hr_shift_timings
  DROP CONSTRAINT IF EXISTS hr_shift_timings_scope_category_chk;
ALTER TABLE public.hr_shift_timings
  DROP CONSTRAINT IF EXISTS hr_shift_timings_scope_shape_chk;
ALTER TABLE public.hr_shift_timings
  ADD CONSTRAINT hr_shift_timings_scope_shape_chk CHECK (
       (staff_scope = 'category'
          AND employment_category_id IS NOT NULL AND role_key IS NULL AND staff_id IS NULL)
    OR (staff_scope = 'role'
          AND role_key IS NOT NULL AND employment_category_id IS NULL AND staff_id IS NULL)
    OR (staff_scope = 'staff'
          AND staff_id IS NOT NULL AND employment_category_id IS NULL AND role_key IS NULL
          AND applicable_gender = 'all')
    OR (staff_scope IN ('teaching','non_teaching')
          AND employment_category_id IS NULL AND role_key IS NULL AND staff_id IS NULL)
  );

-- The current-row unique index must carry BOTH new discriminators, or a role
-- week and a category week for the same weekday collide and the second save is
-- refused (the gender rollout hit exactly this).
DROP INDEX IF EXISTS public.hr_shift_timings_current_uq;
CREATE UNIQUE INDEX hr_shift_timings_current_uq
  ON public.hr_shift_timings (
    institution_id,
    staff_scope,
    COALESCE(employment_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(role_key, ''),
    COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid),
    applicable_gender,
    day_of_week
  )
  WHERE effective_until IS NULL AND is_active;

CREATE INDEX IF NOT EXISTS hr_shift_timings_staff
  ON public.hr_shift_timings (staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hr_shift_timings_role
  ON public.hr_shift_timings (role_key) WHERE role_key IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A person's role keys
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose: called only from inside the SECURITY DEFINER
-- wrappers below, where it runs as their owner and so can read user_roles.
-- Left as DEFINER it would be a way for any signed-in user to enumerate
-- anybody's roles from a staff id.
CREATE OR REPLACE FUNCTION public.fn_staff_role_keys(p_staff_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT cr.role_key::text), ARRAY[]::text[])
  FROM public.staff s
  JOIN public.user_roles ur ON ur.user_id = s.profile_id
  JOIN public.custom_roles cr ON cr.id = ur.role_id AND cr.is_active
  WHERE s.id = p_staff_id;
$function$;

COMMENT ON FUNCTION public.fn_staff_role_keys(uuid) IS
  'Active role_keys held by one team member (via staff.profile_id). The role axis of fn_shift_timing_pick; empty array when none.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The one resolver, with two more rungs
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_shift_timing_pick(uuid, uuid, boolean, text, smallint, date, uuid);

CREATE FUNCTION public.fn_shift_timing_pick(
  p_institution_id uuid,
  p_category_id uuid,
  p_is_teaching boolean,
  p_gender text,
  p_dow smallint,
  p_date date,
  p_work_pattern_id uuid DEFAULT NULL::uuid,
  p_staff_id uuid DEFAULT NULL::uuid,
  p_role_keys text[] DEFAULT NULL::text[]
)
RETURNS SETOF public.hr_shift_timings
LANGUAGE sql
STABLE
AS $function$
  -- `t` is the TABLE alias on purpose: a CTE's whole-row reference is an
  -- anonymous record and cannot unify with the composite the CASE needs.
  SELECT (x.row_out).*
  FROM (
    SELECT CASE
             -- A pattern REMOVES a day: blanked, including the mode, so an
             -- excluded day can never carry a stale duration.
             WHEN p_work_pattern_id IS NOT NULL
                  AND m.days IS NOT NULL
                  AND NOT (p_dow = ANY (m.days))
             THEN jsonb_populate_record(
                    t,
                    '{"is_working_day": false, "first_half_start": null, "first_half_end": null, "second_half_start": null, "second_half_end": null, "attendance_mode": "span", "required_minutes": null}'::jsonb)
             -- A pattern may also REPLACE the hours for a day it does work.
             -- This is how "Wednesday, any 1 hour" reaches the evaluator
             -- without touching the institution's Wednesday.
             WHEN p_work_pattern_id IS NOT NULL
                  AND o.hours IS NOT NULL
             THEN jsonb_populate_record(t, o.hours || '{"is_working_day": true}'::jsonb)
             ELSE t
           END AS row_out
    FROM public.hr_shift_timings t
    CROSS JOIN (SELECT public.fn_work_pattern_days(p_work_pattern_id, p_date) AS days) m
    CROSS JOIN (SELECT public.fn_work_pattern_day_hours(p_work_pattern_id, p_date, p_dow) AS hours) o
    WHERE t.institution_id = p_institution_id
      AND t.day_of_week    = p_dow
      AND t.is_active
      AND t.effective_from <= p_date
      AND (t.effective_until IS NULL OR t.effective_until > p_date)
      AND (
           (t.staff_scope = 'staff'        AND p_staff_id IS NOT NULL AND t.staff_id = p_staff_id)
        OR (t.staff_scope = 'role'         AND t.role_key = ANY (COALESCE(p_role_keys, ARRAY[]::text[])))
        OR (t.staff_scope = 'category'     AND t.employment_category_id = p_category_id)
        OR (t.staff_scope = 'teaching'     AND p_is_teaching)
        OR (t.staff_scope = 'non_teaching' AND NOT p_is_teaching)
      )
      AND (
           t.applicable_gender = 'all'
        OR t.applicable_gender = lower(btrim(COALESCE(p_gender, '')))
      )
    ORDER BY
      CASE t.staff_scope
        WHEN 'staff'    THEN 0
        WHEN 'role'     THEN 1
        WHEN 'category' THEN 2
        ELSE 3
      END,
      CASE WHEN t.applicable_gender = 'all' THEN 1 ELSE 0 END,
      t.effective_from DESC
    LIMIT 1
  ) x;
$function$;

COMMENT ON FUNCTION public.fn_shift_timing_pick(uuid, uuid, boolean, text, smallint, date, uuid, uuid, text[]) IS
  'The ONLY shift-timing resolver. Ladder: staff > role > category > teaching|non_teaching, gender-exact before all, newest effective_from first; a work pattern masks days / replaces hours on top. Coverage passes NULL staff/roles.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The six callers pass the two new inputs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_shift_window(p_staff_id uuid, p_date date)
 RETURNS TABLE(timing_id uuid, is_working_day boolean, first_half_start time without time zone, first_half_end time without time zone, second_half_start time without time zone, second_half_end time without time zone, grace_minutes integer, matched_by text, attendance_mode text, required_minutes integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_institution_id uuid;
  v_category_id    uuid;
  v_is_teaching    boolean;
  v_gender         text;
  v_pattern_id     uuid;
  v_role_keys      text[];
  v_dow            smallint;
  v_second_sat     boolean;
BEGIN
  IF p_staff_id IS NULL OR p_date IS NULL THEN RETURN; END IF;

  SELECT s.institution_id, s.category_id, ec.is_teaching, s.gender
    INTO v_institution_id, v_category_id, v_is_teaching, v_gender
  FROM public.staff s
  JOIN public.employment_categories ec ON ec.id = s.category_id
  WHERE s.id = p_staff_id;

  IF v_institution_id IS NULL THEN RETURN; END IF;

  v_pattern_id := public.fn_staff_work_pattern_id(p_staff_id, p_date);
  v_role_keys  := public.fn_staff_role_keys(p_staff_id);
  v_dow        := EXTRACT(ISODOW FROM p_date)::smallint;
  v_second_sat := (v_dow = 6 AND EXTRACT(DAY FROM p_date) BETWEEN 8 AND 14);

  RETURN QUERY
  SELECT
    t.id,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN false ELSE t.is_working_day END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_start  END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_end    END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_start END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_end   END,
    t.grace_minutes,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN 'second_saturday_holiday'
         ELSE t.staff_scope END,
    -- A second-Saturday holiday blanks the mode too, so the day cannot arrive
    -- as "any 60 minutes" on a date nobody works.
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN 'span' ELSE t.attendance_mode END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.required_minutes END
  FROM public.fn_shift_timing_pick(
         v_institution_id, v_category_id, v_is_teaching, v_gender, v_dow, p_date, v_pattern_id,
         p_staff_id, v_role_keys) t;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hr_is_working_day(p_staff_id uuid, p_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_institution_id uuid;
  v_category_id    uuid;
  v_is_teaching    boolean;
  v_gender         text;
  v_pattern_id     uuid;
  v_role_keys      text[];
  v_dow            smallint;
  v_second_sat     boolean;
  v_working        boolean;
BEGIN
  IF p_staff_id IS NULL OR p_date IS NULL THEN RETURN NULL; END IF;

  SELECT s.institution_id, s.category_id, ec.is_teaching, s.gender
    INTO v_institution_id, v_category_id, v_is_teaching, v_gender
  FROM public.staff s
  JOIN public.employment_categories ec ON ec.id = s.category_id
  WHERE s.id = p_staff_id;

  IF v_institution_id IS NULL THEN RETURN NULL; END IF;

  v_pattern_id := public.fn_staff_work_pattern_id(p_staff_id, p_date);
  v_role_keys  := public.fn_staff_role_keys(p_staff_id);
  v_dow        := EXTRACT(ISODOW FROM p_date)::smallint;
  v_second_sat := (v_dow = 6 AND EXTRACT(DAY FROM p_date) BETWEEN 8 AND 14);

  SELECT CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN false
              ELSE t.is_working_day END
    INTO v_working
  FROM public.fn_shift_timing_pick(
         v_institution_id, v_category_id, v_is_teaching, v_gender, v_dow, p_date, v_pattern_id,
         p_staff_id, v_role_keys) t;

  RETURN v_working;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_resolve_shift_timing(p_staff_id uuid, p_date date)
 RETURNS TABLE(timing_id uuid, institution_id uuid, staff_scope text, employment_category_id uuid, applicable_gender text, day_of_week smallint, is_working_day boolean, first_half_start time without time zone, first_half_end time without time zone, second_half_start time without time zone, second_half_end time without time zone, grace_minutes integer, grace_deadline time without time zone, matched_by text, attendance_mode text, required_minutes integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_institution_id uuid;
  v_category_id    uuid;
  v_is_teaching    boolean;
  v_gender         text;
  v_pattern_id     uuid;
  v_role_keys      text[];
  v_dow            smallint;
  v_second_sat     boolean;
BEGIN
  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.staff s
                WHERE s.id = p_staff_id AND s.profile_id = auth.uid())
    OR (public.user_has_permission('hr.shift_timings.view')
        AND EXISTS (SELECT 1 FROM public.staff s
                     WHERE s.id = p_staff_id
                       AND public.role_has_institution_access(s.institution_id)))
  ) THEN
    RAISE EXCEPTION 'Not authorized to resolve shift timing for this staff member'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.institution_id, s.category_id, ec.is_teaching, s.gender
    INTO v_institution_id, v_category_id, v_is_teaching, v_gender
  FROM public.staff s
  JOIN public.employment_categories ec ON ec.id = s.category_id
  WHERE s.id = p_staff_id;

  IF v_institution_id IS NULL THEN RETURN; END IF;

  v_pattern_id := public.fn_staff_work_pattern_id(p_staff_id, p_date);
  v_role_keys  := public.fn_staff_role_keys(p_staff_id);
  v_dow        := EXTRACT(ISODOW FROM p_date)::smallint;
  v_second_sat := (v_dow = 6 AND EXTRACT(DAY FROM p_date) BETWEEN 8 AND 14);

  RETURN QUERY
  SELECT
    t.id,
    t.institution_id,
    t.staff_scope,
    t.employment_category_id,
    t.applicable_gender,
    t.day_of_week,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN false ELSE t.is_working_day END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_start  END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_end    END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_start END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_end   END,
    t.grace_minutes,
    -- The FIRST SESSION of the day: the morning when there is one, the lone
    -- afternoon on a second-half-only day. Grace applies to whichever it is.
    -- A duration day has no session start to be late against, so no deadline.
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) OR NOT t.is_working_day
              OR t.attendance_mode = 'duration' THEN NULL
         ELSE (COALESCE(t.first_half_start, t.second_half_start)
               + make_interval(mins => t.grace_minutes))::time END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN 'second_saturday_holiday'
         ELSE t.staff_scope END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN 'span' ELSE t.attendance_mode END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN NULL ELSE t.required_minutes END
  FROM public.fn_shift_timing_pick(
         v_institution_id, v_category_id, v_is_teaching, v_gender, v_dow, p_date, v_pattern_id,
         p_staff_id, v_role_keys) t;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_resolve_shift_timings_bulk(p_staff_ids uuid[], p_from date, p_to date)
 RETURNS TABLE(staff_id uuid, work_date date, timing_id uuid, is_working_day boolean, first_half_start time without time zone, first_half_end time without time zone, second_half_start time without time zone, second_half_end time without time zone, grace_minutes integer, matched_by text, attendance_mode text, required_minutes integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR public.user_has_permission('hr.shift_timings.view')
    OR public.user_has_permission('hr.attendance.override')
  ) THEN
    RAISE EXCEPTION 'Not authorized to resolve shift timings'
      USING ERRCODE = '42501';
  END IF;

  IF p_to < p_from THEN
    RAISE EXCEPTION 'p_to must not be earlier than p_from' USING ERRCODE = '22023';
  END IF;

  IF (p_to - p_from) > 400 THEN
    RAISE EXCEPTION 'Date range too wide (% days); resolve at most 400 days at a time', (p_to - p_from)
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH s AS (
    -- Role keys resolved ONCE per person here, not per (person, day) inside
    -- pick: a month across an institution is thousands of pick calls.
    SELECT st.id, st.institution_id, st.category_id, ec.is_teaching, st.gender,
           public.fn_staff_role_keys(st.id) AS role_keys
    FROM public.staff st
    JOIN public.employment_categories ec ON ec.id = st.category_id
    WHERE st.id = ANY(p_staff_ids)
  ), d AS (
    SELECT gs::date AS wd FROM generate_series(p_from, p_to, interval '1 day') gs
  )
  SELECT
    s.id,
    d.wd,
    t.id,
    CASE WHEN t.id IS NULL THEN NULL
         WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN false
         ELSE t.is_working_day END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_start  END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.first_half_end    END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_start END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.second_half_end   END,
    t.grace_minutes,
    CASE WHEN t.id IS NULL THEN NULL
         WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN 'second_saturday_holiday'
         ELSE t.staff_scope END,
    CASE WHEN t.id IS NULL THEN NULL
         WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN 'span'
         ELSE t.attendance_mode END,
    CASE WHEN (EXTRACT(ISODOW FROM d.wd) = 6
               AND EXTRACT(DAY FROM d.wd) BETWEEN 8 AND 14
               AND t.second_saturday_holiday) THEN NULL ELSE t.required_minutes END
  FROM s
  CROSS JOIN d
  LEFT JOIN LATERAL public.fn_shift_timing_pick(
    s.institution_id, s.category_id, s.is_teaching, s.gender,
    EXTRACT(ISODOW FROM d.wd)::smallint, d.wd,
    public.fn_staff_work_pattern_id(s.id, d.wd),
    s.id, s.role_keys) t ON true;
END;
$function$;

-- Per category, no staff row: NULL staff and roles. A person or role row can
-- only ADD a timing for somebody, never take one away, so "which categories
-- have no timing at all" is unchanged by this migration.
CREATE OR REPLACE FUNCTION public.fn_shift_timing_coverage(p_institution_id uuid, p_date date)
 RETURNS TABLE(employment_category_id uuid, category_name text, is_teaching boolean, staff_gender text, staff_count bigint, resolved_timing_id uuid, resolved_via text, resolved_gender text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dow smallint;
BEGIN
  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR ((public.user_has_permission('hr.shift_timings.view')
         OR public.user_has_permission('hr.shift_timings.manage'))
        AND public.role_has_institution_access(p_institution_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to view shift timing coverage for this institution'
      USING ERRCODE = '42501';
  END IF;

  v_dow := EXTRACT(ISODOW FROM p_date)::smallint;

  RETURN QUERY
  WITH cats AS (
    SELECT ec.id AS cat_id,
           ec.category_name AS cat_name,
           ec.is_teaching AS cat_is_teaching,
           s.gender AS cat_gender,
           count(s.id) AS cat_staff_count
    FROM public.staff s
    JOIN public.employment_categories ec ON ec.id = s.category_id
    WHERE s.institution_id = p_institution_id
    GROUP BY ec.id, ec.category_name, ec.is_teaching, s.gender
  )
  SELECT c.cat_id, c.cat_name, c.cat_is_teaching, c.cat_gender, c.cat_staff_count,
         t.id, t.staff_scope, t.applicable_gender
  FROM cats c
  LEFT JOIN LATERAL public.fn_shift_timing_pick(
    p_institution_id, c.cat_id, c.cat_is_teaching, c.cat_gender, v_dow, p_date,
    NULL, NULL, NULL) t ON true
  ORDER BY c.cat_staff_count DESC, c.cat_name, c.cat_gender;
END;
$function$;

-- The salary register's denominator. Rebuilt from the live body with only the
-- staff_in CTE and the pick call changed.
CREATE OR REPLACE FUNCTION public.fn_hr_attendance_period_projection(p_institution_id uuid, p_year integer, p_month integer)
 RETURNS TABLE(staff_id uuid, working_days numeric, present_days numeric, half_days integer, absent_days numeric, weekly_off_days integer, holiday_days integer, leave_days numeric, on_duty_days numeric, comp_off_days numeric, lop_days numeric, payable_days numeric, leave_by_type jsonb, short_time_off_minutes integer, late_minutes integer, excused_minutes integer, unprocessed_days integer, scheduled_days numeric, work_pattern_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start date;
  v_end   date;
BEGIN
  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Month must be 1-12, got %', p_month USING ERRCODE = '22023';
  END IF;

  -- Same gate as the close console this feeds. Read-only, but it exposes
  -- per-person attendance for a whole institution.
  IF NOT (public.is_super_admin()
          OR public.user_has_permission('hr.attendance.period.manage')) THEN
    RAISE EXCEPTION 'hr.attendance.period.manage is required to read an attendance projection.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.fn_hr_institution_included(p_institution_id) THEN
    RAISE EXCEPTION 'This institution is excluded from the HR module.'
      USING ERRCODE = '23514';
  END IF;

  v_start := make_date(p_year, p_month, 1);
  v_end   := (v_start + interval '1 month - 1 day')::date;

  RETURN QUERY
  WITH rec AS (
    SELECT r.employee_id,
           st.code,
           COALESCE(r.late_minutes, 0)    AS late_minutes,
           COALESCE(r.excused_minutes, 0) AS excused_minutes
      FROM public.hr_attendance_records r
      JOIN public.hr_attendance_status_types st ON st.id = r.status_type_id
     WHERE r.institution_id = p_institution_id
       AND r.work_date BETWEEN v_start AND v_end
  ),
  agg AS (
    SELECT employee_id,
           count(*)                                                   AS total_days,
           count(*) FILTER (WHERE code = 'WEEKLY_OFF')                AS weekly_off,
           count(*) FILTER (WHERE code = 'HOLIDAY')                   AS holiday,
           count(*) FILTER (WHERE code IN ('PRESENT','REGULARIZED'))  AS full_present,
           count(*) FILTER (WHERE code = 'HALF_DAY')                  AS half_day,
           count(*) FILTER (WHERE code = 'ABSENT')                    AS absent,
           count(*) FILTER (WHERE code IN ('ON_DUTY','on_clinical_posting')) AS on_duty,
           -- A day the evaluator could not judge. A payslip built on top of
           -- these should say so rather than quietly treat them as absent.
           count(*) FILTER (WHERE code NOT IN (
             'PRESENT','REGULARIZED','HALF_DAY','ABSENT','WEEKLY_OFF',
             'HOLIDAY','LEAVE','ON_DUTY','on_clinical_posting'))      AS unprocessed,
           -- QUALIFIED. These two are now RETURNS TABLE out-parameters, so a
           -- bare reference is ambiguous between the plpgsql variable and the
           -- CTE column and Postgres refuses the whole function at runtime.
           -- The original had no out-parameters, which is why it did not care.
           sum(rec.late_minutes)                                      AS late_minutes,
           sum(rec.excused_minutes)                                   AS excused_minutes
      FROM rec
     GROUP BY employee_id
  ),
  -- Approved requests expanded to individual dates, then INTERSECTED with the
  -- attendance records: a leave that falls on a Sunday is not a leave day, and
  -- counting it from the application alone would inflate the total.
  req AS (
    SELECT la.employee_id,
           lt.leave_type_code,
           lt.is_paid,
           lt.request_category,
           g.d::date AS dt,
           CASE WHEN la.duration_type ILIKE '%half%' THEN 0.5 ELSE 1.0 END AS wt,
           la.start_time, la.end_time
      FROM public.hr_leave_applications la
      JOIN public.hr_leave_types lt ON lt.id = la.leave_type_id
      CROSS JOIN LATERAL generate_series(la.start_date, la.end_date, interval '1 day') g(d)
     WHERE la.status = 'approved'
       AND g.d::date BETWEEN v_start AND v_end
  ),
  req_effective AS (
    SELECT q.*
      FROM req q
      JOIN public.hr_attendance_records r
        ON r.employee_id = q.employee_id AND r.work_date = q.dt
      JOIN public.hr_attendance_status_types st ON st.id = r.status_type_id
     WHERE r.institution_id = p_institution_id
       AND st.code NOT IN ('WEEKLY_OFF', 'HOLIDAY')
  ),
  req_agg AS (
    SELECT employee_id,
           COALESCE(sum(wt) FILTER (WHERE request_category = 'leave' AND is_paid), 0)         AS paid_leave,
           COALESCE(sum(wt) FILTER (WHERE request_category = 'leave' AND NOT is_paid), 0)     AS unpaid_leave,
           COALESCE(sum(wt) FILTER (WHERE request_category = 'compensatory_off'), 0)          AS comp_off,
           COALESCE(sum(
             GREATEST(0, EXTRACT(EPOCH FROM (end_time - start_time)) / 60)
           ) FILTER (WHERE request_category = 'short_time_off'), 0)::int                      AS sto_minutes,
           COALESCE(
             jsonb_object_agg(leave_type_code, days)
               FILTER (WHERE request_category = 'leave' AND leave_type_code IS NOT NULL),
             '{}'::jsonb)                                                                     AS leave_by_type
      FROM (
        SELECT employee_id, request_category, is_paid, leave_type_code,
               start_time, end_time, wt,
               sum(wt) OVER (PARTITION BY employee_id, leave_type_code) AS days
          FROM req_effective
      ) x
     GROUP BY employee_id
  ),
  base AS (
    SELECT
      a.employee_id AS staff_id,
      (a.total_days - a.weekly_off - a.holiday)::numeric(5,1)                  AS working_days,
      (a.full_present + a.half_day * 0.5)::numeric(5,1)                        AS present_days,
      a.half_day::integer                                                      AS half_days,
      (a.absent + a.half_day * 0.5)::numeric(5,1)                              AS absent_days,
      a.weekly_off::integer                                                    AS weekly_off_days,
      a.holiday::integer                                                       AS holiday_days,
      (COALESCE(r.paid_leave, 0) + COALESCE(r.unpaid_leave, 0))::numeric(5,1)  AS leave_days,
      a.on_duty::numeric(5,1)                                                  AS on_duty_days,
      COALESCE(r.comp_off, 0)::numeric(5,1)                                    AS comp_off_days,
      -- LOP: working days neither attended nor covered by a PAID absence.
      -- Unpaid leave is deliberately not subtracted -- that is what makes it
      -- unpaid.
      GREATEST(0, (a.total_days - a.weekly_off - a.holiday)
                  - LEAST((a.total_days - a.weekly_off - a.holiday),
                          (a.full_present + a.half_day * 0.5)
                          + COALESCE(r.paid_leave, 0) + a.on_duty
                          + COALESCE(r.comp_off, 0)))::numeric(5,1)            AS lop_days,
      LEAST((a.total_days - a.weekly_off - a.holiday),
            (a.full_present + a.half_day * 0.5)
            + COALESCE(r.paid_leave, 0) + a.on_duty
            + COALESCE(r.comp_off, 0))::numeric(5,1)                           AS payable_days,
      COALESCE(r.leave_by_type, '{}'::jsonb)                                   AS leave_by_type,
      COALESCE(r.sto_minutes, 0)::integer                                      AS short_time_off_minutes,
      COALESCE(a.late_minutes, 0)::integer                                     AS late_minutes,
      COALESCE(a.excused_minutes, 0)::integer                                  AS excused_minutes,
      a.unprocessed::integer                                                   AS unprocessed_days
    FROM agg a
    LEFT JOIN req_agg r ON r.employee_id = a.employee_id
  ),
  -- Second phase, folded in. The original read these staff back out of the
  -- summaries table after inserting; here the same set comes straight from base.
  staff_in AS (
    SELECT b.staff_id, s.institution_id, s.category_id, ec.is_teaching, s.gender,
           public.fn_staff_role_keys(b.staff_id) AS role_keys
      FROM base b
      JOIN public.staff s ON s.id = b.staff_id
      JOIN public.employment_categories ec ON ec.id = s.category_id
  ),
  hol AS (
    SELECT h.holiday_date
      FROM public.fn_hr_calendar_holiday_dates(p_institution_id, v_start, v_end) h
  ),
  days AS (
    SELECT gs::date AS d FROM generate_series(v_start, v_end, interval '1 day') gs
  ),
  sched AS (
    SELECT si.staff_id,
           count(*) FILTER (
             WHERE COALESCE(
                     CASE WHEN (EXTRACT(ISODOW FROM dd.d) = 6
                                AND EXTRACT(DAY FROM dd.d) BETWEEN 8 AND 14
                                AND t.second_saturday_holiday) THEN false
                          ELSE t.is_working_day END,
                     false)
               AND NOT EXISTS (SELECT 1 FROM hol h WHERE h.holiday_date = dd.d)
           ) AS scheduled
      FROM staff_in si
      CROSS JOIN days dd
      LEFT JOIN LATERAL public.fn_shift_timing_pick(
        si.institution_id, si.category_id, si.is_teaching, si.gender,
        EXTRACT(ISODOW FROM dd.d)::smallint, dd.d,
        public.fn_staff_work_pattern_id(si.staff_id, dd.d),
        si.staff_id, si.role_keys) t ON true
     GROUP BY si.staff_id
  ),
  pat AS (
    SELECT DISTINCT ON (a.staff_id) a.staff_id, a.work_pattern_id
      FROM public.hr_staff_work_pattern_assignments a
     WHERE a.effective_from <= v_end
       AND (a.effective_until IS NULL OR a.effective_until > v_start)
     ORDER BY a.staff_id, a.effective_from DESC
  )
  SELECT b.staff_id, b.working_days, b.present_days, b.half_days, b.absent_days,
         b.weekly_off_days, b.holiday_days, b.leave_days, b.on_duty_days,
         b.comp_off_days, b.lop_days, b.payable_days, b.leave_by_type,
         b.short_time_off_minutes, b.late_minutes, b.excused_minutes,
         b.unprocessed_days,
         sc.scheduled::numeric(5,1) AS scheduled_days,
         pt.work_pattern_id
    FROM base b
    LEFT JOIN sched sc ON sc.staff_id = b.staff_id
    LEFT JOIN pat   pt ON pt.staff_id = b.staff_id;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The writer
-- ─────────────────────────────────────────────────────────────────────────────
-- EVERY WHERE carries role_key and staff_id. A predicate missing from any one
-- of them makes a save "find" a neighbouring week as current, close it and
-- overwrite it — the gender rollout shipped that bug once.
DROP FUNCTION IF EXISTS public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb, text);

CREATE FUNCTION public.fn_save_shift_timing_week(
  p_institution_id uuid,
  p_staff_scope text,
  p_employment_category_id uuid,
  p_effective_from date,
  p_days jsonb,
  p_applicable_gender text DEFAULT 'all'::text,
  p_role_key text DEFAULT NULL::text,
  p_staff_id uuid DEFAULT NULL::uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day      record;
  v_current  public.hr_shift_timings%ROWTYPE;
  v_written  integer := 0;
  v_actor    uuid := auth.uid();
  v_gender   text := COALESCE(p_applicable_gender, 'all');
BEGIN
  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('hr.shift_timings.manage')
        AND public.role_has_institution_access(p_institution_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to configure shift timings for this institution'
      USING ERRCODE = '42501';
  END IF;

  IF p_staff_scope NOT IN ('teaching','non_teaching','category','role','staff') THEN
    RAISE EXCEPTION 'Invalid staff_scope: %', p_staff_scope USING ERRCODE = '22023';
  END IF;

  IF v_gender NOT IN ('all','male','female','bigender') THEN
    RAISE EXCEPTION 'Invalid applicable_gender: %', v_gender USING ERRCODE = '22023';
  END IF;

  -- One discriminator per scope, matching hr_shift_timings_scope_shape_chk but
  -- said in words rather than as a 23514.
  IF (p_staff_scope = 'category') <> (p_employment_category_id IS NOT NULL) THEN
    RAISE EXCEPTION 'staff_scope=category requires an employment_category_id, and vice versa'
      USING ERRCODE = '22023';
  END IF;
  IF (p_staff_scope = 'role') <> (p_role_key IS NOT NULL) THEN
    RAISE EXCEPTION 'staff_scope=role requires a role_key, and vice versa'
      USING ERRCODE = '22023';
  END IF;
  IF (p_staff_scope = 'staff') <> (p_staff_id IS NOT NULL) THEN
    RAISE EXCEPTION 'staff_scope=staff requires a staff_id, and vice versa'
      USING ERRCODE = '22023';
  END IF;

  IF p_staff_scope = 'role'
     AND NOT EXISTS (SELECT 1 FROM public.custom_roles cr WHERE cr.role_key = p_role_key AND cr.is_active) THEN
    RAISE EXCEPTION 'No active role with key %', p_role_key USING ERRCODE = '22023';
  END IF;

  IF p_staff_scope = 'staff' THEN
    -- A person is one gender; the row says so with 'all' so the ladder never
    -- has to compare. Stored, not merely defaulted, so the CHECK holds.
    v_gender := 'all';
    IF NOT EXISTS (SELECT 1 FROM public.staff s
                    WHERE s.id = p_staff_id AND s.institution_id = p_institution_id) THEN
      RAISE EXCEPTION 'That team member is not at this institution' USING ERRCODE = '22023';
    END IF;
  END IF;

  FOR v_day IN
    SELECT *
    FROM jsonb_to_recordset(p_days) AS d(
      day_of_week smallint,
      is_working_day boolean,
      first_half_start time,
      first_half_end time,
      second_half_start time,
      second_half_end time,
      grace_minutes integer,
      second_saturday_holiday boolean
    )
  LOOP
    SELECT * INTO v_current
    FROM public.hr_shift_timings t
    WHERE t.institution_id = p_institution_id
      AND t.staff_scope    = p_staff_scope
      AND t.applicable_gender = v_gender
      AND t.day_of_week    = v_day.day_of_week
      AND t.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
      AND t.role_key IS NOT DISTINCT FROM p_role_key
      AND t.staff_id IS NOT DISTINCT FROM p_staff_id
      AND t.effective_until IS NULL
      AND t.is_active;

    IF NOT FOUND THEN
      INSERT INTO public.hr_shift_timings (
        institution_id, staff_scope, employment_category_id, role_key, staff_id,
        applicable_gender, day_of_week,
        is_working_day, first_half_start, first_half_end,
        second_half_start, second_half_end,
        grace_minutes, second_saturday_holiday, effective_from,
        created_by, updated_by
      ) VALUES (
        p_institution_id, p_staff_scope, p_employment_category_id, p_role_key, p_staff_id,
        v_gender, v_day.day_of_week,
        v_day.is_working_day, v_day.first_half_start, v_day.first_half_end,
        v_day.second_half_start, v_day.second_half_end,
        COALESCE(v_day.grace_minutes, 0), COALESCE(v_day.second_saturday_holiday, false),
        p_effective_from, v_actor, v_actor
      );

    ELSIF p_effective_from <= v_current.effective_from THEN
      UPDATE public.hr_shift_timings h
         SET is_active  = false,
             updated_by = v_actor
       WHERE h.institution_id = p_institution_id
         AND h.staff_scope    = p_staff_scope
         AND h.applicable_gender = v_gender
         AND h.day_of_week    = v_day.day_of_week
         AND h.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
         AND h.role_key IS NOT DISTINCT FROM p_role_key
         AND h.staff_id IS NOT DISTINCT FROM p_staff_id
         AND h.id <> v_current.id
         AND h.is_active
         AND h.effective_from >= p_effective_from;

      UPDATE public.hr_shift_timings h
         SET effective_until = p_effective_from,
             updated_by      = v_actor
       WHERE h.institution_id = p_institution_id
         AND h.staff_scope    = p_staff_scope
         AND h.applicable_gender = v_gender
         AND h.day_of_week    = v_day.day_of_week
         AND h.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
         AND h.role_key IS NOT DISTINCT FROM p_role_key
         AND h.staff_id IS NOT DISTINCT FROM p_staff_id
         AND h.id <> v_current.id
         AND h.is_active
         AND h.effective_from < p_effective_from
         AND (h.effective_until IS NULL OR h.effective_until > p_effective_from);

      UPDATE public.hr_shift_timings
         SET is_working_day          = v_day.is_working_day,
             first_half_start        = v_day.first_half_start,
             first_half_end          = v_day.first_half_end,
             second_half_start       = v_day.second_half_start,
             second_half_end         = v_day.second_half_end,
             grace_minutes           = COALESCE(v_day.grace_minutes, 0),
             second_saturday_holiday = COALESCE(v_day.second_saturday_holiday, false),
             effective_from          = p_effective_from,
             updated_by              = v_actor
       WHERE id = v_current.id;

    ELSE
      UPDATE public.hr_shift_timings
         SET effective_until = p_effective_from,
             updated_by      = v_actor
       WHERE id = v_current.id;

      INSERT INTO public.hr_shift_timings (
        institution_id, staff_scope, employment_category_id, role_key, staff_id,
        applicable_gender, day_of_week,
        is_working_day, first_half_start, first_half_end,
        second_half_start, second_half_end,
        grace_minutes, second_saturday_holiday, effective_from,
        created_by, updated_by
      ) VALUES (
        p_institution_id, p_staff_scope, p_employment_category_id, p_role_key, p_staff_id,
        v_gender, v_day.day_of_week,
        v_day.is_working_day, v_day.first_half_start, v_day.first_half_end,
        v_day.second_half_start, v_day.second_half_end,
        COALESCE(v_day.grace_minutes, 0), COALESCE(v_day.second_saturday_holiday, false),
        p_effective_from, v_actor, v_actor
      );
    END IF;

    v_written := v_written + 1;
  END LOOP;

  RETURN v_written;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. The remover
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_end_shift_timing_override(uuid, text, uuid, text, date);

CREATE FUNCTION public.fn_end_shift_timing_override(
  p_institution_id uuid,
  p_staff_scope text,
  p_employment_category_id uuid,
  p_applicable_gender text,
  p_on date DEFAULT CURRENT_DATE,
  p_role_key text DEFAULT NULL::text,
  p_staff_id uuid DEFAULT NULL::uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor   uuid := auth.uid();
  v_gender  text := COALESCE(p_applicable_gender, 'all');
  v_closed  integer := 0;
  v_deacted integer := 0;
BEGIN
  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('hr.shift_timings.manage')
        AND public.role_has_institution_access(p_institution_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to configure shift timings for this institution'
      USING ERRCODE = '42501';
  END IF;

  IF p_staff_scope NOT IN ('teaching','non_teaching','category','role','staff') THEN
    RAISE EXCEPTION 'Invalid staff_scope: %', p_staff_scope USING ERRCODE = '22023';
  END IF;

  IF (p_staff_scope = 'category') <> (p_employment_category_id IS NOT NULL) THEN
    RAISE EXCEPTION 'staff_scope=category requires an employment_category_id, and vice versa'
      USING ERRCODE = '22023';
  END IF;
  IF (p_staff_scope = 'role') <> (p_role_key IS NOT NULL) THEN
    RAISE EXCEPTION 'staff_scope=role requires a role_key, and vice versa'
      USING ERRCODE = '22023';
  END IF;
  IF (p_staff_scope = 'staff') <> (p_staff_id IS NOT NULL) THEN
    RAISE EXCEPTION 'staff_scope=staff requires a staff_id, and vice versa'
      USING ERRCODE = '22023';
  END IF;
  IF p_staff_scope = 'staff' THEN
    v_gender := 'all';
  END IF;

  -- Role and person rows are always overrides; only a gender-'all' staff-type
  -- week is the general one that must not be removed.
  IF p_staff_scope IN ('teaching','non_teaching') AND v_gender = 'all' THEN
    RAISE EXCEPTION
      'That is the general % week, not an override. Edit it on its own tab; removing it would leave these staff with no timing at all.',
      p_staff_scope
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.hr_shift_timings h
     SET effective_until = p_on,
         updated_by      = v_actor
   WHERE h.institution_id  = p_institution_id
     AND h.staff_scope     = p_staff_scope
     AND h.applicable_gender = v_gender
     AND h.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
     AND h.role_key IS NOT DISTINCT FROM p_role_key
     AND h.staff_id IS NOT DISTINCT FROM p_staff_id
     AND h.is_active
     AND h.effective_until IS NULL
     AND h.effective_from < p_on;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  UPDATE public.hr_shift_timings h
     SET is_active  = false,
         updated_by = v_actor
   WHERE h.institution_id  = p_institution_id
     AND h.staff_scope     = p_staff_scope
     AND h.applicable_gender = v_gender
     AND h.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
     AND h.role_key IS NOT DISTINCT FROM p_role_key
     AND h.staff_id IS NOT DISTINCT FROM p_staff_id
     AND h.is_active
     AND h.effective_until IS NULL
     AND h.effective_from >= p_on;
  GET DIAGNOSTICS v_deacted = ROW_COUNT;

  RETURN v_closed + v_deacted;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Locks — a DROP takes the ACL with it, so every signature is re-stated
-- ─────────────────────────────────────────────────────────────────────────────
-- ci:allow-secdef-authenticated every wrapper below gates inside its body
-- (is_super_admin / hr.shift_timings.* / the caller's own staff row), as it did
-- before this migration; fn_staff_role_keys and fn_shift_timing_pick are
-- SECURITY INVOKER helpers reachable only through them.
REVOKE EXECUTE ON FUNCTION public.fn_staff_role_keys(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_staff_role_keys(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_shift_timing_pick(uuid, uuid, boolean, text, smallint, date, uuid, uuid, text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_shift_timing_pick(uuid, uuid, boolean, text, smallint, date, uuid, uuid, text[]) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_shift_window(uuid, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_shift_window(uuid, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.hr_is_working_day(uuid, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_is_working_day(uuid, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_resolve_shift_timing(uuid, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_resolve_shift_timing(uuid, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_resolve_shift_timings_bulk(uuid[], date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_resolve_shift_timings_bulk(uuid[], date, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_shift_timing_coverage(uuid, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_shift_timing_coverage(uuid, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_hr_attendance_period_projection(uuid, integer, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_attendance_period_projection(uuid, integer, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb, text, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb, text, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_end_shift_timing_override(uuid, text, uuid, text, date, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_end_shift_timing_override(uuid, text, uuid, text, date, text, uuid) TO authenticated, service_role;
