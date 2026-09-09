-- 1. The timing row learns a second way to judge a day.
ALTER TABLE public.hr_shift_timings
  ADD COLUMN IF NOT EXISTS attendance_mode  text NOT NULL DEFAULT 'span',
  ADD COLUMN IF NOT EXISTS required_minutes integer;

ALTER TABLE public.hr_shift_timings
  DROP CONSTRAINT IF EXISTS hr_shift_timings_attendance_mode_check;
ALTER TABLE public.hr_shift_timings
  ADD CONSTRAINT hr_shift_timings_attendance_mode_check
  CHECK (attendance_mode IN ('span', 'duration'));

ALTER TABLE public.hr_shift_timings
  DROP CONSTRAINT IF EXISTS hr_shift_timings_duration_shape_check;
ALTER TABLE public.hr_shift_timings
  ADD CONSTRAINT hr_shift_timings_duration_shape_check
  CHECK (attendance_mode <> 'duration' OR (required_minutes IS NOT NULL AND required_minutes > 0));

COMMENT ON COLUMN public.hr_shift_timings.attendance_mode IS
  'span = be present across the configured window(s), the original rule. duration = any required_minutes on that day counts, whenever they fall. Institution rows are always span; duration arrives by overlay from hr_work_pattern_week_days.';


-- 2. Per-day hours on a work pattern, hung off the WEEK row so hours version
--    with the mask rather than drifting from it.
CREATE TABLE IF NOT EXISTS public.hr_work_pattern_week_days (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id           uuid NOT NULL REFERENCES public.hr_work_pattern_weeks(id) ON DELETE CASCADE,
  day_of_week       smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  attendance_mode   text NOT NULL CHECK (attendance_mode IN ('span', 'duration')),
  required_minutes  integer,
  first_half_start  time,
  first_half_end    time,
  second_half_start time,
  second_half_end   time,
  grace_minutes     integer NOT NULL DEFAULT 0 CHECK (grace_minutes >= 0),
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_wpwd_one_row_per_day UNIQUE (week_id, day_of_week),
  -- Each mode carries exactly its own fields. A duration row with a window, or
  -- a span row with a minute count, is a half-configured day that would resolve
  -- to whichever the evaluator happened to read first.
  CONSTRAINT hr_wpwd_shape CHECK (
    CASE attendance_mode
      WHEN 'duration' THEN
        required_minutes IS NOT NULL AND required_minutes > 0
        AND first_half_start IS NULL AND first_half_end IS NULL
        AND second_half_start IS NULL AND second_half_end IS NULL
      WHEN 'span' THEN
        required_minutes IS NULL
        AND first_half_start IS NOT NULL AND first_half_end IS NOT NULL
        AND first_half_end > first_half_start
        AND ((second_half_start IS NULL) = (second_half_end IS NULL))
        AND (second_half_end IS NULL OR second_half_end > second_half_start)
      ELSE false
    END
  )
);

CREATE INDEX IF NOT EXISTS hr_wpwd_week_idx ON public.hr_work_pattern_week_days (week_id);

COMMENT ON TABLE public.hr_work_pattern_week_days IS
  'Optional per-day hours for a work pattern week. A day with no row here keeps the institution shift timing for that weekday; the week''s working_days array still decides WHICH days are worked.';

-- The mask is still the authority on which days exist. Cross-table, so a CHECK
-- cannot express it.
CREATE OR REPLACE FUNCTION public.hr_trig_wpwd_day_in_mask()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days smallint[];
BEGIN
  SELECT working_days INTO v_days
    FROM public.hr_work_pattern_weeks WHERE id = NEW.week_id;

  IF v_days IS NULL OR NOT (NEW.day_of_week = ANY (v_days)) THEN
    RAISE EXCEPTION
      'Day % is not one of this pattern''s working days, so it cannot carry hours.',
      NEW.day_of_week USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_wpwd_day_in_mask ON public.hr_work_pattern_week_days;
CREATE TRIGGER trg_wpwd_day_in_mask
BEFORE INSERT OR UPDATE ON public.hr_work_pattern_week_days
FOR EACH ROW EXECUTE FUNCTION public.hr_trig_wpwd_day_in_mask();

DROP TRIGGER IF EXISTS trg_wpwd_updated_at ON public.hr_work_pattern_week_days;
CREATE TRIGGER trg_wpwd_updated_at
BEFORE UPDATE ON public.hr_work_pattern_week_days
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hr_work_pattern_week_days ENABLE ROW LEVEL SECURITY;

-- Mirrors hr_work_pattern_weeks exactly: readable with the shift-timing keys at
-- an institution you can reach, writable only by a super admin because every
-- real write goes through fn_hr_set_work_pattern_days.
DROP POLICY IF EXISTS hr_wpwd_select ON public.hr_work_pattern_week_days;
CREATE POLICY hr_wpwd_select ON public.hr_work_pattern_week_days
FOR SELECT USING (
  EXISTS (
    SELECT 1
      FROM public.hr_work_pattern_weeks w
      JOIN public.hr_work_patterns p ON p.id = w.work_pattern_id
     WHERE w.id = hr_work_pattern_week_days.week_id
       AND ((SELECT public.is_super_admin())
         OR (SELECT public.is_admin())
         OR (((SELECT public.user_has_permission('hr.shift_timings.view'))
           OR (SELECT public.user_has_permission('hr.shift_timings.manage')))
             AND public.role_has_institution_access(p.institution_id)))
  )
);

DROP POLICY IF EXISTS hr_wpwd_write ON public.hr_work_pattern_week_days;
CREATE POLICY hr_wpwd_write ON public.hr_work_pattern_week_days
FOR ALL USING ((SELECT public.is_super_admin()))
WITH CHECK ((SELECT public.is_super_admin()));

REVOKE ALL ON public.hr_work_pattern_week_days FROM authenticated;
GRANT SELECT ON public.hr_work_pattern_week_days TO authenticated;


-- 3. The per-day hours in force for a pattern on a date, shaped as an overlay
--    onto hr_shift_timings. Plain STABLE like its sibling fn_work_pattern_days:
--    every caller is already a SECURITY DEFINER wrapper.
CREATE OR REPLACE FUNCTION public.fn_work_pattern_day_hours(
  p_pattern_id uuid, p_date date, p_dow smallint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT jsonb_build_object(
           'attendance_mode',   d.attendance_mode,
           'required_minutes',  d.required_minutes,
           'first_half_start',  d.first_half_start,
           'first_half_end',    d.first_half_end,
           'second_half_start', d.second_half_start,
           'second_half_end',   d.second_half_end,
           'grace_minutes',     d.grace_minutes)
  FROM public.hr_work_pattern_weeks w
  JOIN public.hr_work_pattern_week_days d
    ON d.week_id = w.id AND d.day_of_week = p_dow
  WHERE w.work_pattern_id = p_pattern_id
    AND w.effective_from <= p_date
    AND (w.effective_until IS NULL OR w.effective_until > p_date)
  ORDER BY w.effective_from DESC
  LIMIT 1;
$function$;


-- 4. THE ONE RESOLVER. Return type is unchanged (SETOF hr_shift_timings), which
--    is the whole point of putting the two new columns on that table: the
--    overlay reaches the evaluator, the projection and the import untouched.
CREATE OR REPLACE FUNCTION public.fn_shift_timing_pick(
  p_institution_id uuid, p_category_id uuid, p_is_teaching boolean, p_gender text,
  p_dow smallint, p_date date, p_work_pattern_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF hr_shift_timings
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
