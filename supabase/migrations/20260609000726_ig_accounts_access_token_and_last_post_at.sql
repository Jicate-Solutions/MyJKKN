-- 2026-06-09: Close the schema gap surfaced by Agent C's instagram-metrics-poller
-- 500 investigation. The route SELECTs access_token + last_post_at from
-- ig_accounts, but those columns were never provisioned by the original
-- migration 20260530140000. PostgREST returned column-not-found error
-- which the route caught as a plain object (not Error instance), surfaced
-- as "unknown" in the response body.
--
-- Both columns are nullable — current operational mode hydrates access_token
-- from env (META_IG_SYSTEM_USER_TOKEN || MESSENGER_PAGE_ACCESS_TOKEN), so
-- per-account tokens are optional. last_post_at populates on next IG media
-- poll tick after deploy.
--
-- This migration was applied live via exec_sql RPC at 2026-06-09 05:35 IST
-- to unblock the cron immediately; this file commits the same DDL to the
-- migrations tree for parity between prod and repo.

ALTER TABLE ig_accounts ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE ig_accounts ADD COLUMN IF NOT EXISTS last_post_at TIMESTAMPTZ;

COMMENT ON COLUMN ig_accounts.access_token IS
  'Per-IG-account access token (nullable, hydrated from env when null).';
COMMENT ON COLUMN ig_accounts.last_post_at IS
  'Most recent media post timestamp from /me/media, refreshed by IG metrics poller.';
