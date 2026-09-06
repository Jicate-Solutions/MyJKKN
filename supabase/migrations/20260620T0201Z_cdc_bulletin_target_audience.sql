-- 2026-06-20 — BUG-004080
-- Structured Target Audience for CDC external opportunities bulletin.
-- Replaces reliance on free-text eligibility with a structured, queryable
-- audience definition. Shape: { "departments": [uuid], "programs": [uuid], "sections": [uuid] }
-- An absent/empty key means "no restriction on that dimension"; a NULL column
-- means "no audience restriction at all" (targets everyone).
-- Idempotent: safe to re-run.

ALTER TABLE public.cdc_external_opportunities
  ADD COLUMN IF NOT EXISTS target_audience jsonb;

COMMENT ON COLUMN public.cdc_external_opportunities.target_audience IS
  'BUG-004080: structured target audience. JSONB shape { departments: uuid[], programs: uuid[], sections: uuid[] }. NULL = no restriction (everyone). departments/programs are wired in the Post Opportunity form; sections reserved for a future dimension.';
