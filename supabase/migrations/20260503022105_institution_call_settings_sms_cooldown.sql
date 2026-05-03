-- Add per-institution SMS cooldown column to institution_call_settings
--
-- Replaces the hardcoded 24-hour SMS dedup window in
-- lib/services/telephony/call-pipeline-service.ts:235.
--
-- Per-institution policy = column on the existing institution_call_settings
-- table (not a platform_policies row). Cooldown range is enforced as
-- 1..168 hours (1 hour to 7 days) — wide enough for institutions with
-- different call volumes / spam tolerance.
--
-- Idempotent: re-runs are safe via ADD COLUMN IF NOT EXISTS.
-- Default 24 preserves existing pipeline behaviour for every existing row.

ALTER TABLE institution_call_settings
  ADD COLUMN IF NOT EXISTS auto_sms_cooldown_hours INTEGER NOT NULL DEFAULT 24;

-- Sanity-bound the cooldown to 1..168 hours (7 days).
-- Drop-and-recreate pattern keeps the migration idempotent on re-runs.
ALTER TABLE institution_call_settings
  DROP CONSTRAINT IF EXISTS institution_call_settings_auto_sms_cooldown_hours_check;

ALTER TABLE institution_call_settings
  ADD CONSTRAINT institution_call_settings_auto_sms_cooldown_hours_check
  CHECK (auto_sms_cooldown_hours BETWEEN 1 AND 168);

COMMENT ON COLUMN institution_call_settings.auto_sms_cooldown_hours IS
  'Hours between auto-SMS replies to the same caller. Default 24. Range 1..168.';
