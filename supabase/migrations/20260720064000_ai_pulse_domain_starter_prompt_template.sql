-- ============================================================================
-- Updated: 2026-07-20 - AI Pulse Domain Starter (PR still #2185, dark): set the
-- {{prompt}} glue on the job type. The ₹0 Max-lane drain substitutes the cron's
-- assembled prompt into prompt_template; PR-A seeded the row without it, so the
-- drain would have run an empty prompt. Idempotent. provider/model_id stay NULL
-- (default max-lane model, same as scf.suggest_improvement / pde.case_author).
-- ============================================================================
UPDATE public.ai_job_types
   SET prompt_template = '{{prompt}}', updated_at = now()
 WHERE job_type = 'ai_pulse.domain_starter'
   AND (prompt_template IS NULL OR prompt_template = '');
