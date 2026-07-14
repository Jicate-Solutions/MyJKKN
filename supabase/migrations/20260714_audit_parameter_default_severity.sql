-- Migration: per-parameter default severity for audit findings
-- Date: 2026-07-14
-- Why: The log-finding dialog defaulted every finding to Yellow and made the auditor
--      pick severity by hand — wrong for soft culture items (a "frequent informal
--      acknowledgment" gap is an observation, not a P1). Each parameter now carries a
--      sensible default the dialog pre-selects (auditor can still override). Culture
--      (CARRE) parameters default to green/observation; everything else to yellow.
--      The real SLA days already live on p1_sla_days / p2_sla_days per parameter — the
--      dialog shows the actual due-date from those, instead of a generic "P2 SLA" label.

ALTER TABLE public.audit_parameter_catalog
  ADD COLUMN IF NOT EXISTS default_severity text NOT NULL DEFAULT 'yellow';

-- Constrain to the finding severity vocabulary (red | yellow | green).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_parameter_catalog_default_severity_chk'
  ) THEN
    ALTER TABLE public.audit_parameter_catalog
      ADD CONSTRAINT audit_parameter_catalog_default_severity_chk
      CHECK (default_severity IN ('red','yellow','green'));
  END IF;
END $$;

-- Culture (CARRE) parameters are observations by default, not compliance criticals.
UPDATE public.audit_parameter_catalog
   SET default_severity = 'green', updated_at = now()
 WHERE code LIKE 'CARRE-%'
   AND default_severity <> 'green';
