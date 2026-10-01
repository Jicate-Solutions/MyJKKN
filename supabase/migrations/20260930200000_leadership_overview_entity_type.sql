-- Overview rows carry the institution's entity_type (institution | school) so the
-- page can accent schools and colleges differently. Otherwise as 20260930150000.
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
      (public.fn_get_college_posts(i.id) - 'committee_id')
        || jsonb_build_object('entity_type', i.entity_type)
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
