-- Distinct districts (with counts) for the Last School cascade. SECURITY INVOKER:
-- school_master SELECT is open to all authenticated users, so RLS suffices.
CREATE OR REPLACE FUNCTION public.fn_school_master_districts(p_board text DEFAULT 'state_board')
RETURNS TABLE(district text, school_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT sm.district, count(*) AS school_count
  FROM public.school_master sm
  WHERE sm.board = p_board
    AND sm.is_active = true
  GROUP BY sm.district
  ORDER BY sm.district;
$$;

REVOKE ALL ON FUNCTION public.fn_school_master_districts(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_school_master_districts(text) TO authenticated;
