-- ============================================================================
-- Migration: 20260630065157_bug_reports_metadata_for_ig_auto_route
-- Adds: bug_reports.metadata JSONB column + GIN index on (metadata->>'ig_user_id')
-- ----------------------------------------------------------------------------
-- Why: lib/instagram/auto-route-on-ownership-flip.ts (PR #169x, IG cron
-- extension) needs to re-route open social/instagram bug_reports when an
-- Instagram account's institution_id flips during the daily ig-accounts-sync.
-- The routing payload lives in bug_reports.metadata (jsonb) and is keyed
-- by metadata->>'ig_user_id'.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Backward-safe: the column defaults to '{}', so existing tooling is
-- unaffected. No data backfill required.
-- ============================================================================

-- Updated: 2026-06-30 - Added metadata JSONB for IG auto-route + future
--                       social-module routing payloads
ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.bug_reports.metadata IS
  'Free-form JSON for module-specific routing payloads. e.g. social/instagram
bug reports populate metadata.ig_user_id at submission time and
metadata.routed_owner_user_id is updated by the daily ig-accounts-sync
cron when an account ownership flips.';

-- GIN index on metadata->>'ig_user_id' so the auto-route UPDATE is a
-- bounded lookup, not a sequential scan. Expression index is enough at
-- the bug_reports row count we have; a generated column would be tighter
-- but is not justified yet.
CREATE INDEX IF NOT EXISTS idx_bug_reports_metadata_ig_user_id
  ON public.bug_reports ((metadata->>'ig_user_id'))
  WHERE metadata ? 'ig_user_id';

NOTIFY pgrst, 'reload schema';
