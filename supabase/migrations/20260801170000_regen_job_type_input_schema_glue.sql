-- 20260801170000_regen_job_type_input_schema_glue.sql
-- ============================================================================
-- Align curriculum.lesson_spine_regen's input_schema to the glue {prompt} shape.
--
-- Companion to 20260801160000 (which glued the prompt_template). The #1998 ai_jobs
-- drain validates each job's payload against ai_job_types.input_schema before
-- running it. Regen's row still carried the DECLARATIVE input_schema requiring
-- 'entityId' — the PR #1994 leftover and twin of the old prompt_template — so the
-- ₹0 lane rejected the glue payload (payload.prompt, no entityId) with
-- "missing required input(s): entityId" and every regen job errored.
--
-- Match curriculum.lesson_spine_generate's schema ({prompt}) so the assembled
-- system+user prompt the sweep passes as payload.prompt validates and the Max
-- seat runs it. Nothing reads this column except the drain's validation (the ⚡
-- button + paid path build the prompt in code via buildSubmitItem), so the change
-- is safe. Applied live to prod 2026-07-26; recorded here for reproducibility.
-- Idempotent.
-- ============================================================================

UPDATE public.ai_job_types
   SET input_schema = '[{"key":"prompt","type":"textarea","label":"Assembled prompt","required":true}]'::jsonb,
       updated_at = now()
 WHERE job_type = 'curriculum.lesson_spine_regen'
   AND input_schema IS DISTINCT FROM '[{"key":"prompt","type":"textarea","label":"Assembled prompt","required":true}]'::jsonb;

NOTIFY pgrst, 'reload schema';
