-- Seed: per-run batch cap for SCF Learner Support Notes as a platform policy.
-- 2026-07-11, Director: "Remove this cap. Make it unlimited." + make it editable
-- in the UI. 10000 mirrors curriculum_ai.batch_cap's "no limits" convention
-- (2026-07-08). The Max-lane twin honors the value fully; the cloud cron
-- additionally clamps to its 50/run serverless ceiling (90s dispatcher window).
-- Editable on /admin/ai-routines via the cap chip — writes gated by the
-- existing platform_policies_update RLS policy (super_admin/admin).
-- Guarded on IDENTITY (policy_key + global scope), never on value, so a later
-- Director edit is never resurrected by re-running this seed.
INSERT INTO platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, classification, ui_widget, ui_category, is_system, is_active)
SELECT
  'scf_notes.batch_cap',
  'global',
  NULL,
  to_jsonb(10000),
  'Max learner-support notes one generation run may draft. The Max lane honors it fully; the cloud cron additionally clamps to its 50/run serverless ceiling. 10000 = effectively unlimited.',
  'number',
  'operational',
  'number',
  'scf',
  false,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM platform_policies
  WHERE policy_key = 'scf_notes.batch_cap' AND scope_type = 'global' AND scope_id IS NULL
);
