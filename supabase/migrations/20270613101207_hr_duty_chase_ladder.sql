-- ============================================================================
-- Migration: 20270613101207_hr_duty_chase_ladder
-- Added: 2026-10-01 — HR staff harness, build step 2: the duty register, the
-- chase ladder and the weekly roll-up.
-- Design: artifacts/hr-staff-harness-design-2026-10-01.html ("The chase
-- ladder", "Guardrails", "Your decisions"). Director-approved harness; the
-- decisions this file assumes are the design's RECOMMENDED options and are
-- listed at the end of this header.
-- ============================================================================
--
-- WHAT THIS ADDS
--   1. hr_duty_definitions — the config table (docs/architecture/
--      config-table-pattern.md: shared mixin, typed columns, audit table,
--      super-admin write). One row per HR duty in the design's register,
--      R1–R9, L1–L5, A1–A6, P1–P4, S1–S4, G1–G10 (38 rows). Each row holds
--      the duty's name, owning queue, how its owner is found, its due rule,
--      its ladder rungs and an `enabled` flag.
--        ENABLED (7): the duties whose "waiting" rows are cheap to read today
--        and that have a source adapter in lib/services/hr/duty-harness:
--        L1 leave, L2 comp-off, A3 regularisation, R5 recruitment step,
--        S2 document verification, S3 photo review, G2 HR forms — each with
--        the design's proposed deadline.
--        DISABLED (31): seeded for the register, with the design's proposed
--        deadline where it is a number and a note saying what is missing.
--        Switching one on without a source adapter does nothing (the run
--        records it as no_source_adapter).
--   2. hr_duty_chase_ledger — one row per item per ladder rung reached. The
--      UNIQUE key is the dedupe: a rung is reached, and messaged, once.
--      It is also the per-person record, so it is readable ONLY by the owner
--      and the owner's supervisor (guardrail + decision 3).
--   3. hr_duty_blocked_marks — "blocked, because…" marks. A mark parks the
--      item and lifts it one rung at once.
--   4. hr_duty_chase_runs — every run, whatever it decided, like
--      director_handover_chase_runs: sent, switched off, outside hours,
--      weekly off, fuse blown, failed.
--   5. Functions: fn_hr_duty_mark_blocked / fn_hr_duty_clear_blocked (the
--      owner's "blocked" answer), fn_hr_duty_desk_summary (late counts per
--      DESK for the Director / HR head — no person anywhere in it).
--   6. platform_policies rows (global) — the MASTER SWITCH
--      hr.harness.chase.enabled = false, the volume fuse
--      hr.harness.chase.max_messages_per_run = 50, and the guardrail knobs.
--   7. ai_routine_schedules row 'hr-duty-chase' (daily 10:15 IST) — the route
--      itself checks the master switch, so the schedule can stay on.
--   8. loop_registry row 'hr-duty-chase', class 'accountability', every gate
--      honestly OFF (it is switched off and measures nothing yet).
--
-- WHY NOT A NEW SUBJECT TYPE ON meeting_trigger_events
--   The trigger engine's remedy is explain-in-24h-or-meet; its reconciler
--   escalates any non-handover subject event without an action_responses row
--   to a booked meeting. A late leave request must climb a ladder, not book a
--   meeting, and the Director must see desks, not a person paired with a
--   judge. So this reuses the engine's PATTERNS (UNIQUE-key dedupe, the
--   handover chase's volume fuse and run log, its on-leave predicate) in a
--   small separate service. See lib/services/hr/duty-harness/chase-service.ts.
--
-- NOTHING CHASES ANYONE until the Director sets hr.harness.chase.enabled to
-- true. Until then every run writes one hr_duty_chase_runs row with a preview
-- of what it WOULD have sent, and nothing else.
--
-- ASSUMED DECISIONS (design "Your decisions", recommended options):
--   1. Deadlines: the design's proposals are seeded; the HR head edits the rows.
--   2. How far up: a weekly digest only — no per-item alert to the Director.
--   3. Who sees a person's numbers: the person and their supervisor only; the
--      Director and the HR head see desks.
--
-- NO existing function is replaced by this migration.
-- ============================================================================
-- ci:allow-secdef-authenticated fn_hr_duty_mark_blocked / fn_hr_duty_clear_blocked are callable by any signed-in user by design: the body refuses anyone who is not an owner (or, to clear, the marker or a supervisor) on that item's own ledger rows — an ownership test on data, which is the authorization, not a role check.


-- ----------------------------------------------------------------------------
-- 1. The duty register (config table)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_duty_definitions (
  -- shared config mixin (config-table-pattern.md, verbatim)
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key    text NOT NULL,                  -- the duty code, e.g. 'L1'
  display_name  text NOT NULL,
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES public.profiles(id),
  change_reason text,

  -- typed columns
  area                 text NOT NULL
                         CHECK (area IN ('recruitment','leave','attendance','payroll','staff_records','governance')),
  owning_queue         text NOT NULL,
  -- How the engine finds who an item is waiting on:
  --   chain_step = the approver pinned or named by the item's current step;
  --   permission = holders of owner_permission_key in the item's college;
  --   none       = no per-item owner (monthly / yearly duties).
  owner_rule           text NOT NULL DEFAULT 'permission'
                         CHECK (owner_rule IN ('chain_step','permission','none')),
  owner_permission_key text,
  -- Due rule. Hours are counted as ceil(hours/24) WORKING days (the clock
  -- pauses on weekly offs and holidays). A calendar rule combines with an
  -- hours/days rule as the EARLIER of the two. Supported calendar rule:
  -- 'before_item_deadline:<days>'. Anything else is stored for the record and
  -- keeps the duty out of the run.
  due_hours            integer CHECK (due_hours IS NULL OR due_hours > 0),
  due_working_days     integer CHECK (due_working_days IS NULL OR due_working_days > 0),
  due_calendar_rule    text,
  ladder               jsonb NOT NULL,
  enabled              boolean NOT NULL DEFAULT false,
  href                 text,
  note                 text,

  CONSTRAINT hr_duty_definitions_ladder_is_array CHECK (jsonb_typeof(ladder) = 'array'),
  CONSTRAINT hr_duty_definitions_permission_named
    CHECK (owner_rule <> 'permission' OR owner_permission_key IS NOT NULL),
  CONSTRAINT hr_duty_definitions_enabled_needs_due
    CHECK (NOT enabled OR due_hours IS NOT NULL OR due_working_days IS NOT NULL OR due_calendar_rule IS NOT NULL)
);

COMMENT ON TABLE public.hr_duty_definitions IS
  'HR staff harness duty register (20270613101207): one row per HR duty with its owning queue, owner rule, due rule, chase-ladder rungs and enabled flag. Read by the hr-duty-chase cron. Config-table pattern; super admins write, every change audited in hr_duty_definitions_audit.';
COMMENT ON COLUMN public.hr_duty_definitions.ladder IS
  'Array of rungs {key, after_working_days, audience owner|supervisor|hr_head, channel in_app|whatsapp|weekly_list, enabled}. The whatsapp channel is not wired in this build and is skipped.';

-- One active row per duty; history rows stay with is_active = false.
CREATE UNIQUE INDEX IF NOT EXISTS hr_duty_definitions_active_unique
  ON public.hr_duty_definitions (config_key)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.hr_duty_definitions_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id     uuid NOT NULL REFERENCES public.hr_duty_definitions(id),
  changed_at    timestamptz NOT NULL DEFAULT now(),
  changed_by    uuid REFERENCES public.profiles(id),
  old_value     jsonb,
  new_value     jsonb,
  change_reason text
);

CREATE INDEX IF NOT EXISTS idx_hr_duty_definitions_audit_config
  ON public.hr_duty_definitions_audit (config_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.fn_hr_duty_definitions_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_hr_duty_definitions_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.hr_duty_definitions_audit (config_id, changed_by, old_value, new_value, change_reason)
  VALUES (NEW.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW), NEW.change_reason);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS hr_duty_definitions_touch_trg ON public.hr_duty_definitions;
CREATE TRIGGER hr_duty_definitions_touch_trg
  BEFORE UPDATE ON public.hr_duty_definitions
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_duty_definitions_touch();

DROP TRIGGER IF EXISTS hr_duty_definitions_audit_trg ON public.hr_duty_definitions;
CREATE TRIGGER hr_duty_definitions_audit_trg
  AFTER UPDATE ON public.hr_duty_definitions
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_duty_definitions_audit();

-- Cold-read config (read once per cron run), so no pg_notify cache trigger.

ALTER TABLE public.hr_duty_definitions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_duty_definitions_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hr_duty_definitions       FROM anon, PUBLIC;
REVOKE ALL ON public.hr_duty_definitions_audit FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.hr_duty_definitions TO authenticated;
GRANT SELECT ON public.hr_duty_definitions_audit TO authenticated;
GRANT ALL ON public.hr_duty_definitions, public.hr_duty_definitions_audit TO service_role;

DROP POLICY IF EXISTS hr_duty_definitions_read ON public.hr_duty_definitions;
CREATE POLICY hr_duty_definitions_read ON public.hr_duty_definitions
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS hr_duty_definitions_write ON public.hr_duty_definitions;
CREATE POLICY hr_duty_definitions_write ON public.hr_duty_definitions
  FOR ALL USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS hr_duty_definitions_audit_read ON public.hr_duty_definitions_audit;
CREATE POLICY hr_duty_definitions_audit_read ON public.hr_duty_definitions_audit
  FOR SELECT USING (public.is_super_admin() OR public.is_admin());

-- The seed. The standard ladder, verbatim from the design:
--   due -> owner in-app; +1 -> owner WhatsApp (OFF: not wired);
--   +2 -> supervisor in-app; +4 -> HR head weekly list.
DO $seed$
DECLARE
  v_std jsonb := '[
    {"key":"due","after_working_days":0,"audience":"owner","channel":"in_app","enabled":true},
    {"key":"owner_whatsapp","after_working_days":1,"audience":"owner","channel":"whatsapp","enabled":false},
    {"key":"supervisor","after_working_days":2,"audience":"supervisor","channel":"in_app","enabled":true},
    {"key":"hr_head","after_working_days":4,"audience":"hr_head","channel":"weekly_list","enabled":true}
  ]'::jsonb;
  v_off text := 'Seeded DISABLED: no source adapter reads this queue yet. ';
BEGIN
  INSERT INTO public.hr_duty_definitions
    (config_key, display_name, description, area, owning_queue, owner_rule, owner_permission_key,
     due_hours, due_working_days, due_calendar_rule, ladder, enabled, href, note, change_reason)
  VALUES
  -- ── Recruitment ────────────────────────────────────────────────────────────
  ('R1','Act on the recruitment-need signal','Reviewed by the 5th of each month (proposed).','recruitment','Recruitment need signal','permission','hr.recruitment.view',
     NULL,NULL,'monthly_by_day:5',v_std,false,'/hr/intelligence',v_off||'A monthly duty: needs a monthly due rule the engine does not evaluate yet.','Initial seed 20270613101207'),
  ('R2','Create and publish a job','Posted within 3 working days of an approved need (proposed).','recruitment','Job postings','permission','hr.recruitment.create',
     NULL,3,NULL,v_std,false,'/hr/recruitment/jobs/new',v_off||'"Approved need without a job" is not a queryable row today.','Initial seed 20270613101207'),
  ('R3','Triage website applications','First decision within 2 working days (proposed).','recruitment','Website applications','permission','hr.recruitment.view',
     NULL,2,NULL,v_std,false,'/hr/recruitment/applications',v_off,'Initial seed 20270613101207'),
  ('R4','Propose a hire or refer someone','Voluntary; no deadline. The submitter is informed, not chased.','recruitment','Hire proposals','none',NULL,
     NULL,NULL,NULL,v_std,false,'/hr/recruitment/submit','Never chased: a voluntary duty.','Initial seed 20270613101207'),
  ('R5','Approve a candidate at your step','72 hours per step, already stored on every chain step (escalate_after_hours); that stored value wins per item.','recruitment','Recruitment approvals','chain_step',NULL,
     72,NULL,NULL,v_std,true,'/hr/recruitment/approvals','Owner = the approver pinned on the current step, else every holder of the step''s role (matched on the role alone, as My Desk does).','Initial seed 20270613101207'),
  ('R6','Interview and scorecard','Scorecard within 24 hours of the interview (proposed).','recruitment','Interview scorecards','permission','hr.recruitment.view',
     24,NULL,NULL,v_std,false,'/hr/recruitment/interviews',v_off,'Initial seed 20270613101207'),
  ('R7','Agree the salary package','Agreed within 5 working days of approval (proposed).','recruitment','Salary packages','permission','hr.recruitment.packages.approve',
     NULL,5,NULL,v_std,false,'/hr/recruitment',v_off,'Initial seed 20270613101207'),
  ('R8','Issue the offer and record the joining','Offer within 2 days of the package; outcome within 2 days of the joining date (proposed).','recruitment','Offers and joinings','permission','hr.recruitment.edit',
     NULL,2,NULL,v_std,false,'/hr/recruitment',v_off,'Initial seed 20270613101207'),
  ('R9','Onboarding checklist to team member record','Every step done by the joining date (proposed).','recruitment','Onboarding steps','permission','hr.employees.edit',
     NULL,NULL,'before_item_deadline:0',v_std,false,'/hr/onboarding',v_off||'Onboarding step notifications are lane work elsewhere.','Initial seed 20270613101207'),
  -- ── Leave ──────────────────────────────────────────────────────────────────
  ('L1','Approve or reject leave','48 hours, already stored on each chain step, and always before the leave starts.','leave','Leave approvals','chain_step',NULL,
     48,NULL,'before_item_deadline:0',v_std,true,'/hr/leave/approvals','Owner = the approver pinned on the current step, else holders of the step''s role in the applicant''s college. The step''s stored escalate_after_hours wins over due_hours per item.','Initial seed 20270613101207'),
  ('L2','Comp-off and short time off','Decided before the credit expires; due 7 days ahead of expiry.','leave','Comp-off claims','permission','hr.leave.approve',
     NULL,NULL,'before_item_deadline:7',v_std,true,'/hr/leave/compensatory-off','Claims only (source = claim). Short time off has no pending queue of its own yet.','Initial seed 20270613101207'),
  ('L3','Leave eligibility requests','3 working days per step (proposed).','leave','Leave eligibility requests','permission','hr.leave.approve',
     NULL,3,NULL,v_std,false,'/hr/leave/eligibility',v_off,'Initial seed 20270613101207'),
  ('L4','Leave encashment','7 days (proposed).','leave','Leave encashment','permission','hr.leave.encashment.approve',
     168,NULL,NULL,v_std,false,'/hr/leave/encashment',v_off,'Initial seed 20270613101207'),
  ('L5','Balances and the yearly reset','Balances generated 15 days before the leave year (proposed).','leave','Leave balances','permission','hr.leave.balance.manage',
     NULL,NULL,'yearly_before_leave_year:15',v_std,false,'/hr/admin/leave-balances',v_off||'A yearly duty: needs a yearly due rule.','Initial seed 20270613101207'),
  -- ── Attendance ─────────────────────────────────────────────────────────────
  ('A1','Import the biometric report','By the 3rd working day of the month (proposed).','attendance','Biometric import','permission','hr.attendance.override',
     NULL,NULL,'monthly_by_working_day:3',v_std,false,'/hr/attendance/import',v_off||'A monthly duty.','Initial seed 20270613101207'),
  ('A2','Resolve attendance exceptions','Within 3 working days of the import (proposed).','attendance','Attendance exceptions','permission','hr.attendance.override',
     NULL,3,NULL,v_std,false,'/hr/attendance',v_off,'Initial seed 20270613101207'),
  ('A3','Approve regularisation requests','48 hours (proposed), and before the month closes.','attendance','Attendance regularisation approvals','permission','hr.attendance.regularize_approve',
     48,NULL,NULL,v_std,true,'/hr/attendance/regularize/approvals','"Before the month closes" is not enforced here: the month-close date is not on the request row.','Initial seed 20270613101207'),
  ('A4','Close the attendance month','Closed by the 5th working day (proposed).','attendance','Attendance month close','permission','hr.attendance.period.manage',
     NULL,NULL,'monthly_by_working_day:5',v_std,false,'/hr/attendance/close',v_off||'A monthly duty.','Initial seed 20270613101207'),
  ('A5','Work patterns and shift timings','Set before the effective date (proposed).','attendance','Work patterns','permission','hr.shift_timings.manage',
     NULL,NULL,NULL,v_std,false,'/hr/admin/work-patterns',v_off,'Initial seed 20270613101207'),
  ('A6','HR automation rules','Not a daily duty; wire the firing record first.','attendance','HR automation rules','none',NULL,
     NULL,NULL,NULL,v_std,false,'/hr/admin/automation-rules','Never chased.','Initial seed 20270613101207'),
  -- ── Payroll ────────────────────────────────────────────────────────────────
  ('P1','Salary master, bank account and payer','Complete before the joiner''s first payroll month (proposed).','payroll','Salary, bank and payer setup','permission','hr.payroll.salary.manage',
     NULL,NULL,NULL,v_std,false,'/hr/payroll/salaries',v_off,'Initial seed 20270613101207'),
  ('P2','Generate the salary register','Generated within 2 days of month close; signed before any bank file (proposed).','payroll','Salary register','permission','hr.payroll.register.manage',
     NULL,2,NULL,v_std,false,'/hr/payroll/register',v_off||'Waits on decision 4 (who signs the register).','Initial seed 20270613101207'),
  ('P3','Payroll periods and payslips (older path)','Depends on decision 5 (retire or revive).','payroll','Payroll periods','none',NULL,
     NULL,NULL,NULL,v_std,false,'/hr/admin/payroll/periods','Dormant path; never chased until decision 5.','Initial seed 20270613101207'),
  ('P4','Salary revision requests','Principal check within 5 working days (proposed). The Monday digest to the Director already exists.','payroll','Salary revisions','permission','hr.payroll.salary_revision.approve',
     NULL,5,NULL,v_std,false,'/hr/salary-revisions',v_off,'Initial seed 20270613101207'),
  -- ── Staff records ──────────────────────────────────────────────────────────
  ('S1','Team member records and profile completion','New joiners complete within 7 days (proposed).','staff_records','Profile completion','permission','hr.employees.edit',
     NULL,7,NULL,v_std,false,'/hr/employees',v_off,'Initial seed 20270613101207'),
  ('S2','Verify employee documents','Verified within 3 working days (proposed). Expiry reminders already run.','staff_records','Document verification','permission','hr.employees.edit',
     NULL,3,NULL,v_std,true,'/hr/documents/verify','Pending uploads (verification_status = pending).','Initial seed 20270613101207'),
  ('S3','Review photos and chase missing ones','Reviewed within 2 days (proposed). The weekly nudge to people with no photo is not part of this ladder.','staff_records','Photo review','permission','hr.staff_photo.review',
     NULL,2,NULL,v_std,true,'/hr/staff-photos','Pending submissions only; missing photos are a separate weekly nudge, not built here.','Initial seed 20270613101207'),
  ('S4','Print ID cards','Printed within 5 days of photo approval (proposed). Owned outside HR.','staff_records','ID card printing','none',NULL,
     NULL,5,NULL,v_std,false,'/admin/id-cards/print-queue',v_off||'Owned by the registrar / admission side.','Initial seed 20270613101207'),
  -- ── Governance ─────────────────────────────────────────────────────────────
  ('G1','Policies and promotion suggestions','Weekly, already scheduled; the Director confirms.','governance','Policy suggestions','none',NULL,
     NULL,NULL,NULL,v_std,false,'/hr/admin/policies','Already on a weekly detector; not chased here.','Initial seed 20270613101207'),
  ('G2','HR forms and their approvals','3 working days per step unless the form sets its own (proposed).','governance','HR form approvals','chain_step',NULL,
     NULL,3,NULL,v_std,true,'/hr/forms/inbox','Owner = holders of the current step''s required_role in the submission''s college.','Initial seed 20270613101207'),
  ('G3','Memos: issue, acknowledge, resolve','Acknowledge within 3 days (proposed).','governance','Memo acknowledgements','none',NULL,
     NULL,3,NULL,v_std,false,'/hr/admin/memos',v_off||'Memos are another lane''s work.','Initial seed 20270613101207'),
  ('G4','Disciplinary cases','Each stage has a due date set when the case opens (proposed).','governance','Disciplinary cases','none',NULL,
     NULL,NULL,NULL,v_std,false,'/hr/admin/disciplinary',v_off,'Initial seed 20270613101207'),
  ('G5','Termination','3 working days per step (proposed).','governance','Terminations','none',NULL,
     NULL,3,NULL,v_std,false,'/hr/admin/terminations',v_off,'Initial seed 20270613101207'),
  ('G6','Offboarding, retirement and final settlement','Steps before the last working day; settlement within 30 to 45 days (to confirm against labour law).','governance','Offboarding','none',NULL,
     NULL,NULL,'before_item_deadline:0',v_std,false,'/hr/offboarding',v_off,'Initial seed 20270613101207'),
  ('G7','Appraisal cycle','The cycle window dates already in policy.','governance','Appraisal cycle','none',NULL,
     NULL,NULL,NULL,v_std,false,'/hr/performance-reviews',v_off,'Initial seed 20270613101207'),
  ('G8','Promotions','Scored within 14 days (proposed).','governance','Promotion scoring','none',NULL,
     NULL,14,NULL,v_std,false,'/hr/admin/promotions',v_off,'Initial seed 20270613101207'),
  ('G9','Training and development programmes','Attendance within 2 days of a session (proposed).','governance','Training attendance','none',NULL,
     NULL,2,NULL,v_std,false,'/hr/admin/training',v_off,'Initial seed 20270613101207'),
  ('G10','Benefits and assets','Tied to the G6 exit dates.','governance','Benefits and assets','none',NULL,
     NULL,NULL,NULL,v_std,false,'/hr/benefits',v_off,'Initial seed 20270613101207')
  ON CONFLICT (config_key) WHERE is_active = true DO NOTHING;
END
$seed$;

-- ----------------------------------------------------------------------------
-- 2. The ladder ledger — one row per item per rung reached
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_duty_chase_ledger (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_code              text NOT NULL,
  item_id                uuid NOT NULL,
  -- '' for single-step items; the chain step index for leave / recruitment /
  -- forms, so step 2 of a request is a new wait for a new person.
  stage_key              text NOT NULL DEFAULT '',
  step_key               text NOT NULL,
  audience               text NOT NULL CHECK (audience IN ('owner','supervisor','hr_head')),
  item_label             text,
  institution_id         uuid,
  owner_profile_ids      uuid[] NOT NULL DEFAULT '{}',
  supervisor_profile_ids uuid[] NOT NULL DEFAULT '{}',
  notified_profile_ids   uuid[] NOT NULL DEFAULT '{}',
  notification_id        uuid,
  reroute_reason         text CHECK (reroute_reason IS NULL OR reroute_reason IN
                           ('owner_on_leave','no_owner','owners_over_cap','no_supervisor','supervisor_on_leave','blocked')),
  blocked                boolean NOT NULL DEFAULT false,
  due_at                 timestamptz NOT NULL,
  late_working_days      integer NOT NULL DEFAULT 0,
  reached_at             timestamptz NOT NULL DEFAULT now(),
  -- Stamped by the run when the item has left its queue (decided, withdrawn…).
  resolved_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_duty_chase_ledger_one_per_rung UNIQUE (duty_code, item_id, stage_key, step_key)
);

COMMENT ON TABLE public.hr_duty_chase_ledger IS
  'HR chase ladder: one row per item per rung reached (the UNIQUE key is the dedupe — a rung is messaged once). The per-person record: readable only by the item''s owners and their supervisors. Written by the hr-duty-chase cron (service role) only.';

CREATE INDEX IF NOT EXISTS idx_hr_duty_chase_ledger_item
  ON public.hr_duty_chase_ledger (item_id);
CREATE INDEX IF NOT EXISTS idx_hr_duty_chase_ledger_open
  ON public.hr_duty_chase_ledger (duty_code)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_duty_chase_ledger_owners
  ON public.hr_duty_chase_ledger USING gin (owner_profile_ids);
CREATE INDEX IF NOT EXISTS idx_hr_duty_chase_ledger_supervisors
  ON public.hr_duty_chase_ledger USING gin (supervisor_profile_ids);

ALTER TABLE public.hr_duty_chase_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_duty_chase_ledger FROM anon, PUBLIC;
GRANT SELECT ON public.hr_duty_chase_ledger TO authenticated;
GRANT ALL ON public.hr_duty_chase_ledger TO service_role;

-- DELIBERATELY no is_super_admin() / is_admin() clause (a recorded exception
-- to the standard policy shape): guardrail "a person sees their own numbers
-- first; supervisors see their own team; the Director sees desks, never a
-- ranking of people" (design decision 3, recommended option). Desks come from
-- fn_hr_duty_desk_summary(). No INSERT/UPDATE/DELETE policy: only the cron's
-- service role writes, and RLS denies what it does not name.
DROP POLICY IF EXISTS hr_duty_chase_ledger_select ON public.hr_duty_chase_ledger;
CREATE POLICY hr_duty_chase_ledger_select ON public.hr_duty_chase_ledger
  FOR SELECT USING (
    (SELECT auth.uid()) = ANY (owner_profile_ids)
    OR (SELECT auth.uid()) = ANY (supervisor_profile_ids)
  );

-- ----------------------------------------------------------------------------
-- 3. "Blocked, because…" marks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_duty_blocked_marks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_code    text NOT NULL,
  item_id      uuid NOT NULL,
  stage_key    text NOT NULL DEFAULT '',
  -- The rung the item stood on when it was marked; the engine lifts it one above.
  at_step_key  text,
  reason       text NOT NULL CHECK (length(btrim(reason)) >= 10),
  marked_by    uuid NOT NULL REFERENCES public.profiles(id),
  marked_at    timestamptz NOT NULL DEFAULT now(),
  cleared_at   timestamptz,
  cleared_by   uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_duty_blocked_marks IS
  'An owner''s "blocked, because…" answer on a chased HR item. An open mark parks the item (no more nudges to the owner) and lifts it one rung at once; it never counts against the owner. Written through fn_hr_duty_mark_blocked / fn_hr_duty_clear_blocked only.';

CREATE UNIQUE INDEX IF NOT EXISTS hr_duty_blocked_marks_one_open
  ON public.hr_duty_blocked_marks (duty_code, item_id, stage_key)
  WHERE cleared_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_duty_blocked_marks_item
  ON public.hr_duty_blocked_marks (item_id);

ALTER TABLE public.hr_duty_blocked_marks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_duty_blocked_marks FROM anon, PUBLIC;
GRANT SELECT ON public.hr_duty_blocked_marks TO authenticated;
GRANT ALL ON public.hr_duty_blocked_marks TO service_role;

-- The marker, and whoever can see that item's ledger rows (its owners and
-- their supervisors) — the same audience as the ledger, nobody wider.
DROP POLICY IF EXISTS hr_duty_blocked_marks_select ON public.hr_duty_blocked_marks;
CREATE POLICY hr_duty_blocked_marks_select ON public.hr_duty_blocked_marks
  FOR SELECT USING (
    marked_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.hr_duty_chase_ledger l
       WHERE l.duty_code = hr_duty_blocked_marks.duty_code
         AND l.item_id   = hr_duty_blocked_marks.item_id
         AND l.stage_key = hr_duty_blocked_marks.stage_key
    )
  );

-- ----------------------------------------------------------------------------
-- 4. The run log — every run, whatever it decided
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_duty_chase_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date            date NOT NULL,
  iso_week            text NOT NULL,
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  outcome             text NOT NULL CHECK (outcome IN
                        ('sent','nothing_due','switched_off','outside_hours','weekly_off','halted_volume_fuse','failed')),
  master_switch       boolean NOT NULL DEFAULT false,
  fuse_limit          integer NOT NULL DEFAULT 0,
  fuse_blown          boolean NOT NULL DEFAULT false,
  items_seen          integer NOT NULL DEFAULT 0,
  items_due           integer NOT NULL DEFAULT 0,
  planned_deliveries  integer NOT NULL DEFAULT 0,
  sent_deliveries     integer NOT NULL DEFAULT 0,
  weekly_lists_due    boolean NOT NULL DEFAULT false,
  weekly_lists_sent   boolean NOT NULL DEFAULT false,
  -- Counts per duty and per reroute reason, and the switch-off preview.
  -- Never a profile id.
  detail              jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors              text[] NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_duty_chase_runs IS
  'One row per hr-duty-chase run, whatever it decided (sent, switched off, outside hours, weekly off, fuse blown, failed). While the master switch is off, detail.preview holds what the run WOULD have sent per duty.';

CREATE INDEX IF NOT EXISTS idx_hr_duty_chase_runs_date
  ON public.hr_duty_chase_runs (run_date DESC, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_duty_chase_runs_week_sent
  ON public.hr_duty_chase_runs (iso_week)
  WHERE weekly_lists_sent;

ALTER TABLE public.hr_duty_chase_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_duty_chase_runs FROM anon, PUBLIC;
GRANT SELECT ON public.hr_duty_chase_runs TO authenticated;
GRANT ALL ON public.hr_duty_chase_runs TO service_role;

DROP POLICY IF EXISTS hr_duty_chase_runs_select ON public.hr_duty_chase_runs;
CREATE POLICY hr_duty_chase_runs_select ON public.hr_duty_chase_runs
  FOR SELECT USING (public.is_super_admin() OR public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. Functions
-- ----------------------------------------------------------------------------

-- An owner says "blocked, because…". Allowed for someone named as an owner on
-- that item's open ledger rows (so only after the item has reached the ladder).
CREATE OR REPLACE FUNCTION public.fn_hr_duty_mark_blocked(
  p_duty_code text,
  p_item_id   uuid,
  p_stage_key text,
  p_reason    text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_stage text := COALESCE(p_stage_key, '');
  v_step  text;
  v_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to mark an item blocked.' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Say what is blocking it, in a few words.' USING ERRCODE = '22023';
  END IF;

  SELECT l.step_key INTO v_step
    FROM public.hr_duty_chase_ledger l
   WHERE l.duty_code = p_duty_code
     AND l.item_id   = p_item_id
     AND l.stage_key = v_stage
     AND l.resolved_at IS NULL
     AND v_uid = ANY (l.owner_profile_ids)
   ORDER BY l.reached_at DESC
   LIMIT 1;

  IF v_step IS NULL THEN
    RAISE EXCEPTION 'Only the person this item is waiting on can mark it blocked.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.hr_duty_blocked_marks (duty_code, item_id, stage_key, at_step_key, reason, marked_by)
  VALUES (p_duty_code, p_item_id, v_stage, v_step, btrim(p_reason), v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'This item is already marked blocked.' USING ERRCODE = '23505';
END;
$$;

COMMENT ON FUNCTION public.fn_hr_duty_mark_blocked(text, uuid, text, text) IS
  'HR chase ladder: the item''s owner marks it blocked with a reason (>= 10 characters). Parks it and lifts it one rung at the next run. Only an owner on the item''s open ledger rows may mark. Migration 20270613101207.';

-- The marker, or a supervisor on that item, clears the mark once it is unblocked.
CREATE OR REPLACE FUNCTION public.fn_hr_duty_clear_blocked(
  p_duty_code text,
  p_item_id   uuid,
  p_stage_key text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_stage text := COALESCE(p_stage_key, '');
  v_n     integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to clear a blocked mark.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.hr_duty_blocked_marks m
     SET cleared_at = now(),
         cleared_by = v_uid
   WHERE m.duty_code = p_duty_code
     AND m.item_id   = p_item_id
     AND m.stage_key = v_stage
     AND m.cleared_at IS NULL
     AND (
       m.marked_by = v_uid
       OR EXISTS (
         SELECT 1 FROM public.hr_duty_chase_ledger l
          WHERE l.duty_code = m.duty_code
            AND l.item_id   = m.item_id
            AND l.stage_key = m.stage_key
            AND v_uid = ANY (l.supervisor_profile_ids)
       )
     );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Only the person who marked it, or their supervisor, can clear this mark.'
      USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.fn_hr_duty_clear_blocked(text, uuid, text) IS
  'HR chase ladder: clear an open blocked mark. The marker or a supervisor on that item only. Migration 20270613101207.';

-- Late counts per DESK (a duty's queue at one college). No person, no item
-- title, no per-person count: this is the Director's and the HR head's view.
CREATE OR REPLACE FUNCTION public.fn_hr_duty_desk_summary()
RETURNS TABLE (
  duty_code                 text,
  owning_queue              text,
  institution_id            uuid,
  institution_name          text,
  open_items                integer,
  late_items                integer,
  at_supervisor             integer,
  at_hr_head                integer,
  blocked_items             integer,
  oldest_late_working_days  integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR COALESCE(public.fn_is_the_director(), false)
    OR COALESCE(public.user_has_permission('hr.harness.desks.view'), false)
  ) THEN
    RAISE EXCEPTION 'The HR desk summary is for the Director and the HR head.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH latest AS (
    -- One row per open item: the highest rung it has reached.
    SELECT DISTINCT ON (l.duty_code, l.item_id, l.stage_key)
           l.duty_code, l.item_id, l.stage_key, l.institution_id, l.audience,
           l.late_working_days, l.blocked
      FROM public.hr_duty_chase_ledger l
     WHERE l.resolved_at IS NULL
     ORDER BY l.duty_code, l.item_id, l.stage_key, l.reached_at DESC
  ),
  marks AS (
    SELECT m.duty_code, m.item_id, m.stage_key
      FROM public.hr_duty_blocked_marks m
     WHERE m.cleared_at IS NULL
  )
  SELECT x.duty_code,
         d.owning_queue,
         x.institution_id,
         i.name::text,
         count(*)::integer,
         count(*) FILTER (WHERE x.late_working_days >= 1)::integer,
         count(*) FILTER (WHERE x.audience = 'supervisor')::integer,
         count(*) FILTER (WHERE x.audience = 'hr_head')::integer,
         count(*) FILTER (WHERE mk.item_id IS NOT NULL OR x.blocked)::integer,
         COALESCE(max(x.late_working_days), 0)::integer
    FROM latest x
    LEFT JOIN marks mk
      ON mk.duty_code = x.duty_code AND mk.item_id = x.item_id AND mk.stage_key = x.stage_key
    LEFT JOIN public.hr_duty_definitions d
      ON d.config_key = x.duty_code AND d.is_active
    LEFT JOIN public.institutions i
      ON i.id = x.institution_id
   GROUP BY x.duty_code, d.owning_queue, x.institution_id, i.name
   ORDER BY count(*) FILTER (WHERE x.late_working_days >= 1) DESC, x.duty_code;
END;
$$;

COMMENT ON FUNCTION public.fn_hr_duty_desk_summary() IS
  'HR chase ladder: open and late items per desk (duty x college) from the ledger. Desks only — never a person. Super admins, the Director (fn_is_the_director) and holders of hr.harness.desks.view. Migration 20270613101207.';

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_definitions_audit() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_definitions_touch() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_mark_blocked(text, uuid, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_clear_blocked(text, uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_desk_summary() FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_hr_duty_mark_blocked(text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_duty_clear_blocked(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_duty_desk_summary() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Policies — the master switch, the fuse and the guardrail knobs
--    (platform_policies, global). The unique index is an expression
--    (policy_key, scope_type, COALESCE(scope_id, zero-uuid)), so the bare
--    ON CONFLICT DO NOTHING is what matches it.
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
VALUES
  ('hr.harness.chase.enabled', 'global', NULL, 'false'::jsonb,
   'MASTER SWITCH for the HR chase ladder (hr-duty-chase cron). false = every run is a recorded preview that sends nothing. Only a literal true turns it on. Director decision; seeded off.',
   'boolean', true, true),
  ('hr.harness.chase.max_messages_per_run', 'global', NULL, '50'::jsonb,
   'VOLUME FUSE for the HR chase ladder: a run that works out more deliveries than this sends NONE of them and tells the Director alone. A missing or invalid value falls back to 50, never to unlimited.',
   'number', true, true),
  ('hr.harness.chase.max_owners_per_item', 'global', NULL, '5'::jsonb,
   'HR chase ladder: an item whose owner rule resolves to more people than this is a shared queue, not a person; it skips the personal rungs and goes to the HR head''s weekly list.',
   'number', true, true),
  ('hr.harness.chase.working_hours', 'global', NULL, '{"start":"09:00","end":"18:00"}'::jsonb,
   'HR chase ladder: nothing is sent outside these hours (IST). A run that fires outside them records outside_hours and sends nothing.',
   'object', true, true),
  ('hr.harness.chase.weekly_off_days', 'global', NULL, '[0]'::jsonb,
   'HR chase ladder: weekly-off days (0 = Sunday … 6 = Saturday). They pause the clock and no run sends on them. Calendar holidays come from fn_hr_calendar_holiday_dates per college. Seeded Sunday only — confirm whether Saturdays (or second Saturdays) are off.',
   'array', true, true),
  ('hr.harness.chase.digest_weekday', 'global', NULL, '1'::jsonb,
   'HR chase ladder: the weekday (0 = Sunday … 6 = Saturday) the HR head''s late list and the Director''s desk digest go out; a missed day sends on the next run that week. Once per ISO week.',
   'number', true, true),
  ('hr.harness.chase.hr_head_role_keys', 'global', NULL, '["hr_head"]'::jsonb,
   'HR chase ladder: role keys whose holders receive the weekly HR late list.',
   'array', true, true)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7. Schedule — daily 10:15 IST (minute_of_day 615). The route checks the
--    master switch, weekly offs and working hours itself.
-- ----------------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('hr-duty-chase', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 615)
ON CONFLICT (routine_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 8. The loop tower row. Every gate OFF, honestly: it ships switched off, and
--    it measures nothing yet (the on-time rate per duty is build step 5).
-- ----------------------------------------------------------------------------
INSERT INTO public.loop_registry
  (loop_key, name, stack_tier, loop_class, domain, description, gates, routine_id, owner_email)
VALUES
  ('hr-duty-chase', 'HR Duty Chase — the HR harness ladder', 3, 'accountability', 'hr',
   'Every HR duty in hr_duty_definitions carries a due rule; a late item climbs a ladder (owner, then supervisor at +2 working days, then the HR head''s weekly list at +4) and the Director gets one weekly digest of late items per desk, never per person. Ships SWITCHED OFF (platform_policies hr.harness.chase.enabled = false): until the Director flips it, runs only record a preview. It generates nothing live and measures nothing yet, so every gate is off.',
   '{"g":"off","a":"off","m":"off","f":"off"}'::jsonb,
   'hr-duty-chase',
   'director@jkkn.ac.in')
ON CONFLICT (loop_key) DO NOTHING;


NOTIFY pgrst, 'reload schema';
