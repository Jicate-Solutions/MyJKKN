-- ============================================================================
-- 20270421104700_meetings_followup_routine_schedule.sql
-- ----------------------------------------------------------------------------
-- MEETINGS FOLLOW-UP ROUTINE — the dispatcher SCHEDULE row, SWITCHED OFF, and
-- the routine's four tunables as platform_policies rows.
--
-- ⛔ FILE ONLY — NOT APPLIED. The operator applies it at merge.
--    No BEGIN;/COMMIT; (rollback-rehearsal safe).
--
-- VERSION: renumbered from 20270402100000 on 2026-09-28 — the live ledger's
-- max(version) had moved to 20270414090000, and open PRs claim 20270415090000,
-- 20270416090000 and 20270420090000. 20270421104700 is above all of them.
--
-- WHY: when a meeting ends and its Fireflies note is linked, the ingest turns
-- the note's follow-ups into meeting_action_items and nothing reaches the host.
-- app/api/cron/meetings-followup-routine/route.ts sends the host a "record
-- ready" card per note and a weekly open-follow-ups digest. The schedule row,
-- plus the 'meetings-followup-routine' entry in lib/ai-routines/misc-ai.ts
-- (same PR), is its clock. vercel.json is deliberately untouched (hard
-- 100-cron cap).
--
-- ── 1. the schedule row ─────────────────────────────────────────────────────
-- enabled = false  → ships OFF. The Director switches it on at
--                    /admin/ai-routines once he has chosen the channel. The
--                    route also refuses to write while this row is disabled.
-- created_at       → THIS ROW'S created_at IS THE "RECORD READY" FLOOR. The
--                    route never cards a note applied before it, so the notes
--                    that existed before the routine are never carded. Do not
--                    delete and re-insert this row to "reset" it: that moves
--                    the floor. The weekly digest has NO floor: its first
--                    enabled run sends each host one card covering every
--                    follow-up already open longer than the stale window.
-- minute_of_day    → 1127 = 18:47 IST (IST, not UTC), floored by
--                    fn_ai_routine_claim_due to the 18:45 IST slot.
-- days_of_week     → every day; the weekly digest is keyed on the ISO week so
--                    it sends once per week regardless.
-- managed = true   → day/time editable on /admin/ai-routines, no deploy.
-- max_only = false → no model is called.
--
-- NOT-NULL columns of ai_routine_schedules (live catalog, SELECT only,
-- re-read 2026-09-28): routine_id, enabled, days_of_week, minute_of_day,
-- managed, max_only, created_at, updated_at. Every one is supplied here or has
-- a default (created_at/updated_at now(), max_only false).
--
-- ── 2. the tunables (docs/architecture/config-table-pattern.md) ─────────────
-- Four global platform_policies rows, read by the route on every run. The
-- values seeded are the ones the route falls back to when a row is missing,
-- switched off (is_active = false) or holds something that is not a day count
-- between 0 (exclusive) and 365 — and a row holding such a value is named in
-- the run's report (policy_ignored), never dropped silently.
--   meetings.followup_routine.stale_days                  7
--   meetings.followup_routine.record_ready_lookback_days  7
--   meetings.followup_routine.record_ready_expiry_days    7
--   meetings.followup_routine.digest_expiry_days          8
--
-- NOT-NULL columns of platform_policies (live catalog, SELECT only,
-- 2026-09-28): id (default gen_random_uuid()), policy_key, scope_type, value,
-- data_type, classification (default 'major'), publication_state (default
-- 'published'). All supplied. data_type 'number', scope_type 'global' and
-- classification 'operational' are inside the live CHECK constraints. The
-- uniqueness is the EXPRESSION index uq_platform_policies_key_scope
-- (policy_key, scope_type, COALESCE(scope_id, …)), which a bare
-- ON CONFLICT DO NOTHING honours (no conflict target is needed or possible
-- without naming the expression). None of the three live triggers on
-- platform_policies (re-read 2026-09-29) touches these keys:
-- trg_guard_gate_mode_super_admin_only only guards two session_feedback.*
-- keys, trg_guard_soi_policy_thresholds only soi.* keys, and
-- trg_zero_byow_counter_on_reenable is AFTER UPDATE on wa_byow.is_enabled only.
--
-- ON CONFLICT DO NOTHING (both inserts) → a re-run never clobbers a
-- Director-retuned row. No function is created here, so there is no
-- SECURITY DEFINER grant to re-assert.
-- ============================================================================

INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day, max_only)
VALUES
  ('meetings-followup-routine', false, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 1127, false)
ON CONFLICT DO NOTHING;

INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_widget, ui_category, is_system, is_active, publication_state)
VALUES
  ('meetings.followup_routine.stale_days', 'global', NULL, to_jsonb(7),
   'Meetings follow-up routine: a meeting follow-up still open after this many days counts as overdue, and the meeting''s host is told about it in the weekly open-follow-ups card. A number of days above 0 and no more than 365; part-days such as 0.5 count, and so does a number stored as text such as "7". Any other value is ignored, the run uses 7 and names this setting in its report.',
   'number', 'operational', 'number', 'Meetings', false, true, 'published'),
  ('meetings.followup_routine.record_ready_lookback_days', 'global', NULL, to_jsonb(7),
   'Meetings follow-up routine: the "Meeting record ready" card is sent only for recordings whose follow-ups were turned into tasks within this many days. It stops a late switch-on from sending one card for every recording in between, all at once. A number of days above 0 and no more than 365; part-days such as 0.5 count, and so does a number stored as text such as "7". Any other value is ignored, the run uses 7 and names this setting in its report.',
   'number', 'operational', 'number', 'Meetings', false, true, 'published'),
  ('meetings.followup_routine.record_ready_expiry_days', 'global', NULL, to_jsonb(7),
   'Meetings follow-up routine: how many days a "Meeting record ready" card stays in the host''s bell before it expires. A number of days above 0 and no more than 365; part-days such as 0.5 count, and so does a number stored as text such as "7". Any other value is ignored, the run uses 7 and names this setting in its report.',
   'number', 'operational', 'number', 'Meetings', false, true, 'published'),
  ('meetings.followup_routine.digest_expiry_days', 'global', NULL, to_jsonb(8),
   'Meetings follow-up routine: how many days the weekly open-follow-ups card stays in the host''s bell before it expires. 8 keeps last week''s card until the next one arrives. A number of days above 0 and no more than 365; part-days such as 0.5 count, and so does a number stored as text such as "7". Any other value is ignored, the run uses 8 and names this setting in its report.',
   'number', 'operational', 'number', 'Meetings', false, true, 'published')
ON CONFLICT DO NOTHING;

-- Guard: RAISE EXCEPTION, never RAISE NOTICE — a NOTICE-only miss reads as success.
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.ai_routine_schedules
   WHERE routine_id = 'meetings-followup-routine';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'meetings-followup-routine schedule row missing after insert (found %)', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.platform_policies
   WHERE scope_type = 'global'
     AND scope_id IS NULL
     AND policy_key IN ('meetings.followup_routine.stale_days',
                        'meetings.followup_routine.record_ready_lookback_days',
                        'meetings.followup_routine.record_ready_expiry_days',
                        'meetings.followup_routine.digest_expiry_days');
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'meetings.followup_routine.* policy rows: expected 4 global rows after insert, found %', v_count;
  END IF;
END
$$;
