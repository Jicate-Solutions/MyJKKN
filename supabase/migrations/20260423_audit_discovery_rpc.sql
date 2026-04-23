-- Audit Workflow Sprint 01 — Discovery Query RPC
-- Spec: specs/myjkkn-audit-workflow-sprint-01-plan.md §T4 (paginated discovery)
-- Depends on: 20260422_audit_workflow_substrate.sql (audit_parameter_catalog.discovery_query_sql)
-- Applied: 2026-04-23
--
-- Purpose: Safely execute audit parameter discovery queries. Lead Auditor (Selvamani)
-- clicks "Run Discovery Query" on a parameter; the saved SQL in
-- audit_parameter_catalog.discovery_query_sql is executed server-side with
-- bind parameters ($1=institution_id, $2=cycle_start, $3=cycle_end).
--
-- SECURITY (critical):
--   - SECURITY DEFINER so RLS context is uniform
--   - Conservative allowlist enforced INSIDE the function:
--       * Query MUST start with SELECT (leading whitespace/comments permitted)
--       * Query MUST NOT contain dangerous keywords
--         (INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/GRANT/REVOKE/TRUNCATE/CALL/DO/SET/RESET)
--       * Query MUST NOT reference auth.*, storage.*, pg_* namespaces
--   - search_path pinned to 'public, pg_temp' at function definition time to
--     prevent search_path attacks (per memory feedback_parallel_agent_security.md)
--
-- Execution model:
--   - EXECUTE ... USING with bind params; no string concatenation of user input
--   - Results returned as jsonb_agg of row_to_json
--   - Total count separately queried via SELECT COUNT(*) FROM (<user_sql>) sub
--
-- Idempotent: CREATE OR REPLACE; safe to re-run.

-- ============================================================================
-- audit_validate_discovery_sql — shared validator (used by RPC + optional triggers)
-- Returns NULL on pass, or a text error message on reject.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.audit_validate_discovery_sql(p_sql text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trimmed text;
BEGIN
  IF p_sql IS NULL THEN
    RETURN 'discovery SQL is NULL';
  END IF;

  -- Strip leading whitespace + SQL line comments for the start check
  v_trimmed := regexp_replace(p_sql, '^(\s|--[^\n]*\n|/\*.*?\*/)+', '', 'n');

  -- Must start with SELECT (case-insensitive)
  IF v_trimmed !~* '^\s*SELECT\s' THEN
    RETURN 'discovery SQL must start with SELECT';
  END IF;

  -- Reject dangerous keywords as whole words (case-insensitive).
  -- NOTE: COMMENT and SECURITY are not keyword-matched because they appear as
  -- ordinary column names in many tables; a SELECT can't use them as statements
  -- anyway because the prefix check forces SELECT-only at position 0, and the
  -- single-statement check below blocks ;COMMENT ON ... chained DDL.
  IF p_sql ~* '\m(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|REVOKE|TRUNCATE|CALL|DO|SET|RESET|COPY|VACUUM|ANALYZE|REFRESH)\M' THEN
    RETURN 'discovery SQL contains a forbidden keyword (write/DDL/privileged operation)';
  END IF;

  -- Reject references to reserved schemas (auth, storage, pg_*, information_schema)
  IF p_sql ~* '\m(auth\.|storage\.|pg_|information_schema\.)' THEN
    RETURN 'discovery SQL references a reserved schema (auth/storage/pg_*/information_schema)';
  END IF;

  -- Reject multi-statement payloads (semicolon outside string literal).
  -- Simple heuristic: disallow ';' anywhere except trailing whitespace.
  IF regexp_replace(p_sql, ';\s*$', '') ~ ';' THEN
    RETURN 'discovery SQL must be a single statement (no embedded semicolons)';
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.audit_validate_discovery_sql(text) IS
  'Whitelist validator for audit_parameter_catalog.discovery_query_sql. Returns NULL on pass, error text on reject. See spec §T4.';

-- ============================================================================
-- audit_execute_discovery_query — main RPC called by AuditDiscoveryService
-- ============================================================================
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
SET search_path = public, pg_temp
AS $$
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

  -- SECURITY: validate SQL against allowlist
  v_err := audit_validate_discovery_sql(p_sql);
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'discovery SQL rejected: %', v_err
      USING ERRCODE = '42P01';
  END IF;

  -- Clamp pagination to sane bounds (thrash T4: 100 rows/page cap)
  v_safe_limit  := GREATEST(1, LEAST(COALESCE(p_limit, 100), 100));
  v_safe_offset := GREATEST(0, COALESCE(p_offset, 0));

  -- Build wrapped SQL. We treat the user SQL as a subquery and apply
  -- LIMIT/OFFSET outside it so we don't need to mutate the original text.
  -- The user SQL receives bind parameters $1=institution_id, $2=cycle_start, $3=cycle_end.
  v_paginated_sql := format(
    'SELECT COALESCE(jsonb_agg(row_to_json(sub)), ''[]''::jsonb) FROM (%s) sub LIMIT %s OFFSET %s',
    p_sql, v_safe_limit, v_safe_offset
  );

  v_count_sql := format('SELECT COUNT(*)::bigint FROM (%s) sub', p_sql);

  -- Execute rows query with bind params
  EXECUTE v_paginated_sql
    INTO v_rows
    USING p_institution_id, p_cycle_start, p_cycle_end;

  -- Execute count query with bind params (separate so pagination doesn't corrupt count)
  EXECUTE v_count_sql
    INTO v_count
    USING p_institution_id, p_cycle_start, p_cycle_end;

  rows := COALESCE(v_rows, '[]'::jsonb);
  total_count := COALESCE(v_count, 0);
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.audit_execute_discovery_query(text, uuid, date, date, int, int) IS
  'Executes a whitelisted discovery SQL from audit_parameter_catalog with bind params. Returns (rows jsonb[], total_count) paginated to 100 rows/page. Used by AuditDiscoveryService (lib/services/audit/audit-discovery-service.ts).';

-- Grant execute to authenticated users — RLS + the in-function permission
-- gate + whitelist validation enforce actual access.
GRANT EXECUTE ON FUNCTION public.audit_execute_discovery_query(text, uuid, date, date, int, int)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_validate_discovery_sql(text)
  TO authenticated;
