-- fn_schools_network_feeders — read-through feeder-school discovery.
-- Reads EXISTING data (learners_profiles.last_school +
-- marketing_leads_database.school_name); no copy, no sync problem. LEFT JOIN
-- to schools marks which feeders are already adopted into the network.
-- SECURITY DEFINER because learners_profiles/marketing_leads_database RLS is
-- learner/lead-grade; this exposes ONLY school-name aggregates (no PII).
-- Gated inside on the module's own view permission.
CREATE OR REPLACE FUNCTION public.fn_schools_network_feeders(
  p_search text DEFAULT NULL,
  p_source text DEFAULT NULL,          -- 'enrolled_learners' | 'marketing_leads' | NULL(all)
  p_adopted text DEFAULT NULL,         -- 'adopted' | 'not_adopted' | NULL(all)
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  school_name text,
  enrolled_count bigint,
  leads_count bigint,
  sources text[],
  adopted_school_id uuid,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('schools_network.schools.view')) THEN
    RAISE EXCEPTION 'permission denied for schools_network.schools.view'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH learner_src AS (
    SELECT initcap(trim(lp.last_school)) AS name_disp,
           trim(lower(lp.last_school)) AS name_norm,
           count(*) AS n
      FROM public.learners_profiles lp
     WHERE lp.last_school IS NOT NULL
       AND length(trim(lp.last_school)) >= 6
       AND lower(lp.last_school) NOT LIKE '%unknown%'
       AND lower(trim(lp.last_school)) NOT IN ('nil','na','n/a','-','nothing')
     GROUP BY 1, 2
  ),
  marketing_src AS (
    SELECT initcap(trim(ml.school_name)) AS name_disp,
           trim(lower(ml.school_name)) AS name_norm,
           count(*) AS n
      FROM public.marketing_leads_database ml
     WHERE ml.school_name IS NOT NULL
       AND length(trim(ml.school_name)) >= 6
       AND lower(ml.school_name) NOT LIKE '%unknown%'
     GROUP BY 1, 2
  ),
  merged AS (
    SELECT coalesce(l.name_norm, m.name_norm) AS name_norm,
           coalesce(l.name_disp, m.name_disp) AS name_disp,
           coalesce(l.n, 0) AS enrolled_n,
           coalesce(m.n, 0) AS leads_n,
           array_remove(ARRAY[
             CASE WHEN l.name_norm IS NOT NULL THEN 'enrolled_learners' END,
             CASE WHEN m.name_norm IS NOT NULL THEN 'marketing_leads' END
           ], NULL) AS srcs
      FROM learner_src l
      FULL OUTER JOIN marketing_src m ON m.name_norm = l.name_norm
  ),
  joined AS (
    SELECT mg.name_disp,
           mg.name_norm,
           mg.enrolled_n,
           mg.leads_n,
           mg.srcs,
           s.id AS adopted_id
      FROM merged mg
      LEFT JOIN public.schools s ON trim(lower(s.name)) = mg.name_norm
     WHERE (p_search IS NULL OR mg.name_norm LIKE '%' || trim(lower(p_search)) || '%')
       AND (p_source IS NULL OR p_source = ANY(mg.srcs))
       AND (p_adopted IS NULL
            OR (p_adopted = 'adopted' AND s.id IS NOT NULL)
            OR (p_adopted = 'not_adopted' AND s.id IS NULL))
  )
  SELECT j.name_disp,
         j.enrolled_n,
         j.leads_n,
         j.srcs,
         j.adopted_id,
         count(*) OVER () AS total_count
    FROM joined j
   ORDER BY j.enrolled_n DESC, j.leads_n DESC, j.name_disp
   LIMIT greatest(1, least(p_limit, 200))
  OFFSET greatest(0, p_offset);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_feeders(text, text, text, int, int) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_schools_network_feeders(text, text, text, int, int) TO authenticated;
-- Applied to prod 2026-07-03 09:35 IST via Management API (statement-by-statement)
