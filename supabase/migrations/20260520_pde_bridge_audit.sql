-- =====================================================================
-- PDE Tier 4 — T4.1 Bridge Audit table
-- =====================================================================
-- Tracks every bridge attempt (dry-run + applied) from legacy PDE
-- learner-earned artifacts (capabilities + certificates + passed quests)
-- into the new `pde_demonstrations` substrate. One row per source row per
-- run_id. Used by the admin bridge runner UI and the
-- `pde-bridge-service.ts` idempotency check.
--
-- Director strategy lock (2026-05-20): (c) Bridge old → new categories —
-- preserve learner history while consolidating onto the new 7-category
-- framework. Old tables stay intact (parallel-run safety).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pde_bridge_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL CHECK (source_table IN (
    'pde_learner_capabilities',
    'pde_certificates',
    'pde_quest_enrollments'
  )),
  source_row_id uuid NOT NULL,
  target_demonstration_id uuid REFERENCES public.pde_demonstrations(id) ON DELETE SET NULL,
  learner_id uuid NOT NULL,
  institution_id uuid,
  category_key text,
  status text NOT NULL CHECK (status IN ('dry_run', 'applied', 'failed', 'reversed')),
  error_message text,
  run_id uuid NOT NULL,
  run_started_at timestamptz,
  run_completed_at timestamptz,
  dry_run boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_pde_bridge_audit_run_id
  ON public.pde_bridge_audit (run_id);

CREATE INDEX IF NOT EXISTS idx_pde_bridge_audit_source
  ON public.pde_bridge_audit (source_table, source_row_id);

CREATE INDEX IF NOT EXISTS idx_pde_bridge_audit_learner
  ON public.pde_bridge_audit (learner_id);

CREATE INDEX IF NOT EXISTS idx_pde_bridge_audit_status
  ON public.pde_bridge_audit (status) WHERE status IN ('applied', 'failed');

-- RLS
ALTER TABLE public.pde_bridge_audit ENABLE ROW LEVEL SECURITY;

-- super_admin: full access
DROP POLICY IF EXISTS pde_bridge_audit_super_admin_all ON public.pde_bridge_audit;
CREATE POLICY pde_bridge_audit_super_admin_all
  ON public.pde_bridge_audit
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- faculty/hod: read-only, scoped to own institution
DROP POLICY IF EXISTS pde_bridge_audit_faculty_hod_select ON public.pde_bridge_audit;
CREATE POLICY pde_bridge_audit_faculty_hod_select
  ON public.pde_bridge_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('faculty', 'hod')
        AND p.institution_id = pde_bridge_audit.institution_id
    )
  );

COMMENT ON TABLE public.pde_bridge_audit IS
  'PDE Tier 4 T4.1 — audit trail for the legacy → pde_demonstrations bridge runner. One row per source row per run_id. Dry-run rows have status=dry_run; applied rows link to a real pde_demonstrations.id via target_demonstration_id.';
