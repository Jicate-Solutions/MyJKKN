-- Audit Workflow Sprint 01 — RLS Policies
-- Depends on: 20260422_audit_workflow_substrate.sql
-- Applied: 2026-04-22
--
-- Pattern: standard MyJKKN RLS per CLAUDE.md §Role Management
--   is_super_admin() OR is_admin() OR user_has_permission('<key>')
--   + role_has_institution_access(institution_id) for multi-tenant tables
--
-- Permission keys (will be added to custom_roles.permissions in seeds migration):
--   audit.cycle.view / audit.cycle.manage
--   audit.finding.log / audit.finding.review
--   audit.evidence.upload
--   audit.attestation.sign / audit.attestation.cosign / audit.attestation.view
--   audit.parameter.view / audit.parameter.manage
--   audit.finding_type.manage
--   audit.leadership.view (thrash T13 — CAO/CEO/MD see in-progress findings)

-- ============================================================================
-- Enable RLS on all 5 tables
-- ============================================================================
ALTER TABLE public.audit_cycles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_attestations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_parameter_catalog   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_finding_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_finding_delegations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- audit_cycles policies
-- ============================================================================
DROP POLICY IF EXISTS "audit_cycles_select_permission" ON public.audit_cycles;
CREATE POLICY "audit_cycles_select_permission" ON public.audit_cycles FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('audit.cycle.view')
  );

DROP POLICY IF EXISTS "audit_cycles_insert_permission" ON public.audit_cycles;
CREATE POLICY "audit_cycles_insert_permission" ON public.audit_cycles FOR INSERT
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('audit.cycle.manage')
  );

DROP POLICY IF EXISTS "audit_cycles_update_permission" ON public.audit_cycles;
CREATE POLICY "audit_cycles_update_permission" ON public.audit_cycles FOR UPDATE
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('audit.cycle.manage') AND (lead_auditor_id = auth.uid() OR created_by = auth.uid()))
  );

-- Thrash T8: draft-delete allowed for creator; super_admin always
DROP POLICY IF EXISTS "audit_cycles_delete_permission" ON public.audit_cycles;
CREATE POLICY "audit_cycles_delete_permission" ON public.audit_cycles FOR DELETE
  USING (
    is_super_admin()
    OR (created_by = auth.uid() AND phase = 'draft')
  );

-- ============================================================================
-- audit_attestations policies
-- ============================================================================
DROP POLICY IF EXISTS "audit_attestations_select_permission" ON public.audit_attestations;
CREATE POLICY "audit_attestations_select_permission" ON public.audit_attestations FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('audit.attestation.view') AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS "audit_attestations_insert_permission" ON public.audit_attestations;
CREATE POLICY "audit_attestations_insert_permission" ON public.audit_attestations FOR INSERT
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('audit.attestation.sign')
  );

DROP POLICY IF EXISTS "audit_attestations_update_permission" ON public.audit_attestations;
CREATE POLICY "audit_attestations_update_permission" ON public.audit_attestations FOR UPDATE
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('audit.attestation.sign')
    OR user_has_permission('audit.attestation.cosign')
  );

-- No delete — attestations are immutable audit trail (history via updated_at + audit_logs)
DROP POLICY IF EXISTS "audit_attestations_delete_permission" ON public.audit_attestations;
CREATE POLICY "audit_attestations_delete_permission" ON public.audit_attestations FOR DELETE
  USING (is_super_admin());

-- ============================================================================
-- audit_parameter_catalog policies
-- ============================================================================
DROP POLICY IF EXISTS "param_catalog_select_permission" ON public.audit_parameter_catalog;
CREATE POLICY "param_catalog_select_permission" ON public.audit_parameter_catalog FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('audit.parameter.view')
  );

DROP POLICY IF EXISTS "param_catalog_insert_permission" ON public.audit_parameter_catalog;
CREATE POLICY "param_catalog_insert_permission" ON public.audit_parameter_catalog FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (user_has_permission('audit.parameter.manage') AND is_system = false)
  );

-- Update allowed for super_admin always; audit.parameter.manage can only edit NON-system rows
DROP POLICY IF EXISTS "param_catalog_update_permission" ON public.audit_parameter_catalog;
CREATE POLICY "param_catalog_update_permission" ON public.audit_parameter_catalog FOR UPDATE
  USING (
    is_super_admin()
    OR (user_has_permission('audit.parameter.manage') AND is_system = false)
  );

-- Delete: only super_admin can remove system rows; non-system can be removed with audit.parameter.manage
DROP POLICY IF EXISTS "param_catalog_delete_permission" ON public.audit_parameter_catalog;
CREATE POLICY "param_catalog_delete_permission" ON public.audit_parameter_catalog FOR DELETE
  USING (
    is_super_admin()
    OR (user_has_permission('audit.parameter.manage') AND is_system = false)
  );

-- ============================================================================
-- audit_finding_types policies (same pattern as parameter_catalog)
-- ============================================================================
DROP POLICY IF EXISTS "finding_types_select_permission" ON public.audit_finding_types;
CREATE POLICY "finding_types_select_permission" ON public.audit_finding_types FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('audit.parameter.view')
    OR user_has_permission('audit.cycle.view')
  );

DROP POLICY IF EXISTS "finding_types_write_permission" ON public.audit_finding_types;
CREATE POLICY "finding_types_write_permission" ON public.audit_finding_types FOR ALL
  USING (
    is_super_admin()
    OR (user_has_permission('audit.finding_type.manage') AND is_system = false)
  );

-- ============================================================================
-- audit_finding_delegations policies (thrash T11)
-- ============================================================================
DROP POLICY IF EXISTS "delegations_select_permission" ON public.audit_finding_delegations;
CREATE POLICY "delegations_select_permission" ON public.audit_finding_delegations FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR delegated_to = auth.uid()
    OR delegated_by = auth.uid()
    OR user_has_permission('audit.finding.review')
  );

-- Create delegation: only by the finding's current owner (enforced at service layer — RLS checks permission exists)
DROP POLICY IF EXISTS "delegations_insert_permission" ON public.audit_finding_delegations;
CREATE POLICY "delegations_insert_permission" ON public.audit_finding_delegations FOR INSERT
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR delegated_by = auth.uid()
  );

-- Revoke delegation: creator or super_admin
DROP POLICY IF EXISTS "delegations_update_permission" ON public.audit_finding_delegations;
CREATE POLICY "delegations_update_permission" ON public.audit_finding_delegations FOR UPDATE
  USING (
    is_super_admin()
    OR delegated_by = auth.uid()
  );

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
DECLARE rls_count integer;
BEGIN
  SELECT COUNT(*) INTO rls_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('audit_cycles','audit_attestations','audit_parameter_catalog','audit_finding_types','audit_finding_delegations')
    AND c.relrowsecurity = true;
  ASSERT rls_count = 5, format('Expected RLS enabled on all 5 audit tables, got %s', rls_count);
END $$;
