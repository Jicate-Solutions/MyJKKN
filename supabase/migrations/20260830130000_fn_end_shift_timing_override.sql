-- Retire one shift-timing override without rewriting the past.
--
-- The Override tab can now hold several overrides at once, which means it also
-- needs a way to take one away — and a plain DELETE would be wrong. The
-- resolvers read effective_from/effective_until per date, so deleting the rows
-- makes a recompute of any earlier month re-resolve those days through the
-- general week, silently changing verdicts that were correct when they were
-- recorded. End-dating keeps history intact and stops the rule going forward.
--
-- effective_until IS AN EXCLUSIVE BOUND. The resolver matches on
-- `effective_until IS NULL OR effective_until > p_date`, and the writer closes a
-- superseded row with `effective_until = <the new row's effective_from>`. So
-- passing today means "this override no longer applies from today onward";
-- yesterday and earlier keep resolving through it.
--
-- TWO BRANCHES, because hr_shift_timings_effective_chk requires
-- effective_until > effective_from:
--   * effective_from <  p_on  -> close it at p_on. It had a life; it keeps it.
--   * effective_from >= p_on  -> deactivate. Created today or scheduled for the
--     future, so it never applied to a single day and closing it would violate
--     the CHECK. Nothing to preserve.
--
-- Refuses to touch a GENERAL week (teaching/non_teaching with gender 'all').
-- That is not an override and removing it would leave the institution's staff
-- with no timing at all — the state fn_shift_timing_coverage exists to warn
-- about.

CREATE OR REPLACE FUNCTION public.fn_end_shift_timing_override(
  p_institution_id         uuid,
  p_staff_scope            text,
  p_employment_category_id uuid,
  p_applicable_gender      text,
  p_on                     date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor   uuid := auth.uid();
  v_closed  integer := 0;
  v_deacted integer := 0;
BEGIN
  -- Same gate as fn_save_shift_timing_week: configuring hours and retiring a
  -- rule are the same amount of trust.
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

  IF p_staff_scope <> 'category' AND COALESCE(p_applicable_gender,'all') = 'all' THEN
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
     AND h.applicable_gender = p_applicable_gender
     AND h.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
     AND h.is_active
     AND h.effective_until IS NULL
     AND h.effective_from < p_on;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  UPDATE public.hr_shift_timings h
     SET is_active  = false,
         updated_by = v_actor
   WHERE h.institution_id  = p_institution_id
     AND h.staff_scope     = p_staff_scope
     AND h.applicable_gender = p_applicable_gender
     AND h.employment_category_id IS NOT DISTINCT FROM p_employment_category_id
     AND h.is_active
     AND h.effective_until IS NULL
     AND h.effective_from >= p_on;
  GET DIAGNOSTICS v_deacted = ROW_COUNT;

  RETURN v_closed + v_deacted;
END;
$function$;

COMMENT ON FUNCTION public.fn_end_shift_timing_override(uuid, text, uuid, text, date) IS
  'Retires one shift-timing override from p_on onward, preserving how earlier dates resolved. Closes rows that had a life, deactivates rows that never applied. Refuses general (non-override) weeks.';

REVOKE ALL ON FUNCTION public.fn_end_shift_timing_override(uuid, text, uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_end_shift_timing_override(uuid, text, uuid, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_end_shift_timing_override(uuid, text, uuid, text, date)
  TO authenticated, service_role;
