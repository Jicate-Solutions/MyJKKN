-- Migration: 015_whatsapp_broadcast_indexes.sql
-- Adds indexes to admission_whatsapp_logs to support efficient campaign-level
-- grouping in the GET /api/admission/whatsapp-broadcast endpoint.
--
-- Without this index, querying rows by institution_id and then filtering
-- WHERE campaign_id IS NOT NULL requires a full sequential scan of
-- admission_whatsapp_logs, which is O(n) in the number of log rows.
--
-- Index 1: (institution_id, campaign_id) — composite covering index that
--   satisfies the .eq('institution_id', ...).not('campaign_id', 'is', null)
--   filter without a table heap access for the campaign_id predicate.
--
-- Index 2: (campaign_id) — supports any future direct lookups or JOINs
--   on campaign_id alone (e.g. fetching all logs for a single campaign).

CREATE INDEX IF NOT EXISTS idx_admission_whatsapp_logs_institution_campaign
  ON admission_whatsapp_logs (institution_id, campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admission_whatsapp_logs_campaign_id
  ON admission_whatsapp_logs (campaign_id)
  WHERE campaign_id IS NOT NULL;
