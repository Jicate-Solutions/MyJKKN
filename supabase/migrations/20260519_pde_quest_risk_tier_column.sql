-- =====================================================================
-- PDE Tier 3 — T3.2: Quest risk-tier promotion
-- =====================================================================
-- Adds a `risk_tier` column + `risk_tier_promoted_at` timestamp to
-- pde_quests so the nightly cron at /api/cron/pde-quest-risk-tier can
-- promote experimental quests to production once they accumulate the
-- threshold number of passed submissions (per policy
-- pde.quests.risk_tiers — production_eligibility =
-- 'after_2_experimental_passes').
--
-- Default tier mirrors getQuestsRiskTiers().default_tier = 'experimental'.
-- `risk_tier_promoted_at` doubles as the audit record: audit_logs.module
-- has a hard CHECK constraint that does not include 'pde', so we record
-- promotion provenance on the row itself.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + partial index IF NOT EXISTS.
-- =====================================================================

ALTER TABLE pde_quests
  ADD COLUMN IF NOT EXISTS risk_tier TEXT DEFAULT 'experimental';

ALTER TABLE pde_quests
  ADD COLUMN IF NOT EXISTS risk_tier_promoted_at TIMESTAMPTZ;

-- Index supports the cron's primary filter: WHERE risk_tier = 'experimental'.
CREATE INDEX IF NOT EXISTS idx_pde_quests_risk_tier_experimental
  ON pde_quests(risk_tier)
  WHERE risk_tier = 'experimental';
