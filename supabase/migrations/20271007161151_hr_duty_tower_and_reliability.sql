-- ============================================================================
-- Migration: 20271007161151_hr_duty_tower_and_reliability
-- Added: 2026-10-07 — HR staff harness, section "tower-trust".
-- ============================================================================
--
-- WHAT THIS DOES, IN PLAIN WORDS
--   Seven HR duties that can be measured from data already in the system each
--   become a row on the loops tower (/admin/loops). Once a week the system
--   records, per duty, how many items were decided on time. The same facts give
--   every team member their own read-only 12-week record on My Desk ("Only you
--   can see this."). A Director-only switch, shipped OFF, would let the system
--   list "earned trust" suggestions for the Director to note.
--
--   NOTHING HERE CHANGES ANYONE'S PERMISSIONS, ROLES OR APPROVAL CHAINS. No
--   function in this file writes user_roles, custom_roles, profiles,
--   user_institution_access, leave_approval_chains, hr_approval_flows, the leave
--   or recruitment chain JSON, or platform_policies (except fn_hr_trust_switch,
--   which writes its own single switch row). A static test
--   (__tests__/hr/earned-trust-no-permission-writes.test.ts) reads this file
--   and fails if any function body here gains such a statement.
--
--   Nothing is sent. No email, no WhatsApp, no notification: the weekly run
--   only measures.
--
-- THE SEVEN DUTIES (hr_duty_tower_duties, a config-table-pattern table)
--   L1  leave, per approval-chain step  due = the step's escalate_after_hours, else 48 h
--   L2  comp-off claims                  due = the end of (expires_on - 7 days), IST
--   A3  attendance corrections           due = 48 h
--   S2  document uploads                 due = 3 working days
--   S3  photo submissions                due = 2 working days
--   G2  HR form steps (approval_history) due = 3 working days
--   R5  recruitment approval steps       due = the step's escalate_after_hours, else 72 h
--   R5 IS readable on main: hr_recruitment_candidates.approval_chain /
--   current_step / final_decided_at / submitted_at, with the same per-step keys
--   fn_decide_recruitment_candidate (20260909230000) writes. So R5 is seeded
--   measured = true.
--
-- THE PER-STEP CHAIN KEYS (leave and recruitment)
--   The section spec named them acted_at / acted_by. Main does not use those
--   names anywhere: types/hr.ts LeaveApprovalStep, #4154's deadline harness and
--   fn_decide_recruitment_candidate all write decided_at / decided_by / status
--   / escalate_after_hours, plus skipped_at and decisions[].at/.by on quorum
--   steps. This file reads the keys main actually writes; the pg test stub
--   asserts them.
--
-- WHEN A STEP STARTED WAITING
--   Mirrors #4154's stepWaitingSince: the latest decided_at / skipped_at /
--   decisions[].at on any EARLIER step, else when the item was filed. A later
--   step is never judged late for time the step below it spent.
--
-- WHO THE "ACTOR" IS
--   The person who decided the item: decided_by (chain steps), approved_by
--   (comp-off), approver_id (attendance corrections), verified_by (documents),
--   reviewed_by (photos), actor_id (form history). An item still open has no
--   actor: it counts on the desk numbers as late and open once past due, never
--   against a person.
--
-- WHICH ITEMS COUNT AT ALL (fn_hr_duty_item_facts, the final SELECT)
--   Three kinds of item are left out of every number — the desk readings, a
--   team member's own record and the earned-trust suggestions:
--   1. CLOSED WITH NO DECISION. An item is decided only when a PERSON is named
--      as its decider. A closed item with no decider is neither on time nor
--      late, and it is not open either: it is simply not counted. The two
--      system closures on main are S3 (a team member's new photo marks their
--      older pending one 'rejected' with reviewed_at and no reviewed_by) and
--      L2 (the nightly fn_hr_comp_off_reject_expired_claims stamps approved_at
--      and leaves approved_by NULL). Note: every L2 decision made before
--      20270602090000 (trg_hcoc_stamp_decider) also has approved_by NULL, so L2
--      has no countable history from before that trigger.
--   2. NEVER WAITED. A decided item whose decision is not later than the moment
--      it started waiting (done_at <= arrived_at) was never a waiting duty. The
--      case on main: fn_hr_regularize_attendance_day writes an attendance
--      correction that is already 'approved', with approved_at = created_at.
--   3. ABOUT YOURSELF. An item whose decider is its own subject or the person
--      who filed it: the team member's own profile (staff.profile_id of the
--      row's employee / staff) for L1, L2, A3, S2 and S3, plus the filer —
--      created_by (L2), uploaded_by (S2), submitted_by (S3, G2, R5). Nobody
--      earns 'steady' by verifying their own document or approving their own
--      form.
--
-- HOW FAR THE NUMBERS CAN BE TRUSTED (read before relying on S2 or G2)
--   S2's verified_by / verified_at and G2's approval_history are written by the
--   browser, not by the database. RLS lets anyone with hr.employees.edit at
--   that college update a document's verified_by / verified_at, and lets any
--   staff member at that college update a form's approval_history (the person
--   filing a form also writes its first history). So the S2 and G2 numbers are
--   only as trustworthy as those columns: someone with that write access could
--   record a verification or an approval at any time and under any name. The
--   rule above drops an item decided by its own subject or filer; it cannot
--   catch a decider name written by someone else. Who can write the decider
--   columns of the other five duties was not audited here beyond two facts:
--   L2's approved_by is stamped by trg_hcoc_stamp_decider (20270602090000),
--   and an applicant can still edit the chain JSON of their own pending leave
--   (L1).
--
-- WHEN AN L2 CLAIM WAS DECIDED
--   An approver can write a comp-off claim's approved_at directly (hcoc_update),
--   so it could be back-dated. Where the database itself recorded the decision
--   — the hr_decision_emails row that trg_hcoc_zz_decision_email inserts when a
--   person approves or rejects a claim (created_at = server time; signed-in
--   users can only read that table) — that time is used. Only claims with no
--   such row (decided before 20260911200000, or with no signed-in decider) fall
--   back to approved_at, and THAT timing can be back-dated.
--
-- SMALL COLLEGES (fewer than 3 deciders)
--   Each reading stores how many different people decided its items
--   (deciders). A reading with fewer than 3 is close to one person's own
--   number, so it is readable only by the Director list and hr.dashboard.manage
--   holders with access to that college — not by every admin — and the weekly
--   tower measurement records NULL ("no reading") instead of its rate.
--
-- LOAD: MY DESK READS A WEEKLY SNAPSHOT
--   fn_hr_my_reliability runs on every My Desk load, learners included. It
--   returns at once for anyone with no staff row, and otherwise reads the
--   caller's rows from hr_duty_person_records — written by the weekly compute
--   for the 12 weeks ending with the week it measured — instead of scanning the
--   seven sources live. So a person's record is as of the last weekly run.
--
-- NOT HANDLED IN v1 (noted, not fixed)
--   A quorum leave step (several approvers, decisions[]) counts once, for the
--   approver whose decision completed it; the others are not credited.
--   All seven tower rows share one routine (hr-duty-tower), so they share one
--   run status: one failed run marks all seven.
--
-- REVERSED
--   revoked_at is set (leave, comp-off). On a leave it marks only the last
--   decided step (the decision the revocation took back), never the steps
--   below it. A leave CANCELLED by its applicant is not a reversal: the
--   cancellation clone (status 'cancelled') is skipped and the original keeps
--   its decided steps. The other five sources carry no revoke
--   or reopen column on main today, so they never count as reversed in v1.
--
-- BAR, AND THE 4-MISS REVIEW — NO PARALLEL BAR IS BUILT HERE
--   The seven loop_registry rows are born with every charter leg NULL
--   (outcome_metric, baseline_window, counter_metric, ...) — the receipts rule.
--   fn_loop_bar_proposals_generate will therefore file each one as
--   'insufficient' ("no metric on record"), and every weekly measurement records
--   met = NULL ("no numeric bar yet"), which is neither a hit nor a miss. Only
--   when a numeric on-time bar is approved through fn_loop_bar_decide on
--   /admin/loops/charters does the existing 4-miss bar-review arm
--   (fn_loop_record_measurement raises ONE 'bar-review' card: "the bar may be
--   wrong"). This file adds no bar of its own and no loop_edges rows — in
--   particular nothing points at #4152's hr-duty-chase.
--
--   THE REAL PATH TO A BAR (nothing new is built for it):
--   1. Charter first. The existing metaloop-charter-drafts job drafts charter
--      legs for active loops that have a routine and no charter (up to 3 a
--      run), and files them as kind 'charter' proposals. A super admin approves
--      one on /admin/loops/charters (fn_loop_apply_charter_proposal).
--   2. Then a bar. With outcome_metric and baseline_window on record, the next
--      fn_loop_bar_proposals_generate run closes the 'insufficient' row as
--      superseded and files a kind 'bar', status 'proposed' row.
--   3. Approve it with fn_loop_bar_decide, typing a plain number from 0 to 100
--      in the bar box: the tower records each week's on-time rate as a
--      percentage (0-100), and a non-'threshold' bar is a floor (at or above
--      clears it). fn_loop_bar_decide refuses any row that is not 'proposed'
--      and checks is_super_admin(), not the Director list.
--   Until step 1 is done, the Director cannot approve a bar for these seven
--   rows: the generator files them 'insufficient' and the decide function
--   refuses that status.
--
-- Default taken, overrule here: each of the seven measurable HR duties gets its own row on the loops tower (7 new cards on /admin/loops), as the design describes. The alternative is a single 'HR duties' row with the average.
-- Default taken, overrule here: the seven tower rows are owned by director@jkkn.ac.in, the address existing seeds use. They can be reassigned on /admin/loops with no deploy.
-- Default taken, overrule here: no bar is set by the machine. Each row needs its charter approved first on the existing charters page, then a plain 0-100 on-time percentage bar (THE REAL PATH TO A BAR, above); until then readings are recorded but count as neither hit nor miss, and the Director cannot approve a bar.
-- Default taken, overrule here: v1 working days skip Sundays only. College holidays are not paused, unlike the chase ladder in #4152.
-- Default taken, overrule here: the reliability signal ('steady' means at least 10 items, at least 90% on time and at most 5% reversed over 12 weeks) is shown only to the person it is about, on their own My Desk. The Director and HR see per-duty, per-college numbers, never per person.
-- Default taken, overrule here: the earned-trust suggestions switch ships OFF and only the Director can turn it on. When on, it lists people who have been steady for 12 weeks. Noting a suggestion changes nothing in the system; any lighter check would be a separate change the Director makes by hand.
-- Default taken, overrule here: supervisors do not see their team's reliability in this build, because reporting lines are empty for all 543 team members.
-- Default taken, overrule here: the leave and recruitment chain keys read are decided_at / decided_by (what main writes), not the acted_at / acted_by the section spec named.
-- Default taken, overrule here: a week's reading counts the items whose due time fell in that week (Monday to Sunday, IST). An item still open is counted only once it is past due.
-- Default taken, overrule here: "steady for 12 consecutive weeks" means the 12-week signal was 'steady' at each of the last 12 weekly checkpoints.
-- Default taken, overrule here: an item closed with no person named as its decider, an item decided no later than it started waiting, and an item decided by its own subject or filer are left out of every number (desk readings included), not counted as late or on time.
-- Default taken, overrule here: the three 'steady' thresholds and the suggestions switch can be changed only by the Director list (a guard trigger on platform_policies), and My Desk reads the thresholds from those rows rather than printing 10 / 90% / 5%.
-- Default taken, overrule here: a suggestion carries only "steady for 12 weeks" and the person's name; the Director never sees that person's item count, on-time rate or reversed rate.
-- Default taken, overrule here: when an approved leave is revoked, the reversal counts against the step that settled it (the last decided step), not the earlier steps in the chain. A leave the applicant cancels is not a reversal.
--
-- SECURITY
--   Every SECURITY DEFINER function sets search_path and is REVOKEd from anon
--   and PUBLIC. The facts, compute and suggestion-generate functions are also
--   REVOKEd from authenticated (service role only). The four hr.harness.trust.*
--   policy rows are guarded by trg_guard_hr_trust_policy_writes: only the
--   Director list (or service_role / a migration) may change them.
-- ci:allow-secdef-authenticated fn_hr_my_reliability is callable by every signed-in team member by design: it takes no user parameter and filters to actor_id = auth.uid(), so a caller can only ever read their own numbers. fn_hr_trust_switch and fn_hr_trust_suggestion_decide refuse anyone for whom public.fn_is_the_director() IS NOT TRUE (the named Director list, which a non-Director super admin is not on).
--
-- No BEGIN/COMMIT (rollback-rehearsal safe). NOT applied by merging.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (a) Config table: the seven duties on the tower
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_duty_tower_duties (
  -- shared config mixin (docs/architecture/config-table-pattern.md, verbatim)
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
  duty_code                 text NOT NULL CHECK (duty_code ~ '^(R[1-9]|L[1-5]|A[1-6]|P[1-4]|S[1-4]|G([1-9]|10))$'),
  loop_key                  text NOT NULL UNIQUE,
  -- Due rule: hours, or working days (Sundays skipped), or N days before the
  -- item's own deadline (comp-off expires_on). A chain step's stored
  -- escalate_after_hours wins over due_hours for L1 and R5.
  due_hours                 integer CHECK (due_hours IS NULL OR due_hours > 0),
  due_working_days          integer CHECK (due_working_days IS NULL OR due_working_days > 0),
  due_days_before_deadline  integer CHECK (due_days_before_deadline IS NULL OR due_days_before_deadline >= 0),
  source                    text NOT NULL,
  measured                  boolean NOT NULL DEFAULT true,

  CONSTRAINT hr_duty_tower_duties_key_is_code CHECK (config_key = duty_code),
  CONSTRAINT hr_duty_tower_duties_has_due_rule
    CHECK (NOT measured OR due_hours IS NOT NULL OR due_working_days IS NOT NULL OR due_days_before_deadline IS NOT NULL)
);

COMMENT ON TABLE public.hr_duty_tower_duties IS
  'HR staff harness (20271007161151): the seven measurable HR duties shown on the loops tower, with each duty''s due rule. Read by fn_hr_duty_item_facts. Config-table pattern; only the Director list writes (trg_guard_hr_duty_tower_duties_writes), every insert and change audited in hr_duty_tower_duties_audit. Codes match #4152''s hr_duty_definitions.config_key; once that lands, due rules should be read from there.';

CREATE UNIQUE INDEX IF NOT EXISTS hr_duty_tower_duties_active_unique
  ON public.hr_duty_tower_duties (config_key)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.hr_duty_tower_duties_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id     uuid NOT NULL REFERENCES public.hr_duty_tower_duties(id),
  changed_at    timestamptz NOT NULL DEFAULT now(),
  changed_by    uuid REFERENCES public.profiles(id),
  old_value     jsonb,
  new_value     jsonb,
  change_reason text
);

CREATE INDEX IF NOT EXISTS idx_hr_duty_tower_duties_audit_config
  ON public.hr_duty_tower_duties_audit (config_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.fn_hr_duty_tower_duties_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_tower_duties_touch() FROM anon, PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.fn_hr_duty_tower_duties_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.hr_duty_tower_duties_audit (config_id, changed_by, old_value, new_value, change_reason)
  VALUES (NEW.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW), NEW.change_reason);
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_tower_duties_audit() FROM anon, PUBLIC, authenticated;

DROP TRIGGER IF EXISTS hr_duty_tower_duties_touch_trg ON public.hr_duty_tower_duties;
CREATE TRIGGER hr_duty_tower_duties_touch_trg
  BEFORE UPDATE ON public.hr_duty_tower_duties
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_duty_tower_duties_touch();

DROP TRIGGER IF EXISTS hr_duty_tower_duties_audit_trg ON public.hr_duty_tower_duties;
CREATE TRIGGER hr_duty_tower_duties_audit_trg
  AFTER INSERT OR UPDATE ON public.hr_duty_tower_duties
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_duty_tower_duties_audit();

-- Who may add, change or remove a duty or its due rule: the Director list only
-- (plus service_role and a database session with no JWT — a migration). The
-- same shape as fn_guard_hr_trust_policy_writes below. RLS still requires a
-- super admin; this trigger narrows that to the Director list. Fails closed.
CREATE OR REPLACE FUNCTION public.fn_guard_hr_duty_tower_duties_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_role text := auth.role();
BEGIN
  IF v_role IS NOT NULL AND v_role IS DISTINCT FROM 'service_role' THEN
    IF v_role IS DISTINCT FROM 'authenticated' THEN
      RAISE EXCEPTION 'Only the Director can change the HR duty due rules.'
        USING ERRCODE = '42501';
    END IF;
    IF public.fn_is_the_director() IS NOT TRUE THEN
      RAISE EXCEPTION 'Only the Director can change the HR duty due rules.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_hr_duty_tower_duties_writes() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_hr_duty_tower_duties_writes ON public.hr_duty_tower_duties;
CREATE TRIGGER trg_guard_hr_duty_tower_duties_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.hr_duty_tower_duties
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_hr_duty_tower_duties_writes();

-- Cold-read config (read once per weekly run), so no pg_notify cache trigger.

ALTER TABLE public.hr_duty_tower_duties       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_duty_tower_duties_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hr_duty_tower_duties       FROM anon, PUBLIC;
REVOKE ALL ON public.hr_duty_tower_duties_audit FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.hr_duty_tower_duties TO authenticated;
GRANT SELECT ON public.hr_duty_tower_duties_audit TO authenticated;
GRANT ALL ON public.hr_duty_tower_duties, public.hr_duty_tower_duties_audit TO service_role;

DROP POLICY IF EXISTS hr_duty_tower_duties_read ON public.hr_duty_tower_duties;
CREATE POLICY hr_duty_tower_duties_read ON public.hr_duty_tower_duties
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS hr_duty_tower_duties_write ON public.hr_duty_tower_duties;
CREATE POLICY hr_duty_tower_duties_write ON public.hr_duty_tower_duties
  FOR ALL USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS hr_duty_tower_duties_audit_read ON public.hr_duty_tower_duties_audit;
CREATE POLICY hr_duty_tower_duties_audit_read ON public.hr_duty_tower_duties_audit
  FOR SELECT USING (public.is_super_admin() OR public.is_admin());

INSERT INTO public.hr_duty_tower_duties
  (config_key, duty_code, display_name, description, loop_key,
   due_hours, due_working_days, due_days_before_deadline, source, measured, change_reason)
VALUES
  ('L1','L1','Approve or reject a team member''s leave at your step',
   'One item per decided approval-chain step. Due: the step''s own escalate_after_hours, else these hours.',
   'hr-duty-l1', 48, NULL, NULL, 'hr_leave_applications.approval_chain', true, 'Initial seed 20271007161151'),
  ('L2','L2','Decide a team member''s comp-off claim before it expires',
   'Comp-off claims (source = claim). Due: the end of the day this many days before expires_on (IST).',
   'hr-duty-l2', NULL, NULL, 7, 'hr_comp_off_credits', true, 'Initial seed 20271007161151'),
  ('A3','A3','Decide a team member''s attendance correction',
   'Attendance corrections waiting on an approver.',
   'hr-duty-a3', 48, NULL, NULL, 'hr_attendance_regularizations', true, 'Initial seed 20271007161151'),
  ('S2','S2','Verify a document a team member uploaded',
   'Uploaded documents waiting for verification. Working days skip Sundays only (v1).',
   'hr-duty-s2', NULL, 3, NULL, 'hr_employee_documents', true, 'Initial seed 20271007161151'),
  ('S3','S3','Review a photo a team member submitted',
   'Photo submissions waiting for review. Working days skip Sundays only (v1).',
   'hr-duty-s3', NULL, 2, NULL, 'hr_staff_photo_submissions', true, 'Initial seed 20271007161151'),
  ('G2','G2','Act on an HR form at your step',
   'One item per approve or reject entry in hr_form_submissions.approval_history. Working days skip Sundays only (v1).',
   'hr-duty-g2', NULL, 3, NULL, 'hr_form_submissions.approval_history', true, 'Initial seed 20271007161151'),
  ('R5','R5','Approve a candidate at your step',
   'One item per decided recruitment approval-chain step. Due: the step''s own escalate_after_hours, else these hours.',
   'hr-duty-r5', 72, NULL, NULL, 'hr_recruitment_candidates.approval_chain', true, 'Initial seed 20271007161151')
ON CONFLICT (config_key) WHERE is_active = true DO NOTHING;


-- ----------------------------------------------------------------------------
-- Helpers (plain, not SECURITY DEFINER; only the definer functions below call them)
-- ----------------------------------------------------------------------------

-- p_days working days after p_from. v1: Sundays (IST) are skipped, holidays are
-- not (a known difference from #4152's holiday-aware clock).
CREATE OR REPLACE FUNCTION public.fn_hr_duty_tower_add_working_days(p_from timestamptz, p_days integer)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_at   timestamptz := p_from;
  v_left integer := p_days;
BEGIN
  IF p_from IS NULL OR p_days IS NULL THEN
    RETURN NULL;
  END IF;
  WHILE v_left > 0 LOOP
    v_at := v_at + interval '1 day';
    IF extract(dow FROM (v_at AT TIME ZONE 'Asia/Kolkata')) <> 0 THEN
      v_left := v_left - 1;
    END IF;
  END LOOP;
  RETURN v_at;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_tower_add_working_days(timestamptz, integer) FROM anon, PUBLIC, authenticated;

-- A timestamp read out of chain JSON; NULL (never an error) for a malformed one,
-- so one bad legacy row cannot fail the whole weekly reading.
CREATE OR REPLACE FUNCTION public.fn_hr_duty_tower_ts(p text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN
    RETURN NULL;
  END IF;
  RETURN p::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_tower_ts(text) FROM anon, PUBLIC, authenticated;

-- The latest moment anything happened on an EARLIER step of a chain (a decision,
-- a skip, any quorum decision), else p_filed. Mirrors #4154's stepWaitingSince.
CREATE OR REPLACE FUNCTION public.fn_hr_duty_tower_step_arrived(p_chain jsonb, p_idx integer, p_filed timestamptz)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT GREATEST(p_filed, (
    SELECT max(GREATEST(
             public.fn_hr_duty_tower_ts(e.step ->> 'decided_at'),
             public.fn_hr_duty_tower_ts(e.step ->> 'skipped_at'),
             (SELECT max(public.fn_hr_duty_tower_ts(d ->> 'at'))
                FROM jsonb_array_elements(
                       CASE WHEN jsonb_typeof(e.step -> 'decisions') = 'array'
                            THEN e.step -> 'decisions' ELSE '[]'::jsonb END) d)))
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(p_chain) = 'array' THEN p_chain ELSE '[]'::jsonb END)
           WITH ORDINALITY e(step, ord)
     WHERE e.ord - 1 < p_idx))
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_tower_step_arrived(jsonb, integer, timestamptz) FROM anon, PUBLIC, authenticated;


-- ----------------------------------------------------------------------------
-- (b) The item facts — one row per decided item, plus open items past due
-- ----------------------------------------------------------------------------
-- An item belongs to the window its DUE time falls in: p_from <= due_at < p_to.
-- A NULL done_at is excluded unless the item is already past due_at (then it
-- counts as late and open). on_time = decided at or before the due time.
CREATE OR REPLACE FUNCTION public.fn_hr_duty_item_facts(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  duty_code      text,
  item_table     text,
  item_id        uuid,
  institution_id uuid,
  actor_id       uuid,
  arrived_at     timestamptz,
  due_at         timestamptz,
  done_at        timestamptz,
  on_time        boolean,
  reversed       boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH cfg AS (
    SELECT d.duty_code, d.due_hours, d.due_working_days, d.due_days_before_deadline
      FROM public.hr_duty_tower_duties d
     WHERE d.is_active AND d.measured
  ),
  -- L1: leave approval-chain steps -----------------------------------------
  l1_steps AS (
    SELECT a.id, st.institution_id, st.profile_id AS subject_id, a.revoked_at, a.status AS app_status,
           a.final_decided_at, a.superseded_by, a.current_step, a.created_at,
           a.approval_chain AS chain, (e.ord - 1)::int AS idx, e.step,
           max((e.ord - 1)::int) FILTER (WHERE e.step ->> 'status' IN ('approved','rejected','revoked'))
             OVER (PARTITION BY a.id) AS last_decided_idx
      FROM public.hr_leave_applications a
      LEFT JOIN public.staff st ON st.id = a.employee_id
      CROSS JOIN LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(a.approval_chain) = 'array' THEN a.approval_chain ELSE '[]'::jsonb END)
           WITH ORDINALITY e(step, ord)
     -- cancelApplication clones an approved row as status 'cancelled' with the
     -- whole decided chain copied; counting the clone would count every step twice.
     WHERE a.status <> 'cancelled'
  ),
  l1 AS (
    SELECT 'L1'::text AS duty_code, 'hr_leave_applications'::text AS item_table, s.id AS item_id,
           s.institution_id,
           CASE WHEN (s.step ->> 'decided_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (s.step ->> 'decided_by')::uuid END AS actor_id,
           w.arrived AS arrived_at,
           w.arrived + make_interval(hours => COALESCE(
             CASE WHEN (s.step ->> 'escalate_after_hours') ~ '^[0-9]+$'
                       AND (s.step ->> 'escalate_after_hours')::int > 0
                  THEN (s.step ->> 'escalate_after_hours')::int END,
             c.due_hours)) AS due_at,
           -- 'revoked' = an approval later taken back (applyRevocation keeps the
           -- step's decided_at / decided_by): still a decision, made at decided_at.
           CASE WHEN s.step ->> 'status' IN ('approved','rejected','revoked')
                THEN public.fn_hr_duty_tower_ts(s.step ->> 'decided_at') END AS done_at,
           -- the revocation reverses the decision that settled the leave (the
           -- last decided step), not the recommendations below it
           (s.revoked_at IS NOT NULL AND s.idx = s.last_decided_idx) AS reversed,
           ARRAY[s.subject_id] AS subject_ids
      FROM l1_steps s
      JOIN cfg c ON c.duty_code = 'L1'
      CROSS JOIN LATERAL (SELECT public.fn_hr_duty_tower_step_arrived(s.chain, s.idx, s.created_at) AS arrived) w
     WHERE (s.step ->> 'status' IN ('approved','rejected','revoked')
            AND public.fn_hr_duty_tower_ts(s.step ->> 'decided_at') IS NOT NULL)
        OR (s.idx = s.current_step
            AND COALESCE(s.step ->> 'status', 'pending') = 'pending'
            AND s.app_status IN ('pending','escalated')
            AND s.final_decided_at IS NULL
            AND s.superseded_by IS NULL)
  ),
  -- L2: comp-off claims ----------------------------------------------------
  l2 AS (
    SELECT 'L2'::text, 'hr_comp_off_credits'::text, k.id, st.institution_id,
           k.approved_by,
           k.created_at,
           ((k.expires_on - c.due_days_before_deadline + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'),
           -- the server's own record of the decision when there is one;
           -- approved_at (writable by approvers) only as a fallback
           COALESCE((SELECT min(e.created_at) FROM public.hr_decision_emails e
                      WHERE e.comp_off_credit_id = k.id
                        AND e.decision IN ('approved','rejected')),
                    k.approved_at),
           (k.revoked_at IS NOT NULL),
           ARRAY[st.profile_id, k.created_by]
      FROM public.hr_comp_off_credits k
      JOIN cfg c ON c.duty_code = 'L2'
      LEFT JOIN public.staff st ON st.id = k.employee_id
     WHERE k.source = 'claim'
       AND (k.approved_at IS NOT NULL OR k.status = 'pending')
  ),
  -- A3: attendance corrections ---------------------------------------------
  a3 AS (
    SELECT 'A3'::text, 'hr_attendance_regularizations'::text, r.id, st.institution_id,
           r.approver_id,
           r.created_at,
           r.created_at + make_interval(hours => c.due_hours),
           CASE WHEN r.status IN ('approved','rejected')
                THEN COALESCE(r.approved_at, r.updated_at) END,
           false,
           ARRAY[st.profile_id]
      FROM public.hr_attendance_regularizations r
      JOIN cfg c ON c.duty_code = 'A3'
      LEFT JOIN public.staff st ON st.id = r.employee_id
     WHERE r.status IN ('approved','rejected','pending')
  ),
  -- S2: document verification ----------------------------------------------
  s2 AS (
    SELECT 'S2'::text, 'hr_employee_documents'::text, d.id, d.institution_id,
           d.verified_by,
           d.uploaded_at,
           public.fn_hr_duty_tower_add_working_days(d.uploaded_at, c.due_working_days),
           CASE WHEN d.verification_status <> 'pending' THEN d.verified_at END,
           false,
           ARRAY[st.profile_id, d.uploaded_by]
      FROM public.hr_employee_documents d
      JOIN cfg c ON c.duty_code = 'S2'
      LEFT JOIN public.staff st ON st.id = d.staff_id
     WHERE d.verification_status = 'pending'
        OR (d.verification_status <> 'pending' AND d.verified_at IS NOT NULL)
  ),
  -- S3: photo review -------------------------------------------------------
  s3 AS (
    SELECT 'S3'::text, 'hr_staff_photo_submissions'::text, p.id, p.institution_id,
           p.reviewed_by,
           p.submitted_at,
           public.fn_hr_duty_tower_add_working_days(p.submitted_at, c.due_working_days),
           CASE WHEN p.status <> 'pending' THEN p.reviewed_at END,
           false,
           ARRAY[st.profile_id, p.submitted_by]
      FROM public.hr_staff_photo_submissions p
      JOIN cfg c ON c.duty_code = 'S3'
      LEFT JOIN public.staff st ON st.id = p.staff_id
     WHERE p.status = 'pending'
        OR (p.status <> 'pending' AND p.reviewed_at IS NOT NULL)
  ),
  -- G2: HR form steps ------------------------------------------------------
  g2_hist AS (
    SELECT f.id, f.institution_id, f.submitted_by, f.status, f.created_at, h.entry, h.ord,
           lag(public.fn_hr_duty_tower_ts(h.entry ->> 'at')) OVER (PARTITION BY f.id ORDER BY h.ord) AS prev_at
      FROM public.hr_form_submissions f
      CROSS JOIN LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(f.approval_history) = 'array' THEN f.approval_history ELSE '[]'::jsonb END)
           WITH ORDINALITY h(entry, ord)
  ),
  g2 AS (
    -- decided steps
    SELECT 'G2'::text, 'hr_form_submissions'::text, g.id, g.institution_id,
           CASE WHEN (g.entry ->> 'actor_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (g.entry ->> 'actor_id')::uuid END,
           COALESCE(g.prev_at, g.created_at),
           public.fn_hr_duty_tower_add_working_days(COALESCE(g.prev_at, g.created_at), c.due_working_days),
           public.fn_hr_duty_tower_ts(g.entry ->> 'at'),
           false,
           ARRAY[g.submitted_by]
      FROM g2_hist g
      JOIN cfg c ON c.duty_code = 'G2'
     WHERE g.entry ->> 'action' IN ('approve','reject')
       AND public.fn_hr_duty_tower_ts(g.entry ->> 'at') IS NOT NULL
    UNION ALL
    -- the step still waiting
    SELECT 'G2'::text, 'hr_form_submissions'::text, f.id, f.institution_id,
           NULL::uuid,
           w.since,
           public.fn_hr_duty_tower_add_working_days(w.since, c.due_working_days),
           NULL::timestamptz,
           false,
           ARRAY[f.submitted_by]
      FROM public.hr_form_submissions f
      JOIN cfg c ON c.duty_code = 'G2'
      CROSS JOIN LATERAL (
        SELECT COALESCE((SELECT max(public.fn_hr_duty_tower_ts(x ->> 'at'))
                           FROM jsonb_array_elements(
                                  CASE WHEN jsonb_typeof(f.approval_history) = 'array'
                                       THEN f.approval_history ELSE '[]'::jsonb END) x),
                        f.created_at) AS since) w
     WHERE f.status IN ('submitted','in_review')
  ),
  -- R5: recruitment approval-chain steps ------------------------------------
  r5_steps AS (
    SELECT rc.id, rc.institution_id, rc.submitted_by, rc.status AS app_status, rc.final_decided_at,
           rc.current_step, rc.submitted_at, rc.approval_chain AS chain,
           (e.ord - 1)::int AS idx, e.step
      FROM public.hr_recruitment_candidates rc
      CROSS JOIN LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(rc.approval_chain) = 'array' THEN rc.approval_chain ELSE '[]'::jsonb END)
           WITH ORDINALITY e(step, ord)
  ),
  r5 AS (
    SELECT 'R5'::text, 'hr_recruitment_candidates'::text, s.id, s.institution_id,
           CASE WHEN (s.step ->> 'decided_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (s.step ->> 'decided_by')::uuid END,
           w.arrived,
           w.arrived + make_interval(hours => COALESCE(
             CASE WHEN (s.step ->> 'escalate_after_hours') ~ '^[0-9]+$'
                       AND (s.step ->> 'escalate_after_hours')::int > 0
                  THEN (s.step ->> 'escalate_after_hours')::int END,
             c.due_hours)),
           CASE WHEN s.step ->> 'status' IN ('approved','rejected')
                THEN public.fn_hr_duty_tower_ts(s.step ->> 'decided_at') END,
           false,
           ARRAY[s.submitted_by]
      FROM r5_steps s
      JOIN cfg c ON c.duty_code = 'R5'
      CROSS JOIN LATERAL (SELECT public.fn_hr_duty_tower_step_arrived(s.chain, s.idx, s.submitted_at) AS arrived) w
     WHERE (s.step ->> 'status' IN ('approved','rejected')
            AND public.fn_hr_duty_tower_ts(s.step ->> 'decided_at') IS NOT NULL)
        OR (s.idx = s.current_step
            AND COALESCE(s.step ->> 'status', 'pending') = 'pending'
            AND s.app_status IN ('submitted','pending_approval')
            AND s.final_decided_at IS NULL)
  ),
  all_facts AS (
    SELECT * FROM l1
    UNION ALL SELECT * FROM l2
    UNION ALL SELECT * FROM a3
    UNION ALL SELECT * FROM s2
    UNION ALL SELECT * FROM s3
    UNION ALL SELECT * FROM g2
    UNION ALL SELECT * FROM r5
  )
  SELECT f.duty_code, f.item_table, f.item_id, f.institution_id,
         -- an open item has no decider: it never counts against a person
         CASE WHEN f.done_at IS NOT NULL THEN f.actor_id END,
         f.arrived_at, f.due_at, f.done_at,
         (f.done_at IS NOT NULL AND f.done_at <= f.due_at),
         COALESCE(f.reversed, false)
    FROM all_facts f
   WHERE f.due_at IS NOT NULL
     AND f.due_at >= p_from
     AND f.due_at <  p_to
     AND (f.done_at IS NOT NULL OR f.due_at < now())
     -- closed with no decision: a closed item with no person named as its
     -- decider (S3 resubmission, L2 nightly auto-reject) is not counted
     AND NOT (f.done_at IS NOT NULL AND f.actor_id IS NULL)
     -- never waited: decided no later than it started waiting (A3 direct
     -- corrections are written already approved)
     AND NOT (f.done_at IS NOT NULL AND f.done_at <= f.arrived_at)
     -- about yourself: the decider is the item's own subject or its filer
     AND NOT COALESCE(f.actor_id = ANY (f.subject_ids), false);
END;
$$;

COMMENT ON FUNCTION public.fn_hr_duty_item_facts(timestamptz, timestamptz) IS
  'HR staff harness (20271007161151): one row per HR duty item whose due time falls in [p_from, p_to) — items a person decided, plus open items already past due (late and open). Left out: items closed with no person named as decider, items decided no later than they started waiting, and items whose decider is their own subject or filer. actor_id = the person who decided it (NULL while open). Service role only; fn_hr_duty_tower_compute and fn_hr_my_reliability read it.';

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_item_facts(timestamptz, timestamptz) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_duty_item_facts(timestamptz, timestamptz) TO service_role;


-- ----------------------------------------------------------------------------
-- (c) Weekly readings — desk numbers per duty, per college and all colleges
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_duty_tower_readings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_code      text NOT NULL CHECK (duty_code ~ '^(R[1-9]|L[1-5]|A[1-6]|P[1-4]|S[1-4]|G([1-9]|10))$'),
  institution_id uuid,            -- NULL = all colleges
  week_start     date NOT NULL,
  items          integer NOT NULL DEFAULT 0,
  on_time        integer NOT NULL DEFAULT 0,
  late           integer NOT NULL DEFAULT 0,
  open_overdue   integer NOT NULL DEFAULT 0,
  reversed       integer NOT NULL DEFAULT 0,
  on_time_rate   numeric,         -- NULL when there were no items
  reversal_rate  numeric,
  -- how many different people decided this reading's items; under 3, the
  -- reading is close to one person's number (see SMALL COLLEGES)
  deciders       integer NOT NULL DEFAULT 0,
  computed_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_duty_tower_readings IS
  'HR staff harness (20271007161151): one weekly reading per HR duty, per college (institution_id) and for all colleges (institution_id NULL). Desk numbers only — never per person. Written only by fn_hr_duty_tower_compute.';

CREATE UNIQUE INDEX IF NOT EXISTS hr_duty_tower_readings_unique
  ON public.hr_duty_tower_readings
     (duty_code, COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid), week_start);

CREATE INDEX IF NOT EXISTS idx_hr_duty_tower_readings_week
  ON public.hr_duty_tower_readings (week_start DESC, duty_code);

ALTER TABLE public.hr_duty_tower_readings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_duty_tower_readings FROM anon, PUBLIC, authenticated;
GRANT SELECT ON public.hr_duty_tower_readings TO authenticated;
GRANT ALL ON public.hr_duty_tower_readings TO service_role;

DROP POLICY IF EXISTS hr_duty_tower_readings_select ON public.hr_duty_tower_readings;
CREATE POLICY hr_duty_tower_readings_select ON public.hr_duty_tower_readings
  FOR SELECT USING (
    public.fn_is_the_director() IS TRUE
    OR (public.user_has_permission('hr.dashboard.manage')
        AND (institution_id IS NULL OR public.role_has_institution_access(institution_id)))
    -- every other admin sees only readings with at least 3 deciders
    OR (deciders >= 3 AND (public.is_super_admin() OR public.is_admin()))
  );


-- A person's own 12-week numbers per duty, as of each weekly run. PRIVATE: RLS
-- on and no policy, no grant to authenticated — not the Director, not HR.
-- Read only through fn_hr_my_reliability (the caller's own rows).
CREATE TABLE IF NOT EXISTS public.hr_duty_person_records (
  user_id     uuid NOT NULL,
  duty_code   text NOT NULL CHECK (duty_code ~ '^(R[1-9]|L[1-5]|A[1-6]|P[1-4]|S[1-4]|G([1-9]|10))$'),
  week_start  date NOT NULL,
  items       integer NOT NULL,
  on_time     integer NOT NULL,
  reversed    integer NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_start, duty_code)
);

COMMENT ON TABLE public.hr_duty_person_records IS
  'HR staff harness (20271007161151): each person''s own items / on time / reversed per duty over the 12 weeks ending week_start''s week. Written only by fn_hr_duty_tower_compute; read only by fn_hr_my_reliability for auth.uid(). No policy: nobody else can read it.';

CREATE INDEX IF NOT EXISTS idx_hr_duty_person_records_week
  ON public.hr_duty_person_records (week_start DESC);

ALTER TABLE public.hr_duty_person_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_duty_person_records FROM anon, PUBLIC, authenticated;
GRANT ALL ON public.hr_duty_person_records TO service_role;


-- ----------------------------------------------------------------------------
-- (d) The weekly compute
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_duty_tower_compute(p_week_start date)
RETURNS TABLE (duty_code text, items integer, on_time_rate numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_from timestamptz;
  v_to   timestamptz;
BEGIN
  IF p_week_start IS NULL THEN
    RAISE EXCEPTION 'fn_hr_duty_tower_compute: p_week_start is required';
  END IF;
  v_from := p_week_start::timestamp AT TIME ZONE 'Asia/Kolkata';
  v_to   := (p_week_start + 7)::timestamp AT TIME ZONE 'Asia/Kolkata';

  CREATE TEMP TABLE IF NOT EXISTS _hr_duty_tower_facts ON COMMIT DROP AS
    SELECT * FROM public.fn_hr_duty_item_facts(v_from, v_to) LIMIT 0;
  TRUNCATE _hr_duty_tower_facts;
  INSERT INTO _hr_duty_tower_facts SELECT * FROM public.fn_hr_duty_item_facts(v_from, v_to);

  -- A college that had items in an earlier compute of this week but has none
  -- now keeps no stale row.
  DELETE FROM public.hr_duty_tower_readings r
   WHERE r.week_start = p_week_start
     AND r.institution_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM _hr_duty_tower_facts f
                      WHERE f.duty_code = r.duty_code AND f.institution_id = r.institution_id);

  INSERT INTO public.hr_duty_tower_readings
    (duty_code, institution_id, week_start, items, on_time, late, open_overdue, reversed,
     on_time_rate, reversal_rate, deciders, computed_at)
  SELECT g.duty_code, g.institution_id, p_week_start, g.items, g.on_time, g.late, g.open_overdue, g.reversed,
         CASE WHEN g.items > 0 THEN round(g.on_time::numeric / g.items, 4) END,
         CASE WHEN g.items > 0 THEN round(g.reversed::numeric / g.items, 4) END,
         g.deciders,
         now()
    FROM (
      -- all colleges: one row per measured duty, even a week with no items
      SELECT d.duty_code, NULL::uuid AS institution_id,
             count(f.item_id)::int                                              AS items,
             count(f.item_id) FILTER (WHERE f.on_time)::int                     AS on_time,
             count(f.item_id) FILTER (WHERE f.done_at IS NOT NULL AND NOT f.on_time)::int AS late,
             count(f.item_id) FILTER (WHERE f.done_at IS NULL)::int             AS open_overdue,
             count(f.item_id) FILTER (WHERE f.reversed)::int                    AS reversed,
             count(DISTINCT f.actor_id)::int                                    AS deciders
        FROM public.hr_duty_tower_duties d
        LEFT JOIN _hr_duty_tower_facts f ON f.duty_code = d.duty_code
       WHERE d.is_active AND d.measured
       GROUP BY d.duty_code
      UNION ALL
      -- per college
      SELECT f.duty_code, f.institution_id,
             count(*)::int,
             count(*) FILTER (WHERE f.on_time)::int,
             count(*) FILTER (WHERE f.done_at IS NOT NULL AND NOT f.on_time)::int,
             count(*) FILTER (WHERE f.done_at IS NULL)::int,
             count(*) FILTER (WHERE f.reversed)::int,
             count(DISTINCT f.actor_id)::int
        FROM _hr_duty_tower_facts f
       WHERE f.institution_id IS NOT NULL
       GROUP BY f.duty_code, f.institution_id
    ) g
  ON CONFLICT (duty_code, (COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid)), week_start)
  DO UPDATE SET items         = EXCLUDED.items,
                on_time       = EXCLUDED.on_time,
                late          = EXCLUDED.late,
                open_overdue  = EXCLUDED.open_overdue,
                reversed      = EXCLUDED.reversed,
                on_time_rate  = EXCLUDED.on_time_rate,
                reversal_rate = EXCLUDED.reversal_rate,
                deciders      = EXCLUDED.deciders,
                computed_at   = EXCLUDED.computed_at;

  -- Each person's own 12 weeks, ending with the week just measured, for My
  -- Desk to read without scanning the sources (LOAD, in the header). Private:
  -- no policy on the table, read only through fn_hr_my_reliability.
  DELETE FROM public.hr_duty_person_records pr WHERE pr.week_start = p_week_start;
  INSERT INTO public.hr_duty_person_records (user_id, duty_code, week_start, items, on_time, reversed)
  SELECT f.actor_id, f.duty_code, p_week_start,
         count(*)::int,
         count(*) FILTER (WHERE f.on_time)::int,
         count(*) FILTER (WHERE f.reversed)::int
    FROM public.fn_hr_duty_item_facts(v_to - interval '84 days', v_to) f
   WHERE f.actor_id IS NOT NULL
   GROUP BY f.actor_id, f.duty_code;

  -- The tower gets no rate from a reading with fewer than 3 deciders: it
  -- would be close to one person's own number (SMALL COLLEGES).
  RETURN QUERY
    SELECT r.duty_code, r.items, CASE WHEN r.deciders >= 3 THEN r.on_time_rate END
      FROM public.hr_duty_tower_readings r
     WHERE r.week_start = p_week_start AND r.institution_id IS NULL
     ORDER BY r.duty_code;
END;
$$;

COMMENT ON FUNCTION public.fn_hr_duty_tower_compute(date) IS
  'HR staff harness (20271007161151): records the readings for the IST week starting p_week_start — per duty, per college and for all colleges — and each person''s own 12 weeks ending that week (hr_duty_person_records), and returns one row per duty with the all-college on-time rate (NULL when fewer than 3 people decided). Idempotent per week (upsert). Service role only. Measures; sends nothing.';

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_tower_compute(date) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_duty_tower_compute(date) TO service_role;


-- ----------------------------------------------------------------------------
-- (e) The seven loops-tower rows
-- ----------------------------------------------------------------------------
-- Charter legs (outcome_metric, baseline_window, intervention, verdict_owner,
-- remeasure_window, counter_metric) and bar are deliberately NULL — the
-- receipts rule. fn_loop_bar_proposals_generate will file 'insufficient' for
-- each, and fn_loop_bar_decide refuses an 'insufficient' row, so every
-- measurement records met = NULL until the charter is approved first and a
-- plain 0-100 bar after it (THE REAL PATH TO A BAR, in the header). Only then
-- does the existing 4-miss bar-review arm. No loop_edges rows are written.
INSERT INTO public.loop_registry
  (loop_key, name, stack_tier, loop_class, domain, description, gates, routine_id, owner_email)
VALUES
  ('hr-duty-l1', 'HR duty L1: Approve or reject a team member''s leave at your step', 3, 'accountability', 'hr',
   'Weekly on-time rate of leave approval steps (due: the step''s escalate_after_hours, else 48 hours). Measures only; nothing is sent or changed. No bar yet: the charter is drafted and approved first on /admin/loops/charters, then a plain 0-100 on-time percentage bar can be proposed and approved; until then the Director cannot approve a bar for this row.',
   '{"g":"off","a":"off","m":"off","f":"off"}'::jsonb, 'hr-duty-tower', 'director@jkkn.ac.in'),
  ('hr-duty-l2', 'HR duty L2: Decide a team member''s comp-off claim before it expires', 3, 'accountability', 'hr',
   'Weekly on-time rate of comp-off claim decisions (due: 7 days before the credit expires). Measures only; nothing is sent or changed. No bar yet: the charter is drafted and approved first on /admin/loops/charters, then a plain 0-100 on-time percentage bar can be proposed and approved; until then the Director cannot approve a bar for this row.',
   '{"g":"off","a":"off","m":"off","f":"off"}'::jsonb, 'hr-duty-tower', 'director@jkkn.ac.in'),
  ('hr-duty-a3', 'HR duty A3: Decide a team member''s attendance correction', 3, 'accountability', 'hr',
   'Weekly on-time rate of attendance correction decisions (due: 48 hours). Measures only; nothing is sent or changed. No bar yet: the charter is drafted and approved first on /admin/loops/charters, then a plain 0-100 on-time percentage bar can be proposed and approved; until then the Director cannot approve a bar for this row.',
   '{"g":"off","a":"off","m":"off","f":"off"}'::jsonb, 'hr-duty-tower', 'director@jkkn.ac.in'),
  ('hr-duty-s2', 'HR duty S2: Verify a document a team member uploaded', 3, 'accountability', 'hr',
   'Weekly on-time rate of document verification (due: 3 working days, Sundays skipped). Measures only; nothing is sent or changed. No bar yet: the charter is drafted and approved first on /admin/loops/charters, then a plain 0-100 on-time percentage bar can be proposed and approved; until then the Director cannot approve a bar for this row.',
   '{"g":"off","a":"off","m":"off","f":"off"}'::jsonb, 'hr-duty-tower', 'director@jkkn.ac.in'),
  ('hr-duty-s3', 'HR duty S3: Review a photo a team member submitted', 3, 'accountability', 'hr',
   'Weekly on-time rate of photo reviews (due: 2 working days, Sundays skipped). Measures only; nothing is sent or changed. No bar yet: the charter is drafted and approved first on /admin/loops/charters, then a plain 0-100 on-time percentage bar can be proposed and approved; until then the Director cannot approve a bar for this row.',
   '{"g":"off","a":"off","m":"off","f":"off"}'::jsonb, 'hr-duty-tower', 'director@jkkn.ac.in'),
  ('hr-duty-g2', 'HR duty G2: Act on an HR form at your step', 3, 'accountability', 'hr',
   'Weekly on-time rate of HR form steps (due: 3 working days, Sundays skipped). Measures only; nothing is sent or changed. No bar yet: the charter is drafted and approved first on /admin/loops/charters, then a plain 0-100 on-time percentage bar can be proposed and approved; until then the Director cannot approve a bar for this row.',
   '{"g":"off","a":"off","m":"off","f":"off"}'::jsonb, 'hr-duty-tower', 'director@jkkn.ac.in'),
  ('hr-duty-r5', 'HR duty R5: Approve a candidate at your step', 3, 'accountability', 'hr',
   'Weekly on-time rate of recruitment approval steps (due: the step''s escalate_after_hours, else 72 hours). Measures only; nothing is sent or changed. No bar yet: the charter is drafted and approved first on /admin/loops/charters, then a plain 0-100 on-time percentage bar can be proposed and approved; until then the Director cannot approve a bar for this row.',
   '{"g":"off","a":"off","m":"off","f":"off"}'::jsonb, 'hr-duty-tower', 'director@jkkn.ac.in')
ON CONFLICT (loop_key) DO NOTHING;


-- ----------------------------------------------------------------------------
-- (f) Reliability — read-only, a team member's own numbers
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, classification, publication_state, is_active, description)
VALUES
  ('hr.harness.trust.min_items', 'global', '10'::jsonb, 'number', 'major', 'published', true,
   'HR staff harness: a team member''s 12-week record reads ''steady'' or ''building'' only once they have decided at least this many items of a duty. Below it: ''too few items''.'),
  ('hr.harness.trust.steady_on_time', 'global', '0.9'::jsonb, 'number', 'major', 'published', true,
   'HR staff harness: the on-time share (0 to 1) a team member''s 12-week record needs to read ''steady''.'),
  ('hr.harness.trust.max_reversal', 'global', '0.05'::jsonb, 'number', 'major', 'published', true,
   'HR staff harness: the largest reversed share (0 to 1) a 12-week record may have and still read ''steady''.'),
  ('hr.harness.trust.suggestions_enabled', 'global', 'false'::jsonb, 'boolean', 'major', 'published', true,
   'HR staff harness: earned-trust suggestions for the Director. Ships OFF. Only the Director can turn it on, through fn_hr_trust_switch (a raw edit of this row is not enough: the switch log must agree). Suggestions change nothing in the system.')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- Who may change the four hr.harness.trust.* rows (the three thresholds and the
-- suggestions switch): the Director list only. The same shape as
-- fn_guard_salary_suggestion_rule_writes (20270512090000): allowed are a
-- signed-in caller on the Director list (fn_is_the_director()), service_role,
-- and a database session with no JWT (a migration, the SQL console). Refused
-- with 42501: anon, and every other signed-in account, super admins included.
-- Fails closed: if fn_is_the_director() is NULL or raises, the write is refused.
-- fn_hr_trust_switch passes because the Director's JWT is still the caller
-- inside that SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION public.fn_guard_hr_trust_policy_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_role text := auth.role();
BEGIN
  IF NOT ((TG_OP IN ('INSERT', 'UPDATE') AND NEW.policy_key LIKE 'hr.harness.trust.%')
       OR (TG_OP IN ('UPDATE', 'DELETE') AND OLD.policy_key LIKE 'hr.harness.trust.%')) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF v_role IS NOT NULL AND v_role IS DISTINCT FROM 'service_role' THEN
    IF v_role IS DISTINCT FROM 'authenticated' THEN
      RAISE EXCEPTION 'Only the Director can change the earned-trust settings.'
        USING ERRCODE = '42501';
    END IF;
    IF public.fn_is_the_director() IS NOT TRUE THEN
      RAISE EXCEPTION 'Only the Director can change the earned-trust settings.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_hr_trust_policy_writes() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_guard_hr_trust_policy_writes() IS
  'BEFORE trigger on platform_policies (20271007161151). Refuses any insert/update/delete touching an hr.harness.trust.* row unless the caller is on the Director list (fn_is_the_director()), is service_role, or is a direct DB session with no JWT. Fails closed.';

DROP TRIGGER IF EXISTS trg_guard_hr_trust_policy_writes ON public.platform_policies;
CREATE TRIGGER trg_guard_hr_trust_policy_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_hr_trust_policy_writes();

-- The three thresholds, or NULL for every one of them when any is missing,
-- inactive or not a number (fail closed: never 'steady' by default).
CREATE OR REPLACE FUNCTION public.fn_hr_trust_thresholds()
RETURNS TABLE (min_items numeric, steady_on_time numeric, max_reversal numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min  jsonb;
  v_on   jsonb;
  v_rev  jsonb;
BEGIN
  SELECT pp.value INTO v_min FROM public.platform_policies pp
   WHERE pp.policy_key = 'hr.harness.trust.min_items' AND pp.scope_type = 'global'
     AND pp.scope_id IS NULL AND pp.is_active = true LIMIT 1;
  SELECT pp.value INTO v_on FROM public.platform_policies pp
   WHERE pp.policy_key = 'hr.harness.trust.steady_on_time' AND pp.scope_type = 'global'
     AND pp.scope_id IS NULL AND pp.is_active = true LIMIT 1;
  SELECT pp.value INTO v_rev FROM public.platform_policies pp
   WHERE pp.policy_key = 'hr.harness.trust.max_reversal' AND pp.scope_type = 'global'
     AND pp.scope_id IS NULL AND pp.is_active = true LIMIT 1;

  IF jsonb_typeof(v_min) IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_on) IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_rev) IS DISTINCT FROM 'number' THEN
    RETURN QUERY SELECT NULL::numeric, NULL::numeric, NULL::numeric;
    RETURN;
  END IF;

  RETURN QUERY SELECT (v_min #>> '{}')::numeric, (v_on #>> '{}')::numeric, (v_rev #>> '{}')::numeric;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_trust_thresholds() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_trust_thresholds() TO service_role;

-- The signal for one duty's numbers. Any NULL threshold => 'too few items'.
CREATE OR REPLACE FUNCTION public.fn_hr_trust_signal(
  p_items integer, p_on_time_rate numeric, p_reversal_rate numeric,
  p_min numeric, p_steady numeric, p_max_rev numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_min IS NULL OR p_steady IS NULL OR p_max_rev IS NULL THEN 'too few items'
    WHEN p_items >= p_min AND p_on_time_rate >= p_steady AND p_reversal_rate <= p_max_rev THEN 'steady'
    WHEN p_items >= p_min THEN 'building'
    ELSE 'too few items'
  END
$$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_trust_signal(integer, numeric, numeric, numeric, numeric, numeric) FROM anon, PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.fn_hr_my_reliability()
RETURNS TABLE (duty_code text, items integer, on_time_rate numeric, reversal_rate numeric, signal text,
               min_items numeric, steady_on_time numeric, max_reversal numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_min numeric;
  v_on  numeric;
  v_rev numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to see your record.' USING ERRCODE = '42501';
  END IF;

  -- Learners and anyone else with no staff row decide no HR duties: return at
  -- once, before any other read (My Desk calls this on every load).
  IF NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.profile_id = v_uid) THEN
    RETURN;
  END IF;

  SELECT t.min_items, t.steady_on_time, t.max_reversal INTO v_min, v_on, v_rev
    FROM public.fn_hr_trust_thresholds() t;

  RETURN QUERY
    SELECT g.duty_code, g.items, g.on_time_rate, g.reversal_rate,
           public.fn_hr_trust_signal(g.items, g.on_time_rate, g.reversal_rate, v_min, v_on, v_rev),
           -- the bar 'steady' is read against, so My Desk never hardcodes it
           -- (all three NULL when any is unreadable: nothing reads 'steady')
           v_min, v_on, v_rev
      FROM (
        -- the latest weekly snapshot, never a live scan of the sources
        SELECT pr.duty_code,
               pr.items,
               round(pr.on_time::numeric / pr.items, 4) AS on_time_rate,
               round(pr.reversed::numeric / pr.items, 4) AS reversal_rate
          FROM public.hr_duty_person_records pr
         WHERE pr.user_id = v_uid
           AND pr.items > 0
           AND pr.week_start = (SELECT max(x.week_start) FROM public.hr_duty_person_records x)
      ) g
     ORDER BY g.duty_code;
END;
$$;

COMMENT ON FUNCTION public.fn_hr_my_reliability() IS
  'HR staff harness (20271007161151): the signed-in team member''s OWN record over the 12 weeks ending with the last weekly run (hr_duty_person_records; empty for anyone with no staff row), per duty they decided: items, on-time rate, reversed rate and a signal (steady / building / too few items), plus the three thresholds the signal was read against (NULL when unreadable). No user parameter: a person can only ever read their own numbers. Read-only.';

REVOKE EXECUTE ON FUNCTION public.fn_hr_my_reliability() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_my_reliability() TO authenticated;


-- ----------------------------------------------------------------------------
-- (g) Earned-trust suggestions — Director only, switch ships OFF
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_trust_switch_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turned_on  boolean NOT NULL,
  by_user    uuid NOT NULL REFERENCES public.profiles(id),
  at         timestamptz NOT NULL DEFAULT now(),
  note       text
);

COMMENT ON TABLE public.hr_trust_switch_log IS
  'HR staff harness (20271007161151): every turn of the earned-trust suggestions switch, by whom. Written only by fn_hr_trust_switch (Director only). fn_hr_trust_suggestions_generate reads the latest row: a raw edit of the policy row without a Director entry here switches nothing on.';

CREATE INDEX IF NOT EXISTS idx_hr_trust_switch_log_at ON public.hr_trust_switch_log (at DESC);

ALTER TABLE public.hr_trust_switch_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_trust_switch_log FROM anon, PUBLIC, authenticated;
GRANT SELECT ON public.hr_trust_switch_log TO authenticated;
GRANT ALL ON public.hr_trust_switch_log TO service_role;

DROP POLICY IF EXISTS hr_trust_switch_log_select ON public.hr_trust_switch_log;
CREATE POLICY hr_trust_switch_log_select ON public.hr_trust_switch_log
  FOR SELECT USING (public.fn_is_the_director() OR public.is_super_admin());

CREATE TABLE IF NOT EXISTS public.hr_trust_suggestions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id),
  duty_code     text NOT NULL CHECK (duty_code ~ '^(R[1-9]|L[1-5]|A[1-6]|P[1-4]|S[1-4]|G([1-9]|10))$'),
  evidence      jsonb NOT NULL,   -- {steady_weeks: 12} only — never the person's own rates
  status        text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','noted','declined')),
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_trust_suggestions IS
  'HR staff harness (20271007161151): "this team member has been steady on this duty for 12 weeks" suggestions for the Director to note or decline. Noting one changes nothing in the system. Director-only read; written only by fn_hr_trust_suggestions_generate / fn_hr_trust_suggestion_decide.';

CREATE UNIQUE INDEX IF NOT EXISTS hr_trust_suggestions_one_proposed
  ON public.hr_trust_suggestions (user_id, duty_code)
  WHERE status = 'proposed';

ALTER TABLE public.hr_trust_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hr_trust_suggestions FROM anon, PUBLIC, authenticated;
GRANT SELECT ON public.hr_trust_suggestions TO authenticated;
GRANT ALL ON public.hr_trust_suggestions TO service_role;

DROP POLICY IF EXISTS hr_trust_suggestions_select ON public.hr_trust_suggestions;
CREATE POLICY hr_trust_suggestions_select ON public.hr_trust_suggestions
  FOR SELECT USING (public.fn_is_the_director() IS TRUE);
-- No INSERT / UPDATE / DELETE policies: writes go through the functions below.

CREATE OR REPLACE FUNCTION public.fn_hr_trust_switch(p_on boolean, p_note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.fn_is_the_director() IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the Director can turn earned-trust suggestions on or off.' USING ERRCODE = '42501';
  END IF;
  IF p_on IS NULL THEN
    RAISE EXCEPTION 'Say on or off.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.platform_policies
     SET value = to_jsonb(p_on), updated_at = now(), updated_by = auth.uid()
   WHERE policy_key = 'hr.harness.trust.suggestions_enabled'
     AND scope_type = 'global' AND scope_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The earned-trust switch row is missing (hr.harness.trust.suggestions_enabled).' USING ERRCODE = 'P0002';
  END IF;

  -- clock_timestamp(), not now(): two turns in one transaction must still
  -- order, because the latest row is the switch's state.
  INSERT INTO public.hr_trust_switch_log (turned_on, by_user, at, note)
  VALUES (p_on, auth.uid(), clock_timestamp(), NULLIF(btrim(COALESCE(p_note, '')), ''));

  RETURN p_on;
END;
$$;

COMMENT ON FUNCTION public.fn_hr_trust_switch(boolean, text) IS
  'HR staff harness (20271007161151): the Director turns earned-trust suggestions on or off. Writes the one policy row and appends a hr_trust_switch_log row. Refuses anyone for whom fn_is_the_director() is not true, super admins included.';

REVOKE EXECUTE ON FUNCTION public.fn_hr_trust_switch(boolean, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_trust_switch(boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_hr_trust_suggestions_generate()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled  jsonb;
  v_last     public.hr_trust_switch_log%ROWTYPE;
  v_min      numeric;
  v_on       numeric;
  v_rev      numeric;
  v_inserted integer := 0;
BEGIN
  -- 1. The policy row must read literal true.
  SELECT pp.value INTO v_enabled FROM public.platform_policies pp
   WHERE pp.policy_key = 'hr.harness.trust.suggestions_enabled' AND pp.scope_type = 'global'
     AND pp.scope_id IS NULL AND pp.is_active = true LIMIT 1;
  IF v_enabled IS DISTINCT FROM 'true'::jsonb THEN
    RETURN 0;
  END IF;

  -- 2. ...and the latest switch-log row must be a Director turning it ON. The
  --    log is written only by fn_hr_trust_switch, which checks the Director at
  --    write time; the author is re-checked against the Director list here, so
  --    a raw policy edit by any other super admin switches nothing on.
  SELECT * INTO v_last FROM public.hr_trust_switch_log ORDER BY at DESC, id DESC LIMIT 1;
  IF NOT FOUND OR v_last.turned_on IS NOT TRUE THEN
    RETURN 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = v_last.by_user)
     OR COALESCE((
          SELECT jsonb_typeof(pp.value) = 'array' AND pp.value ? (v_last.by_user)::text
            FROM public.platform_policies pp
           WHERE pp.policy_key = 'platform.the_director_profile_ids'
             AND pp.scope_type = 'global' AND pp.scope_id IS NULL AND pp.is_active = true
           LIMIT 1), false) IS NOT TRUE THEN
    RETURN 0;
  END IF;

  -- 3. Thresholds; any unreadable one => nobody is steady.
  SELECT t.min_items, t.steady_on_time, t.max_reversal INTO v_min, v_on, v_rev
    FROM public.fn_hr_trust_thresholds() t;
  IF v_min IS NULL OR v_on IS NULL OR v_rev IS NULL THEN
    RETURN 0;
  END IF;

  -- 4. Steady at each of the last 12 weekly checkpoints (each a trailing
  --    12-week window), per person per duty.
  WITH facts AS (
    SELECT f.* FROM public.fn_hr_duty_item_facts(now() - interval '168 days', now()) f
     WHERE f.actor_id IS NOT NULL
  ),
  checkpoints AS (
    SELECT k, now() - make_interval(days => 7 * k) AS t FROM generate_series(0, 11) k
  ),
  per_cp AS (
    SELECT f.actor_id, f.duty_code, cp.k,
           count(*)::int AS items,
           count(*) FILTER (WHERE f.on_time)::numeric / count(*) AS on_time_rate,
           count(*) FILTER (WHERE f.reversed)::numeric / count(*) AS reversal_rate
      FROM checkpoints cp
      JOIN facts f ON f.due_at >= cp.t - interval '84 days' AND f.due_at < cp.t
     GROUP BY f.actor_id, f.duty_code, cp.k
  ),
  steady AS (
    SELECT p.actor_id, p.duty_code
      FROM per_cp p
     WHERE public.fn_hr_trust_signal(p.items, p.on_time_rate, p.reversal_rate, v_min, v_on, v_rev) = 'steady'
     GROUP BY p.actor_id, p.duty_code
    HAVING count(DISTINCT p.k) = 12
  ),
  ins AS (
    -- The evidence says only "steady for 12 weeks". The person's item count,
    -- on-time rate and reversed rate stay theirs alone: the Director reads this
    -- table, and "only you can see these numbers" must stay true.
    INSERT INTO public.hr_trust_suggestions (user_id, duty_code, evidence, status)
    SELECT s.actor_id, s.duty_code,
           jsonb_build_object('steady_weeks', 12),
           'proposed'
      FROM steady s
      JOIN public.profiles pr ON pr.id = s.actor_id
     -- a suggestion the Director decided in the last 12 weeks is not asked again
     WHERE NOT EXISTS (SELECT 1 FROM public.hr_trust_suggestions x
                        WHERE x.user_id = s.actor_id AND x.duty_code = s.duty_code
                          AND (x.status = 'proposed' OR x.decided_at > now() - interval '84 days'))
    ON CONFLICT (user_id, duty_code) WHERE status = 'proposed' DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.fn_hr_trust_suggestions_generate() IS
  'HR staff harness (20271007161151): lists team members who have been steady on a duty for 12 consecutive weekly checkpoints, as suggestions for the Director. Returns 0 unless the policy row is literal true AND the latest switch-log row is a Director turning it on. Writes only hr_trust_suggestions. Service role only.';

REVOKE EXECUTE ON FUNCTION public.fn_hr_trust_suggestions_generate() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_trust_suggestions_generate() TO service_role;

CREATE OR REPLACE FUNCTION public.fn_hr_trust_suggestion_decide(p_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.fn_is_the_director() IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the Director can note or decline a suggestion.' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('noted','declined') THEN
    RAISE EXCEPTION 'A suggestion can only be noted or declined.' USING ERRCODE = '22023';
  END IF;

  -- The status ONLY. Noting a suggestion changes nothing else in the system.
  UPDATE public.hr_trust_suggestions
     SET status = p_status, decided_at = now(),
         decision_note = NULLIF(btrim(COALESCE(p_note, '')), '')
   WHERE id = p_id AND status = 'proposed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No suggestion waiting with that id.' USING ERRCODE = 'P0002';
  END IF;

  RETURN p_status;
END;
$$;

COMMENT ON FUNCTION public.fn_hr_trust_suggestion_decide(uuid, text, text) IS
  'HR staff harness (20271007161151): the Director notes or declines one earned-trust suggestion. Changes that row''s status only — no role, permission or approval chain is touched.';

REVOKE EXECUTE ON FUNCTION public.fn_hr_trust_suggestion_decide(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_trust_suggestion_decide(uuid, text, text) TO authenticated;


-- ----------------------------------------------------------------------------
-- (h) Schedule: weekly, Monday 06:47 IST. Measures only; nothing is sent.
-- ----------------------------------------------------------------------------
-- days_of_week ARRAY[1] = Monday (0 = Sunday in this table's vocabulary);
-- minute_of_day 407 = 06:47 IST, free of every other seeded routine.
-- managed=true => day/time editable on /admin/ai-routines with no deploy.
INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day, max_only)
VALUES
  ('hr-duty-tower', true, true, ARRAY[1]::smallint[], 407, false)
ON CONFLICT (routine_id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- Apply-time asserts (RAISE EXCEPTION, never NOTICE)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.hr_duty_tower_duties WHERE is_active;
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'hr_duty_tower_duties: expected 7 active duties, found %', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.loop_registry WHERE loop_key LIKE 'hr-duty-__';
  IF v_n < 7 THEN
    RAISE EXCEPTION 'loop_registry: expected the 7 hr-duty rows, found %', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.ai_routine_schedules WHERE routine_id = 'hr-duty-tower';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'hr-duty-tower schedule row missing after seed (count=%)', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_policies
                  WHERE policy_key = 'hr.harness.trust.suggestions_enabled'
                    AND scope_type = 'global' AND scope_id IS NULL) THEN
    RAISE EXCEPTION 'hr.harness.trust.suggestions_enabled policy row missing after seed';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
