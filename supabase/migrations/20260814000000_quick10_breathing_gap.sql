-- 20260814000000_quick10_breathing_gap.sql
--
-- ⚠️ SUPERSEDED BY 20260814010000. The "WHY NOT buffer_before_min" rationale at
-- the bottom of this header is factually wrong about the slot engine:
-- buffer_after alone does not stop a slot butting up against an earlier
-- meeting; buffer_before does. 20260814010000 carries the correct semantics and
-- the live measurement. This file is retained only because it is already
-- applied and recorded in the ledger.
--
-- FILE ONLY / NOT APPLIED BY CI. Apply is Director-gated and happens via the
-- Supabase Management API, never `supabase db push`.
--
-- WHAT THIS FIXES. 20260813010000 opened four public booking pages by seeding a
-- 10-minute meeting type for each (gobinath-k, mohanraj-v, mr-ravishankar-s and
-- the CEO's rangarajan-r). It relied on the table default buffer_after_min = 0,
-- which means a visitor can chain slots with no break at all: 10:00-10:10,
-- then 10:10-10:20, then 10:20-10:30. The host gets no wrap-up time and no time
-- to walk anywhere. All JKKN colleges sit on one walkable campus, so "walk
-- anywhere" is a real cost measured in minutes, not seconds.
--
-- THE CHANGE. Five minutes of protected time after each of these meetings.
-- Ten minutes to talk, five to finish and move. Director decision, 2026-08-06.
--
-- SCOPE. Only the four seeded 'quick-10' types, addressed by BOTH slug and the
-- explicit host list, so a future unrelated type that happens to use the slug
-- 'quick-10' is not silently retimed by this file. Nothing else about the rows
-- changes: not duration, not is_active, not is_public on the page, not
-- min_notice_min, not max_days_ahead.
--
-- IDEMPOTENT. The WHERE clause excludes rows already at 5, so a re-run updates
-- nothing. Safe to apply twice.
--
-- WHY NOT buffer_before_min. A gap AFTER the meeting protects the host who has
-- just finished. A gap before would push the same wall one slot later without
-- giving the person who just talked any room.

-- WIDEN-ONLY, same as its successor. This file replays BEFORE 20260814010000 on
-- every `db reset` / preview branch, so a flat `SET = 5` here would stomp a
-- deliberately larger value (a CEO raised to 10) down to 5, and the widen-only
-- logic in 20260814010000 would then only lift it back to 5 — never to 10.
-- Shipping the guard and the hazard in the same directory. The predicate below
-- is strictly narrowing and is a no-op on the already-applied production rows,
-- so this edit does not diverge from what the ledger recorded.
UPDATE public.meeting_types
SET buffer_after_min = GREATEST(COALESCE(buffer_after_min, 0), 5),
    updated_at = now()
WHERE slug = 'quick-10'
  AND COALESCE(buffer_after_min, 0) < 5
  AND host_profile_id IN (
    '36442de9-e634-475c-a8a9-c29b6a9d839e',  -- gobinath-k
    '829c81ad-530c-43f2-9885-62b78f82caac',  -- mohanraj-v
    'dfbe273b-0540-4c32-9bad-e9bfb19a6460',  -- mr-ravishankar-s
    '5ad97b8b-0edb-4857-886b-449d8d3df538'   -- rangarajan-r (CEO)
  );
