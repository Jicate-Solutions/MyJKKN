-- push_subscriptions has 1,532 rows, all with `subscription jsonb` populated and
-- subscription->>'endpoint' present. The dashboard push-subscribe route writes to
-- a top-level `endpoint` column and upserts on `(user_id, endpoint)`, but neither
-- the column nor the unique constraint existed in prod — every Enable-push attempt
-- 500'd with "Could not find the 'endpoint' column of 'push_subscriptions' in the
-- schema cache" and the client surfaced it via a blocking alert() dialog.
--
-- Fix: add a STORED GENERATED column derived from the jsonb so existing rows
-- auto-backfill. Then add the (user_id, endpoint) unique partial index so the
-- onConflict upsert can resolve. Partial WHERE endpoint IS NOT NULL guards
-- against any future row that fails to populate the endpoint (would be a
-- malformed subscription).
--
-- Applied via Supabase MCP at 2026-05-03 12:55 UTC. Verification post-apply:
--   rows_with_endpoint=1532, total_rows=1532, index built.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS endpoint text
  GENERATED ALWAYS AS (subscription->>'endpoint') STORED;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_id_endpoint_key
  ON public.push_subscriptions (user_id, endpoint)
  WHERE endpoint IS NOT NULL;
