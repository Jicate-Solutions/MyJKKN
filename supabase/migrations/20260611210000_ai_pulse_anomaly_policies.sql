-- =====================================================================
-- AI Pulse — anomaly-scan policy seed (Pulse-to-Practice SOP §4)
-- Created: 2026-06-11 — Lane F (dept heatmap + anomaly detectors)
--
-- Seed-only migration: ONE new policy row consumed by
-- app/api/cron/ai-pulse-anomaly-scan/route.ts (reach-outlier detector).
-- No DDL. Existing rows are reused, never duplicated
-- (ON CONFLICT (config_key) DO NOTHING).
-- =====================================================================

INSERT INTO public.ai_pulse_policies
  (config_key, display_name, description, value_jsonb, data_type, enum_options, min_value, max_value, locked_by_q)
VALUES
  (
    'reach_outlier_multiplier',
    'Reach outlier multiplier',
    'Flag posts whose reach is this many times the target — unusually viral posts get a human look before they count toward rankings',
    '20',
    'int',
    NULL,
    2,
    1000,
    NULL
  )
ON CONFLICT (config_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
