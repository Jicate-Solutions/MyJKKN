-- ============================================================================
-- INTERNSHIP MODULE — Audit Blocker Fixes
-- Migration: 20260510_internship_module_audit_blocker_fixes.sql
-- Spec: docs/audits/internship-module-silent-failure-audit-2026-05-10.md
-- Driver: Agent F silent-failure audit (2026-05-10)
-- RISK TIER: 1 — additive only, fixes RLS-write gap on one config table.
--
-- Fixes
-- -----
-- 1. internship_site_types RLS write gap
--    Symptom: anon POST to /rest/v1/internship_site_types succeeds (HTTP 201)
--    Cause: existing policy reads
--           USING (institution_id IS NULL OR institution_id IN (...))
--           The "institution_id IS NULL" branch is satisfied by anon
--           (no user_institution_access row), and PostgreSQL applies USING
--           as the implicit WITH CHECK on FOR ALL policies — letting anon
--           insert rows with institution_id=NULL.
--    Fix: drop the loose policy, replace with separate USING (read) +
--         WITH CHECK (write) clauses, where WITH CHECK requires a real
--         institution_id mapped to the caller via user_institution_access.
--         Reads still see global (institution_id IS NULL) system rows.
-- ============================================================================

-- Reproduction (pre-fix, verified 2026-05-10):
-- $ curl -X POST https://kvizhngldtiuufknvehv.supabase.co/rest/v1/internship_site_types \
--     -H "apikey: <anon>" -H "Authorization: Bearer <anon>" \
--     -H "Content-Type: application/json" \
--     -d '{"config_key":"test","display_name":"test"}'
-- => HTTP/2 201 (row landed, institution_id=NULL, created_by=NULL)
-- After this migration the same call returns HTTP 401 with code 42501
-- (row violates RLS policy).

DROP POLICY IF EXISTS "internship_site_types_institution_access" ON internship_site_types;

-- Reads: scoped to caller's institutions OR global (NULL institution) system rows.
CREATE POLICY "internship_site_types_select" ON internship_site_types
  FOR SELECT
  USING (
    institution_id IS NULL
    OR institution_id IN (
      SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
    )
  );

-- Writes: must target an institution the caller has access to.
-- Anonymous users (auth.uid() IS NULL) cannot satisfy WITH CHECK because
-- user_institution_access has no rows for them.
CREATE POLICY "internship_site_types_modify" ON internship_site_types
  FOR ALL
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    institution_id IS NOT NULL
    AND institution_id IN (
      SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
    )
  );

COMMENT ON POLICY "internship_site_types_select" ON internship_site_types IS
  'Read access: caller institutions + global NULL-tenant system rows.';
COMMENT ON POLICY "internship_site_types_modify" ON internship_site_types IS
  'Write access: only inside caller institutions (no NULL-tenant writes).';
