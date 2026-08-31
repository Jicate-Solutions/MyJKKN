-- =====================================================================
-- Meetings: record whether a meeting actually HAPPENED
-- Migration: 2026-08-13 (applies as 20260831010000)
-- =====================================================================
-- ⚠️ FILE ONLY — NOT APPLIED. Director-gated, like every migration in this
-- repo. Until it is applied the two RPCs below do not exist, the marking
-- buttons return an honest "not enabled yet" message rather than failing
-- silently, and the dispatcher has no schedule row to claim.
--
-- WHY
-- ---
-- meeting_bookings has carried 'completed' and 'no_show' in its status CHECK
-- since the native engine shipped (20260611190000), and NOTHING has ever
-- written either one. Production on 2026-08-13: 74 bookings — 52 'confirmed',
-- 22 'cancelled', 0 'completed', 0 'no_show'. There is no button, no cron and
-- no code path that sets them; app/(routes)/meetings/[uid]/page.tsx only READS
-- them. That is the hole behind the Past-tab bug fixed in #2902, whose own
-- code comment says it plainly: "Nothing ever transitions a booking to
-- 'completed', so a meeting held in June is still 'confirmed'."
--
-- WHAT THIS ADDS
-- --------------
--   1. Two columns that record WHO decided the outcome — the host, or the
--      7-day sweep. Without them an auto-close manufactures evidence: the
--      Past tab would show 'completed' for a meeting nobody ever confirmed
--      took place, indistinguishable from one the host actually observed.
--   2. fn_meeting_mark_outcome  — host-only, one booking, called from the
--      meeting detail page.
--   3. fn_meetings_auto_close_unmarked — service-role sweep, idempotent,
--      called by /api/cron/meetings-auto-close via the AI-routine dispatcher.
--   4. The dispatcher schedule row for that routine.
--
-- WHAT THIS DOES NOT ADD
-- ----------------------
-- No RLS policy on meeting_bookings. Checked, not assumed: the table has
-- exactly ONE policy, mb_host_select (SELECT), and 20260611190000 states the
-- reason at lines 246-247 — "cancel/update goes through server actions
-- (service-role) so cancel_token never needs to reach the client". An UPDATE
-- path for the host therefore already exists and is in daily use (the 22
-- cancelled rows on production came through it). Adding an authenticated
-- UPDATE policy would be strictly WIDER than what is needed here: it would let
-- a host write any column of their own booking, including a status the state
-- machine forbids. fn_meeting_mark_outcome is SECURITY DEFINER and gates on
-- auth.uid() instead, so the caller can change exactly one thing, in exactly
-- one direction, and only on a booking they host.
--
-- STATUS CHECK: untouched. 'completed' and 'no_show' are already permitted.
-- EXCLUSION CONSTRAINT: untouched. mb_no_double_booking applies WHERE
-- status = 'confirmed', so a marked row simply leaves the constraint's scope —
-- which is correct: a finished meeting must not keep reserving its slot.
--
-- No BEGIN/COMMIT in this file on purpose, so a reviewer's BEGIN .. ROLLBACK
-- rehearsal against production actually rolls back.
-- =====================================================================

-- ── 1. attribution columns ───────────────────────────────────────────────────
ALTER TABLE public.meeting_bookings
  ADD COLUMN IF NOT EXISTS outcome_marked_at timestamptz;

ALTER TABLE public.meeting_bookings
  ADD COLUMN IF NOT EXISTS outcome_marked_by text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.meeting_bookings'::regclass
       AND conname  = 'mb_outcome_marked_by_chk'
  ) THEN
    ALTER TABLE public.meeting_bookings
      ADD CONSTRAINT mb_outcome_marked_by_chk
      CHECK (outcome_marked_by IS NULL OR outcome_marked_by IN ('host', 'system'));
  END IF;
END $$;

COMMENT ON COLUMN public.meeting_bookings.outcome_marked_at IS
  'When the completed/no_show outcome was recorded. NULL for every row that predates this migration.';
COMMENT ON COLUMN public.meeting_bookings.outcome_marked_by IS
  'host = the meeting host said so; system = the 7-day sweep assumed it. Kept separate on purpose — an assumed outcome is not an observed one.';

-- Partial index for the sweep's predicate (finished + still unmarked).
CREATE INDEX IF NOT EXISTS idx_mb_confirmed_end_time
  ON public.meeting_bookings(end_time)
  WHERE status = 'confirmed';

-- ── 2. fn_meeting_mark_outcome — the host records what happened ──────────────
-- Gate: the booking's OWN HOST only. Deliberately not admins: this records an
-- observation ("I was there"), and the module's sibling mutation is host-only
-- too (NativeSchedulingService.cancelBooking accepts a cancel_token or the
-- host, never an admin).
--
-- "Not yours" and "does not exist" return the SAME error_code on purpose — a
-- distinguishable answer would confirm a uid exists to someone who is not the
-- host, which is exactly the reasoning already applied in
-- app/(routes)/meetings/[uid]/actions.ts::getMyBookingSlots.
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
AS $$
DECLARE
  v_booking record;
BEGIN
  IF p_outcome NOT IN ('completed', 'no_show') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_outcome');
  END IF;

  SELECT b.id, b.status, b.start_time, b.host_profile_id
    INTO v_booking
    FROM public.meeting_bookings b
   WHERE b.uid = p_uid;

  IF NOT FOUND OR v_booking.host_profile_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found');
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_markable',
      'message', format('This booking is already %s.', v_booking.status));
  END IF;

  -- start_time, not end_time: a no-show is knowable the moment the meeting
  -- was due to begin, and making the host wait out the full slot to say so is
  -- the friction that leaves the record empty. The 7-day sweep below uses
  -- end_time — the asymmetry is deliberate and documented there.
  IF v_booking.start_time > now() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_started');
  END IF;

  UPDATE public.meeting_bookings
     SET status            = p_outcome,
         outcome_marked_at = now(),
         outcome_marked_by = 'host',
         updated_at        = now()
   WHERE id = v_booking.id
     AND status = 'confirmed';   -- re-assert under the row lock: a concurrent
                                 -- cancel must win rather than be overwritten

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_markable',
      'message', 'This booking changed while you were marking it.');
  END IF;

  RETURN jsonb_build_object('success', true, 'status', p_outcome);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_meeting_mark_outcome(text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_meeting_mark_outcome(text, text) TO authenticated;

COMMENT ON FUNCTION public.fn_meeting_mark_outcome(text, text) IS
  'Host-only: records whether a started booking happened (completed) or did not (no_show). Gates on auth.uid() = host_profile_id; returns not_found for both "missing" and "not yours".';

-- ── 3. fn_meetings_auto_close_unmarked — the 7-day sweep ─────────────────────
-- Director decision 2026-08-08: an unmarked finished meeting auto-closes as
-- 'completed' after 7 days.
--
-- end_time (not start_time) plus the full window: the sweep must never race a
-- host who is still deciding, and "7 days after it ended" is the only reading
-- that is true for a meeting which ran long.
--
-- IDEMPOTENT BY CONSTRUCTION, not by a guard column: the predicate is
-- status = 'confirmed', and the UPDATE's own effect is to leave that set. A
-- second run in the same minute matches zero rows. A row the host already
-- marked is 'completed'/'no_show' and was never in the set to begin with — its
-- outcome_marked_by = 'host' stamp is therefore preserved, which is the whole
-- point of keeping the two apart.
--
-- No batch cap: the working set is bounded by the number of meetings that
-- finished and went unmarked, and every row it touches leaves the set.
--
-- ACTIVATION FLOOR — why this sweep refuses to touch the backlog
-- ---------------------------------------------------------------------------
-- The 7-day rule was decided for meetings going forward. Without a floor it is
-- also a RETROACTIVE judgement on every meeting that ever finished, because on
-- the day this is applied the entire backlog is already older than 7 days: the
-- first tick would close ~24 of the 52 confirmed production rows in one sweep,
-- stamped 'system', with no un-mark path (fn_meeting_mark_outcome requires
-- status = 'confirmed', so an auto-closed row can never be corrected to
-- no_show).
--
-- That is the exact opposite of the Director's 2026-08-08 decision, recorded as
-- "build the button first, do NOT mark the finished meetings done — the system
-- cannot know which were no-shows". Auto-closing them IS the system guessing,
-- and a 'system' stamp on a guess is manufactured evidence.
--
-- So the sweep is floored at the moment the routine was switched on:
-- ai_routine_schedules.created_at for 'meetings-auto-close', written by the
-- seed below at APPLY time. A meeting that ended before the host ever had a
-- button to press is never auto-judged; only meetings that finish under the new
-- regime, where the host genuinely had 7 days to answer, are in scope.
--
-- Missing schedule row => the routine was never switched on => the sweep is an
-- explicit error, never a silent no-op that reads identically to "nothing due".
CREATE OR REPLACE FUNCTION public.fn_meetings_auto_close_unmarked(
  p_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz;
  v_floor  timestamptz;
  v_closed integer;
BEGIN
  IF p_days IS NULL OR p_days < 1 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_days');
  END IF;

  SELECT created_at INTO v_floor
    FROM public.ai_routine_schedules
   WHERE routine_id = 'meetings-auto-close';

  IF v_floor IS NULL THEN
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'not_activated',
      'error',      'No ai_routine_schedules row for meetings-auto-close: the '
                    || 'routine has never been switched on, so there is no '
                    || 'activation floor and the sweep refuses to run.'
    );
  END IF;

  v_cutoff := now() - make_interval(days => p_days);

  UPDATE public.meeting_bookings
     SET status            = 'completed',
         outcome_marked_at = now(),
         outcome_marked_by = 'system',
         updated_at        = now()
   WHERE status   = 'confirmed'
     AND end_time < v_cutoff
     AND end_time >= v_floor;

  GET DIAGNOSTICS v_closed = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'closed',  v_closed,
    'cutoff',  v_cutoff,
    'floor',   v_floor,
    'days',    p_days
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_meetings_auto_close_unmarked(integer)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_meetings_auto_close_unmarked(integer) TO service_role;

COMMENT ON FUNCTION public.fn_meetings_auto_close_unmarked(integer) IS
  'Service-role sweep: closes confirmed bookings that ended more than p_days ago as completed, stamped outcome_marked_by = system. Floored at ai_routine_schedules.created_at for meetings-auto-close, so the pre-existing backlog is never retroactively judged (Director 2026-08-08: do not mark the finished meetings done). Returns not_activated when that row is absent. Idempotent — the update leaves its own predicate set.';

-- ── 4. dispatcher schedule row ───────────────────────────────────────────────
-- NOT a vercel.json cron. vercel.json has a HARD 100-cron cap; PR #2938 pushed
-- it to 101 once and every production build failed schema validation until a
-- routine was moved off. PR #3010 has just taken it from 100 -> 55 precisely so
-- that new work like this lands here instead.
--
-- ⚠️ TIMEZONE: vercel.json crons are UTC; minute_of_day is IST
-- (fn_ai_routine_claim_due compares now() AT TIME ZONE 'Asia/Kolkata', floored
-- to a 15-minute slot). 380 = 06:20 IST, which floors to the 06:15 IST slot —
-- a slot no other routine currently occupies, chosen off the :00/:30 marks the
-- rest of the estate crowds onto.
INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, days_of_week, minute_of_day, managed)
VALUES
  ('meetings-auto-close', true, ARRAY[0,1,2,3,4,5,6]::smallint[], 380, true)
ON CONFLICT (routine_id) DO UPDATE
  SET enabled       = EXCLUDED.enabled,
      days_of_week  = EXCLUDED.days_of_week,
      minute_of_day = EXCLUDED.minute_of_day,
      managed       = EXCLUDED.managed,
      updated_at    = now();

-- ── 5. guard ─────────────────────────────────────────────────────────────────
-- RAISE EXCEPTION, never RAISE NOTICE: a NOTICE-only miss path reads as success
-- in Studio while having done nothing.
DO $$
DECLARE
  v_min       smallint;
  v_anon_mark boolean;
  v_auth_close boolean;
  v_backlog   integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'meeting_bookings'
       AND column_name IN ('outcome_marked_at', 'outcome_marked_by')
     GROUP BY table_name HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'meeting_bookings is missing outcome_marked_at / outcome_marked_by';
  END IF;

  IF to_regprocedure('public.fn_meeting_mark_outcome(text, text)') IS NULL THEN
    RAISE EXCEPTION 'fn_meeting_mark_outcome(text, text) was not created';
  END IF;
  IF to_regprocedure('public.fn_meetings_auto_close_unmarked(integer)') IS NULL THEN
    RAISE EXCEPTION 'fn_meetings_auto_close_unmarked(integer) was not created';
  END IF;

  -- The REVOKEs are the security half of this file; assert them rather than
  -- trusting that the statements above ran.
  v_anon_mark := has_function_privilege(
    'anon', 'public.fn_meeting_mark_outcome(text, text)', 'EXECUTE');
  IF v_anon_mark THEN
    RAISE EXCEPTION 'fn_meeting_mark_outcome is still executable by anon';
  END IF;

  v_auth_close := has_function_privilege(
    'authenticated', 'public.fn_meetings_auto_close_unmarked(integer)', 'EXECUTE');
  IF v_auth_close THEN
    RAISE EXCEPTION 'fn_meetings_auto_close_unmarked is still executable by authenticated';
  END IF;

  SELECT minute_of_day INTO v_min
    FROM public.ai_routine_schedules
   WHERE routine_id = 'meetings-auto-close' AND enabled AND managed;
  IF v_min IS NULL OR v_min <> 380 THEN
    RAISE EXCEPTION
      'meetings-auto-close schedule row missing or wrong (minute_of_day %, expected 380 = 06:20 IST)', v_min;
  END IF;

  -- PROVE THE ACTIVATION FLOOR BITES.
  -- This counts exactly what the first sweep would close. With the floor it is
  -- necessarily 0 at apply time (a row cannot both have ended after now() and
  -- more than 7 days before now()). WITHOUT the floor this same count is the
  -- whole finished backlog — ~24 of production's 52 confirmed rows — every one
  -- of which the Director said not to mark. If this ever raises, the floor has
  -- been dropped from the UPDATE and the sweep has become retroactive again.
  SELECT count(*) INTO v_backlog
    FROM public.meeting_bookings b
    JOIN public.ai_routine_schedules s ON s.routine_id = 'meetings-auto-close'
   WHERE b.status = 'confirmed'
     AND b.end_time <  now() - interval '7 days'
     AND b.end_time >= s.created_at;
  IF v_backlog > 0 THEN
    RAISE EXCEPTION
      'activation floor is not holding: % pre-existing finished bookings are in scope for the first auto-close sweep (expected 0)', v_backlog;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
