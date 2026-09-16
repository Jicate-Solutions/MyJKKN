-- Updated: 2026-09-15 - Join the interview you run to the interview you record.
--
-- THE GAP THIS CLOSES. MyJKKN has both halves of hiring and no join between
-- them. `hr_recruitment_jobs` holds 31 open posts and `hr_recruitment_candidates`
-- holds 52 people. `hr_recruitment_interviews` expects a candidate, a post, a
-- round, a panel and an outcome_summary. Meanwhile the interviews actually
-- happen as calendar bookings: 27 of the 217 rows in `meeting_bookings` are
-- hiring conversations, and every one of them says so only in the free-text
-- note the visitor typed when booking.
--
-- Measured on production 2026-09-15: `hr_recruitment_interviews` holds 2 rows
-- and `hr_recruitment_scorecards` holds 0, while the same person (Dr T.
-- Maheswaran, interviewed on 8 and 14 September) does not exist in
-- `hr_recruitment_candidates` at all. The calendar and the recruitment module
-- have never spoken.
--
-- Nothing here guesses that join. A booking becomes an interview only when a
-- person says which candidate and which post it belongs to, because those two
-- facts cannot be derived from a recording: a transcript can tell you what was
-- said, never which requisition it was against.
--
-- ============================================================================
-- 1. hr_recruitment_interviews.booking_id
-- ============================================================================
-- Direction matters. The column goes on the RECRUITMENT side, not on
-- meeting_bookings, for two reasons:
--   * meeting_bookings is the generic calendar table behind every meeting in
--     MyJKKN. Putting a recruitment concept on it couples a shared table to one
--     module, for the sake of 27 rows out of 217.
--   * the relationship is optional in exactly one direction. Nearly every
--     booking is not an interview; every interview could sensibly have a
--     booking. The nullable column belongs where the nulls are rare.
--
-- ON DELETE SET NULL, not CASCADE: deleting a calendar entry must never delete
-- the record that an interview happened. The interview keeps its own
-- scheduled_at, duration_minutes and outcome_summary and survives on its own.
ALTER TABLE public.hr_recruitment_interviews
  ADD COLUMN IF NOT EXISTS booking_id uuid
    REFERENCES public.meeting_bookings(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hr_recruitment_interviews.booking_id IS
  'The calendar booking this interview was held as, when it was held through MyJKKN scheduling. NULL for interviews recorded by hand or held elsewhere.';

-- One booking is at most one interview. A partial unique index rather than a
-- constraint so the many NULLs do not compete: without the WHERE clause every
-- hand-recorded interview would be unique-checked against every other one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_recruitment_interviews_booking
  ON public.hr_recruitment_interviews (booking_id)
  WHERE booking_id IS NOT NULL;

-- ============================================================================
-- 2. meeting_notes.action_items_applied_at
-- ============================================================================
-- WITHOUT THIS COLUMN THE FEATURE FLOODS SOMEBODY'S TASK LIST.
--
-- The ingest is scheduled every half hour and re-upserts the same transcripts
-- by (provider, provider_ref) on purpose, so that re-running it is free. The
-- moment it also CREATES action items, "free" stops being true: every tick
-- would add another copy of the same three follow-ups, for ever, and a person
-- who deleted one would watch it come back within thirty minutes.
--
-- So the follow-ups are applied exactly once per note and the fact is stamped
-- here. A human who then edits or deletes a task owns it from that point; the
-- machine never touches it again. NULL means "not yet applied", which is also
-- the correct reading for every note that arrived before this column existed.
ALTER TABLE public.meeting_notes
  ADD COLUMN IF NOT EXISTS action_items_applied_at timestamptz;

COMMENT ON COLUMN public.meeting_notes.action_items_applied_at IS
  'When the follow-ups in this note were turned into meeting_action_items. Set once and never cleared: the scheduled ingest re-reads the same note every 30 minutes and must not recreate tasks a person has since edited or deleted.';

-- Cheap lookup for "notes whose follow-ups still need applying".
CREATE INDEX IF NOT EXISTS idx_meeting_notes_actions_pending
  ON public.meeting_notes (booking_id)
  WHERE action_items_applied_at IS NULL AND booking_id IS NOT NULL;

-- ============================================================================
-- GRANTS
-- ============================================================================
-- Deliberately none. Both columns are additive on existing tables and inherit
-- those tables' privileges and RLS policies unchanged:
--   * hr_recruitment_interviews stays gated on hr.recruitment.view / .create /
--     .edit, so a meeting host who is not a recruiter still cannot read or
--     write one. The UI that offers the link checks the same permission before
--     rendering, rather than showing a control that fails on submit.
--   * meeting_notes keeps its SELECT-only policy set: no INSERT, UPDATE or
--     DELETE policy exists on purpose, so only the service role writes here.
-- Nothing new becomes reachable by anon.

-- ============================================================================
-- ASSERTIONS — this file fails rather than applying half of itself
-- ============================================================================
DO $interview_link$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(x, ', ') INTO v_missing FROM (
    SELECT 'hr_recruitment_interviews.booking_id' AS x
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'hr_recruitment_interviews'
        AND column_name = 'booking_id'
    )
    UNION ALL
    SELECT 'meeting_notes.action_items_applied_at'
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'meeting_notes'
        AND column_name = 'action_items_applied_at'
    )
    UNION ALL
    SELECT 'uq_hr_recruitment_interviews_booking'
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_class WHERE relname = 'uq_hr_recruitment_interviews_booking'
    )
    UNION ALL
    SELECT 'idx_meeting_notes_actions_pending'
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_class WHERE relname = 'idx_meeting_notes_actions_pending'
    )
  ) missing;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'interview-link migration incomplete, missing: %', v_missing;
  END IF;

  -- The foreign key must point at meeting_bookings and must NOT cascade.
  -- A CASCADE here would mean deleting a calendar entry silently destroys the
  -- record that the interview took place, which is the opposite of the intent.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'hr_recruitment_interviews'
      AND c.contype = 'f'
      AND c.confdeltype = 'n'                     -- 'n' = SET NULL
      AND pg_get_constraintdef(c.oid) LIKE '%meeting_bookings%'
  ) THEN
    RAISE EXCEPTION 'booking_id must reference meeting_bookings ON DELETE SET NULL';
  END IF;

  RAISE NOTICE 'interview-link migration: all objects present';
END
$interview_link$;
