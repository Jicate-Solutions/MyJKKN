-- Task 3: standing "Whole Institution" report card.
-- Org-wide params (LOOP_HEALTH, EXAM_IA_AUDIT) are graded by their DISCOVERY
-- verdicts, not findings, so fn_audit_capture_cycle_results never populates the
-- standing cycle. This board runs each org-wide active param's discovery over the
-- cycle window and reports a transparent status: 'measured' if the always-on check
-- produced fresh evidence rows, 'no_data' if none, 'error' if the query failed.
-- Reuses the hardened audit_execute_discovery_query (validation + catalog-match).
-- 2026-07-15

CREATE OR REPLACE FUNCTION public.fn_audit_standing_board(p_cycle_id uuid)
RETURNS TABLE(
  parameter_code text,
  name text,
  framework_mapping jsonb,
  discovery_source text,
  measured_count bigint,
  status text,
  sample jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end date;
  r record;
  v_rows jsonb;
  v_total bigint;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('audit.parameter.view')) THEN
    RAISE EXCEPTION 'permission denied: audit.parameter.view required' USING ERRCODE = '42501';
  END IF;

  SELECT start_date, end_date INTO v_start, v_end FROM audit_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'audit cycle % not found', p_cycle_id USING ERRCODE = 'P0002';
  END IF;

  FOR r IN
    SELECT c.code, c.name, c.framework_mapping, c.discovery_query_sql
    FROM audit_parameter_catalog c
    WHERE c.is_org_wide = true AND c.is_active = true AND c.discovery_query_sql IS NOT NULL
    ORDER BY c.code
  LOOP
    BEGIN
      SELECT d.rows, d.total_count INTO v_rows, v_total
      FROM audit_execute_discovery_query(r.discovery_query_sql, NULL, v_start, v_end, 100, 0) d;

      parameter_code := r.code;
      name := r.name;
      framework_mapping := r.framework_mapping;
      discovery_source := left(r.discovery_query_sql, 60);
      measured_count := COALESCE(v_total, 0);
      status := CASE WHEN COALESCE(v_total, 0) > 0 THEN 'measured' ELSE 'no_data' END;
      sample := COALESCE((SELECT jsonb_agg(val) FROM (SELECT value AS val FROM jsonb_array_elements(v_rows) LIMIT 3) s), '[]'::jsonb);
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      parameter_code := r.code;
      name := r.name;
      framework_mapping := r.framework_mapping;
      discovery_source := left(r.discovery_query_sql, 60);
      measured_count := 0;
      status := 'error';
      sample := jsonb_build_object('error', SQLERRM);
      RETURN NEXT;
    END;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_audit_standing_board(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_audit_standing_board(uuid) TO authenticated;
