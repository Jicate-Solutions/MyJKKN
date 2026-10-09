-- Procurement moves from Claude Haiku 4.5 to Claude Haiku 5.5 ($0.10 / $0.50 per MTok
-- for prompts up to 100K tokens). Apply AFTER the app that registers 'claude-haiku-5-5'
-- in lib/services/platform/ai-providers.ts is deployed: cost tracking and spend caps look
-- the model up there, and an unknown id would be priced as nothing.
-- Same two sources as 20261007090211: the registry (read first) and the legacy config.

update public.ai_job_types
   set model_id = 'claude-haiku-5-5',
       updated_at = now()
 where job_type in ('procurement.quotation_extract', 'procurement.invoice_extract');

update public.ai_model_config
   set model_id = 'claude-haiku-5-5',
       updated_at = now()
 where feature_key like 'procurement.%'
   and provider = 'anthropic'
   and model_id <> 'claude-haiku-5-5';
