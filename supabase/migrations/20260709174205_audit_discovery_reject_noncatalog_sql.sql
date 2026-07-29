-- 2026-07-09 SECURITY FIX
-- audit_execute_discovery_query accepted arbitrary caller-supplied SQL and ran it
-- SECURITY DEFINER (owner=postgres, RLS not FORCEd) => cross-tenant PII exfiltration
-- reachable by any holder of audit.parameter.view (incl. the External Auditor role).
-- Proven live 2026-07-09: a registrar (not admin) pulled profiles.email across 3 institutions
-- via SQL that existed in no audit_parameter_catalog row.
--
-- Root cause: the RPC took the discovery SQL as a caller ARGUMENT (p_sql). The
-- audit_parameter_catalog was therefore NOT a trust boundary — any authenticated
-- caller who could pass the permission gate could inject any SELECT, and the
-- keyword-allowlist validator (audit_validate_discovery_sql) is a spelling check,
-- not an authorization check (e.g. `SELECT * FROM fn_writes()` passes it).
--
-- Fix: require p_sql to byte-match an ACTIVE audit_parameter_catalog.discovery_query_sql.
-- The catalog (RLS-governed, logged) becomes the trust boundary; the API caller can no
-- longer introduce novel SQL. Signature + callers unchanged (zero code change, zero
-- downtime). Note (2026-07-09): 0 of 61 catalog params currently store a discovery
-- query, and the service short-circuits before the RPC when the column is empty — so
-- this guard blocks only the injection path and has no effect on legitimate usage.
--
-- Follow-up (not in this migration): the measure-outcome functions
-- (fn_scf_measure_suggestion_outcomes / fn_induction_measure_loop_outcomes /
-- fn_mess_measure_menu_lift) are VOLATILE + writing + SECURITY DEFINER and pass the
-- validator; a catalog editor could still store SQL that invokes them. Residual trust
-- now sits with catalog editors only. A dedicated read-only executor role is the
-- belt-and-braces hardening.
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
  -- Permission gate: caller must be allowed to run discovery queries
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('audit.parameter.view')) THEN
    RAISE EXCEPTION 'permission denied: audit.parameter.view required'
      USING ERRCODE = '42501';
  END IF;

  -- SECURITY (2026-07-09): the caller must NOT be able to inject arbitrary SQL.
  -- Require p_sql to byte-match an ACTIVE catalog discovery query. This makes
  -- audit_parameter_catalog the trust boundary (only catalog editors choose what
  -- SQL runs) instead of the API caller. Closes cross-tenant PII exfiltration.
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_parameter_catalog
     WHERE discovery_query_sql = p_sql
       AND is_active
  ) THEN
    RAISE EXCEPTION 'discovery SQL not recognised: only saved catalog queries may run'
      USING ERRCODE = '42501';
  END IF;

  -- Defense in depth: keep the allowlist validator (SELECT-only, no DDL, no reserved schemas)
  v_err := audit_validate_discovery_sql(p_sql);
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'discovery SQL rejected: %', v_err
      USING ERRCODE = '42P01';
  END IF;

  -- Clamp pagination to sane bounds (thrash T4: 100 rows/page cap)
  v_safe_limit  := GREATEST(1, LEAST(COALESCE(p_limit, 100), 100));
  v_safe_offset := GREATEST(0, COALESCE(p_offset, 0));

  v_paginated_sql := format(
    'SELECT COALESCE(jsonb_agg(row_to_json(sub)), ''[]''::jsonb) FROM (%s) sub LIMIT %s OFFSET %s',
    p_sql, v_safe_limit, v_safe_offset
  );
  v_count_sql := format('SELECT COUNT(*)::bigint FROM (%s) sub', p_sql);

  EXECUTE v_paginated_sql INTO v_rows
    USING p_institution_id, p_cycle_start, p_cycle_end;
  EXECUTE v_count_sql INTO v_count
    USING p_institution_id, p_cycle_start, p_cycle_end;

  rows := COALESCE(v_rows, '[]'::jsonb);
  total_count := COALESCE(v_count, 0);
  RETURN NEXT;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.audit_execute_discovery_query(text, uuid, date, date, int, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.audit_execute_discovery_query(text, uuid, date, date, int, int) TO authenticated;
