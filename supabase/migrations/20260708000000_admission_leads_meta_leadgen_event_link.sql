-- 2026-07-08: Add admission_leads.meta_leadgen_event_id for explicit
-- traceability from CRM lead → Meta Lead Ads webhook submission.
--
-- Context: meta_leadgen_events.lead_id already points the other way (event
-- → lead), but to answer the inverse "which Meta submission produced this
-- lead?" the existing path requires a reverse query. Adding this nullable
-- FK gives the admin "Received Leads" tab a single-row lookup and makes
-- future deduplication unambiguous.
--
-- Forward-compatible: NULLABLE, no backfill required. Existing leads stay
-- NULL; new Meta-imported leads populate it via importMetaLead().
--
-- No RLS change — column inherits admission_leads policies. No GRANT change.

ALTER TABLE public.admission_leads
  ADD COLUMN IF NOT EXISTS meta_leadgen_event_id UUID NULL
    REFERENCES public.meta_leadgen_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admission_leads_meta_leadgen_event
  ON public.admission_leads (meta_leadgen_event_id)
  WHERE meta_leadgen_event_id IS NOT NULL;

COMMENT ON COLUMN public.admission_leads.meta_leadgen_event_id IS
  'Set by lib/services/admission/meta-lead-importer.ts when the lead originated from a Meta Lead Ads webhook. NULL otherwise.';
