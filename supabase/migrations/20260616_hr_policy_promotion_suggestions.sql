-- ============================================================================
-- Migration: 20260616_hr_policy_promotion_suggestions
-- Wave 3 — M10 — Auto-promote detector + Director-confirm UI
-- ============================================================================
-- Director lock R3-Q2 (project_wave3_hr_policy_lock_2026_05_15):
--   "System-suggested + Director confirm" — when a policy_key has been identical
--   across all institutions for 6+ months AND no recent edits, the system
--   suggests promotion to scope_type='global'. Director confirms or denies via
--   a banner on /admin/hr/policies. Every action is recorded in
--   hr_policy_audit_log under the 'promote_to_global' action.
--
-- This migration creates the ledger table that the weekly cron writes into,
-- plus RLS, indexes, and an inline smoke test. The cron route itself
-- (app/api/cron/hr-policy-promote-detector/route.ts) is the W3-M10 companion;
-- the admin UI lives at /admin/hr/policies/promotion-suggestions.
--
-- TIER-0 safe-additive:
--   - One new table only; no destructive DDL on existing tables.
--   - All CREATEs use IF NOT EXISTS / drop-and-recreate constraints.
--   - Idempotent. Safe to re-apply.
--
-- Spec: specs/wave-3-policy-driven-hr-manual-2026-05-15.md (R3-Q2)
-- Companion substrate: supabase/migrations/20260429000002_platform_policies_substrate.sql
--                      supabase/migrations/20260601_hr_policy_substrate_extensions.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: hr_policy_promotion_suggestions
--    One row per detected promotion candidate. Director resolves via UI to
--    'approved' (cron applies the promote_to_global on next tick OR UI applies
--     inline — current M10 ships inline-apply for low-latency confirm flow)
--    or 'denied' (dismissal_reason mandatory).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_policy_promotion_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key TEXT NOT NULL,
  suggested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Snapshot of the identical value across all institutions at detection time.
  -- Captured so the Director sees exactly what they're promoting even if
  -- per-institution rows drift between suggestion and review.
  snapshot_value JSONB NOT NULL,
  snapshot_classification TEXT NOT NULL,
  -- Count of institutions that held the identical value at detection time.
  -- Useful for the Director banner ("9 institutions held the same value
  -- for 187 days") so they can sanity-check the suggestion.
  identical_institution_count INT NOT NULL,
  identical_days INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID NULL REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ NULL,
  dismissal_reason TEXT NULL
);

-- Status enum-check.
ALTER TABLE hr_policy_promotion_suggestions
  DROP CONSTRAINT IF EXISTS hr_policy_promotion_suggestions_status_check;
ALTER TABLE hr_policy_promotion_suggestions
  ADD CONSTRAINT hr_policy_promotion_suggestions_status_check
  CHECK (status IN ('pending', 'approved', 'denied'));

-- Classification mirrors platform_policies.classification.
ALTER TABLE hr_policy_promotion_suggestions
  DROP CONSTRAINT IF EXISTS hr_policy_promotion_suggestions_classification_check;
ALTER TABLE hr_policy_promotion_suggestions
  ADD CONSTRAINT hr_policy_promotion_suggestions_classification_check
  CHECK (snapshot_classification IN ('operational', 'major'));

-- When a row is reviewed (approved OR denied), reviewed_by + reviewed_at MUST
-- both be set. When pending, both MUST be NULL. Caught at DB layer so no
-- "ghost reviewed rows without an editor" can land via any client.
ALTER TABLE hr_policy_promotion_suggestions
  DROP CONSTRAINT IF EXISTS hr_policy_promotion_suggestions_review_consistency;
ALTER TABLE hr_policy_promotion_suggestions
  ADD CONSTRAINT hr_policy_promotion_suggestions_review_consistency
  CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('approved', 'denied') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  );

-- When denied, dismissal_reason MUST be non-empty. Approved + pending can be NULL.
ALTER TABLE hr_policy_promotion_suggestions
  DROP CONSTRAINT IF EXISTS hr_policy_promotion_suggestions_dismissal_reason_when_denied;
ALTER TABLE hr_policy_promotion_suggestions
  ADD CONSTRAINT hr_policy_promotion_suggestions_dismissal_reason_when_denied
  CHECK (
    status <> 'denied'
    OR (dismissal_reason IS NOT NULL AND length(trim(dismissal_reason)) > 0)
  );

-- Avoid duplicate pending suggestions for the same policy_key. If the cron
-- detects an already-pending row, it skips re-insertion (handled in cron code,
-- but enforced here as defense-in-depth via a partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_policy_promotion_suggestions_pending_key
  ON hr_policy_promotion_suggestions (policy_key)
  WHERE status = 'pending';

-- Hot-path index for "show me pending" admin UI + banner count.
CREATE INDEX IF NOT EXISTS idx_hr_policy_promotion_suggestions_pending
  ON hr_policy_promotion_suggestions (suggested_at DESC)
  WHERE status = 'pending';

-- Audit-query index for "all suggestions about this policy_key".
CREATE INDEX IF NOT EXISTS idx_hr_policy_promotion_suggestions_key_time
  ON hr_policy_promotion_suggestions (policy_key, suggested_at DESC);

-- ----------------------------------------------------------------------------
-- 2. RLS
--    Read: any authenticated user can see suggestions (read-only for non-admins
--          so an HR Admin can know "Director has been asked to promote X").
--    Insert: service_role only (the cron). UI does not insert — it only
--            mutates status from pending to approved/denied.
--    Update: super_admin / admin only (Director confirms).
--    Delete: super_admin only (rare cleanup; audit trail preferred).
-- ----------------------------------------------------------------------------
ALTER TABLE hr_policy_promotion_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_policy_promotion_suggestions_select
  ON hr_policy_promotion_suggestions;
CREATE POLICY hr_policy_promotion_suggestions_select
  ON hr_policy_promotion_suggestions
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- INSERT policy intentionally NULL — only service_role (cron) writes new
-- suggestions. Postgres default-deny applies; authenticated users get rejected.

DROP POLICY IF EXISTS hr_policy_promotion_suggestions_update
  ON hr_policy_promotion_suggestions;
CREATE POLICY hr_policy_promotion_suggestions_update
  ON hr_policy_promotion_suggestions
  FOR UPDATE
  USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS hr_policy_promotion_suggestions_delete
  ON hr_policy_promotion_suggestions;
CREATE POLICY hr_policy_promotion_suggestions_delete
  ON hr_policy_promotion_suggestions
  FOR DELETE USING (is_super_admin());

-- ----------------------------------------------------------------------------
-- 3. Smoke test (inline DO block — fails loudly on any mismatch)
--    Includes ALL NOT NULL columns per standing rule. Verifies:
--      a. Insert with full column set round-trips.
--      b. status CHECK constraint catches bogus values.
--      c. review-consistency CHECK rejects half-reviewed rows.
--      d. dismissal_reason CHECK rejects empty-on-denied.
--      e. partial unique index catches duplicate-pending insert.
-- ----------------------------------------------------------------------------
DO $smoketest$
DECLARE
  v_suggestion_id UUID;
  v_dup_id UUID;
  v_reviewer UUID;
  v_count INT;
  v_status TEXT;
BEGIN
  -- Pick any existing profile for the reviewer FK.
  SELECT id INTO v_reviewer FROM profiles ORDER BY created_at ASC LIMIT 1;
  IF v_reviewer IS NULL THEN
    RAISE NOTICE 'hr_policy_promotion_suggestions smoke test skipped — no profiles row present';
    RETURN;
  END IF;

  -- (a) Happy path: insert pending row touching every NOT NULL column.
  INSERT INTO hr_policy_promotion_suggestions (
    policy_key, snapshot_value, snapshot_classification,
    identical_institution_count, identical_days
  )
  VALUES (
    'hr.test._smoketest_w3m10',
    '{"smoke": true}'::jsonb,
    'operational',
    9,
    187
  )
  RETURNING id INTO v_suggestion_id;

  SELECT status INTO v_status
    FROM hr_policy_promotion_suggestions WHERE id = v_suggestion_id;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'pending default failed: got %', v_status;
  END IF;

  -- (b) Bogus status rejected.
  BEGIN
    INSERT INTO hr_policy_promotion_suggestions (
      policy_key, snapshot_value, snapshot_classification,
      identical_institution_count, identical_days, status
    )
    VALUES (
      'hr.test._smoketest_w3m10_b', '{"x": 1}'::jsonb, 'operational',
      1, 180, 'bogus_status'
    );
    RAISE EXCEPTION 'bogus status accepted — CHECK constraint missing';
  EXCEPTION
    WHEN check_violation THEN
      NULL; -- expected
  END;

  -- (c) Review-consistency CHECK: cannot approve without reviewer.
  BEGIN
    UPDATE hr_policy_promotion_suggestions
      SET status = 'approved', reviewed_at = now()
      WHERE id = v_suggestion_id;
    RAISE EXCEPTION 'half-reviewed approve accepted — CHECK constraint missing';
  EXCEPTION
    WHEN check_violation THEN
      NULL; -- expected
  END;

  -- (d) dismissal_reason required on deny.
  BEGIN
    UPDATE hr_policy_promotion_suggestions
      SET status = 'denied', reviewed_by = v_reviewer, reviewed_at = now()
      WHERE id = v_suggestion_id;
    RAISE EXCEPTION 'empty-reason deny accepted — CHECK constraint missing';
  EXCEPTION
    WHEN check_violation THEN
      NULL; -- expected
  END;

  -- (e) Partial unique index: cannot insert second pending row for same key.
  BEGIN
    INSERT INTO hr_policy_promotion_suggestions (
      policy_key, snapshot_value, snapshot_classification,
      identical_institution_count, identical_days
    )
    VALUES (
      'hr.test._smoketest_w3m10', '{"dup": true}'::jsonb, 'operational',
      9, 200
    )
    RETURNING id INTO v_dup_id;
    RAISE EXCEPTION 'duplicate pending suggestion accepted — partial unique index missing';
  EXCEPTION
    WHEN unique_violation THEN
      NULL; -- expected
  END;

  -- Happy path: approve correctly (review-consistency satisfied).
  UPDATE hr_policy_promotion_suggestions
    SET status = 'approved', reviewed_by = v_reviewer, reviewed_at = now()
    WHERE id = v_suggestion_id;

  SELECT status INTO v_status
    FROM hr_policy_promotion_suggestions WHERE id = v_suggestion_id;
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'approved round-trip failed: got %', v_status;
  END IF;

  -- Now a second pending row for the same key IS allowed (no pending exists).
  INSERT INTO hr_policy_promotion_suggestions (
    policy_key, snapshot_value, snapshot_classification,
    identical_institution_count, identical_days
  )
  VALUES (
    'hr.test._smoketest_w3m10', '{"second": true}'::jsonb, 'operational',
    9, 190
  )
  RETURNING id INTO v_dup_id;

  -- Clean up — leave no test rows.
  DELETE FROM hr_policy_promotion_suggestions
    WHERE policy_key = 'hr.test._smoketest_w3m10';

  SELECT count(*) INTO v_count FROM hr_policy_promotion_suggestions
    WHERE policy_key LIKE 'hr.test._smoketest_w3m10%';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'smoke test row leak: % rows remain', v_count;
  END IF;

  RAISE NOTICE '[W3-M10] hr_policy_promotion_suggestions smoke test passed';
END
$smoketest$ LANGUAGE plpgsql;
