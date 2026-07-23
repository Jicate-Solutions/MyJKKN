-- 2026-07-10 HARDENING (follow-up to 20260709174205_audit_discovery_reject_noncatalog_sql)
-- (Q1) Run the discovery SQL inside a READ-ONLY transaction so that even a
--      super-admin-authored catalog card that calls a VOLATILE writing function
--      (fn_scf_measure_* etc.) is physically unable to write ("cannot execute
--      INSERT/UPDATE in a read-only transaction"). Defense in depth beyond the
--      byte-match guard: byte-match limits WHICH sql runs; read-only limits what
--      it can DO. Verified live 2026-07-10: a catalog card calling
--      fn_scf_measure_suggestion_outcomes(0) → "cannot execute UPDATE in a
--      read-only transaction"; benign read card still returns rows.
-- (Q3) Close the write-path asymmetry on audit_parameter_catalog: INSERT lacked the
--      institution-scope check that UPDATE/DELETE had, and all three trusted the
--      role_has_institution_access(NULL)=TRUE footgun. Non-super managers may now
--      only write rows for an institution they can access (never NULL/global).
--      No live impact today (0 non-super-admins hold audit.parameter.manage); this
--      forward-proofs delegating manage to a Lead/External Auditor.

-- ---------------------------------------------------------------------------
-- (Q1) read-only execution guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_execute_discovery_query(
  p_sql text,
  p_institution_id uuid,
  p_cycle_start date,
  p_cycle_end date,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE(rows jsonb, total_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_err text;
  v_paginated_sql text;
  v_count_sql text;
  v_rows jsonb;
  v_count bigint;
  v_safe_limit int;
  v_safe_offset int;
BEGIN
  -- Permission gate
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('audit.parameter.view')) THEN
    RAISE EXCEPTION 'permission denied: audit.parameter.view required' USING ERRCODE = '42501';
  END IF;

  -- (2026-07-09) caller may not inject arbitrary SQL: require a catalog match
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_parameter_catalog
     WHERE discovery_query_sql = p_sql AND is_active
  ) THEN
    RAISE EXCEPTION 'discovery SQL not recognised: only saved catalog queries may run'
      USING ERRCODE = '42501';
  END IF;

  -- Allowlist validator (SELECT-only, no DDL, no reserved schemas)
  v_err := audit_validate_discovery_sql(p_sql);
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'discovery SQL rejected: %', v_err USING ERRCODE = '42P01';
  END IF;

  v_safe_limit  := GREATEST(1, LEAST(COALESCE(p_limit, 100), 100));
  v_safe_offset := GREATEST(0, COALESCE(p_offset, 0));

  v_paginated_sql := format(
    'SELECT COALESCE(jsonb_agg(row_to_json(sub)), ''[]''::jsonb) FROM (%s) sub LIMIT %s OFFSET %s',
    p_sql, v_safe_limit, v_safe_offset
  );
  v_count_sql := format('SELECT COUNT(*)::bigint FROM (%s) sub', p_sql);

  -- (2026-07-10) HARDENING: execute the (catalog-authored) SQL under a read-only
  -- transaction so it cannot write, even if it invokes a VOLATILE writing function.
  -- SET LOCAL reverts at transaction end; each PostgREST RPC call is its own txn.
  PERFORM set_config('transaction_read_only', 'on', true);

  EXECUTE v_paginated_sql INTO v_rows USING p_institution_id, p_cycle_start, p_cycle_end;
  EXECUTE v_count_sql     INTO v_count USING p_institution_id, p_cycle_start, p_cycle_end;

  rows := COALESCE(v_rows, '[]'::jsonb);
  total_count := COALESCE(v_count, 0);
  RETURN NEXT;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.audit_execute_discovery_query(text, uuid, date, date, int, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.audit_execute_discovery_query(text, uuid, date, date, int, int) TO authenticated;

-- ---------------------------------------------------------------------------
-- (Q3) tighten catalog write policies: institution-scoped, never NULL/global
--      for delegated (non-super-admin) managers. Super-admin path unchanged.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS param_catalog_insert_permission ON public.audit_parameter_catalog;
CREATE POLICY param_catalog_insert_permission ON public.audit_parameter_catalog
  FOR INSERT WITH CHECK (
    is_super_admin() OR (
      user_has_permission('audit.parameter.manage')
      AND is_system = false
      AND institution_id IS NOT NULL
      AND role_has_institution_access(institution_id)
    )
  );

DROP POLICY IF EXISTS param_catalog_update_permission ON public.audit_parameter_catalog;
CREATE POLICY param_catalog_update_permission ON public.audit_parameter_catalog
  FOR UPDATE USING (
    is_super_admin() OR (
      user_has_permission('audit.parameter.manage')
      AND is_system = false
      AND institution_id IS NOT NULL
      AND role_has_institution_access(institution_id)
    )
  );

DROP POLICY IF EXISTS param_catalog_delete_permission ON public.audit_parameter_catalog;
CREATE POLICY param_catalog_delete_permission ON public.audit_parameter_catalog
  FOR DELETE USING (
    is_super_admin() OR (
      user_has_permission('audit.parameter.manage')
      AND is_system = false
      AND institution_id IS NOT NULL
      AND role_has_institution_access(institution_id)
    )
  );
