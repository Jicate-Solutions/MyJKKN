-- =============================================================================
-- Meet Scheduling Polish — M2 (slot rules) + M3 (meeting modes)
-- Migration: meet_scheduling_polish
-- Added: 2026-06-17
-- =============================================================================
--
-- Exposes scheduling controls the native slot engine already supports
-- (lib/services/meetings/native-slot-engine.ts → computeSlots) but which the
-- meeting_types row had no column for, plus confirms the per-type buffer /
-- min-notice columns exist (they were created in 20260611190000; the
-- ADD … IF NOT EXISTS guards keep this migration safe to run anywhere,
-- including a fresh JICATE-customer deployment).
--
-- WHAT'S GENUINELY NEW:
--   * meeting_types.slot_interval_min — the step between candidate slot starts.
--     NULL = use duration_min (back-to-back slots, the engine default). A value
--     lets a 60-min meeting be offered on a 30-min grid, etc.
--
-- WHAT'S ALREADY HERE (idempotent guards only — no behaviour change):
--   * buffer_before_min / buffer_after_min / min_notice_min on meeting_types
--     (20260611190000) — already read by NativeSchedulingService.listSlots.
--   * meeting_schedule_overrides (20260611190000) — per-date closures/special
--     hours, keyed by schedule_id + date. The engine REPLACES a date's weekly
--     windows with that date's override rows; a NULL/NULL row closes the day.
--     No new column is needed — the M2 holidays UI writes existing columns.
--
-- M3 — MEETING MODES (location):
--   meeting_types.location_mode ('in_person'|'phone'|'online') and
--   location_text ALREADY EXIST (migration 20260612090000, decision D4) and are
--   wired end-to-end: the event-type form picks the mode, and
--   NativeSchedulingService passes withMeet = (location_mode = 'online') into
--   GoogleCalendarService.createEvent, which requests a Google Meet
--   conferenceData link and stores it on meeting_bookings.video_url.
--   'online' IS the Google Meet mode — we deliberately DO NOT add a parallel
--   'google_meet'/location_type column (it would split a working mechanism;
--   95 provisioned rows already use this column). This migration therefore adds
--   no location columns; M3 is a UI + service-readback change only.
-- =============================================================================

-- ── M2: slot-interval (slot increment) on meeting_types ─────────────────────

ALTER TABLE public.meeting_types
  ADD COLUMN IF NOT EXISTS slot_interval_min smallint
    CHECK (slot_interval_min IS NULL OR slot_interval_min BETWEEN 1 AND 1440);

COMMENT ON COLUMN public.meeting_types.slot_interval_min IS
  'M2: step between candidate slot starts, minutes. NULL = use duration_min (back-to-back). Consumed by computeSlots(slotIntervalMin).';

-- ── M2: idempotent guards for the buffer / notice columns ────────────────────
-- These were created in 20260611190000. The guards make this migration safe to
-- run against any deployment (and document the columns the M2 UI now exposes).

ALTER TABLE public.meeting_types
  ADD COLUMN IF NOT EXISTS buffer_before_min smallint NOT NULL DEFAULT 0
    CHECK (buffer_before_min >= 0),
  ADD COLUMN IF NOT EXISTS buffer_after_min smallint NOT NULL DEFAULT 0
    CHECK (buffer_after_min >= 0),
  ADD COLUMN IF NOT EXISTS min_notice_min integer NOT NULL DEFAULT 120
    CHECK (min_notice_min >= 0);

-- ── M2: meeting_schedule_overrides reachability guard ────────────────────────
-- The holidays / date-override editor writes (schedule_id, date, start_minute,
-- end_minute). The table + its columns already exist (20260611190000); this is
-- a defensive guard for fresh deployments only — it makes no change on prod.
-- (Listed explicitly so a reviewer can confirm the M2 UI's write target.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'meeting_schedule_overrides'
  ) THEN
    RAISE EXCEPTION 'meeting_schedule_overrides is missing — apply 20260611190000_native_scheduling_engine.sql first';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
