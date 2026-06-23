-- =====================================================================
-- Global Calendar resolver — Phase 1 (holiday/event feeds)               2026-06-23
-- fn_calendar_items UNIONs: (1) global calendar_entries, (2) academic
-- institution_leaves (approved), (3) hr_public_holidays. SECURITY DEFINER,
-- so it MUST scope itself: it intersects the requested institutions with the
-- viewer's get_user_accessible_institutions(auth.uid()). Person-level leave is
-- Phase 2 (not included here). Each name column is cast ::text to match the
-- declared TABLE types (avoids 42804); every institution_id is qualified
-- (avoids 42702).
-- =====================================================================

-- helper: is a feed on for an institution? per-institution override > global > ON
CREATE OR REPLACE FUNCTION public.fn_calendar_feed_enabled(p_feed_key text, p_institution_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT is_enabled FROM public.calendar_feed_settings
       WHERE feed_key = p_feed_key AND institution_id = p_institution_id LIMIT 1),
    (SELECT is_enabled FROM public.calendar_feed_settings
       WHERE feed_key = p_feed_key AND institution_id IS NULL LIMIT 1),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_calendar_items(
  p_institution_ids uuid[] DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL,
  p_feeds text[] DEFAULT NULL,
  p_kinds text[] DEFAULT NULL
)
RETURNS TABLE (
  item_id text,
  source_module text,
  source_id uuid,
  kind text,
  title text,
  description text,
  start_at timestamptz,
  end_at timestamptz,
  all_day boolean,
  institution_id uuid,
  institution_name text,
  category text,
  color_code text,
  blocks_attendance boolean,
  visibility text,
  person_name text,
  meta jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_accessible uuid[];
  v_effective  uuid[];
BEGIN
  -- viewer's accessible institutions (never trust the client)
  SELECT COALESCE(array_agg(gua.institution_id), ARRAY[]::uuid[])
    INTO v_accessible
    FROM public.get_user_accessible_institutions(auth.uid()) gua;

  IF p_institution_ids IS NULL OR array_length(p_institution_ids, 1) IS NULL THEN
    v_effective := v_accessible;
  ELSE
    SELECT COALESCE(array_agg(x), ARRAY[]::uuid[])
      INTO v_effective
      FROM unnest(p_institution_ids) x
     WHERE x = ANY(v_accessible);
  END IF;

  RETURN QUERY
  -- Source 1: global-owned entries (common ⇒ everyone; subset ⇒ intersect) -----
  SELECT
    ('global:' || ce.id::text),
    'global'::text,
    ce.id,
    ce.kind::text,
    ce.title::text,
    ce.description::text,
    ce.start_at,
    ce.end_at,
    ce.all_day,
    NULL::uuid,
    NULL::text,
    COALESCE(cc.name, ce.kind)::text,
    COALESCE(ce.color_code, cc.color_code, '#6b7280')::text,
    ce.blocks_attendance,
    ce.visibility::text,
    NULL::text,
    jsonb_build_object('scope_institution_ids', ce.scope_institution_ids)
  FROM public.calendar_entries ce
  LEFT JOIN public.calendar_categories cc ON cc.id = ce.category_id
  WHERE ce.is_active = true
    AND (p_kinds IS NULL OR ce.kind = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'global_entries' = ANY(p_feeds))
    AND (p_start IS NULL OR ce.end_at::date   >= p_start)
    AND (p_end   IS NULL OR ce.start_at::date <= p_end)
    AND public.fn_calendar_feed_enabled('global_entries', NULL)
    AND (ce.scope_institution_ids IS NULL OR ce.scope_institution_ids && v_effective)

  UNION ALL
  -- Source 2: academic institution_leaves (approved holidays) -----------------
  SELECT
    ('academic:' || il.id::text),
    'academic'::text,
    il.id,
    'holiday'::text,
    il.leave_name::text,
    il.description::text,
    il.start_date::timestamptz,
    (il.end_date::timestamptz + interval '1 day' - interval '1 second'),
    true,
    il.institution_id,
    i.name::text,
    COALESCE(lt.leave_type_name, 'Institution Leave')::text,
    COALESCE(lt.color_code, '#0ea5e9')::text,
    true,
    'public'::text,
    NULL::text,
    jsonb_build_object('scope_level', il.scope_level, 'leave_type_id', il.leave_type_id)
  FROM public.institution_leaves il
  JOIN public.institutions i ON i.id = il.institution_id
  LEFT JOIN public.leave_types lt ON lt.id = il.leave_type_id
  WHERE il.status = 'approved'
    AND il.institution_id = ANY(v_effective)
    AND (p_kinds IS NULL OR 'holiday' = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'academic_holidays' = ANY(p_feeds))
    AND (p_start IS NULL OR il.end_date   >= p_start)
    AND (p_end   IS NULL OR il.start_date <= p_end)
    AND public.fn_calendar_feed_enabled('academic_holidays', il.institution_id)

  UNION ALL
  -- Source 3: HR public holidays (current version only) -----------------------
  SELECT
    ('hr:' || hph.id::text),
    'hr'::text,
    hph.id,
    'holiday'::text,
    hph.name::text,
    hph.notes::text,
    hph.holiday_date::timestamptz,
    (hph.holiday_date::timestamptz + interval '1 day' - interval '1 second'),
    true,
    ho.institution_id,
    i2.name::text,
    'Public Holiday'::text,
    '#f59e0b'::text,
    true,
    'public'::text,
    NULL::text,
    jsonb_build_object('is_optional', hph.is_optional)
  FROM public.hr_public_holidays hph
  JOIN public.hr_organizations ho ON ho.id = hph.hr_organization_id
  JOIN public.institutions i2 ON i2.id = ho.institution_id
  WHERE ho.institution_id = ANY(v_effective)
    AND hph.superseded_by IS NULL
    AND (p_kinds IS NULL OR 'holiday' = ANY(p_kinds))
    AND (p_feeds IS NULL OR 'hr_public_holidays' = ANY(p_feeds))
    AND (p_start IS NULL OR hph.holiday_date >= p_start)
    AND (p_end   IS NULL OR hph.holiday_date <= p_end)
    AND public.fn_calendar_feed_enabled('hr_public_holidays', ho.institution_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_calendar_feed_enabled(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_calendar_feed_enabled(text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_calendar_items(uuid[], date, date, text[], text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_calendar_items(uuid[], date, date, text[], text[]) TO authenticated;
