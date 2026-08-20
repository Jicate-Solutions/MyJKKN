-- 20260820000000_meeting_type_default_breathing_gap.sql
--
-- WHY. Four leadership booking pages went public on 2026-08-05 with
-- buffer_before_min = buffer_after_min = 0, which let a visitor book a slot
-- starting the instant an existing commitment ended. 20260814010000 repaired
-- those four rows BY HAND. The root cause was never touched: meeting_types
-- still defaults both buffer columns to 0, so the fifth public booking page
-- created next week would be chain-bookable exactly as those four were.
--
-- WHAT THIS DOES. Moves the column default from 0 to 5 minutes. NEW rows only.
--
-- WHAT THIS DELIBERATELY DOES NOT DO. It does not backfill. 248 of the 252
-- meeting types on the platform currently sit at a 0 gap and every one of them
-- keeps its current value. A backfill would withdraw slots from 128 host pages
-- that their owners are already offering — a platform-wide behaviour change
-- that was considered and explicitly declined (Director, 2026-08-07). Changing
-- a column default in Postgres only affects subsequent INSERTs, so this file
-- cannot touch an existing row even by accident.
--
-- WHY 5 AND NOT SOMETHING ELSE. It matches what 20260814010000 already applied
-- to the four live pages, so new pages behave identically to the repaired ones.
--
-- WHY buffer_BEFORE MATTERS MORE THAN ITS NAME SUGGESTS. The slot engine pads
-- the CANDIDATE slot and then tests it against busy time
-- (lib/services/meetings/native-slot-engine.ts:271):
--     candStart = start - bufferBefore
--     candEnd   = start + duration + bufferAfter
--     clash     = candStart < busy.end && candEnd > busy.start
-- so buffer_BEFORE is what stops a booking butting up against the END of an
-- existing meeting. Setting buffer_after alone changes the column and changes
-- no behaviour at all. Both are set here for symmetry, but before is the
-- load-bearing one.
--
-- THIS FILE IS A BACKSTOP, NOT THE WHOLE FIX. Every application path that
-- creates a meeting type sends an explicit value, so Postgres never consults
-- this default from the app:
--   * app/(routes)/meetings/manage/actions.ts:578 (create) and its update
--     sibling always write buffer_before_min / buffer_after_min, taken from
--     the form. The behavioural change for hosts is the FORM default in
--     app/(routes)/meetings/manage/_components/event-types-manager.tsx, which
--     now pre-fills 5 for a new type (and still shows an existing type's own
--     value when editing, including a deliberate 0).
--   * scripts/meetings/provision-leadership-native.ts and
--     provision-counselors-native.ts hardcoded 0 — these seeded the original
--     four — and now hardcode 5.
-- This default therefore covers the remaining case: a raw SQL seed that omits
-- the column entirely, as 20260813010000_seed_default_meeting_type_four_hosts
-- did.
--
-- SAFETY. Pure DDL, no data mutation, no UUIDs, idempotent on replay
-- (SET DEFAULT is unconditional and repeatable). No function is created or
-- replaced, so there is no EXECUTE grant to re-assert. RLS is untouched.

ALTER TABLE public.meeting_types
  ALTER COLUMN buffer_before_min SET DEFAULT 5,
  ALTER COLUMN buffer_after_min SET DEFAULT 5;

COMMENT ON COLUMN public.meeting_types.buffer_before_min IS
  'Minutes of protected gap BEFORE the meeting. The slot engine pads the candidate slot by this amount when testing against busy time, so this is the value that stops a visitor booking straight onto the end of an existing commitment. Defaults to 5 (since 20260820000000); rows created before that date may still be 0 and were deliberately left alone.';

COMMENT ON COLUMN public.meeting_types.buffer_after_min IS
  'Minutes of protected gap AFTER the meeting. Defaults to 5 (since 20260820000000). Note this alone does not prevent back-to-back booking onto an existing commitment — buffer_before_min is the load-bearing guard.';

-- Make the changed defaults visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
