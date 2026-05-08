-- ============================================================================
-- 20260507140001 — CASCADE FKs for lead-owned child tables on admission_leads
-- ============================================================================
-- Hard-deleting an admission_lead failed with 23503 because four child tables
-- still had ON DELETE NO ACTION on their lead_id (or admission_id) FKs:
--
--   * consultant_lead_attributions  (the user's reported blocker — attribution
--     metadata that has no value once the lead is gone)
--   * admission_callback_queue      (pending future callback to this lead)
--   * admission_campaign_queue      (pending campaign send)
--   * admission_drip_sequences      (scheduled drip schedule rows)
--
-- These tables match the pattern of the already-CASCADE'd lead-internal tables
-- (admission_lead_activities, admission_lead_source_captures,
-- admission_lead_stage_history, admission_lead_scores, admission_tasks):
-- they're records that exist *because* the lead exists; orphaning them is
-- not a meaningful state. The fact that they were originally created with
-- NO ACTION is a leftover from when the consultant module and the campaign
-- queues were added separately — the cascade-rationalisation pass that
-- covered the lead-internal tables didn't catch them.
--
-- DELIBERATELY NOT TOUCHED in this migration (need separate policy decisions):
--   * admission_call_logs / admission_email_logs / admission_sms_logs /
--     admission_whatsapp_logs / admission_campaign_logs — these are audit
--     trails and should probably SET NULL, not CASCADE. Communication
--     history outliving the lead is the business-correct behaviour.
--   * consultant_commission_transactions — financial records; must outlive
--     the lead. SET NULL when ready.
--   * consultant_communications.linked_lead_id — consultant-side inbox
--     records that have their own lifecycle.
--   * admission_applications — application is part of the lead funnel but
--     deserves its own discussion (some teams want to keep applications
--     even after the underlying lead is purged).
--
-- The remaining 7 NO ACTION FKs continue to block hard-delete; admin will
-- need to either purge those rows manually or extend this migration after
-- a policy review. The four CASCADE flips below address the user's
-- immediate failure path.
-- ============================================================================

-- 1. consultant_lead_attributions ---------------------------------------------
ALTER TABLE public.consultant_lead_attributions
  DROP CONSTRAINT consultant_lead_attributions_admission_id_fkey;
ALTER TABLE public.consultant_lead_attributions
  ADD CONSTRAINT consultant_lead_attributions_admission_id_fkey
  FOREIGN KEY (admission_id)
  REFERENCES public.admission_leads(id)
  ON DELETE CASCADE;

-- 2. admission_callback_queue -------------------------------------------------
ALTER TABLE public.admission_callback_queue
  DROP CONSTRAINT admission_callback_queue_lead_id_fkey;
ALTER TABLE public.admission_callback_queue
  ADD CONSTRAINT admission_callback_queue_lead_id_fkey
  FOREIGN KEY (lead_id)
  REFERENCES public.admission_leads(id)
  ON DELETE CASCADE;

-- 3. admission_campaign_queue -------------------------------------------------
ALTER TABLE public.admission_campaign_queue
  DROP CONSTRAINT admission_campaign_queue_lead_id_fkey;
ALTER TABLE public.admission_campaign_queue
  ADD CONSTRAINT admission_campaign_queue_lead_id_fkey
  FOREIGN KEY (lead_id)
  REFERENCES public.admission_leads(id)
  ON DELETE CASCADE;

-- 4. admission_drip_sequences -------------------------------------------------
ALTER TABLE public.admission_drip_sequences
  DROP CONSTRAINT admission_drip_sequences_lead_id_fkey;
ALTER TABLE public.admission_drip_sequences
  ADD CONSTRAINT admission_drip_sequences_lead_id_fkey
  FOREIGN KEY (lead_id)
  REFERENCES public.admission_leads(id)
  ON DELETE CASCADE;
