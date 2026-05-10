-- ============================================================================
-- Migration: 20260513120000_voice_memo_monitor_policies
-- Phase: Voice Memo Monitor — substrate seeds (Agent A / 3-agent fan-out)
-- ============================================================================
-- Seeds 8 platform_policies rows consumed by /admission/counselors/voice-memos
-- monitor page + its server hook. Every threshold/mapping/flag on the page is
-- a row here — zero hardcoded numbers in service/UI code (per Director rule
-- feedback_policy_decisions_must_be_config_rows.md).
--
-- Director will tweak these via /admin/voice-memo-monitor (sibling Agent C UI).
-- Defaults at deploy match the agreed spec — auto-refresh 30s, stuck > 10min,
-- failure-rate amber 5%/red 20%, 24h counter window, ₹100/day cost alert,
-- 20-row recent lists, sentiment→digest-bucket mapping for Director digest.
--
-- Policy keys (must match lib/policies/keys.ts — Agent A also edits that file):
--   voice_memo_monitor.window_hours              (number, 24)
--   voice_memo_monitor.stuck_threshold_minutes   (number, 10)
--   voice_memo_monitor.failure_rate_red_pct      (number, 20)
--   voice_memo_monitor.failure_rate_amber_pct    (number, 5)
--   voice_memo_monitor.recent_rows_limit         (number, 20)
--   voice_memo_monitor.refresh_interval_seconds  (number, 30)
--   voice_memo_monitor.cost_alert_daily_inr      (number, 100)
--   voice_memo_monitor.director_digest_categories (object)
--
-- TIER-0: additive INSERTs only. No DDL. No DROP. No NOT NULL changes.
-- IDEMPOTENT: WHERE NOT EXISTS guard mirrors the substrate convention
--             (20260429000020, 20260503000002). Safe to re-apply.
-- REVERSIBILITY: DELETE the row OR set is_active=false; consuming code falls
--                back to hardcoded defaults baked into getPolicy<T>() callers.
-- ============================================================================

BEGIN;

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
    'voice_memo_monitor.window_hours',
    'global',
    NULL::uuid,
    '24'::jsonb,
    'Time window for live counters on the voice memo monitor page (hours). Counters show uploads in the last N hours.',
    'number',
    true,
    true
  ),
  (
    'voice_memo_monitor.stuck_threshold_minutes',
    'global',
    NULL::uuid,
    '10'::jsonb,
    'Show a STUCK alert if any memo has been in ''pending'' or ''transcribing'' for more than this many minutes. Helps catch a wedged cron sweeper.',
    'number',
    true,
    true
  ),
  (
    'voice_memo_monitor.failure_rate_red_pct',
    'global',
    NULL::uuid,
    '20'::jsonb,
    'Show RED status if today''s failure rate exceeds this percent.',
    'number',
    true,
    true
  ),
  (
    'voice_memo_monitor.failure_rate_amber_pct',
    'global',
    NULL::uuid,
    '5'::jsonb,
    'Show AMBER status if today''s failure rate exceeds this percent (and is below the red threshold).',
    'number',
    true,
    true
  ),
  (
    'voice_memo_monitor.recent_rows_limit',
    'global',
    NULL::uuid,
    '20'::jsonb,
    'How many recent failures and recent completions to show on the monitor page.',
    'number',
    true,
    true
  ),
  (
    'voice_memo_monitor.refresh_interval_seconds',
    'global',
    NULL::uuid,
    '30'::jsonb,
    'Auto-refresh cadence on the monitor page (seconds). Set to 0 to disable auto-refresh.',
    'number',
    true,
    true
  ),
  (
    'voice_memo_monitor.cost_alert_daily_inr',
    'global',
    NULL::uuid,
    '100'::jsonb,
    'Alert if total Whisper + Gemini spend on voice-memo analysis exceeds this many rupees in a single day.',
    'number',
    true,
    true
  ),
  (
    'voice_memo_monitor.director_digest_categories',
    'global',
    NULL::uuid,
    '{"interested":["interested"],"concerned":["concerned","anxious","hostile"],"neutral":["neutral"]}'::jsonb,
    'Maps memo sentiment values to Director digest buckets. Keys are bucket names; values are arrays of memo_sentiment values that roll up into that bucket.',
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

COMMIT;
