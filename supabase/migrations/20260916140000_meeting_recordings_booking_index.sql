-- 20260916140000_meeting_recordings_booking_index.sql
--
-- One index. Every in-person meeting's page now asks "is there a recording of
-- this meeting?", and that lookup was a sequential scan of a table that only
-- grows.
--
-- WHY A SEPARATE FILE. The index belongs with 20260915120001, which created
-- meeting_recordings — but that migration merged in #3799 and is on main, so
-- editing it would be a change that never runs: supabase db push keys the
-- applied-migrations ledger on the version token, and a version already in the
-- ledger is skipped silently. A shipped migration is history. New object, new
-- file.
--
-- RENUMBERED 16 Sep 21:00. 20260916120000 was free when this branch was cut at
-- 12:19 and was taken by a direct push at 16:00
-- (20260916120000_gate_report_search_text_casts.sql). A duplicate version is
-- recorded as already applied and its SQL never runs, so this index would
-- simply never have existed. 20260916140000 sits above every version on main
-- and is claimed by no open PR, checked with git ls-tree rather than the
-- contents API, which pages out on this directory.
--
-- Partial on purpose: a standalone recording made from /meetings/record has no
-- booking, and those rows do not belong in an index that only ever answers
-- "which recording belongs to booking X".

CREATE INDEX IF NOT EXISTS idx_meeting_recordings_booking
  ON public.meeting_recordings(booking_id)
  WHERE booking_id IS NOT NULL;

COMMENT ON INDEX public.idx_meeting_recordings_booking IS
  'Lookup behind the Recording card on a meeting''s own page (16 Sep 2026).';
