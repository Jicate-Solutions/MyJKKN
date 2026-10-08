-- ============================================================================
-- 20270610100000_walkin_claims_weekly_note.sql
-- ----------------------------------------------------------------------------
-- Walk-in agency claims — the weekly note's recipient list and its clock.
--
-- WHY: agency credits on walk-in enquiries are held out of the payment run until
-- a human releases them (20260909061500). On 2026-09-27 352 were waiting, the
-- oldest from 12 May 2026, and none had ever been released — nobody was being
-- told. Director ruling 2026-09-27: the release owner (Joint MD) AND the Director
-- each get a short note every week, by email and by the in-app bell.
--
-- WHAT THIS FILE DOES (data rows only — no table, no function, no grant):
--   1. platform_policies admission.walkin_release.weekly_note_recipient_ids —
--      JSON array of profile ids, seeded with the Director only. The release
--      owner is NOT listed here: the route reads admission.walkin_release.
--      owner_user_id (created by a separate PR) and adds that person at run
--      time, de-duplicated. A missing owner row is logged and skipped.
--   2. ai_routine_schedules 'walkin-claims-weekly-note' — Monday 09:15 IST.
--      The matching registry entry is in lib/ai-routines/platform-ops.ts and the
--      route is app/api/cron/walkin-claims-weekly-note/route.ts (same PR);
--      __tests__/lib/ai-routines/registry-cron-wiring.test.ts checks both.
--
-- ⚠️ TIMEZONE: minute_of_day is IST (fn_ai_routine_claim_due compares
-- now() AT TIME ZONE 'Asia/Kolkata', floored to a 15-minute slot). 555 = 09:15
-- IST. days_of_week uses 0 = Sunday, so ARRAY[1] = Monday.
-- ⚠️ AUTH: the dispatcher sends `Authorization: Bearer <CRON_SECRET>` only; the
-- route accepts exactly that.
-- ⛔ vercel.json is deliberately untouched (hard 100-cron cap).
--
-- ORDERING IS SAFE EITHER WAY: applied before the deploy, the dispatcher logs
-- 'skipped: not in registry' until the code lands; applied after, the first
-- Monday simply fires. Both inserts are no-ops on re-run and never clobber a
-- value someone has since edited.
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; (rollback-rehearsal safe).
-- ============================================================================

-- 1. Who gets the weekly note (besides the release owner, added at run time).
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_category, is_system, is_active)
SELECT
  'admission.walkin_release.weekly_note_recipient_ids',
  'global',
  NULL,
  '["b2bcb548-6b4c-4c75-a6b3-72dd5e9a94f1"]'::jsonb,
  'People (profile ids) who get the weekly note on walk-in agency claims still waiting to be released: how many, the oldest, and how many were released in the last 7 days — by email and the in-app bell, every Monday. The release owner (admission.walkin_release.owner_user_id) always gets it as well and need not be listed here. Director ruling 2026-09-27.',
  'array',
  'operational',
  'admission',
  false,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'admission.walkin_release.weekly_note_recipient_ids'
     AND scope_type = 'global' AND scope_id IS NULL
);

-- 2. The clock: Monday 09:15 IST, editable at /admin/ai-routines.
INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES
  ('walkin-claims-weekly-note', true, true, ARRAY[1]::smallint[], 555)
ON CONFLICT (routine_id) DO NOTHING;

-- Guard: RAISE EXCEPTION, never RAISE NOTICE — a NOTICE-only miss path reads as
-- success (ref feedback_a_raise_notice_guard_reads_as_success).
DO $$
DECLARE
  v_sched  int;
  v_policy int;
BEGIN
  SELECT count(*) INTO v_sched
    FROM public.ai_routine_schedules
   WHERE routine_id = 'walkin-claims-weekly-note';
  SELECT count(*) INTO v_policy
    FROM public.platform_policies
   WHERE policy_key = 'admission.walkin_release.weekly_note_recipient_ids'
     AND scope_type = 'global' AND scope_id IS NULL;
  IF v_sched <> 1 OR v_policy <> 1 THEN
    RAISE EXCEPTION 'walkin-claims-weekly-note seed incomplete (schedule=%, policy=%)', v_sched, v_policy;
  END IF;
END $$;
