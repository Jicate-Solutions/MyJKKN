-- ============================================================================
-- Migration: 20260601_hr_policy_substrate_extensions
-- Wave 3 — Policy-Driven HR Manual Replacement (M0 substrate)
-- ============================================================================
-- Extends platform_policies with the columns Wave 3 editors need:
--   1. classification ('operational' | 'major', default 'major')
--      - Director-only edits major-classified rows
--      - CAO can edit operational-classified rows
--   2. draft_value JSONB NULL
--      - Holds unpublished edits during Draft -> Publish flow
--   3. publication_state ('draft_only' | 'published' | 'draft_pending', default 'published')
--      - Mirrors current state of the row vs its draft
--
-- Plus new audit substrate:
--   hr_policy_audit_log — mandatory-reason ledger of every Wave 3 mutation
--
-- Spec: specs/wave-3-policy-driven-hr-manual-2026-05-15.md
--       specs/hr-policy-jsonb-structures-2026-05-15.md (Director-locked updates)
--       project_wave3_hr_policy_lock_2026_05_15 memory (24 decisions)
--
-- TIER-0 safe-additive:
--   - Column adds use IF NOT EXISTS (Postgres 14+) / DO-block guards
--   - New table + RLS only; no destructive DDL on existing tables
--   - Idempotent. Safe to re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend platform_policies — 3 new columns
-- ----------------------------------------------------------------------------

-- 1a. classification
ALTER TABLE platform_policies
  ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'major';

-- Attach CHECK once (drop-and-recreate to keep idempotent across re-runs).
ALTER TABLE platform_policies
  DROP CONSTRAINT IF EXISTS platform_policies_classification_check;
ALTER TABLE platform_policies
  ADD CONSTRAINT platform_policies_classification_check
  CHECK (classification IN ('operational', 'major'));

-- 1b. draft_value
ALTER TABLE platform_policies
  ADD COLUMN IF NOT EXISTS draft_value JSONB NULL;

-- 1c. publication_state
ALTER TABLE platform_policies
  ADD COLUMN IF NOT EXISTS publication_state TEXT NOT NULL DEFAULT 'published';

ALTER TABLE platform_policies
  DROP CONSTRAINT IF EXISTS platform_policies_publication_state_check;
ALTER TABLE platform_policies
  ADD CONSTRAINT platform_policies_publication_state_check
  CHECK (publication_state IN ('draft_only', 'published', 'draft_pending'));

-- Helper index for "show me everything with unpublished drafts" admin dashboards.
CREATE INDEX IF NOT EXISTS idx_platform_policies_publication_state
  ON platform_policies (publication_state)
  WHERE publication_state <> 'published';

-- ----------------------------------------------------------------------------
-- 2. hr_policy_audit_log — mandatory-reason ledger
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_policy_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES platform_policies(id) ON DELETE CASCADE,
  policy_key TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id UUID NULL,
  action TEXT NOT NULL,
  old_value JSONB NULL,
  new_value JSONB NULL,
  reason TEXT NOT NULL,
  edited_by UUID NOT NULL REFERENCES profiles(id),
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE hr_policy_audit_log
  DROP CONSTRAINT IF EXISTS hr_policy_audit_log_action_check;
ALTER TABLE hr_policy_audit_log
  ADD CONSTRAINT hr_policy_audit_log_action_check
  CHECK (action IN ('edit_draft', 'publish', 'classify_change', 'promote_to_global'));

-- Mandatory-reason enforcement at the DB layer (UI also blocks empty strings,
-- but defense-in-depth — no empty-reason rows can land via any client).
ALTER TABLE hr_policy_audit_log
  DROP CONSTRAINT IF EXISTS hr_policy_audit_log_reason_nonempty;
ALTER TABLE hr_policy_audit_log
  ADD CONSTRAINT hr_policy_audit_log_reason_nonempty
  CHECK (length(trim(reason)) > 0);

CREATE INDEX IF NOT EXISTS idx_hr_policy_audit_log_key_time
  ON hr_policy_audit_log (policy_key, edited_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_policy_audit_log_editor_time
  ON hr_policy_audit_log (edited_by, edited_at DESC);

-- ----------------------------------------------------------------------------
-- 3. RLS on hr_policy_audit_log
-- ----------------------------------------------------------------------------
ALTER TABLE hr_policy_audit_log ENABLE ROW LEVEL SECURITY;

-- Super admin sees everything across institutions.
-- Institution-scoped users see rows whose scope_id matches their institution
-- OR rows with NULL scope_id (global policies are visible to everyone for
-- read-only audit). Authenticated users only.
DROP POLICY IF EXISTS hr_policy_audit_log_select ON hr_policy_audit_log;
CREATE POLICY hr_policy_audit_log_select ON hr_policy_audit_log
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      is_super_admin()
      OR scope_id IS NULL
      OR scope_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Inserts limited to super_admin (Director) — CAO inserts will go through
-- a SECURITY DEFINER service function in a later M PR. For now, restrict
-- direct INSERT to super_admin to keep the audit trail trustworthy.
DROP POLICY IF EXISTS hr_policy_audit_log_insert ON hr_policy_audit_log;
CREATE POLICY hr_policy_audit_log_insert ON hr_policy_audit_log
  FOR INSERT WITH CHECK (is_super_admin());

-- No UPDATE / DELETE policies — audit log is append-only by design.
-- Postgres default-deny applies; only super_admin via service_role can mutate.

-- ----------------------------------------------------------------------------
-- 4. Smoke test (inline DO block — fails loudly on any mismatch)
-- ----------------------------------------------------------------------------
DO $smoketest$
DECLARE
  v_policy_id UUID;
  v_audit_id UUID;
  v_classification TEXT;
  v_publication_state TEXT;
  v_draft_value JSONB;
  v_audit_reason TEXT;
  v_count INT;
  v_editor UUID;
BEGIN
  -- Pick any existing profile to satisfy the FK (audit log requires real editor).
  SELECT id INTO v_editor FROM profiles ORDER BY created_at ASC LIMIT 1;
  IF v_editor IS NULL THEN
    -- No profiles to FK against on a fresh DB; skip smoke test rather than fail.
    RAISE NOTICE 'hr_policy_audit_log smoke test skipped — no profiles row present';
    RETURN;
  END IF;

  -- Insert a test platform_policies row touching every new column.
  INSERT INTO platform_policies (
    policy_key, scope_type, scope_id, value, description, data_type,
    is_system, classification, draft_value, publication_state
  )
  VALUES (
    'hr.test._smoketest_w3m0',
    'global',
    NULL,
    '{"published": true}'::jsonb,
    'W3-M0 smoke test row; safe to delete',
    'object',
    false,
    'operational',
    '{"draft": true}'::jsonb,
    'draft_pending'
  )
  RETURNING id INTO v_policy_id;

  -- Verify new columns round-tripped correctly.
  SELECT classification, publication_state, draft_value
    INTO v_classification, v_publication_state, v_draft_value
    FROM platform_policies WHERE id = v_policy_id;

  IF v_classification <> 'operational' THEN
    RAISE EXCEPTION 'classification round-trip failed: got %', v_classification;
  END IF;
  IF v_publication_state <> 'draft_pending' THEN
    RAISE EXCEPTION 'publication_state round-trip failed: got %', v_publication_state;
  END IF;
  IF v_draft_value IS NULL OR (v_draft_value->>'draft')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'draft_value round-trip failed: got %', v_draft_value;
  END IF;

  -- Insert audit log row with mandatory reason.
  INSERT INTO hr_policy_audit_log (
    policy_id, policy_key, scope_type, scope_id, action,
    old_value, new_value, reason, edited_by
  )
  VALUES (
    v_policy_id,
    'hr.test._smoketest_w3m0',
    'global',
    NULL,
    'edit_draft',
    '{"published": true}'::jsonb,
    '{"draft": true}'::jsonb,
    'W3-M0 smoke test reason — verifying mandatory reason check',
    v_editor
  )
  RETURNING id INTO v_audit_id;

  -- Verify audit row queryable + reason preserved.
  SELECT reason INTO v_audit_reason
    FROM hr_policy_audit_log WHERE id = v_audit_id;
  IF v_audit_reason IS NULL OR length(trim(v_audit_reason)) = 0 THEN
    RAISE EXCEPTION 'audit log reason round-trip failed: got %', v_audit_reason;
  END IF;

  -- Verify the mandatory-reason CHECK fires on empty input.
  BEGIN
    INSERT INTO hr_policy_audit_log (
      policy_id, policy_key, scope_type, action, reason, edited_by
    )
    VALUES (
      v_policy_id, 'hr.test._smoketest_w3m0', 'global',
      'edit_draft', '   ', v_editor
    );
    RAISE EXCEPTION 'empty-reason audit row was accepted — CHECK constraint missing';
  EXCEPTION
    WHEN check_violation THEN
      -- expected
      NULL;
  END;

  -- Verify the action CHECK fires on bogus action.
  BEGIN
    INSERT INTO hr_policy_audit_log (
      policy_id, policy_key, scope_type, action, reason, edited_by
    )
    VALUES (
      v_policy_id, 'hr.test._smoketest_w3m0', 'global',
      'bogus_action', 'reason', v_editor
    );
    RAISE EXCEPTION 'bogus action was accepted — CHECK constraint missing';
  EXCEPTION
    WHEN check_violation THEN
      -- expected
      NULL;
  END;

  -- Clean up — leave no test rows in production tables.
  DELETE FROM hr_policy_audit_log WHERE id = v_audit_id;
  DELETE FROM platform_policies WHERE id = v_policy_id;

  -- Confirm cleanup.
  SELECT count(*) INTO v_count FROM platform_policies
    WHERE policy_key = 'hr.test._smoketest_w3m0';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'smoke test row leak: % rows remain', v_count;
  END IF;

  RAISE NOTICE '[W3-M0] hr_policy substrate smoke test passed';
END
$smoketest$ LANGUAGE plpgsql;
