-- One body for "which shift timing row applies", and gender-aware.
--
-- WHY THIS EXISTS
--
-- The resolution predicate was copy-pasted into FIVE functions —
-- fn_shift_window, fn_resolve_shift_timing, fn_resolve_shift_timings_bulk,
-- hr_is_working_day and fn_shift_timing_coverage. Adding the gender dimension
-- meant editing the same WHERE and ORDER BY in five places in lockstep, and one
-- of them being missed is exactly the shape that produced the bug where a
-- 30-minute permission erased a fully worked day: two triggers on one table,
-- only one of them holding the rule.
--
-- So the predicate moves here and all five are rewritten onto it. They keep
-- their own auth gates, their own second-Saturday presentation and their own
-- return shapes — only the choice of row is shared.
--
-- PRECEDENCE — four levels, read scope-first then gender:
--
--   1. category            + exact gender     most specific
--   2. category            + 'all'
--   3. teaching|non_teach  + exact gender
--   4. teaching|non_teach  + 'all'            least specific
--
-- Scope-major on purpose: a category override is the more specific statement
-- about who a person is, so a female Security guard keeps the Security start
-- time rather than falling back to the generic female window. An institution
-- that wants otherwise adds an explicit category+female row.
--
-- UNMATCHED GENDERS FALL THROUGH, THEY DO NOT VANISH. staff.gender permits
-- 'bigender' and only 'male'/'female' occur today; anyone whose gender has no
-- rule matches the 'all' row. Returning nothing would leave them with no shift
-- window at all, which reads downstream as "not a working day".
--
-- Takes resolved attributes rather than a staff_id because
-- fn_shift_timing_coverage resolves per employment category and has no staff row
-- to hand. It carries no personal data — an institution's working-hours calendar
-- for one day, the same reasoning already documented for fn_shift_window.
--
-- Plain SQL, STABLE, no SECURITY clause: SECURITY INVOKER is the default and the
-- right choice. Called from inside the five SECURITY DEFINER functions it runs
-- with their privileges; called directly it is gated by hr_shift_timings' own
-- SELECT policy. Everything is schema-qualified, so no `SET search_path` is
-- needed and the planner can still inline it into the bulk resolver's LATERAL.

CREATE OR REPLACE FUNCTION public.fn_shift_timing_pick(
  p_institution_id uuid,
  p_category_id    uuid,
  p_is_teaching    boolean,
  p_gender         text,
  p_dow            smallint,
  p_date           date
)
RETURNS SETOF public.hr_shift_timings
LANGUAGE sql
STABLE
AS $function$
  SELECT t.*
  FROM public.hr_shift_timings t
  WHERE t.institution_id = p_institution_id
    AND t.day_of_week    = p_dow
    AND t.is_active
    AND t.effective_from <= p_date
    AND (t.effective_until IS NULL OR t.effective_until > p_date)
    AND (
         (t.staff_scope = 'category'     AND t.employment_category_id = p_category_id)
      OR (t.staff_scope = 'teaching'     AND p_is_teaching)
      OR (t.staff_scope = 'non_teaching' AND NOT p_is_teaching)
    )
    AND (
         t.applicable_gender = 'all'
      OR t.applicable_gender = lower(btrim(COALESCE(p_gender, '')))
    )
  ORDER BY
    CASE t.staff_scope WHEN 'category' THEN 0 ELSE 1 END,
    CASE WHEN t.applicable_gender = 'all' THEN 1 ELSE 0 END,
    t.effective_from DESC
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.fn_shift_timing_pick(uuid, uuid, boolean, text, smallint, date) IS
  'The single shift-timing resolution predicate. Most specific wins: scope first (category over teaching/non_teaching), then gender (an exact match over ''all''), then the latest effective_from. Every reader must go through this.';

-- ---------------------------------------------------------------------------
-- 1 · fn_shift_window — output shape UNCHANGED
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_shift_window(p_staff_id uuid, p_date date)
 RETURNS TABLE(timing_id uuid, is_working_day boolean, first_half_start time without time zone, first_half_end time without time zone, second_half_start time without time zone, second_half_end time without time zone, grace_minutes integer, matched_by text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_institution_id uuid;
  v_category_id    uuid;
  v_is_teaching    boolean;
  v_gender         text;
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
         ELSE t.staff_scope END
  FROM public.fn_shift_timing_pick(
         v_institution_id, v_category_id, v_is_teaching, v_gender, v_dow, p_date) t;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2 · hr_is_working_day — output shape UNCHANGED
-- ---------------------------------------------------------------------------
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

  v_dow        := EXTRACT(ISODOW FROM p_date)::smallint;
  v_second_sat := (v_dow = 6 AND EXTRACT(DAY FROM p_date) BETWEEN 8 AND 14);

  SELECT CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN false
              ELSE t.is_working_day END
    INTO v_working
  FROM public.fn_shift_timing_pick(
         v_institution_id, v_category_id, v_is_teaching, v_gender, v_dow, p_date) t;

  RETURN v_working;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3 · fn_resolve_shift_timings_bulk — output shape UNCHANGED
--     Deliberately: this is the biometric import's and the recompute's path, the
--     two highest-risk consumers. Only which row it picks changes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_resolve_shift_timings_bulk(p_staff_ids uuid[], p_from date, p_to date)
 RETURNS TABLE(staff_id uuid, work_date date, timing_id uuid, is_working_day boolean, first_half_start time without time zone, first_half_end time without time zone, second_half_start time without time zone, second_half_end time without time zone, grace_minutes integer, matched_by text)
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
    SELECT st.id, st.institution_id, st.category_id, ec.is_teaching, st.gender
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
         ELSE t.staff_scope END
  FROM s
  CROSS JOIN d
  LEFT JOIN LATERAL public.fn_shift_timing_pick(
    s.institution_id, s.category_id, s.is_teaching, s.gender,
    EXTRACT(ISODOW FROM d.wd)::smallint, d.wd) t ON true;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4 · fn_resolve_shift_timing — GAINS applicable_gender, so the admin UI can say
--     which rule matched. RETURNS TABLE cannot change under CREATE OR REPLACE.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_resolve_shift_timing(uuid, date);

CREATE OR REPLACE FUNCTION public.fn_resolve_shift_timing(p_staff_id uuid, p_date date)
 RETURNS TABLE(timing_id uuid, institution_id uuid, staff_scope text, employment_category_id uuid, applicable_gender text, day_of_week smallint, is_working_day boolean, first_half_start time without time zone, first_half_end time without time zone, second_half_start time without time zone, second_half_end time without time zone, grace_minutes integer, grace_deadline time without time zone, matched_by text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_institution_id uuid;
  v_category_id    uuid;
  v_is_teaching    boolean;
  v_gender         text;
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
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) OR NOT t.is_working_day THEN NULL
         ELSE (t.first_half_start + make_interval(mins => t.grace_minutes))::time END,
    CASE WHEN (v_second_sat AND t.second_saturday_holiday) THEN 'second_saturday_holiday'
         ELSE t.staff_scope END
  FROM public.fn_shift_timing_pick(
         v_institution_id, v_category_id, v_is_teaching, v_gender, v_dow, p_date) t;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5 · fn_shift_timing_coverage — now buckets by (category, GENDER)
--
--     A category can hold both genders resolving to different timings, so a
--     per-category answer became ambiguous the moment gender existed. Splitting
--     the bucket is what keeps "these staff have NO timing" true.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_shift_timing_coverage(uuid, date);

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
    p_institution_id, c.cat_id, c.cat_is_teaching, c.cat_gender, v_dow, p_date) t ON true
  ORDER BY c.cat_staff_count DESC, c.cat_name, c.cat_gender;
END;
$function$;
