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
-- IDEMPOTENT. Skips rows already at 5, so a re-run updates nothing.

UPDATE public.meeting_types
SET buffer_before_min = 5,
    updated_at = now()
WHERE slug = 'quick-10'
  AND buffer_before_min IS DISTINCT FROM 5
  AND host_profile_id IN (
    '36442de9-e634-475c-a8a9-c29b6a9d839e',  -- gobinath-k
    '829c81ad-530c-43f2-9885-62b78f82caac',  -- mohanraj-v
    'dfbe273b-0540-4c32-9bad-e9bfb19a6460',  -- mr-ravishankar-s
    '5ad97b8b-0edb-4857-886b-449d8d3df538'   -- rangarajan-r (CEO)
  );
