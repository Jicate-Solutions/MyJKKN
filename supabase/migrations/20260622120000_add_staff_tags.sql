-- Staff Tags: optional free-form labels for fetching staff subsets via the
-- external API (GET /api/api-management/staff?tags=a,b → overlap / any-of).
-- Stored as a native text[] (GIN-indexed) rather than jsonb so PostgREST array
-- operators (overlaps/contains) work cleanly. NOT NULL DEFAULT '{}' so existing
-- rows are simply "untagged"; the field is never required of a user.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_staff_tags
  ON public.staff USING GIN (tags);

-- Distinct-tag list powering the staff form's tag autocomplete (suggests tags
-- already in use to curb spelling drift). Returns only non-sensitive label
-- strings, optionally scoped to one institution. SECURITY DEFINER so it can
-- read across the table for suggestions even under RLS; execute is locked to
-- authenticated users (anon revoked per Supabase grant-to-anon default).
CREATE OR REPLACE FUNCTION public.staff_distinct_tags(p_institution_id uuid DEFAULT NULL)
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT t
  FROM public.staff, unnest(tags) AS t
  WHERE (p_institution_id IS NULL OR institution_id = p_institution_id)
    AND t <> ''
  ORDER BY t;
$$;

REVOKE EXECUTE ON FUNCTION public.staff_distinct_tags(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.staff_distinct_tags(uuid) TO authenticated;
