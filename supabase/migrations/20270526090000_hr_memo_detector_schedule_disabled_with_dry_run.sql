-- =====================================================================
-- HR memo detector: scheduled DISABLED, with a dry run and acknowledgement
-- nudges (HR staff harness, lane F — duty card G3)
-- Migration: 20270526090000
-- =====================================================================
-- WHY: app/api/cron/hr-memo-auto-detector existed and said "configure via
-- vercel.json", but nothing ever scheduled it (no vercel.json entry, no
-- dispatcher row, no pg_cron). This migration schedules it on the AI-routine
-- dispatcher — SWITCHED OFF — and gives it a dry run, so the first thing a
-- super admin sees is a preview, never a message to a staff member.
--
-- WHAT THIS ADDS
--   1. hr_memo_detector_runs — one row per run (dry_run or live): counts plus a
--      `details` list of the memos and nudges the run created, or WOULD have
--      created in a dry run.
--   2. hr_memo_nudges — the acknowledgement-nudge ledger. UNIQUE
--      (memo_id, nudge_kind) makes every nudge a one-time event: ONE reminder
--      to the staff member (3 days after issue, memo still not acknowledged or
--      disputed), then ONE notice to their reporting head (3 days after that).
--      The row is claimed BEFORE the notice is sent.
--   3. platform_policies 'hr.memo_auto_detector' (global) =
--      {"mode":"dry_run","staff_reminder_after_days":3,
--       "hod_notice_after_days":3,"nudge_max_age_days":30}
--        off     — the run reads this row and stops. No other work.
--        dry_run — reads everything, writes ONLY the hr_memo_detector_runs
--                  row. No memo, no event, no nudge row, no notification.
--        live    — creates memos and sends the in-app notices + nudges.
--      A missing row or unknown mode reads as 'off' in the code.
--   4. ai_routine_schedules 'hr-memo-auto-detector' — enabled = FALSE,
--      every day at 07:30 IST (minute_of_day 450 = 02:00 UTC, the time the
--      route header always named). The dispatcher only claims enabled rows,
--      so until a super admin switches it on the route is never called.
--
-- Nothing in this migration, or in the code that ships with it, can message
-- a staff member: the schedule is off AND the switch is dry_run.
--
-- ─── HOW TO SWITCH IT ON (super admin) ────────────────────────────────────
-- Step 1 — daily preview (still sends NOTHING):
--   /admin/ai-routines → "HR memo detector + acknowledgement nudges" → turn
--   the schedule on. Or in SQL:
--     UPDATE public.ai_routine_schedules
--        SET enabled = true, updated_at = now()
--      WHERE routine_id = 'hr-memo-auto-detector';
--   Read what it would do after the next 07:30 IST run:
--     SELECT ran_at, mode, events_found, memos_found, nudges_found,
--            details, errors
--       FROM public.hr_memo_detector_runs
--      ORDER BY ran_at DESC LIMIT 5;
--
-- Step 2 — go live (memos are created and people are notified):
--     UPDATE public.platform_policies
--        SET value = jsonb_set(value, '{mode}', '"live"'), updated_at = now()
--      WHERE policy_key = 'hr.memo_auto_detector'
--        AND scope_type = 'global' AND scope_id IS NULL;
--
-- Stop everything at once: the same UPDATE with '"off"'.
-- Back to preview only: the same UPDATE with '"dry_run"'.
-- ─────────────────────────────────────────────────────────────────────────
--
-- READ THE DRY RUN BEFORE STEP 2. Known today (2026-10-01, from the code, not
-- from production): the leave-before-approval detector reads
-- institution_leaves, which holds holiday declarations whose requested_by is
-- a profile id, not a staff id — the code refuses to issue a memo to an id
-- that is not a staff row, and the dry run lists those as staff_found=false.
-- The monthly loss-of-pay detector asks hr_attendance_records for columns it
-- does not have (staff_id, is_lop, attendance_date); that read now reports an
-- error in the run row instead of silently finding nothing.
--
-- No SECURITY DEFINER function is created: the switch is read through the
-- existing fn_get_policy (anon already revoked, 20270506090000).
-- No transaction control on purpose (a BEGIN..ROLLBACK rehearsal must work).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) hr_memo_detector_runs
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_memo_detector_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL UNIQUE,
  mode               text NOT NULL CHECK (mode IN ('dry_run', 'live')),
  ran_at             timestamptz NOT NULL DEFAULT now(),
  events_found       integer NOT NULL DEFAULT 0,
  events_written     integer NOT NULL DEFAULT 0,
  memos_found        integer NOT NULL DEFAULT 0,
  memos_created      integer NOT NULL DEFAULT 0,
  notifications_sent integer NOT NULL DEFAULT 0,
  nudges_found       integer NOT NULL DEFAULT 0,
  nudges_sent        integer NOT NULL DEFAULT 0,
  details            jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors             jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_memo_detector_runs_ran_at
  ON public.hr_memo_detector_runs (ran_at DESC);

COMMENT ON TABLE public.hr_memo_detector_runs IS
  'One row per hr-memo-auto-detector run (dry_run or live). details = {events, memos, nudges} the run created, or would have created in a dry run. Written by the cron (service role) only. Migration 20270526090000.';

ALTER TABLE public.hr_memo_detector_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hr_memo_detector_runs FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.hr_memo_detector_runs TO authenticated;
GRANT ALL ON TABLE public.hr_memo_detector_runs TO service_role;

DROP POLICY IF EXISTS hr_memo_detector_runs_select ON public.hr_memo_detector_runs;
CREATE POLICY hr_memo_detector_runs_select ON public.hr_memo_detector_runs
  FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin()) OR (SELECT public.is_admin()));

-- ---------------------------------------------------------------------
-- 2) hr_memo_nudges
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_memo_nudges (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memo_id               uuid NOT NULL REFERENCES public.hr_memos(id) ON DELETE CASCADE,
  nudge_kind            text NOT NULL CHECK (nudge_kind IN ('staff_reminder', 'hod_notice')),
  run_id                uuid,
  status                text NOT NULL DEFAULT 'claimed'
                          CHECK (status IN ('claimed', 'sent', 'no_recipient', 'failed')),
  recipient_profile_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  recipient_source      text,   -- staff | reports_to | department_head | department_hod_role | none
  recorded_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_memo_nudges_once UNIQUE (memo_id, nudge_kind)
);

COMMENT ON TABLE public.hr_memo_nudges IS
  'Acknowledgement nudges for hr_memos: at most ONE staff_reminder and ONE hod_notice per memo (UNIQUE memo_id, nudge_kind), claimed before sending. no_recipient = nobody could be resolved, recorded so it is visible and not retried. Written by the cron (service role) only. Migration 20270526090000.';

ALTER TABLE public.hr_memo_nudges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hr_memo_nudges FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.hr_memo_nudges TO authenticated;
GRANT ALL ON TABLE public.hr_memo_nudges TO service_role;

DROP POLICY IF EXISTS hr_memo_nudges_select ON public.hr_memo_nudges;
CREATE POLICY hr_memo_nudges_select ON public.hr_memo_nudges
  FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin()) OR (SELECT public.is_admin()));

DROP TRIGGER IF EXISTS trg_hr_memo_nudges_updated_at ON public.hr_memo_nudges;
CREATE TRIGGER trg_hr_memo_nudges_updated_at
  BEFORE UPDATE ON public.hr_memo_nudges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3) The switch — seeded dry_run (never live)
-- ---------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_category, is_system, is_active, publication_state)
SELECT
  'hr.memo_auto_detector',
  'global',
  NULL,
  '{"mode":"dry_run","staff_reminder_after_days":3,"hod_notice_after_days":3,"nudge_max_age_days":30}'::jsonb,
  'Switch for the daily HR memo detector. mode: off = does nothing; dry_run = records in hr_memo_detector_runs what it would create and send, and sends nothing; live = issues memos and sends notices. Also: one reminder to the staff member when a memo is not acknowledged or disputed after staff_reminder_after_days, then one notice to their reporting head after hod_notice_after_days more; memos older than nudge_max_age_days get no first reminder. The schedule itself is the hr-memo-auto-detector row at /admin/ai-routines.',
  'object',
  'major',
  'HR',
  true,
  true,
  'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'hr.memo_auto_detector'
     AND scope_type = 'global' AND scope_id IS NULL
);

-- ---------------------------------------------------------------------
-- 4) The schedule — seeded DISABLED
-- ---------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, days_of_week, minute_of_day, managed)
VALUES
  ('hr-memo-auto-detector', false, ARRAY[0,1,2,3,4,5,6]::smallint[], 450, true) -- 02:00 UTC = 07:30 IST
ON CONFLICT (routine_id) DO UPDATE
  SET enabled    = false,
      updated_at = now();

-- ---------------------------------------------------------------------
-- 5) Guard — RAISE EXCEPTION, never NOTICE
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_enabled boolean;
  v_mode    text;
BEGIN
  SELECT enabled INTO v_enabled
    FROM public.ai_routine_schedules
   WHERE routine_id = 'hr-memo-auto-detector';
  IF v_enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'hr-memo-auto-detector schedule must be seeded disabled (found %)', v_enabled;
  END IF;

  SELECT value->>'mode' INTO v_mode
    FROM public.platform_policies
   WHERE policy_key = 'hr.memo_auto_detector'
     AND scope_type = 'global' AND scope_id IS NULL;
  IF v_mode IS NULL OR v_mode = 'live' THEN
    RAISE EXCEPTION 'hr.memo_auto_detector must exist and must not be live at seed time (found %)', v_mode;
  END IF;

  IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hr_memo_detector_runs'::regclass) IS NOT TRUE
     OR (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hr_memo_nudges'::regclass) IS NOT TRUE THEN
    RAISE EXCEPTION 'RLS must be enabled on hr_memo_detector_runs and hr_memo_nudges';
  END IF;
END $$;
