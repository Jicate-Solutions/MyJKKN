-- ============================================================================
-- Migration: 20260429000011_duty_log_retention_policy
-- Phase 1.5a follow-up — duty-log retention as platform_policies row
-- ============================================================================
-- Documents the seed for `compliance.duty_log.retention_days` (already
-- inserted on prod 2026-04-29; this migration is the in-repo source of
-- truth so a fresh DB rebuild reproduces the same row).
--
-- Retires the hardcoded `90` days constant in
-- app/api/cron/duty-log-retention/route.ts. The cron now reads the value
-- via getPolicyInt('compliance.duty_log.retention_days', 90), which calls
-- fn_get_policy → platform_policies. Director can tweak the retention
-- window from /admin/policies in 5 seconds, no deploy.
--
-- Named anti-pattern: feedback_policy_decisions_must_be_config_rows.md
-- (lines 60-63) — every policy decision must be a config-table row, not
-- a hardcoded constant in code.
--
-- Idempotent. Safe to re-apply (WHERE NOT EXISTS guard).
-- ============================================================================

INSERT INTO platform_policies (
  policy_key,
  scope_type,
  scope_id,
  value,
  description,
  data_type,
  enum_options,
  is_system
)
SELECT
  'compliance.duty_log.retention_days',
  'global',
  NULL,
  '90'::jsonb,
  'Days to retain admission_counselor_duty_log rows. The weekly cron at /api/cron/duty-log-retention purges rows older than this (preserving most-recent row per counselor). Originally hardcoded as 90 in PR #586; migrated to platform_policies 2026-04-29.',
  'number',
  NULL,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM platform_policies
  WHERE policy_key = 'compliance.duty_log.retention_days'
    AND scope_type = 'global'
    AND scope_id IS NULL
);
