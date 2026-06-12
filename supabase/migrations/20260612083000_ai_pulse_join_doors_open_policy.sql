-- =====================================================================
-- AI Pulse — join doors-open policy seed
-- Created: 2026-06-12 — live-session wiring fix (first-session zero-data RCA)
--
-- Seed-only migration: ONE new policy row consumed by
-- lib/services/ai-pulse/live-session-service.ts (getLiveSession join window).
-- Cycles surface on My Pulse up to a week early (daily cron creates next
-- Thursday's cycle ahead of time) — without an opening rule, a Monday click
-- on Join would earn the on-time gate for Thursday's session. Director
-- decision 2026-06-12: Join unlocks this many minutes before session start.
-- No DDL. Existing rows are reused, never duplicated
-- (ON CONFLICT (config_key) DO NOTHING).
-- =====================================================================

INSERT INTO public.ai_pulse_policies
  (config_key, display_name, description, value_jsonb, data_type, enum_options, min_value, max_value, locked_by_q)
VALUES
  (
    'join_doors_open_minutes',
    'Join doors-open window (minutes)',
    'How many minutes before session start the Join button unlocks on the live page — clicks before this window are blocked so early joins cannot farm the on-time gate',
    '15',
    'int',
    NULL,
    0,
    120,
    NULL
  )
ON CONFLICT (config_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
