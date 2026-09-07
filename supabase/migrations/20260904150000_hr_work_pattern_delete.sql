-- Delete a work pattern that nobody has ever held.
--
-- WHY AN RPC. hr_shift_timings' DELETE policy is is_admin()-only, so an HR
-- Admin (who may create patterns and save their weeks) could never remove the
-- week rows from the client — the delete would half-succeed and leave seven
-- orphaned timing rows behind a RESTRICT foreign key. One DEFINER function
-- does the whole thing or none of it.
--
-- WHY ONLY NEVER-HELD PATTERNS. The resolvers read a pattern's rows per date:
-- fn_staff_work_pattern_id finds the (possibly ended) assignment, and
-- fn_shift_timing_pick then matches ONLY that pattern's rows. Deleting a
-- pattern someone once held would make every recompute of those months resolve
-- to nothing — the attendance that was correct when recorded is rewritten as
-- "no shift window". The foreign keys already refuse that; this function turns
-- the refusal into a sentence and points at Deactivate, which is the
-- history-preserving way to retire a pattern.

CREATE OR REPLACE FUNCTION public.fn_hr_delete_work_pattern(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pattern public.hr_work_patterns%ROWTYPE;
  v_held    integer;
  v_week    integer;
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

  DELETE FROM public.hr_shift_timings WHERE work_pattern_id = p_id;
  GET DIAGNOSTICS v_week = ROW_COUNT;

  -- Entitlements cascade from the pattern row.
  DELETE FROM public.hr_work_patterns WHERE id = p_id;

  RETURN jsonb_build_object(
    'deleted',           true,
    'name',              v_pattern.name,
    'week_rows_removed', v_week
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_delete_work_pattern(uuid) IS
  'Delete a work pattern (its week rows and leave figures with it) only if no staff member has ever been assigned to it; otherwise refuses and points at deactivation.';

REVOKE ALL ON FUNCTION public.fn_hr_delete_work_pattern(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_delete_work_pattern(uuid) TO authenticated;
