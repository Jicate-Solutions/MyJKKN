-- 20260813000000_meeting_prefs_note_in_title.sql
-- FILE ONLY / NOT APPLIED. Not run against production, not even inside a
-- BEGIN..ROLLBACK. Apply is Director-gated.
--
-- WHY. 27 of 40 meeting bookings carry a discussion note the guest wrote at
-- booking time (meeting_bookings.answers->>'note' — real values: "Hostel fee
-- reduction", "GRT event purpose"). It was displayed nowhere, so the host
-- walked into the meeting not knowing what it was about. The note now always
-- rides in the Google Calendar event BODY (no setting, no migration needed).
--
-- WHAT THIS ADDS. One column, so a host can ALSO put the note in the event
-- TITLE. Default false, deliberately: the Google event is shared with the guest
-- (they are an attendee), so the title is what shows on their phone lock screen
-- and in their own calendar. The note is text the guest themselves wrote, so
-- echoing it is not a leak — but the body is the safe default and the title is
-- an explicit per-host choice.
--
-- The host reads/writes this through the existing "Video provider" card
-- (app/(routes)/meetings/availability/_components/integration-prefs-card.tsx);
-- the booking service reads it in
-- lib/services/meetings/native-scheduling-service.ts. Both sides treat a
-- MISSING column as false, so the code half is safe to deploy before this file
-- is applied.
--
-- Home table: meeting_host_integration_prefs (20260619000200) — already the
-- per-host meeting-integration settings row. ONE column, not a new table.
--
-- No function is created or replaced here, so there is no EXECUTE grant to
-- re-assert. RLS (mhip_host_all) and the table's existing anon lock are
-- untouched — a column inherits the table's policies.

ALTER TABLE public.meeting_host_integration_prefs
  ADD COLUMN IF NOT EXISTS show_note_in_title boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.meeting_host_integration_prefs.show_note_in_title IS
  'Opt-in (default false): also append the guest''s booking discussion note to the Google Calendar event TITLE. The note always appears in the event body regardless. Off by default because the guest is an attendee and the title is their high-visibility surface.';

-- Make the new column visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
