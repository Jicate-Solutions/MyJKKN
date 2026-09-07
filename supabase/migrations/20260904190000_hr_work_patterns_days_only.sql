-- Work patterns become a DAY MASK; hours stay in Shift Timings (2026-09-04).
--
-- WHY. The first build (20260904120000) gave each pattern its own week of hours
-- as hr_shift_timings rows with staff_scope='work_pattern', exclusive for its
-- members. HR's correction: at Dental the hours are the teaching/non-teaching
-- hours already configured — only the WORKING DAYS differ (6, 5 or 3 a week).
-- Re-entering hours per pattern duplicated configuration and would drift the
-- moment Shift Timings changed.
--
-- THE RULE NOW. A pattern holds working days only, effective-dated
-- (hr_work_pattern_weeks). For a member on date D the resolver takes the row
-- their ordinary ladder produces (category / teaching / non-teaching / gender,
-- hours included) and, when D's weekday is not in the pattern's days, returns
-- it as a non-working day. A pattern REMOVES days; it never adds one — a day the
-- institution's week does not work has no hours to add, so it stays off
-- whatever the pattern says.
--
-- The mask is applied INSIDE fn_shift_timing_pick, so every reader — the four
-- staff wrappers, the biometric import, recompute, hr_calc_leave_days, the
-- period summary's scheduled_days (the salary basis) and the Short Time Off
-- drawer — follows it with no change of their own.
--
-- THE PATTERN SCOPE ON hr_shift_timings IS REMOVED, not left as a dead value.
-- No production row ever used it (the test rows were rolled back), so this is
-- a clean revert of that part of 20260904120000: column, constraints, unique
-- index and the 7-argument fn_save_shift_timing_week go back to their
-- 2026-08-30 shape. fn_shift_timing_pick keeps its 7th argument — that is how
-- the mask gets its pattern.

-- ============================================================================
-- 1 · hr_work_pattern_weeks — the days, effective-dated
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hr_work_pattern_weeks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_pattern_id  uuid NOT NULL REFERENCES public.hr_work_patterns(id) ON DELETE CASCADE,
  -- ISO weekdays 1=Mon .. 7=Sun, de-duplicated and sorted by the writer.
  working_days     smallint[] NOT NULL,
  effective_from   date NOT NULL,
  -- EXCLUSIVE, like hr_shift_timings.effective_until.
  effective_until  date,
  notes            text,
  created_by       uuid REFERENCES public.profiles(id),
  updated_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_wpw_days_chk CHECK (
    cardinality(working_days) > 0
    AND working_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
  ),
  CONSTRAINT hr_wpw_effective_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
  CONSTRAINT hr_wpw_no_overlap EXCLUDE USING gist (
    work_pattern_id WITH =,
    daterange(effective_from, effective_until, '[)') WITH &&
  )
);

CREATE INDEX IF NOT EXISTS hr_wpw_pattern_idx
  ON public.hr_work_pattern_weeks (work_pattern_id, effective_from DESC);

ALTER TABLE public.hr_work_pattern_weeks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.hr_work_pattern_weeks IS
  'The working weekdays of a work pattern, effective-dated. Written only by fn_hr_set_work_pattern_days; read by fn_work_pattern_days inside fn_shift_timing_pick. Hours are never here — they come from the member''s Shift Timings row.';

DROP TRIGGER IF EXISTS hr_wpw_updated_at ON public.hr_work_pattern_weeks;
CREATE TRIGGER hr_wpw_updated_at
  BEFORE UPDATE ON public.hr_work_pattern_weeks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS hr_wpw_select ON public.hr_work_pattern_weeks;
CREATE POLICY hr_wpw_select ON public.hr_work_pattern_weeks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.hr_work_patterns p
       WHERE p.id = work_pattern_id
         AND (   (SELECT public.is_super_admin())
              OR (SELECT public.is_admin())
              OR (((SELECT public.user_has_permission('hr.shift_timings.view'))
                   OR (SELECT public.user_has_permission('hr.shift_timings.manage')))
                  AND public.role_has_institution_access(p.institution_id)))
    )
  );

-- Writes go through fn_hr_set_work_pattern_days (SECURITY DEFINER); a direct
-- write is left to super admins only, like the assignments table.
DROP POLICY IF EXISTS hr_wpw_write ON public.hr_work_pattern_weeks;
CREATE POLICY hr_wpw_write ON public.hr_work_pattern_weeks
  FOR ALL USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_work_pattern_weeks TO authenticated;
GRANT ALL ON public.hr_work_pattern_weeks TO service_role;

-- ============================================================================
-- 2 · hr_shift_timings — the pattern scope goes away
-- ============================================================================

DROP INDEX IF EXISTS public.hr_shift_timings_current_uq;
ALTER TABLE public.hr_shift_timings DROP CONSTRAINT IF EXISTS hr_shift_timings_scope_target_chk;
ALTER TABLE public.hr_shift_timings DROP CONSTRAINT IF EXISTS hr_shift_timings_pattern_gender_chk;
ALTER TABLE public.hr_shift_timings DROP CONSTRAINT IF EXISTS hr_shift_timings_staff_scope_check;

-- None exist in production; stated so the column drop cannot strand a row.
DELETE FROM public.hr_shift_timings WHERE staff_scope = 'work_pattern';

ALTER TABLE public.hr_shift_timings DROP COLUMN IF EXISTS work_pattern_id;

ALTER TABLE public.hr_shift_timings ADD CONSTRAINT hr_shift_timings_staff_scope_check
  CHECK (staff_scope IN ('teaching', 'non_teaching', 'category'));

ALTER TABLE public.hr_shift_timings ADD CONSTRAINT hr_shift_timings_scope_category_chk
  CHECK (
       (staff_scope = 'category'  AND employment_category_id IS NOT NULL)
    OR (staff_scope <> 'category' AND employment_category_id IS NULL)
  );

CREATE UNIQUE INDEX hr_shift_timings_current_uq
  ON public.hr_shift_timings (
    institution_id,
    staff_scope,
    COALESCE(employment_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    applicable_gender,
    day_of_week
  )
  WHERE effective_until IS NULL AND is_active;

-- ============================================================================
-- 3 · Which days does a pattern work on a date?
-- ============================================================================
--
-- Plain SQL, STABLE, SECURITY INVOKER, schema-qualified — like
-- fn_shift_timing_pick and fn_staff_work_pattern_id. NULL when the pattern has
-- no week in force on the date (or no pattern at all), which the resolver
-- treats as "mask nothing"; fn_hr_assign_work_pattern refuses an assignment
-- the pattern's days do not cover, so that state is never reached for a member.

CREATE OR REPLACE FUNCTION public.fn_work_pattern_days(p_pattern_id uuid, p_date date)
RETURNS smallint[]
LANGUAGE sql
STABLE
AS $function$
  SELECT w.working_days
  FROM public.hr_work_pattern_weeks w
  WHERE w.work_pattern_id = p_pattern_id
    AND w.effective_from <= p_date
    AND (w.effective_until IS NULL OR w.effective_until > p_date)
  ORDER BY w.effective_from DESC
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.fn_work_pattern_days(uuid, date) IS
  'The working weekdays (ISO 1..7) a work pattern is in force for on a date, or NULL.';

-- ============================================================================
-- 4 · fn_shift_timing_pick — the ladder, then the mask
-- ============================================================================
--
-- Same 7-argument signature, so CREATE OR REPLACE. The base row is the
-- ordinary ladder's winner (hours included); when the member holds a pattern
-- whose days exclude this weekday, the same row comes back as a non-working
-- day. jsonb_populate_record keeps every other column — id, grace,
-- second_saturday_holiday, effective dates — so callers see the rule that
-- produced the day, just switched off.

CREATE OR REPLACE FUNCTION public.fn_shift_timing_pick(
  p_institution_id  uuid,
  p_category_id     uuid,
  p_is_teaching     boolean,
  p_gender          text,
  p_dow             smallint,
  p_date            date,
  p_work_pattern_id uuid DEFAULT NULL
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
             WHEN p_work_pattern_id IS NOT NULL
                  AND m.days IS NOT NULL
                  AND NOT (p_dow = ANY (m.days))
             THEN jsonb_populate_record(
                    t,
                    '{"is_working_day": false, "first_half_start": null, "first_half_end": null, "second_half_start": null, "second_half_end": null}'::jsonb)
             ELSE t
           END AS row_out
    FROM public.hr_shift_timings t
    CROSS JOIN (SELECT public.fn_work_pattern_days(p_work_pattern_id, p_date) AS days) m
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
    LIMIT 1
  ) x;
$function$;

COMMENT ON FUNCTION public.fn_shift_timing_pick(uuid, uuid, boolean, text, smallint, date, uuid) IS
  'The single shift-timing resolution predicate. Most specific wins: scope first (category over teaching/non_teaching), then gender (an exact match over ''all''), then the latest effective_from. A held work pattern then switches the day OFF when its weekday is not in the pattern''s days; it never adds a day. Every reader must go through this.';

-- ============================================================================
-- 5 · fn_save_shift_timing_week — back to six arguments
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb, text, uuid);

CREATE FUNCTION public.fn_save_shift_timing_week(
  p_institution_id         uuid,
  p_staff_scope            text,
  p_employment_category_id uuid,
  p_effective_from         date,
  p_days                   jsonb,
  p_applicable_gender      text DEFAULT 'all'
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

  IF p_staff_scope NOT IN ('teaching','non_teaching','category') THEN
    RAISE EXCEPTION 'Invalid staff_scope: %', p_staff_scope USING ERRCODE = '22023';
  END IF;

  IF p_applicable_gender NOT IN ('all','male','female','bigender') THEN
    RAISE EXCEPTION 'Invalid applicable_gender: %', p_applicable_gender USING ERRCODE = '22023';
  END IF;

  IF (p_staff_scope = 'category') <> (p_employment_category_id IS NOT NULL) THEN
    RAISE EXCEPTION 'staff_scope=category requires an employment_category_id, and vice versa'
      USING ERRCODE = '22023';
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
      AND t.applicable_gender = p_applicable_gender
      AND t.day_of_week    = v_day.day_of_week
      AND t.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
      AND t.effective_until IS NULL
      AND t.is_active;

    IF NOT FOUND THEN
      INSERT INTO public.hr_shift_timings (
        institution_id, staff_scope, employment_category_id, applicable_gender, day_of_week,
        is_working_day, first_half_start, first_half_end,
        second_half_start, second_half_end,
        grace_minutes, second_saturday_holiday, effective_from,
        created_by, updated_by
      ) VALUES (
        p_institution_id, p_staff_scope, p_employment_category_id, p_applicable_gender, v_day.day_of_week,
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
         AND h.applicable_gender = p_applicable_gender
         AND h.day_of_week    = v_day.day_of_week
         AND h.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
         AND h.id <> v_current.id
         AND h.is_active
         AND h.effective_from >= p_effective_from;

      UPDATE public.hr_shift_timings h
         SET effective_until = p_effective_from,
             updated_by      = v_actor
       WHERE h.institution_id = p_institution_id
         AND h.staff_scope    = p_staff_scope
         AND h.applicable_gender = p_applicable_gender
         AND h.day_of_week    = v_day.day_of_week
         AND h.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
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
        institution_id, staff_scope, employment_category_id, applicable_gender, day_of_week,
        is_working_day, first_half_start, first_half_end,
        second_half_start, second_half_end,
        grace_minutes, second_saturday_holiday, effective_from,
        created_by, updated_by
      ) VALUES (
        p_institution_id, p_staff_scope, p_employment_category_id, p_applicable_gender, v_day.day_of_week,
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

COMMENT ON FUNCTION public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb, text) IS
  'Save one scope''s week (teaching / non_teaching / category × gender) effective from a date. Closes the previous rows at that date, or rewrites them when backdating.';

-- ============================================================================
-- 6 · fn_shift_timing_coverage — pattern members are counted again
-- ============================================================================
--
-- They resolve through their category / teaching week now (with days masked),
-- so a category with no timing is a real gap for them too.

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

-- ============================================================================
-- 7 · fn_hr_set_work_pattern_days — the only writer of the days
-- ============================================================================
--
-- The three branches of fn_save_shift_timing_week, on one row instead of seven:
--   * no open row            -> insert
--   * date on/before current -> rewrite current in place, closing earlier rows
--                               at the date and removing later ones (they
--                               never applied)
--   * date after current     -> close current at the date, insert the new row

CREATE OR REPLACE FUNCTION public.fn_hr_set_work_pattern_days(
  p_pattern_id     uuid,
  p_working_days   smallint[],
  p_effective_from date,
  p_notes          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pattern    public.hr_work_patterns%ROWTYPE;
  v_actor      uuid := auth.uid();
  v_days       smallint[];
  v_current    public.hr_work_pattern_weeks%ROWTYPE;
  v_superseded boolean := false;
BEGIN
  SELECT * INTO v_pattern FROM public.hr_work_patterns WHERE id = p_pattern_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work pattern % not found', p_pattern_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('hr.shift_timings.manage')
        AND public.role_has_institution_access(v_pattern.institution_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to configure work patterns at this institution'
      USING ERRCODE = '42501';
  END IF;

  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'An effective date is required' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT d ORDER BY d) INTO v_days
    FROM unnest(COALESCE(p_working_days, ARRAY[]::smallint[])) AS d
   WHERE d BETWEEN 1 AND 7;
  IF v_days IS NULL OR cardinality(v_days) = 0 THEN
    RAISE EXCEPTION 'Pick at least one working day' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current
    FROM public.hr_work_pattern_weeks
   WHERE work_pattern_id = p_pattern_id
     AND effective_until IS NULL
   ORDER BY effective_from DESC
   LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.hr_work_pattern_weeks (
      work_pattern_id, working_days, effective_from, notes, created_by, updated_by
    ) VALUES (
      p_pattern_id, v_days, p_effective_from, p_notes, v_actor, v_actor
    );

  ELSIF p_effective_from <= v_current.effective_from THEN
    DELETE FROM public.hr_work_pattern_weeks
     WHERE work_pattern_id = p_pattern_id
       AND id <> v_current.id
       AND effective_from >= p_effective_from;

    UPDATE public.hr_work_pattern_weeks
       SET effective_until = p_effective_from,
           updated_by      = v_actor
     WHERE work_pattern_id = p_pattern_id
       AND id <> v_current.id
       AND effective_from < p_effective_from
       AND (effective_until IS NULL OR effective_until > p_effective_from);

    UPDATE public.hr_work_pattern_weeks
       SET working_days   = v_days,
           effective_from = p_effective_from,
           notes          = p_notes,
           updated_by     = v_actor
     WHERE id = v_current.id;

  ELSE
    UPDATE public.hr_work_pattern_weeks
       SET effective_until = p_effective_from,
           updated_by      = v_actor
     WHERE id = v_current.id;

    INSERT INTO public.hr_work_pattern_weeks (
      work_pattern_id, working_days, effective_from, notes, created_by, updated_by
    ) VALUES (
      p_pattern_id, v_days, p_effective_from, p_notes, v_actor, v_actor
    );
    v_superseded := true;
  END IF;

  RETURN jsonb_build_object(
    'pattern_id',     p_pattern_id,
    'working_days',   to_jsonb(v_days),
    'effective_from', p_effective_from,
    'superseded',     v_superseded
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_set_work_pattern_days(uuid, smallint[], date, text) IS
  'Set a work pattern''s working weekdays (ISO 1..7) effective from a date. Closes the previous days row at that date, or rewrites it when backdating — the same rule as saving a shift-timing week.';

-- ============================================================================
-- 8 · fn_hr_assign_work_pattern — the pre-check reads the days, not a week
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_hr_assign_work_pattern(
  p_staff_ids       uuid[],
  p_work_pattern_id uuid,
  p_effective_from  date,
  p_notes           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor        uuid := auth.uid();
  v_removing     boolean := (p_work_pattern_id IS NULL);
  v_pattern      public.hr_work_patterns%ROWTYPE;
  v_sid          uuid;
  v_staff        record;
  v_prev_pattern uuid;
  v_prev_name    text;
  v_changes      jsonb;
  v_rows         jsonb := '[]'::jsonb;
  r              record;
BEGIN
  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'An effective date is required' USING ERRCODE = '22023';
  END IF;
  IF p_staff_ids IS NULL OR cardinality(p_staff_ids) = 0 THEN
    RAISE EXCEPTION 'No staff selected' USING ERRCODE = '22023';
  END IF;

  IF NOT v_removing THEN
    SELECT * INTO v_pattern FROM public.hr_work_patterns WHERE id = p_work_pattern_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Work pattern % not found', p_work_pattern_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT v_pattern.is_active THEN
      RAISE EXCEPTION 'Work pattern "%" is inactive', v_pattern.name USING ERRCODE = '22023';
    END IF;

    IF NOT (
         public.is_super_admin()
      OR public.is_admin()
      OR (public.user_has_permission('hr.shift_timings.manage')
          AND public.role_has_institution_access(v_pattern.institution_id))
    ) THEN
      RAISE EXCEPTION 'Not authorized to assign work patterns at this institution'
        USING ERRCODE = '42501';
    END IF;

    -- The mask does nothing for a date the pattern has no days for, which
    -- would silently give the member the full institution week. Refuse here.
    IF public.fn_work_pattern_days(p_work_pattern_id, p_effective_from) IS NULL THEN
      RAISE EXCEPTION 'Work pattern "%" has no working days in force on %. Save the pattern''s working days first.',
        v_pattern.name, to_char(p_effective_from, 'DD Mon YYYY')
        USING ERRCODE = '22023';
    END IF;
  END IF;

  FOREACH v_sid IN ARRAY p_staff_ids LOOP
    SELECT s.id,
           s.staff_id AS staff_code,
           btrim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) AS name,
           s.institution_id
      INTO v_staff
      FROM public.staff s
     WHERE s.id = v_sid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Staff member % not found', v_sid USING ERRCODE = 'P0002';
    END IF;

    -- Per row, not once: a uuid[] would otherwise be a bulk cross-institution write.
    IF NOT v_removing AND v_staff.institution_id <> v_pattern.institution_id THEN
      RAISE EXCEPTION '% (%) works at a different institution from the work pattern',
        v_staff.name, coalesce(v_staff.staff_code, '?') USING ERRCODE = '22023';
    END IF;
    IF v_removing AND NOT (
         public.is_super_admin()
      OR public.is_admin()
      OR (public.user_has_permission('hr.shift_timings.manage')
          AND public.role_has_institution_access(v_staff.institution_id))
    ) THEN
      RAISE EXCEPTION 'Not authorized to change work patterns at this institution'
        USING ERRCODE = '42501';
    END IF;

    SELECT a.work_pattern_id, p.name
      INTO v_prev_pattern, v_prev_name
      FROM public.hr_staff_work_pattern_assignments a
      JOIN public.hr_work_patterns p ON p.id = a.work_pattern_id
     WHERE a.staff_id = v_sid
       AND a.effective_from <= p_effective_from
       AND (a.effective_until IS NULL OR a.effective_until > p_effective_from)
     ORDER BY a.effective_from DESC
     LIMIT 1;
    IF NOT FOUND THEN
      v_prev_pattern := NULL;
      v_prev_name    := NULL;
    END IF;

    DELETE FROM public.hr_staff_work_pattern_assignments
     WHERE staff_id = v_sid
       AND effective_from >= p_effective_from;

    UPDATE public.hr_staff_work_pattern_assignments
       SET effective_until = p_effective_from,
           updated_by      = v_actor
     WHERE staff_id = v_sid
       AND effective_from < p_effective_from
       AND (effective_until IS NULL OR effective_until > p_effective_from);

    IF NOT v_removing THEN
      INSERT INTO public.hr_staff_work_pattern_assignments (
        staff_id, work_pattern_id, institution_id, effective_from, notes, created_by, updated_by
      ) VALUES (
        v_sid, p_work_pattern_id, v_pattern.institution_id, p_effective_from, p_notes, v_actor, v_actor
      );
    END IF;

    -- Resync open balances: every leave type the NEW or the PREVIOUS pattern
    -- speaks for. UPDATE only — generate_hr_leave_balances inserts ON CONFLICT
    -- DO NOTHING and would skip a row created here for ever.
    v_changes := '[]'::jsonb;
    FOR r IN
      WITH touched AS (
        SELECT e.leave_type_id FROM public.hr_work_pattern_leave_entitlements e
         WHERE e.work_pattern_id = p_work_pattern_id
        UNION
        SELECT e.leave_type_id FROM public.hr_work_pattern_leave_entitlements e
         WHERE e.work_pattern_id = v_prev_pattern
      )
      SELECT b.employee_id, b.leave_type_id, b.hr_academic_year_id,
             t.leave_type_code, y.year_name,
             COALESCE(o.entitled_days, b.entitled, t.default_entitled_days)   AS before_eff,
             ne.entitled_days                                                  AS new_raw,
             COALESCE(o.entitled_days, ne.entitled_days, t.default_entitled_days) AS after_eff,
             (o.id IS NOT NULL)                                                AS overridden
        FROM public.hr_leave_balances b
        JOIN touched tp ON tp.leave_type_id = b.leave_type_id
        JOIN public.hr_leave_types t ON t.id = b.leave_type_id
        JOIN public.hr_academic_years y ON y.id = b.hr_academic_year_id
        LEFT JOIN public.hr_leave_entitlement_overrides o
               ON o.employee_id = b.employee_id
              AND o.leave_type_id = b.leave_type_id
              AND o.hr_academic_year_id = b.hr_academic_year_id
        LEFT JOIN public.hr_work_pattern_leave_entitlements ne
               ON ne.work_pattern_id = p_work_pattern_id
              AND ne.leave_type_id = b.leave_type_id
       WHERE b.employee_id = v_sid
         AND t.request_category = 'leave'
         AND y.frozen_at IS NULL
         AND y.end_date >= p_effective_from
       ORDER BY y.start_date, t.display_order
    LOOP
      UPDATE public.hr_leave_balances
         SET entitled   = r.new_raw,
             updated_at = now()
       WHERE employee_id         = r.employee_id
         AND leave_type_id       = r.leave_type_id
         AND hr_academic_year_id = r.hr_academic_year_id;

      v_changes := v_changes || jsonb_build_object(
        'leave_type_code', r.leave_type_code,
        'year_name',       r.year_name,
        'from',            r.before_eff,
        'to',              r.after_eff,
        'overridden',      r.overridden
      );
    END LOOP;

    v_rows := v_rows || jsonb_build_object(
      'staff_id',         v_sid,
      'staff_code',       v_staff.staff_code,
      'name',             v_staff.name,
      'previous_pattern', v_prev_name,
      'changes',          v_changes
    );
  END LOOP;

  RETURN jsonb_build_object(
    'pattern_id',     p_work_pattern_id,
    'pattern_name',   CASE WHEN v_removing THEN NULL ELSE v_pattern.name END,
    'effective_from', p_effective_from,
    'removed',        v_removing,
    'staff_count',    cardinality(p_staff_ids),
    'staff',          v_rows
  );
END;
$function$;

-- ============================================================================
-- 9 · fn_hr_delete_work_pattern — nothing on hr_shift_timings to remove now
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_hr_delete_work_pattern(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pattern public.hr_work_patterns%ROWTYPE;
  v_held    integer;
  v_weeks   integer;
BEGIN
  SELECT * INTO v_pattern FROM public.hr_work_patterns WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work pattern % not found', p_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
       public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('hr.shift_timings.manage')
        AND public.role_has_institution_access(v_pattern.institution_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to delete work patterns at this institution'
      USING ERRCODE = '42501';
  END IF;

  -- ANY assignment, live or ended: history is what is being protected.
  SELECT count(DISTINCT a.staff_id) INTO v_held
    FROM public.hr_staff_work_pattern_assignments a
   WHERE a.work_pattern_id = p_id;

  IF v_held > 0 THEN
    RAISE EXCEPTION '"%" has been held by % staff member(s). Their attendance history resolves through it, so it cannot be deleted. Remove any current members and deactivate it instead.',
      v_pattern.name, v_held
      USING ERRCODE = '23503';
  END IF;

  SELECT count(*) INTO v_weeks FROM public.hr_work_pattern_weeks WHERE work_pattern_id = p_id;

  -- Days and entitlements cascade from the pattern row.
  DELETE FROM public.hr_work_patterns WHERE id = p_id;

  RETURN jsonb_build_object(
    'deleted',       true,
    'name',          v_pattern.name,
    'weeks_removed', v_weeks
  );
END;
$function$;

-- ============================================================================
-- 10 · Grants
-- ============================================================================

REVOKE ALL ON FUNCTION public.fn_work_pattern_days(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_work_pattern_days(uuid, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_shift_timing_pick(uuid, uuid, boolean, text, smallint, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_shift_timing_pick(uuid, uuid, boolean, text, smallint, date, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_save_shift_timing_week(uuid, text, uuid, date, jsonb, text) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_hr_set_work_pattern_days(uuid, smallint[], date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_set_work_pattern_days(uuid, smallint[], date, text) TO authenticated;
