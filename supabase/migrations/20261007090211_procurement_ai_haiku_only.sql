-- Procurement uses Claude Haiku 4.5 only (the lowest-priced current Claude model,
-- $1 / $5 per MTok). Two features were already on it (quotation compare chat,
-- direct quotation / item-list reading); the two PDF-extract jobs still named the
-- 'opus' alias. Both are set to the concrete Haiku id in the registry (read first)
-- and in the legacy config (read as the fallback), so neither source can route a
-- procurement call to Sonnet or Opus. The code fallback in
-- lib/services/platform/ai-model-config-service.ts is pinned to Haiku too.

update public.ai_job_types
   set model_id = 'claude-haiku-4-5',
       updated_at = now()
 where job_type in ('procurement.quotation_extract', 'procurement.invoice_extract');

update public.ai_model_config
   set model_id = 'claude-haiku-4-5',
       updated_at = now()
 where feature_key like 'procurement.%'
   and provider = 'anthropic'
   and model_id <> 'claude-haiku-4-5';
