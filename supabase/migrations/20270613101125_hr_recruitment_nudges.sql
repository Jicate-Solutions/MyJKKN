-- =====================================================================================
-- HR staff harness — recruitment nudges (duty cards R5, R6, R8)
-- =====================================================================================
-- Design: artifacts/hr-staff-harness-design-2026-10-01.html.
--
-- WHY
--   Every recruitment approval step has carried `escalate_after_hours: 72` since the
--   flows were seeded (20260513230000 and its successors), frozen into each
--   candidate's approval_chain — and nothing has ever read it. A candidate could
--   wait at one step for weeks with nobody told. Interviewers are never reminded
--   about a missing scorecard, and nothing asks whether an issued offer turned into
--   a joining.
--
--   The route /api/cron/hr-recruitment-nudges now reads those deadlines and sends
--   one in-app nudge per overdue item (rules in lib/hr/recruitment/harness-selection.ts).
--   This migration adds the two things it needs:
--
--   1. hr_recruitment_nudges_sent — the record that makes each nudge fire ONCE.
--      The route INSERTs a row (the claim) BEFORE it sends; UNIQUE (kind, ref_key)
--      means a re-run, or two overlapping runs, cannot both send. A failed send
--      deletes its own claim so the next run retries. A nudge that found nobody to
--      send to still keeps its row: for an approval reminder that row is what
--      starts the 48-hour clock after which the HR Head is told, so a step whose
--      role nobody holds still reaches someone.
--
--      ref_key shapes (all text):
--        approval_reminder / approval_escalation  '<candidate_id>:<step_index>'
--        scorecard_missing                        '<interview_id>:<interviewer_id>'
--        offer_not_issued                         '<candidate_id>'
--        joining_outcome_missing                  '<candidate_id>:<expected_joining_date>'
--
--      Not the notifications table's own idempotency_key: notifications can expire
--      and be cleaned up, and a nudge must not come back because its bell item did.
--
--   2. The ai_routine_schedules row that makes the AI-routine dispatcher fire the
--      route (Mon–Sat 09:15 IST). The registry entry is in
--      lib/ai-routines/platform-ops.ts (id 'hr-recruitment-nudges').
--
-- ACCESS
--   RLS on, NO policies, and ALL revoked from anon and authenticated: the table is
--   written and read only by the service-role client in the cron route. No
--   SECURITY DEFINER function is added by this migration.
--
-- Mirrored into supabase/setup/01_tables.sql.
-- No transaction control in this file on purpose (a BEGIN..ROLLBACK rehearsal by
-- the person applying it must stay possible).
-- =====================================================================================

-- ── 1. The sent-record ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hr_recruitment_nudges_sent (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL,
  ref_key          text NOT NULL,
  candidate_id     uuid NOT NULL REFERENCES public.hr_recruitment_candidates(id) ON DELETE CASCADE,
  recipient_ids    uuid[] NOT NULL DEFAULT '{}',
  notification_id  uuid,
  sent_at          timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_recruitment_nudges_sent_kind_chk CHECK (kind IN (
    'approval_reminder',
    'approval_escalation',
    'scorecard_missing',
    'offer_not_issued',
    'joining_outcome_missing'
  )),
  CONSTRAINT hr_recruitment_nudges_sent_once UNIQUE (kind, ref_key)
);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_nudges_sent_candidate
  ON public.hr_recruitment_nudges_sent (candidate_id);

DROP TRIGGER IF EXISTS hr_recruitment_nudges_sent_updated_at
  ON public.hr_recruitment_nudges_sent;
CREATE TRIGGER hr_recruitment_nudges_sent_updated_at
  BEFORE UPDATE ON public.hr_recruitment_nudges_sent
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hr_recruitment_nudges_sent ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: service role only.
REVOKE ALL ON public.hr_recruitment_nudges_sent FROM anon, authenticated;

COMMENT ON TABLE public.hr_recruitment_nudges_sent IS
  'HR staff harness (R5/R6/R8): one row per recruitment nudge ever due — the claim '
  'written before the send, UNIQUE (kind, ref_key), so each nudge fires once. Written '
  'and read only by /api/cron/hr-recruitment-nudges with the service-role client. '
  'recipient_ids = {} means it fell due and found nobody to tell.';

-- ── 2. Schedule it on the AI-routine dispatcher ───────────────────────────────────
-- minute_of_day is IST (fn_ai_routine_claim_due compares now() AT TIME ZONE
-- 'Asia/Kolkata', floored to a 15-minute slot). 555 = 09:15 IST, start of the
-- office day. Mon–Sat: a Sunday nudge would sit unread until Monday anyway.
INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, days_of_week, minute_of_day, managed)
VALUES
  ('hr-recruitment-nudges', true, ARRAY[1,2,3,4,5,6]::smallint[], 555, true)
ON CONFLICT (routine_id) DO NOTHING;

-- ── 3. Guard ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.hr_recruitment_nudges_sent') IS NULL THEN
    RAISE EXCEPTION 'hr_recruitment_nudges_sent was not created';
  END IF;
  IF has_table_privilege('anon', 'public.hr_recruitment_nudges_sent', 'SELECT')
     OR has_table_privilege('authenticated', 'public.hr_recruitment_nudges_sent', 'SELECT') THEN
    RAISE EXCEPTION 'hr_recruitment_nudges_sent is still readable by anon or authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_routine_schedules WHERE routine_id = 'hr-recruitment-nudges') THEN
    RAISE EXCEPTION 'ai_routine_schedules row hr-recruitment-nudges is missing';
  END IF;
END
$$;
