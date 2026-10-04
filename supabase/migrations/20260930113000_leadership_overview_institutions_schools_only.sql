-- ============================================================================
-- College Leadership overview — institutions and schools only.
-- Created: 2026-09-30.
--
-- institutions.entity_type is one of admin_office | company | institution |
-- school. Principal / Vice Principal / IQAC do not exist at a company (Jicate
-- Solutions, Nattraja Incubation Forum) or the admin office (JKKN Main Office),
-- so they showed up as permanent "Vacant" rows and dragged coverage down.
-- The overview now lists entity_type IN ('institution', 'school') only.
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
    AND i.entity_type IN ('institution', 'school')
    AND public.fn_college_leadership_can_manage(i.id);

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_leadership_overview() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_leadership_overview() TO authenticated;
