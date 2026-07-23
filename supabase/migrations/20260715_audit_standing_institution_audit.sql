-- Migration: standing "Whole Institution" audit + org-wide parameter routing
-- Date: 2026-07-15
-- Why (Director interview 2026-07-14, decisions #2 + #7): a few checks measure the WHOLE
--      institution, not one college — LOOP_HEALTH (are our improvement loops healthy?) and
--      EXAM_IA_AUDIT (is exam marking honest?). With audits going per-college, these must NOT
--      repeat in every college's audit. They live in ONE standing "Whole Institution" audit the
--      system keeps for them. This adds the two flags + seeds/maintains that standing cycle.

-- 1. Flags ------------------------------------------------------------------------------
-- Which parameters are institution-wide (audited once for the whole institution).
ALTER TABLE public.audit_parameter_catalog
  ADD COLUMN IF NOT EXISTS is_org_wide boolean NOT NULL DEFAULT false;

-- The two auto/discovery-driven system checks are org-wide; every CARRE/accreditation
-- parameter stays per-college (the default false).
UPDATE public.audit_parameter_catalog
   SET is_org_wide = true, updated_at = now()
 WHERE code IN ('LOOP_HEALTH', 'EXAM_IA_AUDIT')
   AND is_org_wide = false;

-- Marks the single standing whole-institution audit (never closes; holds org-wide params).
ALTER TABLE public.audit_cycles
  ADD COLUMN IF NOT EXISTS is_standing boolean NOT NULL DEFAULT false;

-- 2. Ensure-function ------------------------------------------------------------------
-- Idempotently returns the standing whole-institution audit, creating it if missing.
-- "Standing" = phase in-progress, never closed, institution_ids NULL (whole institution),
-- a wide date window so the org-wide discovery queries always see the latest verdicts.
-- Called on demand from the audit surfaces so the standing audit is always there.
CREATE OR REPLACE FUNCTION public.fn_ensure_standing_institution_audit()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_lead uuid;
BEGIN
  SELECT id INTO v_id FROM audit_cycles WHERE is_standing = true LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Lead auditor: prefer a registrar, else any super-admin (lead_auditor_id is NOT NULL).
  SELECT id INTO v_lead FROM profiles WHERE role = 'registrar' LIMIT 1;
  IF v_lead IS NULL THEN
    SELECT id INTO v_lead FROM profiles WHERE is_super_admin = true LIMIT 1;
  END IF;
  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'no registrar or super-admin to own the standing audit';
  END IF;

  INSERT INTO audit_cycles (
    name, description, frameworks, start_date, end_date, lead_auditor_id,
    cosigner_roles, institution_ids, phase, is_standing, created_by
  ) VALUES (
    'Whole Institution — Ongoing',
    'Standing audit for institution-wide checks (loop health, exam integrity). These run for the whole institution, so they are audited here once rather than repeated in every college''s audit.',
    ARRAY['NAAC'],
    '2026-01-01', '2099-12-31',
    v_lead,
    ARRAY[]::text[],
    NULL,               -- whole institution
    'in-progress',
    true,
    v_lead
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ensure_standing_institution_audit() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ensure_standing_institution_audit() TO authenticated;

-- 3. Seed it now ----------------------------------------------------------------------
SELECT public.fn_ensure_standing_institution_audit();
