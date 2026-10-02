-- ============================================================================
-- College Leadership — overview for the statistics panel.
-- Created: 2026-09-30.
--
-- The Leadership page is now senior posts only (Principal, Vice Principal,
-- IQAC Chairman, IQAC Coordinator); departments/HoD live on
-- /organizations/departments/hod-assignment. The statistics on the page need
-- every visible college's four posts in one round trip.
--
-- fn_list_leadership_colleges is NOT reusable for this: it counts Principal and
-- Vice Principal from user_roles + profiles.institution_id only (ignores
-- institution_leadership) and folds headless departments into `unfilled`, so its
-- numbers disagree with what the page shows per college.
--
-- This function therefore calls fn_get_college_leadership for each college the
-- caller may manage — the same resolver the detail view uses — so the overview
-- and the drawer cannot disagree. SECURITY DEFINER for the same reason as the
-- rest of the family: user_roles / committee tables are not readable by a
-- college officer and RLS denial is silent (a filled post would read as empty).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_leadership_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You are not signed in.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      (public.fn_get_college_leadership(i.id) - 'departments' - 'committee_id')
      ORDER BY i.name
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.institutions i
  WHERE i.is_active
    AND public.fn_college_leadership_can_manage(i.id);

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_leadership_overview() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_leadership_overview() TO authenticated;

COMMENT ON FUNCTION public.fn_leadership_overview() IS
  'Four senior posts (principal, vice_principal, iqac_chair, iqac_coordinator) '
  'for every active college the caller may manage, resolved by '
  'fn_get_college_leadership so the statistics cannot drift from the detail view.';
