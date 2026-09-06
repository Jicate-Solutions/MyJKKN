-- ============================================================================
-- 20260711060000_ai_model_config_procurement_extraction.sql
-- Register the two procurement PDF-extraction features in ai_model_config so
-- their model is governed from /admin/ai-models and their spend lands in
-- ai_model_usage. They shipped 2026-07-10 (#1949) with a hardcoded model and
-- no ledger recording — invisible to AI governance until now.
--
-- CUTOVER INVARIANT (same as the 20260702120000 adoption seed): both rows are
-- seeded to the model the code hardcodes today (claude-opus-4-8, verified
-- against jicate/main lib/procurement/*-pdf-extract.ts on 2026-07-11).
-- Applying this migration changes ZERO runtime behavior; the companion code
-- change resolves through ai_model_config to the exact same model id, with the
-- hardcoded-fallback map mirroring it for degraded mode.
--
-- No DDL. No new functions/RPCs (nothing for the anon-lockdown rule to cover).
-- Idempotent: ON CONFLICT (feature_key) DO NOTHING — a later Director model
-- change from the UI can never be clobbered by a re-run.
-- ============================================================================

INSERT INTO ai_model_config (feature_key, display_name, description, category, provider, model_id) VALUES
  ('procurement.quotation_extract',
   'Procurement Quotation PDF Extraction',
   'On-demand: read a vendor quotation PDF and match line prices to RFQ items (staff review before saving).',
   'procurement',
   'anthropic',
   'claude-opus-4-8'),
  ('procurement.invoice_extract',
   'Procurement Invoice PDF Extraction',
   'On-demand: read a vendor invoice PDF at GRN and match lines to PO items for the three-way match (staff review before posting).',
   'procurement',
   'anthropic',
   'claude-opus-4-8')
ON CONFLICT (feature_key) DO NOTHING;
