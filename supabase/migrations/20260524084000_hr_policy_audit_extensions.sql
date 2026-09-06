-- ============================================================================
-- Migration: 20260524084000_hr_policy_audit_extensions
-- Wave 3 B4 — Audit/publish extensions for HR policy substrate
-- ============================================================================
-- Adds:
--   1. published_at / published_by columns to platform_policies
--      (tracks WHO published and WHEN — complements existing publication_state)
--   2. Extends hr_policy_audit_log action CHECK to include 'unpublish'
--
-- Depends on: 20260601_hr_policy_substrate_extensions (hr_policy_audit_log
-- table, platform_policies.classification / draft_value / publication_state)
--
-- TIER-0 safe-additive: column adds use IF NOT EXISTS, CHECK constraint is
-- drop-and-recreate (idempotent). No destructive DDL.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Add published_at / published_by to platform_policies
-- ----------------------------------------------------------------------------

ALTER TABLE platform_policies
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE platform_policies
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES profiles(id);

-- Backfill: any row already in 'published' state gets published_at = updated_at
-- and published_by = NULL (unknown — pre-tracking era). No-op on re-run because
-- we only fill rows where published_at IS NULL AND publication_state = 'published'.
UPDATE platform_policies
  SET published_at = COALESCE(updated_at, created_at, now())
  WHERE publication_state = 'published'
    AND published_at IS NULL;

-- Index for "recently published" queries.
CREATE INDEX IF NOT EXISTS idx_platform_policies_published_at
  ON platform_policies (published_at DESC NULLS LAST)
  WHERE published_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Extend hr_policy_audit_log action CHECK to include 'unpublish'
-- ----------------------------------------------------------------------------

ALTER TABLE hr_policy_audit_log
  DROP CONSTRAINT IF EXISTS hr_policy_audit_log_action_check;

ALTER TABLE hr_policy_audit_log
  ADD CONSTRAINT hr_policy_audit_log_action_check
  CHECK (action IN (
    'edit_draft',
    'publish',
    'unpublish',
    'classify_change',
    'promote_to_global'
  ));

-- ----------------------------------------------------------------------------
-- 3. Smoke test
-- ----------------------------------------------------------------------------
DO $smoketest$
DECLARE
  v_has_published_at BOOLEAN;
  v_has_published_by BOOLEAN;
BEGIN
  -- Verify columns exist.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_policies' AND column_name = 'published_at'
  ) INTO v_has_published_at;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_policies' AND column_name = 'published_by'
  ) INTO v_has_published_by;

  IF NOT v_has_published_at THEN
    RAISE EXCEPTION 'published_at column missing on platform_policies';
  END IF;
  IF NOT v_has_published_by THEN
    RAISE EXCEPTION 'published_by column missing on platform_policies';
  END IF;

  -- Verify 'unpublish' action is allowed by CHECK.
  -- (We don't insert a real row — just verify the CHECK text via pg_catalog.)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hr_policy_audit_log_action_check'
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%unpublish%'
  ) THEN
    RAISE EXCEPTION 'hr_policy_audit_log_action_check does not include unpublish';
  END IF;

  RAISE NOTICE '[B4] hr_policy_audit_extensions smoke test passed';
END
$smoketest$ LANGUAGE plpgsql;
