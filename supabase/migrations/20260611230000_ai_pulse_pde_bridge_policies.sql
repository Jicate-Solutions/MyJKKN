-- =====================================================================
-- AI Pulse — PDE capability-bridge policy seed (Lane B)
-- Created: 2026-06-11 — AI Pulse → pde_demonstrations bridge config
--
-- Seed-only migration: THREE new policy rows consumed by the nightly
-- PDE bridge (Lane A: app/api/cron/ai-pulse-pde-bridge/route.ts).
-- No DDL. Column list copied from 20260502_create_ai_pulse_events_extension.sql
-- (is_active defaults true). Existing rows are never duplicated
-- (ON CONFLICT (config_key) DO NOTHING).
--
-- pde_bridge_enabled defaults FALSE — Director flips it in
-- /ai-pulse/admin/policies after reviewing pde_bridge_signal_map.
-- =====================================================================

INSERT INTO public.ai_pulse_policies
  (config_key, display_name, description, value_jsonb, data_type, enum_options, min_value, max_value, locked_by_q)
VALUES
  (
    'pde_bridge_enabled',
    'Send AI Pulse achievements to PDE',
    'Master switch: when on, each week''s AI Pulse results (engaged sessions, Domain-Sync artifacts, Gold Standards, Instagram publications) are automatically recorded as PDE capability demonstrations on each learner''s profile. Turn on after reviewing the mapping below.',
    'false',
    'bool',
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    'pde_bridge_signal_map',
    'AI Pulse → PDE signal mapping',
    'Which PDE category each AI Pulse achievement counts toward, and what it is called on the learner profile. Edit to re-map without a code change. Live keys: category_key, skill_name, status, evidence_type, min_polls_responded. (score_source is informational in v1 — scoring rules are fixed per signal.)',
    '{
      "engaged_live_session": {
        "category_key": "embodied",
        "skill_name": "AI Pulse — Weekly AI Tool Practice",
        "evidence_type": "engagement_record",
        "status": "scored",
        "score_source": "quiz_score"
      },
      "domain_sync_submitted": {
        "category_key": "problem_finding",
        "skill_name": "AI Pulse — Domain-Sync Artifact",
        "evidence_type": "artifact_link",
        "status": "submitted",
        "score_source": null
      },
      "gold_selected": {
        "category_key": "social_leadership",
        "skill_name": "AI Pulse — Gold Standard (peer training)",
        "evidence_type": "artifact_link",
        "status": "validated",
        "score_source": "gold_selection_scores"
      },
      "publication_above_target": {
        "category_key": "cultural_civic",
        "skill_name": "AI Pulse — Public AI Publication",
        "evidence_type": "artifact_link",
        "status": "validated",
        "score_source": "ig_reach"
      }
    }',
    'jsonb',
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    'pde_bridge_lookback_days',
    'PDE bridge lookback (days)',
    'How many days back the nightly bridge looks for AI Pulse cycles to record. Larger values heal missed runs.',
    '14',
    'int',
    NULL,
    7,
    60,
    NULL
  )
ON CONFLICT (config_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
