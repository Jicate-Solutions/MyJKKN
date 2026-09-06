-- 20260814010000_quick10_gap_use_before_buffer.sql
--
-- FILE ONLY / NOT APPLIED BY CI. Apply is Director-gated, via the Supabase
-- Management API.
--
-- CORRECTS 20260814000000, which set the WRONG column and therefore did not
-- deliver the protection it claimed. Keeping both files (rather than editing the
-- first) because 20260814000000 is already applied and recorded in the ledger.
--
-- WHAT WENT WRONG. 20260814000000 set buffer_after_min = 5 to stop a visitor
-- booking a slot immediately after an existing meeting. That is not what
-- buffer_after_min does. The engine (lib/services/meetings/native-slot-engine.ts,
-- ~line 271) pads the CANDIDATE slot, then tests it against the busy set:
--
--     candStart = start            - bufferBefore
--     candEnd   = start + duration + bufferAfter
--     clash     = candStart < busy.end AND candEnd > busy.start
--
-- With an existing 11:20-11:35 booking and a candidate at 11:35:
--   buffer_after = 5  -> cand [11:35, 11:50]; 11:35 < 11:35 is FALSE -> no clash
--                        -> the back-to-back slot is still offered. No protection.
--   buffer_before = 5 -> cand [11:30, 11:50]; 11:30 < 11:35 and 11:50 > 11:20
--                        -> clash -> the back-to-back slot is withheld. Correct.
--
-- So buffer_BEFORE is the one that protects the host who has just finished;
-- buffer_AFTER protects the run-up to a meeting that already exists.
--
-- CONFIRMED ON LIVE DATA, not from reading alone: with 0/0 buffers the public
-- slots API offered 11:35 on 2026-08-07 for host `omm` while 11:20-11:35 was
-- already booked -- i.e. production really does hand out the back-to-back slot.
--
-- THE CHANGE. Set buffer_before_min = 5 as well, keeping buffer_after_min = 5.
-- Both together give every one of these meetings five protected minutes on each
-- side, so a host is never crowded from either direction. The offered grid still
-- steps every 10 minutes (slot_interval_min is null, so it falls back to
-- duration_min); the buffers bite only against real busy time, which is the
-- intended behaviour.
--
-- SCOPE. Same four seeded 'quick-10' types, addressed by BOTH slug and explicit
-- host list. Nothing else changes: not duration, not is_active, not is_public,
-- not min_notice_min, not max_days_ahead.
--
-- IDEMPOTENT and WIDEN-ONLY. A re-run updates nothing, and a row deliberately
-- tuned HIGHER later (say the CEO raised to 10) is left alone rather than being
-- stomped back to 5. This file lives in supabase/migrations/, so `db reset`,
-- preview branches and any future replay will execute it again; a flat
-- "SET = 5" would silently undo later per-host tuning on every replay.

-- SELF-CONTAINED ON PURPOSE. This file sets BOTH buffers rather than relying on
-- 20260814000000 having run first. Apply here is manual and Director-gated, so
-- nothing guarantees file order: replayed out of order (or before the seed
-- 20260813010000 exists) a before-only UPDATE would either leave one-sided
-- protection or match zero rows and report success — the breathing gap silently
-- absent while the run looks clean. Setting both makes this file the single
-- statement of the intended end state.

UPDATE public.meeting_types
SET buffer_before_min = GREATEST(COALESCE(buffer_before_min, 0), 5),
    buffer_after_min  = GREATEST(COALESCE(buffer_after_min, 0), 5),
    updated_at = now()
WHERE slug = 'quick-10'
  AND (COALESCE(buffer_before_min, 0) < 5 OR COALESCE(buffer_after_min, 0) < 5)
  AND host_profile_id IN (
    '36442de9-e634-475c-a8a9-c29b6a9d839e',  -- gobinath-k
    '829c81ad-530c-43f2-9885-62b78f82caac',  -- mohanraj-v
    'dfbe273b-0540-4c32-9bad-e9bfb19a6460',  -- mr-ravishankar-s
    '5ad97b8b-0edb-4857-886b-449d8d3df538'   -- rangarajan-r (CEO)
  );

-- REPORT coverage. Deliberately a NOTICE, never an EXCEPTION.
--
-- Two earlier drafts of this block tried to assert, and both were wrong:
--
--   1. "exactly 4 rows carry both buffers at 5" — aborts the whole migration
--      transaction on entirely legitimate states, in a directory that
--      `db reset`, preview branches and any future replay will execute: a
--      fresh or partial database (0-3 of these production hosts present), a
--      host legitimately archived or re-slugged, or a row deliberately tuned
--      higher later. Short-circuiting on "zero hosts" does not save it —
--      a partial snapshot or one offboarded host still lands in 1..3.
--
--   2. "no matching row is below 5" — safe, but VACUOUS. The UPDATE above and
--      that check share the same predicate, so after the UPDATE no matching row
--      can be below 5 and the exception is unreachable. A guard that cannot
--      fire is worse than no guard: it reads as protection while providing
--      none.
--
-- There is no post-condition here worth aborting a migration chain over. The
-- UPDATE is idempotent and widen-only, so its own success is the guarantee.
-- What is genuinely useful to an operator is how many rows this file actually
-- governed on THIS database — 4 on production, 0 on a fresh one. So report it
-- and never fail.
DO $$
DECLARE governed integer;
BEGIN
  SELECT count(*) INTO governed
  FROM public.meeting_types
  WHERE slug = 'quick-10'
    AND host_profile_id IN (
      '36442de9-e634-475c-a8a9-c29b6a9d839e',
      '829c81ad-530c-43f2-9885-62b78f82caac',
      'dfbe273b-0540-4c32-9bad-e9bfb19a6460',
      '5ad97b8b-0edb-4857-886b-449d8d3df538'
    )
    AND COALESCE(buffer_before_min, 0) >= 5
    AND COALESCE(buffer_after_min, 0) >= 5;

  RAISE NOTICE
    'quick-10 breathing gap: % of the four seeded booking types now carry at least 5 minutes on both sides (0 is expected on a database that does not hold these hosts).',
    governed;
END $$;
