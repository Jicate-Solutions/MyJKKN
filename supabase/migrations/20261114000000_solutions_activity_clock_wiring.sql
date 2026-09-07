-- ============================================================================
-- 2026-09-07 · Give the dormancy sweep a caller, and give un-invoiced work a
--              type to be filed under
--
-- 🛑 FILE ONLY / NOT APPLIED TO ANY DATABASE — the operator applies migrations.
--    Nothing below has been run.
--
-- ⚠️ CORRECTION TO THE FIRST DRAFT OF THIS FILE, kept visible on purpose.
--    An earlier version of this migration said the sweep "has never fired" and
--    that "a clock nobody winds does not tell the time". BOTH STATEMENTS WERE
--    FALSE, and the second one was the argument for the change. The sweep HAS
--    fired — once — and it caused an incident. The correct facts are below.
--
-- WHAT ACTUALLY HAPPENED, and why it matters for this file.
--   sh_department_status_history holds exactly two events in its whole life:
--     · 2026-04-14                    — 44 departments → 'active'
--     · 2026-08-17 13:58:09.091614+00 — 44 departments → 'dormant'
--   All forty-four of the second batch carry that ONE timestamp (span
--   0.000000s), changed_by NULL — no human — and one reason string for all 44:
--   'Auto-dormant: 4.2 months without revenue'. That was
--   update_department_statuses() writing `status` unattended. The Cluster
--   Academic Council funnel joined on `status = 'active'`, matched nothing from
--   that moment, and reported that no college had ever activated a solution
--   department. Eight colleges' work left the record because one job moved one
--   column. 20261019000000 records the same event in its own header.
--
-- WHY SCHEDULING IT IS NEVERTHELESS THE RIGHT CHANGE — this is the whole
-- argument, and it is not the one the first draft made.
--   The function that caused that incident NO LONGER EXISTS in that form.
--   20261019000000_societal_approval_and_status_review.sql §6 redefined
--   update_department_statuses(): it still computes exactly the same status,
--   but it now INSERTs a PROPOSAL into sh_department_status_reviews and never
--   UPDATEs sh_solution_departments.status. Moving a department requires
--   apply_department_status_review(), which raises unless the caller holds
--   `solutions.societal.approve` (or is admin/super-admin). One open review per
--   department, refreshed in place by ON CONFLICT, so a monthly sweep cannot
--   pile up duplicates for the same fact.
--
--   So the risk that made 2026-08-17 possible was engineered out on
--   2026-09-02, and scheduling this function today is SAFE IN A WAY IT WAS NOT
--   THEN: the worst a monthly fire can now do is put a row in front of a human.
--   That is the argument for this job. What is missing is only the caller —
--   read on production 2026-09-07, cron.job carries NO entry for
--   update_department_statuses, and the sole application entry point,
--   DepartmentTrackerService.refreshStatuses(), has no caller in app/ or
--   hooks/. A review queue nobody fills has nothing to review.
--
-- WHAT THIS CHANGE WILL AND WILL NOT DO ON THE DAY IT IS APPLIED.
--   It will propose NOTHING for the 44 existing solution departments. All 44
--   carry NULL last_revenue_at AND NULL last_activity_at and fall back to
--   activated_at, so each computes 'dormant' — and each ALREADY records
--   'dormant' after 2026-08-17, so the function's own
--   `CONTINUE WHEN v_new_status = v_dept.status` skips every one of them. No
--   review rows, no history rows, no status writes. That is the correct and
--   honest outcome of re-judging 44 departments under a rule that asks "has
--   anyone recorded activity or revenue?" — for all 44, today, the answer is
--   no. It is not a bug and it is not this file failing; it is the register
--   being empty. The queue starts filling the first time a department's clock
--   moves and then stops again.
--
-- WHAT WAS IN THE FIRST DRAFT AND IS DELIBERATELY NOT HERE — see the section
--   at the foot of this file. Short version: an AFTER INSERT trigger on
--   sh_solution_first_use was removed because it violated a deliberate
--   invariant.
--
-- ORDERING NOTE.
--   This file depends on update_department_statuses() as redefined in
--   20261019000000 and on sh_solution_types from 20260209000001. Its version
--   token 20261114000000 sorts after both, which is what makes a replay from
--   empty apply them in the right order. The token is unique on jicate/main as
--   of this commit — checked, because two files sharing a version merge
--   cleanly, pass every gate, and the second is silently SKIPPED on apply.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Something that winds the clock: the monthly sweep
-- ---------------------------------------------------------------------------
-- Cadence: monthly, because the thresholds the sweep enforces are monthly
-- (1 month → at_risk, 3 months → dormant). A daily job would re-read the same
-- answer thirty times to change nothing; a monthly job crosses each threshold
-- at most one month late, which is inside the resolution of the rule itself.
--
-- 03:00 UTC on the 1st = 08:30 IST on the 1st. Off-hours for this estate, and
-- a proposal lands before anyone opens the tracker that morning.
--
-- ── CAN THE JOB ACTUALLY EXECUTE THE FUNCTION? ──────────────────────────────
-- This is the one thing about a cron job that fails SILENTLY, and it is worth
-- the ten lines below. cron.schedule records the SCHEDULING role in
-- cron.job.username and the background worker runs the command as that role.
-- update_department_statuses() is SECURITY DEFINER and 20261019000000 revoked
-- EXECUTE from anon, authenticated and PUBLIC. If the applying role is neither
-- the owner, nor a member of the owner, nor separately granted, the job is
-- created successfully, fires every month, and does nothing — and the failure
-- appears only in cron.job_run_details, which nobody reads.
--
-- Neither cron migration in this repo is a precedent for that combination:
-- 20260606103000_auto_complete_past_due_reservations.sql schedules a function
-- carrying NO revoke at all, and 20260503083153_cron_refresh_dashboard_views_
-- 30min.sql calls fn_refresh_dashboard_views, which has no CREATE in any
-- migration file, so its grants cannot be read from this repository. Neither
-- can be copied here. So this file VERIFIES instead of assuming: the check
-- below tests the exact role cron will record, and it runs BEFORE the schedule
-- so a failing check cannot leave a dead job behind. No GRANT is issued —
-- widening EXECUTE to fix a check would be widening it for everyone holding
-- that role, and the honest fix is for the operator to apply as a role that
-- already has it.
DO $execcheck$
BEGIN
  IF NOT has_function_privilege(
            current_user, 'public.update_department_statuses()', 'EXECUTE') THEN
    RAISE EXCEPTION
      'Refusing to schedule a job that cannot run: role % has no EXECUTE on '
      'public.update_department_statuses(). Scheduling it anyway would create a '
      'silent monthly no-op visible only in cron.job_run_details. Apply this '
      'migration as the function owner (or a member of it), or grant EXECUTE '
      'to the applying role first.', current_user;
  END IF;
END $execcheck$;

-- Idempotent: unschedule any prior job of the same name first, tolerating the
-- first run where it does not exist yet.
DO $$
BEGIN
  PERFORM cron.unschedule('update-solution-department-statuses');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job did not exist yet, safe to continue
END;
$$;

SELECT cron.schedule(
  'update-solution-department-statuses',
  '0 3 1 * *',
  $$ SELECT public.update_department_statuses(); $$
);

-- NOTE, so nobody reads the first fire as a failure: on the day this is applied
-- all 44 solution departments record 'dormant' and compute 'dormant', so the
-- function skips every one of them and writes no proposal. That is the sweep
-- agreeing with the record, not the sweep being broken.

-- ---------------------------------------------------------------------------
-- 2. A solution is not always commercial
-- ---------------------------------------------------------------------------
-- Director decision: community and outreach work is real solution work and
-- needs a type of its own. sh_solution_types holds exactly four active rows —
-- Content Production, Healthcare Solutions, Software Development, Training &
-- Workshops — all client work. Without a type of its own, community work is
-- filed under a commercial type or not filed at all, and unfiled work is
-- invisible to every count the hub makes.
--
-- Idempotent on BOTH identifying columns. `slug` is the UNIQUE constraint and
-- is what the database enforces; `name` is what a human would recognise and is
-- what the brief named, and the two are guarded separately so a row already
-- added by hand under either identity is left exactly as it is. is_default is
-- FALSE: is_default marks the originally-seeded set, and flipping a default
-- would change which type a new solution lands on — not something this file
-- decides.
--
-- Columns checked against the table's own CREATE in
-- 20260209000001_solution_department_tracker.sql: id, name, slug, description,
-- icon, color, is_default, is_active, created_by, created_at, updated_at. The
-- seven named below all exist; the rest take their defaults.
INSERT INTO public.sh_solution_types (name, slug, description, icon, color, is_default, is_active)
SELECT 'Community & Outreach',
       'community',
       'Community, outreach and public-service work delivered without a client invoice',
       'heart-handshake',
       '#8b5cf6',
       false,
       true
WHERE NOT EXISTS (
    SELECT 1 FROM public.sh_solution_types
     WHERE slug = 'community'
        OR lower(name) = lower('Community & Outreach')
)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. REMOVED FROM THIS FILE: the first-use trigger
-- ---------------------------------------------------------------------------
-- The first draft added `on_first_use_touch_department()` plus
-- `CREATE TRIGGER trg_first_use_touches_dept AFTER INSERT ON
-- public.sh_solution_first_use`, so that recording a solution's first real user
-- moved the owning department's last_activity_at and could reactivate an
-- at_risk/dormant department. It is removed, and this note is the record of
-- why, so nobody re-adds it by reading the gap as an oversight.
--
-- IT VIOLATED A DELIBERATE INVARIANT. The sibling trigger it claimed to mirror
-- is not an unconditional AFTER INSERT. 20261019000000 §4 defines it as:
--
--     AFTER UPDATE OF approval_status ON public.sh_community_engagements
--     FOR EACH ROW
--     WHEN (NEW.approval_status = 'approved'
--           AND OLD.approval_status IS DISTINCT FROM 'approved')
--
-- The draft mirrored the function BODY and not the FIRING CONDITION, and the
-- firing condition is where the gate lives. That migration states the rule in
-- its own words, on the column comment for approval_status: "Only an APPROVED
-- engagement moves the department's activity clock — an unreviewed entry must
-- never be able to clear a dormant flag, or the approval step is decorative."
--
-- NO EQUIVALENT GATE CAN BE WRITTEN HERE. sh_solution_first_use has no
-- approval column at all — its columns are id, solution_id, used_on, used_by,
-- note, recorded_by, created_at, updated_at — and its INSERT policy admits
-- every role holding `solutions.first_use.record`, which is every role already
-- holding `solutions.dashboard.view`: 137 people across 7 roles. Wiring it
-- ungated would let any one of them silently clear a department's dormant flag
-- and write a permanent history row, which is precisely the outcome the review
-- queue exists to prevent.
--
-- Connecting first use to the dormancy clock therefore needs an approval step
-- on that table first. That is a separate decision with its own scope — who
-- approves a recorded first use, and whether a once-ever entry should carry an
-- approval workflow at all — and it is not taken here. The value forgone today
-- is small and worth naming: sh_solutions holds 2 rows, so the path would
-- reach at most 2 departments.
