-- ============================================================================
-- Migration: 20260503022300_telephony_exovoice_config_policy
-- Director-tunable ExoVoiceAnalyze tasks + categories
-- ============================================================================
-- Seeds the canonical platform_policies row consumed by
-- lib/services/telephony/call-pipeline-service.ts at every analyzeCall
-- submission (via getPolicy('telephony.exovoice.config', 'global')).
--
-- The hardcoded literal arrays previously lived in call-pipeline-service.ts
-- (commit 4e4133958, 2026-05-02 cron-path restoration). Editing those values
-- required a deploy. This migration moves them into a Director-editable row.
--
-- Initial seeded value preserves the prior hardcoded literals — zero behaviour
-- change at deploy.  The companion service edit (this PR) reads via
-- getPolicy() and falls back to the same literals if the row is missing or
-- the RPC fails (defensive — covers fresh environments not yet seeded).
--
-- Director's standing rule (2026-04-29):
--   every policy decision = config-table row + super_admin UI to write.
--   Result: zero deploys / zero PRs / zero developer round-trips for tweaks.
-- Memory: feedback_policy_decisions_must_be_config_rows.md
--
-- Idempotent: WHERE NOT EXISTS guard mirrors the 12 platform_policies rows
-- seeded on 2026-04-29. Safe to re-apply.
-- ============================================================================

INSERT INTO public.platform_policies (
  policy_key,
  scope_type,
  scope_id,
  value,
  description,
  data_type,
  is_system,
  is_active
)
SELECT * FROM (VALUES
  (
    'telephony.exovoice.config',
    'global',
    NULL::uuid,
    '{
      "tasks": ["transcript", "summarization", "sentiment", "categorise"],
      "categories": [
        "admission_inquiry",
        "fee_inquiry",
        "course_inquiry",
        "placement_inquiry",
        "complaint",
        "follow_up",
        "other"
      ]
    }'::jsonb,
    'ExoVoiceAnalyze submission config — tasks (which analyses to run) + categories (call classification taxonomy). Director-tunable via /admin/telephony-policies. Consumed by lib/services/telephony/call-pipeline-service.ts on every answered-call analysis submission.',
    'object',
    true,
    true
  )
) AS r(
  policy_key,
  scope_type,
  scope_id,
  value,
  description,
  data_type,
  is_system,
  is_active
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.platform_policies p
  WHERE p.policy_key = r.policy_key
    AND p.scope_type = r.scope_type
    AND COALESCE(p.scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(r.scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
