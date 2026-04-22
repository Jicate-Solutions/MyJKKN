-- Audit Workflow Sprint 01 — Seeds + Triggers
-- Depends on: 20260422_audit_workflow_substrate.sql, 20260422_audit_workflow_rls.sql
-- Applied: 2026-04-22
--
-- Seeds:
--   1. service_types row for 'audit_finding' (binds audit findings to existing ticket engine)
--   2. 4 default audit_finding_types (gap / inconsistency / missing_evidence / data_quality)
--   3. 3 new roles in custom_roles (lead_auditor, evidence_uploader, external_auditor_timeboxed)
--      with 11 new permission keys
--
-- Triggers:
--   4. emit_audit_finding_evidence() — fan-out to quality_evidence_mappings on close+rectified
--   5. revoke_audit_finding_evidence() — thrash T1: remove evidence rows on reopen
--   6. auto_revoke_delegations_on_finding_close() — thrash T11: auto-revoke delegations

-- ============================================================================
-- 1. service_types seed — 'audit_finding' binds our findings to service_requests
-- ============================================================================
INSERT INTO public.service_types
  (slug, name, description, is_active, is_system_default, enable_priority, enable_attachments,
   enable_email_notifications, approval_workflow_type, scope_level)
VALUES
  ('audit_finding',
   'Audit Finding',
   'A gap logged by the Lead Auditor requiring rectification by a finding owner. Auto-emits evidence on close+rectified.',
   true, true, true, true, true, 'sequential', 'institution')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_system_default = true,
  is_active = true,
  updated_at = now();

-- ============================================================================
-- 2. audit_finding_types seed — 4 defaults
-- ============================================================================
INSERT INTO public.audit_finding_types (code, name, description, is_system, is_active)
VALUES
  ('gap',                'Gap',                 'Missing or absent evidence for a required parameter',           true, true),
  ('inconsistency',      'Inconsistency',       'Data mismatch across sources (e.g., HR vs payroll headcount)',  true, true),
  ('missing_evidence',   'Missing Evidence',    'Parameter satisfied but required documentation not uploaded',   true, true),
  ('data_quality',       'Data Quality',        'Evidence exists but does not meet regulator quality standard',  true, true)
ON CONFLICT (code, institution_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_system = true,
  is_active = true,
  updated_at = now();

-- ============================================================================
-- 3. Seed 3 new roles + their permission keys
-- ============================================================================
-- Note: permission keys also need to be added to lib/constants/permissions.ts for UI
-- visibility — that's a code-side change handled in PR-B2.
-- Permission keys used below:
--   audit.cycle.view, audit.cycle.manage,
--   audit.finding.log, audit.finding.review, audit.finding.rectify,
--   audit.evidence.upload,
--   audit.attestation.sign, audit.attestation.cosign, audit.attestation.view,
--   audit.parameter.view, audit.parameter.manage,
--   audit.finding_type.manage,
--   audit.leadership.view (thrash T13)

INSERT INTO public.custom_roles
  (role_key, role_name, description, institution_scope, is_system_role, is_active, permissions)
VALUES
  ('lead_auditor',
   'Lead Auditor',
   'Group Registrar role for conducting institutional audits across all colleges. Holder (Selvamani) can create cycles, log findings, review rectifications, and sign per-parameter attestations.',
   'all', true, true,
   jsonb_build_object(
     'audit.cycle.view', true,
     'audit.cycle.manage', true,
     'audit.finding.log', true,
     'audit.finding.review', true,
     'audit.attestation.sign', true,
     'audit.attestation.view', true,
     'audit.parameter.view', true
   )),

  ('evidence_uploader',
   'Evidence Uploader',
   'Delegated role for uploading audit-finding rectification evidence on behalf of a finding owner (thrash T11).',
   'own', true, true,
   jsonb_build_object(
     'audit.finding.view', true,
     'audit.evidence.upload', true
   )),

  ('external_auditor_timeboxed',
   'External Auditor (Time-Boxed)',
   'Read-only auditor role with time-boxed expiry via user_institution_access.expires_at. Used for Aassaan mock peer-team visit (Aug 2026) and future external assessments.',
   'all', true, true,
   jsonb_build_object(
     'audit.cycle.view', true,
     'audit.finding.view', true,
     'audit.attestation.view', true,
     'audit.parameter.view', true
   ))
ON CONFLICT (role_key) DO UPDATE SET
  role_name = EXCLUDED.role_name,
  description = EXCLUDED.description,
  institution_scope = EXCLUDED.institution_scope,
  permissions = EXCLUDED.permissions,
  is_system_role = true,
  is_active = true,
  updated_at = now();

-- ============================================================================
-- 4. Fan-out trigger: emit evidence on finding close+rectified
-- ============================================================================
-- Thrash T17: close requires evidence uploaded per parameter.evidence_required
--   — service layer enforces; trigger fires once finding is closed with resolution context.
-- Fan-out: one finding → one evidence row per body in framework_mapping
-- Idempotent via ON CONFLICT on quality_evidence_mappings unique constraint.

CREATE OR REPLACE FUNCTION public.emit_audit_finding_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_type_slug text;
  v_parameter_code    text;
  v_framework_mapping jsonb;
  v_audit_cycle_id    uuid;
  v_institution_id    uuid;
  v_body_code         text;
  v_metric_code       text;
BEGIN
  -- Only fire on service_requests of type audit_finding
  SELECT slug INTO v_service_type_slug
  FROM public.service_types
  WHERE id = NEW.service_type_id;

  IF v_service_type_slug != 'audit_finding' THEN
    RETURN NEW;
  END IF;

  -- Only on close transition AND form_data marks it rectified
  IF NEW.status::text != 'closed' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.form_data->>'resolution', '') != 'rectified' THEN RETURN NEW; END IF;

  -- Guard against repeat firing (already-closed rectified state)
  IF OLD.status::text = 'closed' AND COALESCE(OLD.form_data->>'resolution', '') = 'rectified' THEN
    RETURN NEW;
  END IF;

  -- Extract audit context from form_data
  v_parameter_code := NEW.form_data->>'parameter_code';
  v_audit_cycle_id := NULLIF(NEW.form_data->>'audit_cycle_id', '')::uuid;
  v_institution_id := NEW.institution_id;

  IF v_parameter_code IS NULL OR v_institution_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve framework_mapping from catalog (institution-override wins over system default)
  SELECT framework_mapping INTO v_framework_mapping
  FROM public.audit_parameter_catalog
  WHERE code = v_parameter_code
    AND (institution_id = v_institution_id OR institution_id IS NULL)
  ORDER BY (institution_id IS NOT NULL) DESC  -- prefer institution-specific
  LIMIT 1;

  IF v_framework_mapping IS NULL OR v_framework_mapping = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  -- Fan-out: one evidence row per body in framework_mapping
  FOR v_body_code, v_metric_code IN
    SELECT key, value FROM jsonb_each_text(v_framework_mapping)
  LOOP
    IF COALESCE(v_metric_code, '') = '' OR v_metric_code = '-' THEN
      CONTINUE;  -- skip bodies with no mapping for this parameter
    END IF;

    INSERT INTO public.quality_evidence_mappings
      (source_table, source_id, institution_id, body_code, metric_code, mapped_at, mapped_by, is_auto, metadata)
    VALUES
      ('service_requests', NEW.id, v_institution_id, upper(v_body_code), v_metric_code, NEW.closed_at, NEW.updated_by, true,
       jsonb_build_object('audit_finding_id', NEW.id, 'parameter_code', v_parameter_code, 'audit_cycle_id', v_audit_cycle_id))
    ON CONFLICT (source_table, source_id, body_code, metric_code) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_audit_finding_evidence ON public.service_requests;
CREATE TRIGGER trg_emit_audit_finding_evidence
  AFTER UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.emit_audit_finding_evidence();

COMMENT ON FUNCTION public.emit_audit_finding_evidence() IS
  'Fan-out audit-finding rectification into quality_evidence_mappings. Mirrors PR-A5 (anti-ragging) + PR-A6a (grievance) pattern. Idempotent via unique constraint on target.';

-- ============================================================================
-- 5. Revoke trigger: remove evidence when a closed-rectified finding reopens (thrash T1)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.revoke_audit_finding_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_type_slug text;
  v_was_rectified     boolean;
  v_is_still_closed   boolean;
BEGIN
  SELECT slug INTO v_service_type_slug
  FROM public.service_types
  WHERE id = NEW.service_type_id;

  IF v_service_type_slug != 'audit_finding' THEN RETURN NEW; END IF;

  v_was_rectified := OLD.status::text = 'closed' AND COALESCE(OLD.form_data->>'resolution','') = 'rectified';
  v_is_still_closed := NEW.status::text = 'closed' AND COALESCE(NEW.form_data->>'resolution','') = 'rectified';

  -- Only fire when transitioning OUT of closed-rectified state (reopen OR resolution change)
  IF NOT v_was_rectified OR v_is_still_closed THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.quality_evidence_mappings
  WHERE source_table = 'service_requests'
    AND source_id = NEW.id
    AND (metadata->>'audit_finding_id')::uuid = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_revoke_audit_finding_evidence ON public.service_requests;
CREATE TRIGGER trg_revoke_audit_finding_evidence
  AFTER UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.revoke_audit_finding_evidence();

COMMENT ON FUNCTION public.revoke_audit_finding_evidence() IS
  'Thrash T1: when a rectified finding reopens, delete emitted quality_evidence_mappings rows so coverage dashboard never shows stale claims.';

-- ============================================================================
-- 6. Auto-revoke delegations on finding close (thrash T11)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_revoke_delegations_on_finding_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_type_slug text;
BEGIN
  SELECT slug INTO v_service_type_slug
  FROM public.service_types
  WHERE id = NEW.service_type_id;

  IF v_service_type_slug != 'audit_finding' THEN RETURN NEW; END IF;
  IF NEW.status::text != 'closed' OR OLD.status::text = 'closed' THEN RETURN NEW; END IF;

  UPDATE public.audit_finding_delegations
  SET revoked_at = now(),
      revoke_reason = 'auto-revoked on finding close'
  WHERE finding_id = NEW.id
    AND revoked_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_revoke_delegations_on_close ON public.service_requests;
CREATE TRIGGER trg_auto_revoke_delegations_on_close
  AFTER UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.auto_revoke_delegations_on_finding_close();

-- ============================================================================
-- 7. Verification
-- ============================================================================
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM public.service_types WHERE slug = 'audit_finding') = 1,
    'Expected audit_finding service type seeded';
  ASSERT (SELECT COUNT(*) FROM public.audit_finding_types WHERE is_system = true) = 4,
    'Expected 4 system finding types seeded';
  ASSERT (SELECT COUNT(*) FROM public.custom_roles WHERE role_key IN ('lead_auditor','evidence_uploader','external_auditor_timeboxed')) = 3,
    'Expected 3 new audit roles seeded';
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'emit_audit_finding_evidence'),
    'Expected emit_audit_finding_evidence function';
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'revoke_audit_finding_evidence'),
    'Expected revoke_audit_finding_evidence function';
END $$;
