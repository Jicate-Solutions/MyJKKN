-- ============================================================================
-- 2026-09-07 · Connect the solution-department activity clock to the ONE
--              surface that already records use — and give the sweep a caller
--
-- 🛑 FILE ONLY / NOT APPLIED TO ANY DATABASE — the operator applies migrations.
--    Nothing below has been run. Every claim in this header is about the file
--    and about read-only observations of production made on 2026-09-07; no
--    claim here is about an object this change created.
--
-- WHAT IS ACTUALLY BROKEN, stated plainly.
--   `update_department_statuses()` is correct and is NOT touched by this file.
--   Since 20261013000000 it anchors dormancy on
--   GREATEST(last_revenue_at, last_activity_at) and writes the honest reason
--   string 'N months without recorded activity'. The rule is right. What is
--   missing is everything that would let the rule ever see a fact:
--
--     (1) NOTHING WRITES last_activity_at IN PRACTICE. The only writer is
--         on_societal_activity_touch_department(), whose only live caller is a
--         trigger on sh_community_engagements — a table holding 0 rows whose
--         capture UI is still being built. Meanwhile sh_solution_first_use —
--         "somebody outside the producing team actually USED this" — has had a
--         working capture card since PR #3083 and writable permissions for
--         seven roles since PR #3148, and is wired to nothing. The one surface
--         that can record real use is the one surface the clock cannot hear.
--
--     (2) NOTHING CALLS THE SWEEP. Read on production 2026-09-07, `cron.job`
--         carries no entry for update_department_statuses, and the only
--         application entry point, DepartmentTrackerService.refreshStatuses(),
--         has no caller. A clock nobody winds does not tell the time.
--
--     (3) EVERY SOLUTION TYPE IS COMMERCIAL. sh_solution_types holds exactly
--         four active rows — Content Production, Healthcare Solutions,
--         Software Development, Training & Workshops. A department doing
--         community or outreach work has no type to file it under, so the work
--         is either mis-filed or not recorded, and then the clock cannot see
--         that either.
--
-- WHAT THIS CHANGE WILL AND WILL NOT DO ON THE DAY IT IS APPLIED.
--   It will NOT move any department. On all 44 rows of
--   sh_solution_departments, `last_revenue_at` and `last_activity_at` are both
--   NULL and only `activated_at` is set, so every department falls back to its
--   activation date, computes 'dormant', and already RECORDS 'dormant'. The
--   sweep therefore proposes nothing for any of them — before this change and
--   after it. That is the correct outcome of re-judging 44 departments under a
--   rule that asks "has anyone recorded activity or revenue?", because for all
--   44 the honest answer today is no. It is not a bug and it is not this file
--   failing; it is the register being empty. The clock starts telling a
--   different story the first time somebody records a first use.
--
-- ORDERING NOTE, because it is easy to get wrong.
--   This file depends on objects created in
--   20261013000000_societal_capture_and_activity_clock.sql
--   (`sh_solution_departments.last_activity_at`) and in
--   20260907120000_sh_solution_first_use.sql (`sh_solution_first_use`). Its
--   version token 20261114000000 sorts AFTER both, which is what makes a
--   replay from empty apply them in the right order. The token is unique on
--   jicate/main as of this commit — checked, because two files sharing a
--   version merge cleanly, pass every gate, and the second is silently SKIPPED
--   on apply.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Recording a solution's first real user touches its department's clock
-- ---------------------------------------------------------------------------
-- WHY A SIBLING FUNCTION RATHER THAN REUSING THE EXISTING ONE.
--   on_societal_activity_touch_department() branches on TG_TABLE_NAME and, in
--   its else-branch, reads NEW.is_pro_bono and NEW.lead_department_id. Those
--   columns exist on sh_community_engagements and sh_solutions and do NOT
--   exist on sh_solution_first_use, so attaching it to this table would raise
--   at runtime on the very first insert. Adding a third branch to it would
--   also mean re-issuing a function three unrelated triggers depend on. This
--   sibling follows the SAME pattern — same clock semantics, same
--   never-move-backwards guard, same reactivation window — against the one
--   shape it actually reads.
--
-- HOW THE DEPARTMENT IS RESOLVED.
--   sh_solution_first_use.solution_id → sh_solutions.lead_department_id →
--   sh_solution_departments.department_id. `lead_department_id` is NOT NULL on
--   sh_solutions, and sh_solution_departments carries UNIQUE (department_id),
--   so the second hop returns at most one row. A solution whose lead
--   department is not an activated solution department resolves to nothing and
--   the trigger returns quietly — that is a department outside the tracker,
--   not an error.
CREATE OR REPLACE FUNCTION public.on_first_use_touch_department()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dept_id UUID;
    v_sd_id   UUID;
    v_old     TEXT;
    v_when    timestamptz;
BEGIN
    -- The date the use HAPPENED, not now(): an entry filed today for a first
    -- use back in March must not read as activity today.
    v_when := NEW.used_on::timestamptz;

    SELECT s.lead_department_id
      INTO v_dept_id
      FROM public.sh_solutions s
     WHERE s.id = NEW.solution_id;

    IF v_dept_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT sd.id, sd.status
      INTO v_sd_id, v_old
      FROM public.sh_solution_departments sd
     WHERE sd.department_id = v_dept_id;

    IF v_sd_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Never move the clock backwards: a late entry for old work must not
    -- shorten a department's standing.
    UPDATE public.sh_solution_departments
       SET last_activity_at = GREATEST(COALESCE(last_activity_at, v_when), v_when),
           updated_at = now()
     WHERE id = v_sd_id;

    -- Reactivate only when the use is recent enough to mean it. An entry for a
    -- first use four months ago should not clear a dormant flag today.
    IF v_old IN ('at_risk', 'dormant') AND v_when > now() - interval '30 days' THEN
        UPDATE public.sh_solution_departments
           SET status = 'active',
               updated_at = now()
         WHERE id = v_sd_id;

        INSERT INTO public.sh_department_status_history
            (solution_department_id, previous_status, new_status, reason, changed_at)
        VALUES (v_sd_id, v_old, 'active', 'Reactivated: first real use recorded', now());
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.on_first_use_touch_department() IS
  'Trigger function. When a solution''s FIRST REAL USE is recorded, moves the '
  'owning solution department''s last_activity_at forward to the date of that '
  'use (never backwards), and reactivates an at_risk/dormant department when '
  'the use is within the last 30 days. Sibling of '
  'on_societal_activity_touch_department(), which cannot serve this table '
  'because its else-branch reads is_pro_bono / lead_department_id, columns '
  'sh_solution_first_use does not have.';

-- ── Grant lockdown ──────────────────────────────────────────────────────────
-- This is a trigger function: PostgreSQL does not consult EXECUTE when a
-- trigger fires, so the NARROWEST GRANT THAT WORKS IS NO GRANT AT ALL, and
-- none is issued below. The revoke is still explicit and still names all three
-- grantees, because Supabase's ALTER DEFAULT PRIVILEGES gives anon a direct
-- EXECUTE grant on every new function SEPARATELY from PUBLIC, and
-- `authenticated` is itself a member of PUBLIC — so revoking one does not
-- remove the other. Without this, any holder of the public anon key (embedded
-- in every Next.js bundle) could call it directly; the call would fail with
-- "trigger functions can only be called as triggers", but the reachability is
-- the thing being closed, not the error message.
REVOKE EXECUTE ON FUNCTION public.on_first_use_touch_department() FROM anon, authenticated, PUBLIC;

DO $lockcheck$
BEGIN
  IF has_function_privilege('anon', 'public.on_first_use_touch_department()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.on_first_use_touch_department()', 'EXECUTE') THEN
    RAISE EXCEPTION 'on_first_use_touch_department is still EXECUTE-able by anon or authenticated';
  END IF;
END $lockcheck$;

-- AFTER INSERT only, deliberately. Recording the first use is a once-ever
-- event (sh_solution_first_use.solution_id is UNIQUE); the UPDATE path exists
-- only to correct a typo in an existing row, and the clock's
-- never-move-backwards rule means a correction to an EARLIER date must not
-- move it anyway. Firing on UPDATE would let a correction to a LATER date move
-- the clock, which is a separate decision nobody has taken.
DROP TRIGGER IF EXISTS trg_first_use_touches_dept ON public.sh_solution_first_use;
CREATE TRIGGER trg_first_use_touches_dept
    AFTER INSERT
    ON public.sh_solution_first_use
    FOR EACH ROW EXECUTE FUNCTION public.on_first_use_touch_department();

-- ---------------------------------------------------------------------------
-- 2. Something that winds the clock: the monthly sweep
-- ---------------------------------------------------------------------------
-- Cadence: monthly, because the thresholds the sweep enforces are monthly
-- (1 month → at_risk, 3 months → dormant). A daily job would re-read the same
-- answer thirty times to change nothing; a monthly job crosses each threshold
-- at most one month late, which is inside the resolution of the rule itself.
--
-- 03:00 UTC on the 1st = 08:30 IST on the 1st. Off-hours for this estate, and
-- a status flip lands before anyone opens the tracker that morning.
--
-- WHO IT RUNS AS. cron.schedule records the scheduling role and runs the
-- command as that role. In this project migrations are applied as the database
-- superuser, which owns these functions; a function's OWNER always retains
-- EXECUTE regardless of the REVOKE FROM anon, authenticated, PUBLIC that
-- 20261013000000 placed on update_department_statuses(). So the job runs
-- without widening anyone's grant — no GRANT is added here, deliberately. This
-- matches how 20260606103000_auto_complete_past_due_reservations.sql and
-- 20260503083153_cron_refresh_dashboard_views_30min.sql schedule their own.
--
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

-- NOTE, so nobody reads the first run as a failure: on the day this is applied
-- all 44 solution departments have NULL last_revenue_at AND NULL
-- last_activity_at, fall back to activated_at, compute 'dormant', and already
-- record 'dormant'. The first fire will therefore change nothing and write no
-- history rows. That is the sweep agreeing with the record, not the sweep
-- being broken.

-- ---------------------------------------------------------------------------
-- 3. A solution is not always commercial
-- ---------------------------------------------------------------------------
-- Director decision: community and outreach work is real solution work and
-- needs a type of its own. Without one it is filed under a commercial type or
-- not filed at all, and unfiled work is invisible to every count the hub makes.
--
-- Idempotent on BOTH identifying columns. `slug` is the UNIQUE constraint and
-- is what the database enforces; `name` is what a human would recognise and is
-- what the brief named, and the two are guarded separately so a row already
-- added by hand under either identity is left exactly as it is. is_default is
-- FALSE: is_default marks the originally-seeded set, and flipping a default
-- would change which type a new solution lands on — not something this file
-- decides.
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
