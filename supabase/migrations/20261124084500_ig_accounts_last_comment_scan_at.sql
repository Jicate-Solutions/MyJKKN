-- Updated: 2026-09-09 - Add ig_accounts.last_comment_scan_at (fair-queue cursor
-- for the feedback-adapter-ig-comments cron).
--
-- WHY
--   app/api/cron/feedback-adapter-ig-comments/route.ts selected its accounts
--   with `.limit(12)` and NO `.order()`, so PostgREST sent LIMIT 12 with no
--   ORDER BY and Postgres returned arbitrary heap order. The route persisted
--   nothing, so an account outside that window had no mechanism to ever be
--   promoted. Measured in production: the routine ran daily for 66 days
--   (2026-06-26 -> 2026-09-05) against 59 eligible accounts (metrics_source =
--   'graph' AND access_token IS NOT NULL) and only 11 distinct accounts have
--   EVER produced a feedback_events row. 22 of them have posts to scan and
--   have never ingested a single comment.
--
--   Ordering oldest-scanned-first makes the truncated tail ROTATE. This is the
--   same fix shape as PR #3358 for instagram-metrics-poller, with one
--   difference that is the reason this file exists: that route ordered on
--   `last_polled_at`, which already existed. This one needs a new column.
--
-- WHY A NEW COLUMN AND NOT last_polled_at
--   `last_polled_at` is a cadence GATE for two other crons —
--   instagram-metrics-poller (`last_polled_at.is.null,last_polled_at.lt.<cutoff>`)
--   and ig-stories-poll. A write from the comments adapter would make those
--   pollers skip accounts they had never polled, re-creating the exact
--   starvation #3358 just fixed. `last_discovery_at` is likewise owned by
--   ig-business-discovery-poll. There is no free timestamp column on the table
--   (verified against the live catalog 2026-09-09).
--
-- NO BACKFILL IS NEEDED, ON PURPOSE
--   Every existing row is left NULL, and the route orders with
--   `nullsFirst: true`. NULL therefore means "never scanned, go first", which
--   is precisely the desired semantics: the 22 starved accounts sort to the
--   very front of the queue on the first run after this is applied.
--
-- NO INDEX, ON PURPOSE
--   ig_accounts holds 71 rows. A sort over 71 rows costs nothing, and an index
--   here would be maintenance with no reader.
--
-- SAFETY
--   Adding a nullable column takes only a brief ACCESS EXCLUSIVE lock for the
--   catalog update (no table rewrite on PG11+). Existing RLS policies on
--   ig_accounts cover the new column with no change; the cron writes it with
--   the service-role client.

ALTER TABLE public.ig_accounts
  ADD COLUMN IF NOT EXISTS last_comment_scan_at timestamptz;

COMMENT ON COLUMN public.ig_accounts.last_comment_scan_at IS
  'Fair-queue cursor for the feedback-adapter-ig-comments cron: when this account last had its turn in that run (stamped even when the scan errored, so one broken account cannot wedge the head of the queue). NULL = never scanned, which sorts first. Distinct from last_polled_at, which is the metrics/stories poller cadence gate — do not reuse that column here.';
