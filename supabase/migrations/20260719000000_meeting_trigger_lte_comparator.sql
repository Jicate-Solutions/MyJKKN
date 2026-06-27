-- ============================================================================
-- Migration: Auto-accountability-meeting engine — at-or-below threshold (E9)
-- Date: 2026-06-23
-- Interview decision E9: a college landing EXACTLY on its threshold counts as
-- falling short (at-or-below), not just strictly below.
--
-- Flips the attendance rules' comparator 'lt' -> 'lte' and changes the column
-- default so future rules inherit at-or-below. Idempotent.
-- ============================================================================

-- Existing seeded attendance rules: strictly-below -> at-or-below.
UPDATE public.meeting_trigger_rules
SET comparator = 'lte'
WHERE metric_key = 'attendance_rate_daily'
  AND comparator = 'lt';

-- Future rules default to at-or-below.
ALTER TABLE public.meeting_trigger_rules
  ALTER COLUMN comparator SET DEFAULT 'lte';
