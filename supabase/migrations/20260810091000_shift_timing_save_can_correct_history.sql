-- ============================================================================
-- fn_save_shift_timing_week: let "correct from <date>" actually reach back
-- Created: 2026-08-10
--
-- THE LIMITATION
--   The function only ever loaded the row with effective_until IS NULL:
--
--     SELECT * INTO v_current FROM hr_shift_timings
--      WHERE ... AND effective_until IS NULL AND is_active;
--
--   so once a save had SUPERSEDED (closed the old row, opened a new one), the
--   closed row became unreachable from the UI forever. Asking to correct from
--   an earlier date took the ELSIF branch and updated the OPEN row in place
--   without moving its effective_from — the caller's date was silently
--   discarded and the historical period kept the old rule.
--
--   That is how the same class of bug landed three times in two days: a grace
--   change, a 2nd-Saturday change and a weekday change each fixed "the rule"
--   while leaving the days the operator was actually looking at untouched. Each
--   needed a hand-written migration to repair.
--
-- THE CHANGE — only the ELSIF (correct-in-place) branch. Saving with an
-- effective_from at or before the open row's now genuinely rewrites the span:
--
--   1. Rows starting inside the corrected span are RETIRED (is_active = false,
--      never DELETE — the row records what the rule used to say, and the
--      partial unique index ignores inactive rows).
--   2. A row that started BEFORE the span keeps its earlier life and is clipped
--      to end where the correction begins.
--   3. The open row absorbs the values AND moves its effective_from back.
--
--   Without step 1 the timeline would overlap: two active rows matching the
--   same July date, with the resolver's `ORDER BY effective_from DESC LIMIT 1`
--   picking arbitrarily between equal dates.
--
-- UNCHANGED: the permission gate, the scope/category validation, the INSERT
-- branch, the supersede branch, and the return count. Saving with
-- p_effective_from = the open row's effective_from — by far the common case —
-- is a strict no-op through the two new statements: nothing starts at or after
-- that date except the row itself (excluded by id), and the previous row
-- already ends exactly there.
--
-- Constraint safety: hr_shift_timings_effective_chk requires
-- effective_until > effective_from. Step 2 sets effective_until =
-- p_effective_from on rows whose effective_from is strictly less, so it holds.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_save_shift_timing_week(
  p_institution_id uuid,
  p_staff_scope text,
  p_employment_category_id uuid,
  p_effective_from date,
  p_days jsonb
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
      AND t.day_of_week    = v_day.day_of_week
      AND t.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
      AND t.effective_until IS NULL
      AND t.is_active;

    IF NOT FOUND THEN
      INSERT INTO public.hr_shift_timings (
        institution_id, staff_scope, employment_category_id, day_of_week,
        is_working_day, first_half_start, first_half_end,
        second_half_start, second_half_end,
        grace_minutes, second_saturday_holiday, effective_from,
        created_by, updated_by
      ) VALUES (
        p_institution_id, p_staff_scope, p_employment_category_id, v_day.day_of_week,
        v_day.is_working_day, v_day.first_half_start, v_day.first_half_end,
        v_day.second_half_start, v_day.second_half_end,
        COALESCE(v_day.grace_minutes, 0), COALESCE(v_day.second_saturday_holiday, false),
        p_effective_from, v_actor, v_actor
      );

    ELSIF p_effective_from <= v_current.effective_from THEN
      -- 1. Retire whatever started inside the span we are about to claim.
      UPDATE public.hr_shift_timings h
         SET is_active  = false,
             updated_by = v_actor
       WHERE h.institution_id = p_institution_id
         AND h.staff_scope    = p_staff_scope
         AND h.day_of_week    = v_day.day_of_week
         AND h.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
         AND h.id <> v_current.id
         AND h.is_active
         AND h.effective_from >= p_effective_from;

      -- 2. Clip a row that predates the span so it ends where we begin.
      UPDATE public.hr_shift_timings h
         SET effective_until = p_effective_from,
             updated_by      = v_actor
       WHERE h.institution_id = p_institution_id
         AND h.staff_scope    = p_staff_scope
         AND h.day_of_week    = v_day.day_of_week
         AND h.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
         AND h.id <> v_current.id
         AND h.is_active
         AND h.effective_from < p_effective_from
         AND (h.effective_until IS NULL OR h.effective_until > p_effective_from);

      -- 3. The open row takes the new values and really does start here.
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
        institution_id, staff_scope, employment_category_id, day_of_week,
        is_working_day, first_half_start, first_half_end,
        second_half_start, second_half_end,
        grace_minutes, second_saturday_holiday, effective_from,
        created_by, updated_by
      ) VALUES (
        p_institution_id, p_staff_scope, p_employment_category_id, v_day.day_of_week,
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

-- Grants are deliberately NOT restated. CREATE OR REPLACE preserves the ACL
-- (only DROP + CREATE discards it), and the existing one is already correct:
--   =X/postgres | postgres=X | authenticated=X | service_role=X
-- Re-issuing REVOKE/GRANT here would either be a no-op or, if written as
-- REVOKE ... FROM PUBLIC, quietly change who can call it. The function gates
-- itself with is_super_admin / is_admin / hr.shift_timings.manage and raises
-- 42501 regardless of caller, so there is nothing to harden here.
