-- =====================================================================
-- Solutions Hub: Intent Platform Inbound Ingestion Columns
-- =====================================================================
-- Adds intent_agency_id and intent_lead_id to sh_prospects so that
-- inbound webhook payloads from the Intent Platform can be upserted
-- idempotently. The partial unique index lets ON CONFLICT (intent_lead_id)
-- DO UPDATE work safely without forcing every prospect row to carry an
-- intent_lead_id.
--
-- Owner: Phase C4 (PRD-solutions-hub-pipeline.md)
-- =====================================================================

ALTER TABLE public.sh_prospects
    ADD COLUMN IF NOT EXISTS intent_agency_id UUID,
    ADD COLUMN IF NOT EXISTS intent_lead_id   TEXT;

-- Partial unique index: only prospects originating from the Intent
-- Platform are constrained, allowing direct/manual prospects to remain
-- without an intent_lead_id while still preventing duplicate ingestion
-- of the same external lead.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sh_prospects_intent_lead
    ON public.sh_prospects (intent_lead_id)
    WHERE intent_lead_id IS NOT NULL;

-- Lookup support for filtering by agency.
CREATE INDEX IF NOT EXISTS idx_sh_prospects_intent_agency_id
    ON public.sh_prospects (intent_agency_id)
    WHERE intent_agency_id IS NOT NULL;

COMMENT ON COLUMN public.sh_prospects.intent_agency_id IS 'UUID of the originating agency in the Intent Platform (nullable for non-Intent prospects).';
COMMENT ON COLUMN public.sh_prospects.intent_lead_id   IS 'External lead ID from the Intent Platform; partial-unique to allow idempotent webhook upserts.';
