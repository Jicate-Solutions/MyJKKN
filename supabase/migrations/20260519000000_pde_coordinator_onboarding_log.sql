-- ============================================================================
-- Migration: 20260519000000_pde_coordinator_onboarding_log
-- PDE Tier 2.1 — pace-cap enforcement substrate.
-- ============================================================================
-- Purpose
-- -------
-- Creates the rolling log of coordinator onboardings consumed by
-- `lib/services/pde-pace-cap-service.ts` to enforce the policy
-- `pde.rollout.pace_cap_coordinators_per_60d` (currently inert at 30/60d).
--
-- Reader path:
--   PDEPaceCapService.canOnboardCoordinator(institutionId?)
--     → getPaceCapCoordinatorsPer60d(institutionId)  -- platform_policies
--     → COUNT(*) FROM pde_coordinator_onboarding_log WHERE onboarded_at > now() - interval '60 days'
--     → allowed = (count < cap)
--
-- Writer path (gated):
--   POST /api/pde/coordinators/can-onboard
--     → PDEPaceCapService.recordOnboarding(...)
--     → throws if gate.allowed === false
--     → INSERT row (RLS: super_admin only)
--
-- RLS pattern
-- -----------
-- Adapted from the canonical `profiles.role` + `profiles.is_super_admin`
-- pattern used in 20260518_pde_demonstrations_table.sql. The original task
-- spec assumed a simpler USING clause — extended to match the prevailing PDE
-- convention so faculty/hod/coordinator/dean within the same institution can
-- read (for visibility into the rolling count), but only super_admin can
-- INSERT (the service layer enforces the pace-cap before insert).
--
-- Verification
-- ------------
-- Table + indexes + RLS + grants only. No INSERT smoke tests
-- (per memory feedback_smoke_test_must_include_all_not_null_columns.md).
-- Out-of-band verification via information_schema (see PR body).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pde_coordinator_onboarding_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  institution_id  UUID REFERENCES public.institutions(id),
  onboarded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  onboarded_by    UUID REFERENCES public.profiles(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pde_coordinator_onboarding_log IS
  'Rolling log of coordinator onboardings — consumed by pde-pace-cap-service to enforce pde.rollout.pace_cap_coordinators_per_60d.';
COMMENT ON COLUMN public.pde_coordinator_onboarding_log.onboarded_at IS
  'Timestamp the pace-cap window slides on. Pace-cap window: now() - interval ''60 days''.';
COMMENT ON COLUMN public.pde_coordinator_onboarding_log.institution_id IS
  'Scope for per-institution caps. NULL means "global / unscoped" — counted against the global cap.';

-- ---------------------------------------------------------------------------
-- 2) Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pde_coord_onboard_at
  ON public.pde_coordinator_onboarding_log (onboarded_at DESC);
CREATE INDEX IF NOT EXISTS idx_pde_coord_onboard_institution
  ON public.pde_coordinator_onboarding_log (institution_id);
CREATE INDEX IF NOT EXISTS idx_pde_coord_onboard_coordinator
  ON public.pde_coordinator_onboarding_log (coordinator_id);

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.pde_coordinator_onboarding_log ENABLE ROW LEVEL SECURITY;

-- READ: super_admin all + faculty/hod/coordinator/dean/institution_admin same-institution
DROP POLICY IF EXISTS pde_coord_onboard_read ON public.pde_coordinator_onboarding_log;
CREATE POLICY pde_coord_onboard_read ON public.pde_coordinator_onboarding_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.is_super_admin = true)
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('faculty', 'hod', 'coordinator', 'dean', 'institution_admin', 'administrator')
        AND (
          p.institution_id = public.pde_coordinator_onboarding_log.institution_id
          OR public.pde_coordinator_onboarding_log.institution_id IS NULL
        )
    )
  );

-- INSERT: super_admin only (service layer enforces the pace-cap gate before insert)
DROP POLICY IF EXISTS pde_coord_onboard_insert ON public.pde_coordinator_onboarding_log;
CREATE POLICY pde_coord_onboard_insert ON public.pde_coordinator_onboarding_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.is_super_admin = true)
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Grants (idempotent)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON public.pde_coordinator_onboarding_log TO authenticated;
