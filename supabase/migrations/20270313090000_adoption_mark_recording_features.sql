-- Adoption loop — mark three features as recording, now that real people have used them,
-- and judge staff leave as "when needed" BEFORE it becomes judgeable at all.
--
-- usage_wired is a LABEL, not a switch: fn_feature_used never reads it, so these keys have
-- been recording since the deploy of #3966 on the morning of 2026-09-24. The label decides
-- whether the adoption pages present a feature as MEASURED — and a measured feature becomes
-- eligible for the dead rule and for fn_adoption_ask_why. So the order matters: set how a
-- feature is judged first, then let it be judged.
--
-- Evidence, read from production at 12:08 IST on 2026-09-24 (distinct people, excluding
-- test.* accounts and super admins):
--   service_requests.raise   28 people   (already 'event' since #3992)
--   hr.leave_apply           20 people
--   hr.leave_decide           2 people
--
-- CADENCE — hr.leave_apply and hr.leave_decide become 'event' (used when needed):
--   Nobody applies for leave every week; nobody decides one until an application arrives.
--   Left 'weekly', flipping them would (1) judge them on a single morning of recording,
--   because recording only began today, and (2) make them eligible for a must-answer
--   "why haven't you used this?" question to every intended person who simply had no leave
--   to take — 386 faculty alone. Hostel leave (campus_living.leave_apply) was already set
--   to 'event' in #3992 for the same reason; staff leave was the inconsistent one.
--   (Raised by the W12 desk's blind critic on #4000.)
--
-- NOT flipped, and why:
--   users.assign_role                — its only row so far is a super admin.
--   campus_living.leave_apply, campus_living.gate_pass_request,
--   cdc.declare_interest, cdc.answer_willingness — no rows yet; each is flipped once it has
--                                      a real use.
--
-- These three are DIRECTLY wired (recorded server-side after the write succeeds): their
-- shares mean "did it", unlike the bridged features' "tried it".
--
-- GUARD: the block refuses, and so rolls the whole migration back, if it would touch any
-- row outside these keys or more rows than it names. Re-running is safe: every UPDATE only
-- touches rows still at their old value, so a second run changes 0 rows and passes.

DO $$
DECLARE
  v_cadence int;
  v_wired   int;
BEGIN
  UPDATE public.feature_registry
     SET cadence = 'event', updated_at = now()
   WHERE feature_key IN ('hr.leave_apply', 'hr.leave_decide')
     AND cadence = 'weekly';
  GET DIAGNOSTICS v_cadence = ROW_COUNT;
  IF v_cadence > 2 THEN
    RAISE EXCEPTION 'adoption guard: cadence update touched % rows, expected at most 2', v_cadence;
  END IF;

  UPDATE public.feature_registry
     SET usage_wired = true, updated_at = now()
   WHERE feature_key IN ('service_requests.raise', 'hr.leave_apply', 'hr.leave_decide')
     AND usage_wired = false;
  GET DIAGNOSTICS v_wired = ROW_COUNT;
  IF v_wired > 3 THEN
    RAISE EXCEPTION 'adoption guard: usage_wired update touched % rows, expected at most 3', v_wired;
  END IF;

  -- The end state, not just the counts: all three must now be recording and 'event'.
  IF (SELECT count(*) FROM public.feature_registry
       WHERE feature_key IN ('service_requests.raise', 'hr.leave_apply', 'hr.leave_decide')
         AND usage_wired AND cadence = 'event') <> 3 THEN
    RAISE EXCEPTION 'adoption guard: expected all three features recording and judged as event';
  END IF;

  RAISE NOTICE 'adoption: % cadence row(s), % usage_wired row(s) changed', v_cadence, v_wired;
END $$;
