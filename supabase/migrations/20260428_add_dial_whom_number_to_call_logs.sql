-- Migration: 20260428_add_dial_whom_number_to_call_logs.sql
-- Forward-only — agent's actual phone from Passthru webhook.
-- Consumed by future Signal 4 attribution rescope.
--
-- Background: ~45% of inbound rows (712+) have to_number = ExoPhone virtual
-- queue DID (e.g. 04446313503), where the answering agent is NOT visible in
-- to_number. Exotel Passthru webhooks deliver the actual dialled-agent number
-- in the DialWhomNumber query param, but we never persisted it.  This column
-- captures it going forward so a follow-up PR can use it as Signal 4.
--
-- Historical rows pre-migration remain NULL — DialWhomNumber is not
-- retrievable from the CDR API (confirmed in PR #523 body).
--
-- Author: backend-generator agent (2026-04-28)

ALTER TABLE admission_call_logs
  ADD COLUMN IF NOT EXISTS dial_whom_number TEXT;

-- Comment preserved in DB catalog for discoverability
COMMENT ON COLUMN admission_call_logs.dial_whom_number IS
  'Agent phone actually dialled by Exotel Connect applet (from Passthru DialWhomNumber). '
  'Populated only for webhook-inserted rows. NULL for CDR-synced rows — '
  'Exotel CDR API does not expose per-leg dial targets. '
  'Intended for Signal 4 attribution: bucket 04446313503 → real agent. '
  'Do not use for attribution until the Signal 4 helper PR lands.';

-- Index on right-10 normalized form — same pattern as existing counselor-phone index
-- in call-attribution.ts to support future last-10-digit lookups without full-scan.
CREATE INDEX IF NOT EXISTS idx_call_logs_dial_whom_number_last10
  ON admission_call_logs (
    (right(regexp_replace(coalesce(dial_whom_number, ''), '\D', '', 'g'), 10))
  )
  WHERE dial_whom_number IS NOT NULL;
