-- =====================================================================
-- Meetings: record WHO actually closed a meeting, not always the host
-- Migration: 2026-08-24 (applies as 20260926010000)
-- =====================================================================
-- ⚠️ FILE ONLY — NOT APPLIED. Director-gated, like every migration here.
--
-- WHY
-- ---
-- meeting_bookings.outcome_marked_by can currently hold exactly two values:
--
--   CHECK (outcome_marked_by IS NULL
--          OR outcome_marked_by = ANY (ARRAY['host'::text, 'system'::text]))
--
-- Both are KINDS of actor, not people. So the moment anyone other than the
-- meeting's own host closes a booking, the only thing the record can say is
-- 'host' — and app/(routes)/meetings/[uid]/page.tsx renders that literally as
-- "Recorded by the host". When a super admin closes one of the Director's
-- meetings, the page therefore names the DIRECTOR as the person who closed it.
-- Nobody lied; the schema simply has no place to put the real name.
--
-- The Director asked for the real person to be recorded.
--
-- NO BACKFILL IS NEEDED, and that is a measured fact rather than an
-- assumption: outcome_marked_by is NULL on all 128 production rows. No meeting
-- has ever been marked by anyone, so there is no historical attribution to
-- migrate and nothing to re-interpret. This fixes the shape before first use.
--
-- WHAT THIS ADDS
-- --------------
--   1. outcome_marked_by_profile_id — WHO. A separate column on purpose.
--      outcome_marked_by keeps meaning WHICH KIND of actor; overloading one
--      column with both meanings is the failure this repo has already paid
--      for once, so identity gets its own column.
--   2. A widened kind CHECK: 'host' | 'admin' | 'system'. 'host' and 'system'
--      keep their existing meanings exactly.
--   3. An integrity CHECK that a PERSON-marked row must actually name the
--      person. Without it, 'admin' could be written with a NULL identity and
--      the record would be anonymous again — the rule would exist in prose
--      and nowhere on the write path.
--   4. fn_meeting_mark_outcome replaced so it stamps the CURRENT caller, and
--      so a super admin can close on the host's behalf at all. Those two are
--      one change: recording a non-host actor is meaningless if no non-host
--      actor can ever reach the write.
--
-- WHY SUPER ADMIN, AND ONLY SUPER ADMIN
-- -------------------------------------
-- This is not a new authorization idea in this module. MeetingModeSwitchService
-- already accepts "the booking's host, or a super admin" for host-side
-- mutations on the same table. fn_meeting_mark_outcome was the odd one out.
-- The gate stays deliberately narrow: is_super_admin() only, not is_admin(),
-- and not a permission key — closing someone else's meeting is an exceptional
-- act, and the record now says who did it.
--
-- WHAT THIS DOES NOT TOUCH
-- ------------------------
-- The status CHECK, mb_no_double_booking, RLS on meeting_bookings, and
-- fn_meetings_auto_close_unmarked are all left exactly as they are. The 7-day
-- auto-close was RETIRED by the Director on 2026-08-21 and
-- app/api/cron/meetings-auto-close/route.ts now performs no database write at
-- all — but 'system' stays permitted so that neither the retired sweep nor any
-- row it might ever have written is invalidated by this change.
--
-- No BEGIN/COMMIT in this file on purpose, so a reviewer's BEGIN .. ROLLBACK
-- rehearsal actually rolls back.
-- =====================================================================

-- ── 1. columns ───────────────────────────────────────────────────────────────
-- The first two are re-asserted rather than assumed: 20260831010000 is itself
-- file-only, so this migration must apply whether or not that one ran first.
ALTER TABLE public.meeting_bookings
  ADD COLUMN IF NOT EXISTS outcome_marked_at timestamptz;

ALTER TABLE public.meeting_bookings
  ADD COLUMN IF NOT EXISTS outcome_marked_by text;

-- No ON DELETE clause, matching host_profile_id on this same table: deleting a
-- profile must not be able to quietly erase who closed a meeting.
ALTER TABLE public.meeting_bookings
  ADD COLUMN IF NOT EXISTS outcome_marked_by_profile_id uuid
  REFERENCES public.profiles(id);

COMMENT ON COLUMN public.meeting_bookings.outcome_marked_by IS
  'WHICH KIND of actor recorded the outcome: host = the booking''s own host; admin = a super admin acting on the host''s behalf; system = the pre-2026-08-21 automatic sweep. Identity lives in outcome_marked_by_profile_id, never here.';
COMMENT ON COLUMN public.meeting_bookings.outcome_marked_by_profile_id IS
  'WHO recorded the outcome. NULL for system-closed rows and for every row that predates this migration.';

-- ── 2. constraints ───────────────────────────────────────────────────────────
-- DROP ... IF EXISTS then ADD, rather than a guarded CREATE: the constraint
-- already exists on production with the narrower two-value list, so an
-- IF NOT EXISTS guard would find it, skip, and leave the bug in place.
ALTER TABLE public.meeting_bookings
  DROP CONSTRAINT IF EXISTS mb_outcome_marked_by_chk;

ALTER TABLE public.meeting_bookings
  ADD CONSTRAINT mb_outcome_marked_by_chk
  CHECK (outcome_marked_by IS NULL
         OR outcome_marked_by IN ('host', 'admin', 'system'));

-- The enforcement point. A person-marked row names the person, at the database,
-- on the write path — not in a comment and not in a review screen.
ALTER TABLE public.meeting_bookings
  DROP CONSTRAINT IF EXISTS mb_outcome_marked_by_person_chk;

ALTER TABLE public.meeting_bookings
  ADD CONSTRAINT mb_outcome_marked_by_person_chk
  CHECK (outcome_marked_by NOT IN ('host', 'admin')
         OR outcome_marked_by_profile_id IS NOT NULL);

-- ── 3. fn_meeting_mark_outcome — stamp the real actor ────────────────────────
-- Replaces the 20260831010000 version, which hardcoded outcome_marked_by =
-- 'host' regardless of who called it.
--
-- "Not yours" and "does not exist" still return the SAME error_code — a
-- distinguishable answer would confirm a uid exists to someone with no
-- business knowing it.
--
-- error_codes: invalid_outcome | not_found | not_started | not_markable
CREATE OR REPLACE FUNCTION public.fn_meeting_mark_outcome(
  p_uid     text,
  p_outcome text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_booking record;
  v_actor   uuid := auth.uid();
  v_kind    text;
BEGIN
  IF p_outcome NOT IN ('completed', 'no_show') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_outcome');
  END IF;

  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found');
  END IF;

  SELECT b.id, b.status, b.start_time, b.host_profile_id
    INTO v_booking
    FROM public.meeting_bookings b
   WHERE b.uid = p_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found');
  END IF;

  -- The host records their own meeting; a super admin may record it for them,
  -- and is stamped as themselves so the page can name them.
  IF v_booking.host_profile_id = v_actor THEN
    v_kind := 'host';
  ELSIF public.is_super_admin() THEN
    v_kind := 'admin';
  ELSE
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found');
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_markable',
      'message', format('This booking is already %s.', v_booking.status));
  END IF;

  -- start_time, not end_time: a no-show is knowable the moment the meeting was
  -- due to begin, and making the host wait out the full slot to say so is the
  -- friction that leaves the record empty.
  IF v_booking.start_time > now() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_started');
  END IF;

  UPDATE public.meeting_bookings
     SET status                       = p_outcome,
         outcome_marked_at            = now(),
         outcome_marked_by            = v_kind,
         outcome_marked_by_profile_id = v_actor,
         updated_at                   = now()
   WHERE id = v_booking.id
     AND status = 'confirmed';   -- re-assert under the row lock: a concurrent
                                 -- cancel must win rather than be overwritten

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_markable',
      'message', 'This booking changed while you were marking it.');
  END IF;

  RETURN jsonb_build_object(
    'success',   true,
    'status',    p_outcome,
    'marked_by', v_kind
  );
END $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_meeting_mark_outcome(text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_meeting_mark_outcome(text, text) TO authenticated;

COMMENT ON FUNCTION public.fn_meeting_mark_outcome(text, text) IS
  'Records whether a started booking happened (completed) or did not (no_show). Callable by the booking''s own host, or by a super admin acting on their behalf; stamps outcome_marked_by_profile_id = auth.uid() either way so the page can name the real person. Returns not_found for "missing", "not yours" and "signed out" alike.';

-- ── 4. guard ─────────────────────────────────────────────────────────────────
-- RAISE EXCEPTION, never RAISE NOTICE: a NOTICE-only miss path reads as success
-- in Studio while having done nothing.
DO $guard$
DECLARE
  v_anon_mark boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'meeting_bookings'
       AND column_name = 'outcome_marked_by_profile_id'
  ) THEN
    RAISE EXCEPTION 'meeting_bookings.outcome_marked_by_profile_id was not created';
  END IF;

  -- The widened kind list is the fix; assert it bites rather than trusting the
  -- ALTER ran. A constraint that still rejects 'admin' would leave the bug in
  -- place while every other statement here reported success.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.meeting_bookings'::regclass
       AND conname  = 'mb_outcome_marked_by_chk'
       AND pg_get_constraintdef(oid) LIKE '%admin%'
  ) THEN
    RAISE EXCEPTION 'mb_outcome_marked_by_chk does not permit the admin actor kind';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.meeting_bookings'::regclass
       AND conname  = 'mb_outcome_marked_by_person_chk'
  ) THEN
    RAISE EXCEPTION 'mb_outcome_marked_by_person_chk was not created';
  END IF;

  IF to_regprocedure('public.fn_meeting_mark_outcome(text, text)') IS NULL THEN
    RAISE EXCEPTION 'fn_meeting_mark_outcome(text, text) was not created';
  END IF;

  -- The REVOKE is the security half of this file. Assert the EFFECTIVE
  -- privilege, not the ACL text: anon is a member of PUBLIC, so revoking anon
  -- alone can still leave anon able to execute.
  v_anon_mark := has_function_privilege(
    'anon', 'public.fn_meeting_mark_outcome(text, text)', 'EXECUTE');
  IF v_anon_mark THEN
    RAISE EXCEPTION 'fn_meeting_mark_outcome is still executable by anon';
  END IF;
END $guard$;

NOTIFY pgrst, 'reload schema';
