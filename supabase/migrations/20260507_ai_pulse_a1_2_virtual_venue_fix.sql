-- ============================================================================
-- AI Pulse Module — Wave A.1.2 virtual-venue substrate fix
-- ============================================================================
--
-- Spec:       specs/myjkkn-ai-pulse-spec.md v3 (PR #641, merged)
-- Stacks on:  PR #644 (wave-a1/ai-pulse-events-extension)
-- Concern:    "B" from continuation brief 2026-05-07
--
-- Problem
-- -------
-- AI Pulse cycles run as virtual Google Meet sessions and have no physical
-- venue. event_team_attendance.venue_assignment_id is currently NOT NULL
-- with no default, so when Wave B.3 (#733) marks attendance for an AI Pulse
-- cycle the INSERT will fail with:
--
--   null value in column "venue_assignment_id" violates not-null constraint
--
-- A sentinel "virtual venue" workaround is also blocked because
-- event_venue_assignments.day_type CHECK only accepts ('build_day','demo_day'),
-- so we cannot seed a virtual-venue row tagged with the new 'live_session' /
-- 'async_makeup' day types added in PR #644.
--
-- Fix (Option 1, Director-approved 2026-05-07 ~00:55 IST)
-- -------------------------------------------------------
-- Drop the NOT NULL on event_team_attendance.venue_assignment_id, and add
-- a partial CHECK that preserves the data-integrity guarantee for physical
-- day types ('build_day', 'demo_day'). Virtual day types added by PR #644
-- ('live_session', 'async_makeup') may have NULL venue.
--
-- Empirical verification
-- ----------------------
-- Verified 2026-05-07 ~00:55 IST via Supabase MCP `BEGIN; ... ROLLBACK;` on
-- production. Migration applies cleanly on top of PR #644's day_type CHECK
-- extension and engagement_signals column. All 1,210 existing attendance
-- rows have venue_assignment_id set, so the partial CHECK is satisfied
-- trivially for current data.
-- ============================================================================

-- 1. Drop NOT NULL so AI Pulse virtual-venue attendance INSERTs can proceed.
ALTER TABLE public.event_team_attendance
  ALTER COLUMN venue_assignment_id DROP NOT NULL;

-- 2. Compensating CHECK: physical day types still require venue assignment;
--    virtual day types (live_session, async_makeup) added by PR #644 may NULL.
ALTER TABLE public.event_team_attendance
  DROP CONSTRAINT IF EXISTS event_team_attendance_venue_required_for_physical;
ALTER TABLE public.event_team_attendance
  ADD CONSTRAINT event_team_attendance_venue_required_for_physical
  CHECK (
    venue_assignment_id IS NOT NULL
    OR day_type IN ('live_session', 'async_makeup')
  );

COMMENT ON CONSTRAINT event_team_attendance_venue_required_for_physical
  ON public.event_team_attendance IS
  'AI Pulse Wave A.1.2: virtual day types (live_session, async_makeup) per spec v3 §4.1 have no physical venue; build_day and demo_day must still have venue assignment.';

-- ============================================================================
-- END Wave A.1.2 virtual-venue substrate fix
-- ============================================================================
