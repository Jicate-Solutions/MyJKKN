-- ============================================================================
-- Migration: 20260519_pde_reciprocal_credits
-- PDE Tier 3 — T3.3 — Reciprocal credit accounting substrate.
-- ============================================================================
-- Purpose
-- -------
-- Creates the per-grant ledger consumed by
-- `lib/services/pde-reciprocal-credit-service.ts` to track credits awarded
-- under the `pde.quests.compensation_model` policy
-- (seeded by 20260518_pde_cluster_d_quests_supply_policies.sql).
--
-- Reader / writer paths
-- ---------------------
-- Writer (gated):
--   PDEReciprocalCreditService.grantCreditForQuestCompletion(learnerId, questId)
--     → getQuestsCompensationModel(institutionId?)
--     → if model === 'reciprocal_credit' → INSERT one row (credit_type='quest_completion')
--     → else                              → no-op
--
--   PDEReciprocalCreditService.grantCreditForValidator(validatorId, demonstrationId)
--     → same policy read; INSERTs credit_type='validator_grant' when enabled.
--
-- Reader:
--   PDEReciprocalCreditService.getLearnerCredits(learnerId)
--     → SELECT * FROM pde_reciprocal_credits WHERE learner_id = $1
--     → aggregates sum + per-type breakdown.
--
-- RLS pattern
-- -----------
-- Aligned with `pde_coordinator_onboarding_log`
-- (20260519000000_pde_coordinator_onboarding_log.sql):
--   - Learner SELECTs own rows
--   - super_admin SELECTs all + INSERT/UPDATE
--   - faculty/hod/coordinator/dean/institution_admin same-institution SELECT
--
-- Verification
-- ------------
-- Table + indexes + RLS + grants only. No inline DO $$ smoke tests
-- (per memory feedback_smoke_test_must_include_all_not_null_columns.md).
-- Out-of-band verification via information_schema probe (see PR body).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pde_reciprocal_credits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quest_id        UUID,
  credit_type     TEXT NOT NULL CHECK (credit_type IN ('quest_completion', 'validator_grant', 'peer_attestation')),
  credit_value    NUMERIC NOT NULL DEFAULT 0,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by      UUID REFERENCES public.profiles(id),
  institution_id  UUID REFERENCES public.institutions(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pde_reciprocal_credits IS
  'Per-grant ledger of reciprocal credits — consumed by pde-reciprocal-credit-service under the pde.quests.compensation_model policy.';
COMMENT ON COLUMN public.pde_reciprocal_credits.credit_type IS
  'quest_completion = learner finished a quest; validator_grant = validator was credited for a demonstration review; peer_attestation = peer recognized a learner.';
COMMENT ON COLUMN public.pde_reciprocal_credits.credit_value IS
  'Numeric credit awarded. Default 1.0 for quest_completion; service layer chooses the value per credit_type.';
COMMENT ON COLUMN public.pde_reciprocal_credits.institution_id IS
  'Scope for per-institution reporting. NULL means "global / unscoped".';

-- ---------------------------------------------------------------------------
-- 2) Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pde_reciprocal_credits_learner
  ON public.pde_reciprocal_credits (learner_id);
CREATE INDEX IF NOT EXISTS idx_pde_reciprocal_credits_quest
  ON public.pde_reciprocal_credits (quest_id);
CREATE INDEX IF NOT EXISTS idx_pde_reciprocal_credits_granted_at
  ON public.pde_reciprocal_credits (granted_at DESC);
CREATE INDEX IF NOT EXISTS idx_pde_reciprocal_credits_institution
  ON public.pde_reciprocal_credits (institution_id);

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.pde_reciprocal_credits ENABLE ROW LEVEL SECURITY;

-- READ: learner owns their rows + super_admin all + same-institution faculty/hod/etc.
DROP POLICY IF EXISTS pde_reciprocal_credits_read ON public.pde_reciprocal_credits;
CREATE POLICY pde_reciprocal_credits_read ON public.pde_reciprocal_credits
  FOR SELECT TO authenticated
  USING (
    public.pde_reciprocal_credits.learner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.is_super_admin = true)
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('faculty', 'hod', 'coordinator', 'dean', 'institution_admin', 'administrator')
        AND (
          p.institution_id = public.pde_reciprocal_credits.institution_id
          OR public.pde_reciprocal_credits.institution_id IS NULL
        )
    )
  );

-- INSERT: super_admin only (service layer enforces the policy gate before insert)
DROP POLICY IF EXISTS pde_reciprocal_credits_insert ON public.pde_reciprocal_credits;
CREATE POLICY pde_reciprocal_credits_insert ON public.pde_reciprocal_credits
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.is_super_admin = true)
    )
  );

-- UPDATE: super_admin only (rare — corrections / annotations)
DROP POLICY IF EXISTS pde_reciprocal_credits_update ON public.pde_reciprocal_credits;
CREATE POLICY pde_reciprocal_credits_update ON public.pde_reciprocal_credits
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'super_admin' OR p.is_super_admin = true)
    )
  )
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
GRANT SELECT, INSERT, UPDATE ON public.pde_reciprocal_credits TO authenticated;
