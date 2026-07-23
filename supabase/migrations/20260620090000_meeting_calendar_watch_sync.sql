-- 20260620090000_meeting_calendar_watch_sync.sql
-- Universal Booking — BIDIRECTIONAL Google Calendar sync (watch channels).
--
-- Closes the inbound gap found by smoke test 2026-06-20 (booking phJeX9_…):
-- the host deleted the Google Calendar event, but MyJKKN still showed the
-- booking as 'confirmed' because the module was OUTBOUND-ONLY — it writes to
-- Google (createEvent / patchEventTime / deleteEvent) but never read back.
--
-- This migration adds the state needed for Google Calendar PUSH NOTIFICATIONS
-- (events.watch): a per-host watch channel + an incremental-sync cursor. When
-- the host changes an event directly in Google Calendar, Google POSTs a
-- (contentless) ping to /api/webhooks/google-calendar; we then run an
-- incremental events.list with the stored sync_token and reconcile
-- meeting_bookings (cancel / reschedule) to match Google.
--
-- All access is service-role (webhook + renewal cron). No new RPC, so there is
-- no anon EXECUTE surface to revoke. No pgcrypto calls here, so no 42883 risk.

-- ── 1. Watch-channel + incremental-sync state (1:1 with the connection) ──────
ALTER TABLE public.meeting_host_google_connections
  ADD COLUMN IF NOT EXISTS watch_channel_id  text,
  ADD COLUMN IF NOT EXISTS watch_resource_id text,
  ADD COLUMN IF NOT EXISTS watch_expiration  timestamptz,
  ADD COLUMN IF NOT EXISTS watch_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS sync_token        text;

COMMENT ON COLUMN public.meeting_host_google_connections.watch_channel_id IS
  'events.watch channel UUID we generate. The inbound webhook looks the host up by this header (X-Goog-Channel-ID).';
COMMENT ON COLUMN public.meeting_host_google_connections.watch_resource_id IS
  'Google''s opaque resource id for the watched calendar; cross-checked on every inbound ping (anti-spoof, with the HMAC channel token).';
COMMENT ON COLUMN public.meeting_host_google_connections.watch_expiration IS
  'When Google will stop sending pushes for this channel. The renewal cron re-watches before this instant.';
COMMENT ON COLUMN public.meeting_host_google_connections.sync_token IS
  'events.list nextSyncToken — the incremental delta cursor the inbound reconcile reads from. 410 GONE on use ⇒ re-seed.';

-- Webhook lookup path: X-Goog-Channel-ID → host. Partial index (only watched rows).
CREATE INDEX IF NOT EXISTS idx_mhgc_watch_channel
  ON public.meeting_host_google_connections(watch_channel_id)
  WHERE watch_channel_id IS NOT NULL;

-- ── 2. Audit: when a booking was last reconciled FROM Google ────────────────
ALTER TABLE public.meeting_bookings
  ADD COLUMN IF NOT EXISTS synced_from_google_at timestamptz;

COMMENT ON COLUMN public.meeting_bookings.synced_from_google_at IS
  'Last time this booking was changed by the INBOUND Google-Calendar reconcile (watch channel). NULL = only ever touched by MyJKKN-originated actions.';

-- PostgREST schema cache reload (so the new columns are queryable immediately).
NOTIFY pgrst, 'reload schema';
