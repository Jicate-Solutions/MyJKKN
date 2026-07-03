-- =====================================================================
-- 20260731010000_ig_silence_realert_policy.sql
--
-- Re-alert cadence knob for the daily Instagram silence-detect cron
-- (/api/cron/ig-silence-detect → lib/instagram/silence-detect.ts).
--
-- Before: a still-silent account was re-alerted EVERY day (the cron's
-- idempotency key is per-(account, day), so each new day produced a fresh
-- notification — ~35 repeat alerts/day observed → alert fatigue).
-- After: alert on first detection, then suppress repeats until
-- `ig.silence_realert_days` days have elapsed since that account's last
-- silence alert. 0 = legacy alert-every-day behaviour.
--
-- "Last alerted" is derived at runtime from the notifications rows the
-- cron already writes (idempotency_key `ig-silence-<ig_user_id>-<day>`)
-- — no new state table/column, so this migration is a pure policy seed.
--
-- Follows the config-table pattern (docs/architecture/config-table-pattern.md)
-- via the module's existing substrate: platform_policies row + the
-- fn_get_policy_int accessor, exactly like the 8 ig.* knobs seeded by
-- 20260530140000_instagram_monitoring_substrate.sql.
-- =====================================================================

INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, data_type, description,
  classification, publication_state, is_system, is_active,
  ui_widget, ui_category, ui_consequence
) VALUES
  (
    'ig.silence_realert_days', 'global', NULL,
    to_jsonb(7), 'number',
    'Minimum number of days between repeated silence alerts for the same still-silent Instagram account. The first alert always fires; repeats are suppressed until this many days have passed since that account''s last silence alert. Set to 0 to re-alert every day (legacy behaviour).',
    'operational', 'published', false, true,
    'number', 'Instagram',
    'Raise the value to cut repeat-alert noise for accounts that stay silent; lower it (or set 0) to keep silent accounts in front of admins more often.'
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- =====================================================================
-- Verification (SELECT-only, safe to re-run):
--   SELECT policy_key, value FROM platform_policies
--     WHERE policy_key = 'ig.silence_realert_days';
--     -- expected: 1 row, value = 7
-- =====================================================================
