-- ============================================================================
-- CARRE Coverage Map — Phase 1 (ADDITIVE-ONLY)
-- Spec: team-lead build brief 2026-07-05 (CARRE coverage map).
-- Stacks on: 20260705120000_carre_audit_v2.sql (CARRE v2 family).
--
-- Purpose: tag each CARE/CARRE audit with the people-facing MODULE it audited,
-- so a coverage page can show "of the ~25 modules a learner/staff member
-- experiences, which have a recent CARRE audit, which are overdue, which are
-- frozen." Modules never grade themselves — the page only shows the status of
-- the most-recent REAL audit per module.
--
-- ADDITIVE-ONLY GUARANTEE: this migration NEVER edits, DROPs, or
-- CREATE OR REPLACEs any existing fn_care_* or fn_carre_* function or any
-- existing table. It only:
--   1. ADDs a nullable audit_cycles.module_key column.
--   2. ADDs fn_carre_set_audit_module  (owner-checked tag write).
--   3. ADDs fn_carre_module_coverage   (leadership-gated coverage read).
--
-- NOT applied to production by this build — file only (per build brief).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Which module this audit is for. Nullable: historical audits + audits
--    opened without a module stay valid (they surface in the page's
--    "Unassigned checks" bucket, never silently dropped).
-- ----------------------------------------------------------------------------
ALTER TABLE public.audit_cycles
  ADD COLUMN IF NOT EXISTS module_key text;

COMMENT ON COLUMN public.audit_cycles.module_key IS
  'CARRE Coverage Map: the people-facing module (lib/navigation/modules.ts slug) this audit assesses. NULL = unassigned. Set via fn_carre_set_audit_module.';

-- Coverage read groups by module_key + orders by created_at desc — index both.
CREATE INDEX IF NOT EXISTS idx_audit_cycles_module_key
  ON public.audit_cycles (module_key, created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. fn_carre_set_audit_module — owner tags a CARRE cycle with its module.
--    Owner check reuses fn_carre_is_cycle_owner (CARRE-family, v2 migration):
--    only the lead auditor of a CARRE cycle can set its module_key.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_set_audit_module(
  p_cycle_id uuid,
  p_module_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  -- CARRE-only owner gate (frameworks @> ['CARRE'] AND lead_auditor_id = uid).
  IF NOT public.fn_carre_is_cycle_owner(p_cycle_id) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_owner');
  END IF;

  UPDATE public.audit_cycles
  SET module_key = nullif(trim(coalesce(p_module_key, '')), ''),
      updated_at = now()
  WHERE id = p_cycle_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_set_audit_module(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_set_audit_module(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_carre_set_audit_module IS
  'CARRE Coverage Map: owner sets audit_cycles.module_key on a CARRE cycle (owner-checked via fn_carre_is_cycle_owner). Returns {success} jsonb.';

-- ----------------------------------------------------------------------------
-- 3. fn_carre_module_coverage — one row per DISTINCT module_key that has at
--    least one CARE/CARRE audit: the MOST-RECENT such audit's identity + the
--    owner's raw scores (the page computes the /100 index + verdict client-side
--    from the pure math in carre-scoring-service.ts — modules never self-grade).
--
--    NULL-module audits are NOT dropped: every NULL-module CARE/CARRE audit is
--    returned as its own row (module_key NULL) so the page can list them under
--    "Unassigned checks". (Only non-null module_keys are collapsed to their
--    single most-recent audit; NULLs pass through in full.)
--
--    LEADERSHIP-GATED: mirrors the fn_carre_list_audits leadership branch and
--    the /audit/care/coverage page gate (audit.cycle.view). A caller without
--    audit.cycle.view / admin / super_admin gets an empty set — this SECURITY
--    DEFINER read is not an anon/any-authenticated enumeration surface.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_carre_module_coverage()
RETURNS TABLE (
  module_key    text,
  framework     text,
  cycle_id      uuid,
  name          text,
  re_audit_date date,
  created_at    timestamptz,
  owner_scores  jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('audit.cycle.view')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH care_cycles AS (
    SELECT
      c.module_key                              AS mk,
      c.parameter_catalog_snapshot ->> 'framework' AS fw,
      c.id                                      AS cid,
      c.name                                    AS nm,
      c.end_date                                AS rad,
      c.created_at                              AS cat,
      ROW_NUMBER() OVER (
        PARTITION BY c.module_key
        ORDER BY c.created_at DESC, c.id DESC
      )                                         AS rn
    FROM public.audit_cycles c
    WHERE c.frameworks && ARRAY['CARE', 'CARRE']::text[]
  )
  SELECT
    cc.mk,
    cc.fw,
    cc.cid,
    cc.nm,
    cc.rad,
    cc.cat,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object('parameter_code', s.parameter_code, 'score', s.score)
             )
      FROM public.care_audit_scores s
      WHERE s.cycle_id = cc.cid AND s.scorer_role = 'owner'
    ), '[]'::jsonb)
  FROM care_cycles cc
  WHERE cc.mk IS NULL OR cc.rn = 1
  ORDER BY cc.mk NULLS LAST, cc.cat DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_module_coverage() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_module_coverage() TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_carre_module_coverage IS
  'CARRE Coverage Map: most-recent CARE/CARRE audit per module_key + owner scores; NULL-module audits pass through as unassigned rows. Leadership-gated (audit.cycle.view).';

-- PostgREST schema-cache reload (new column + functions invisible to REST until this)
NOTIFY pgrst, 'reload schema';
