-- ============================================================================
-- Societal capture surface, and an activity clock that dormancy can read
-- ============================================================================
--
-- WHAT WAS WRONG, stated plainly.
--   `update_department_statuses()` marks a solution department `at_risk` after
--   one month and `dormant` after three, measured from `last_revenue_at` alone.
--   The only writer of that column is `on_payment_received_update_dept()`,
--   which fires on a received payment. So revenue is the ONLY thing that can
--   keep a department active.
--
--   The institution moved from academic department to solution department on
--   1 April 2026, and the brief for that transition states that most problems
--   a department closes carry no client and no invoice. Under the rule above,
--   a department that closes ten un-invoiced problems produces no payment row,
--   its clock runs down, and it is recorded as dormant WITH A REASON STRING
--   SAYING SO — for having done what it was asked to do. The system did not
--   merely fail to count the work. It penalised it.
--
-- WHY THE SOCIETAL HALF COULD NOT ALREADY DO THIS.
--   lib/services/solutions/paradigm-shift-service.ts has computed a
--   `societal_score` since April from five metrics. Every source it reads is
--   absent from production, verified read-only against the live database on
--   2026-08-17 and corroborated by the generated types/supabase.ts:
--     sh_community_engagements        42P01  relation does not exist
--     sh_solutions.is_pro_bono        42703  column does not exist
--     sh_solutions.beneficiaries_count 42703
--     sh_solutions.sdg_goals          42703
--   So `emptySocietalMetrics()` — all zeros — is what actually runs, and the
--   dashboard has been rendering those zeros as if they were measurements.
--   supabase/migrations/20260714041600_mission_pillars_config.sql already
--   records the consequence in the database: "No loop measures
--   community/societal impact", status `gap`, weight 60.
--
--   This migration builds the missing surface with EXACTLY the column names
--   the service already expects, so the existing reads light up rather than
--   needing to be rewritten against a new shape.
--
-- THE CLOCK CHANGE IS ADDITIVE AND BACKWARD COMPATIBLE.
--   `last_activity_at` is a NEW column beside `last_revenue_at`, never a
--   replacement — the revenue date stays readable on its own for the
--   commercial half of the scorecard. Postgres GREATEST ignores NULLs, so
--   while nothing has written an activity date the anchor is the revenue date
--   and behaviour is byte-identical to today. No department changes status on
--   the day this applies.
--
--   The reason strings change from "months without revenue" to "months
--   without recorded activity", because once the anchor can be either date the
--   old sentence is simply false, and it is written permanently into
--   sh_department_status_history where someone will later read it as a fact.
--
-- WHAT DOES *NOT* CHANGE, deliberately.
--   The 1-month and 3-month thresholds, the statuses, and the payment trigger
--   are untouched. Whether a clock should mark a department dormant with no
--   human in the loop is a real question and a separate one; this change only
--   stops the clock being wrong about what counts as work.
--
-- THE PERMISSION KEYS ARE REGISTERED AND GRANTED IN THIS SAME CHANGE.
--   `solutions.societal.view` and `solutions.societal.record` are added to
--   lib/constants/permissions.ts in this PR and granted below. A key
--   registered nowhere can never be switched on in Role Management, so the
--   table would be permanently super-admin-only and the feature would look
--   built and be unreachable — the class
--   scripts/ci/check-ungrantable-permissions.mjs exists to catch.
--
--   WHICH ROLES. Every role already holding `solutions.dashboard.view` TRUE,
--   the existing way into the hub. The predicate tests the VALUE, never
--   `permissions ? 'key'` — `?` tests KEY EXISTENCE and returns true for a key
--   explicitly set to false, so a grant loop written that way reports success
--   while granting nothing. The affected role list is printed by RAISE NOTICE
--   and not enforced, so whoever applies this sees who gained what.
-- ============================================================================

-- ── 1. The capture surface ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sh_community_engagements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    institution_id uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
    -- Optional: an engagement may or may not belong to a hub solution. Most do
    -- not, which is the entire point — this is where un-invoiced work lands.
    solution_id uuid REFERENCES public.sh_solutions(id) ON DELETE SET NULL,
    title text NOT NULL,
    description text,
    engagement_date date NOT NULL,
    hours_spent numeric(8,2) NOT NULL DEFAULT 0 CHECK (hours_spent >= 0),
    beneficiaries_count integer NOT NULL DEFAULT 0 CHECK (beneficiaries_count >= 0),
    sdg_goals text[] NOT NULL DEFAULT '{}',
    recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sh_community_engagements IS
  'Where a department records work done for the community that produced no '
  'invoice. Column names match what paradigm-shift-service.ts has expected '
  'since April 2026 (engagement_date, hours_spent, beneficiaries_count, '
  'sdg_goals), so the societal half of the scorecard reads real numbers '
  'instead of emptySocietalMetrics() zeros.';

COMMENT ON COLUMN public.sh_community_engagements.solution_id IS
  'Nullable on purpose. An engagement usually has no hub solution behind it — '
  'requiring one would make the common case unrecordable and push departments '
  'back to recording nothing.';

CREATE INDEX IF NOT EXISTS idx_sh_community_engagements_dept
    ON public.sh_community_engagements(department_id, engagement_date DESC);
CREATE INDEX IF NOT EXISTS idx_sh_community_engagements_institution
    ON public.sh_community_engagements(institution_id);

-- Societal fields on solutions, named exactly as the service already reads.
ALTER TABLE public.sh_solutions
    ADD COLUMN IF NOT EXISTS is_pro_bono boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS beneficiaries_count integer CHECK (beneficiaries_count IS NULL OR beneficiaries_count >= 0),
    ADD COLUMN IF NOT EXISTS sdg_goals text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.sh_solutions.is_pro_bono IS
  'A solution delivered without an invoice. Defaults false so every existing '
  'row keeps its current meaning; nothing is retroactively reclassified.';

CREATE INDEX IF NOT EXISTS idx_sh_solutions_pro_bono
    ON public.sh_solutions(lead_department_id) WHERE is_pro_bono;

-- ── 2. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.sh_community_engagements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sh_community_engagements_select" ON public.sh_community_engagements;
DROP POLICY IF EXISTS "sh_community_engagements_insert" ON public.sh_community_engagements;
DROP POLICY IF EXISTS "sh_community_engagements_update" ON public.sh_community_engagements;
DROP POLICY IF EXISTS "sh_community_engagements_delete" ON public.sh_community_engagements;

CREATE POLICY "sh_community_engagements_select" ON public.sh_community_engagements
    FOR SELECT USING (
        public.is_super_admin()
        OR public.is_admin()
        OR (
            public.user_has_permission('solutions.societal.view')
            AND public.role_has_institution_access(institution_id)
        )
    );

CREATE POLICY "sh_community_engagements_insert" ON public.sh_community_engagements
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR public.is_admin()
        OR (
            public.user_has_permission('solutions.societal.record')
            AND public.role_has_institution_access(institution_id)
        )
    );

-- UPDATE, not delete-and-reinsert, is how a mistyped hour count is corrected.
CREATE POLICY "sh_community_engagements_update" ON public.sh_community_engagements
    FOR UPDATE USING (
        public.is_super_admin()
        OR public.is_admin()
        OR (
            public.user_has_permission('solutions.societal.record')
            AND public.role_has_institution_access(institution_id)
        )
    );

-- Deletion is admin-only: removing the row erases the only evidence the work
-- happened, and the department's activity clock would silently fall back.
CREATE POLICY "sh_community_engagements_delete" ON public.sh_community_engagements
    FOR DELETE USING (public.is_super_admin() OR public.is_admin());

-- ── Anon lockdown (CI gate: every new table locks anon explicitly) ──────────
REVOKE ALL ON TABLE public.sh_community_engagements FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sh_community_engagements TO authenticated;
GRANT ALL ON TABLE public.sh_community_engagements TO service_role;

-- ── 3. The activity clock ───────────────────────────────────────────────────

ALTER TABLE public.sh_solution_departments
    ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

COMMENT ON COLUMN public.sh_solution_departments.last_activity_at IS
  'Most recent NON-REVENUE contribution: a recorded community engagement, or a '
  'solution marked pro-bono. Sits beside last_revenue_at rather than replacing '
  'it; update_department_statuses() anchors on whichever of the two is later. '
  'NULL means nothing non-revenue has been recorded, and the department is '
  'scored exactly as it was before this column existed.';

CREATE INDEX IF NOT EXISTS idx_sh_solution_departments_last_activity
    ON public.sh_solution_departments(last_activity_at);

CREATE OR REPLACE FUNCTION public.update_department_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dept RECORD;
    v_new_status TEXT;
    v_months NUMERIC;
BEGIN
    FOR v_dept IN
        SELECT sd.id, sd.status, sd.last_revenue_at, sd.last_activity_at,
               sd.activated_at, sd.department_id
        FROM public.sh_solution_departments sd
        WHERE sd.status NOT IN ('pending_approval')
    LOOP
        -- GREATEST ignores NULLs in Postgres, so this is the later of the two
        -- dates when both exist, the one that exists when only one does, and
        -- falls back to activation when neither has ever been set.
        v_months := EXTRACT(EPOCH FROM (
                        now() - COALESCE(
                            GREATEST(v_dept.last_revenue_at, v_dept.last_activity_at),
                            v_dept.activated_at
                        )
                    )) / (30 * 24 * 3600);

        IF v_months >= 3 THEN
            v_new_status := 'dormant';
        ELSIF v_months >= 1 THEN
            v_new_status := 'at_risk';
        ELSE
            v_new_status := 'active';
        END IF;

        IF v_new_status != v_dept.status THEN
            UPDATE public.sh_solution_departments
            SET status = v_new_status,
                dormant_at = CASE WHEN v_new_status = 'dormant' THEN now() ELSE dormant_at END,
                updated_at = now()
            WHERE id = v_dept.id;

            INSERT INTO public.sh_department_status_history
                (solution_department_id, previous_status, new_status, reason, changed_at)
            VALUES
                (v_dept.id, v_dept.status, v_new_status,
                 CASE
                    WHEN v_new_status = 'dormant' THEN 'Auto-dormant: ' || ROUND(v_months, 1) || ' months without recorded activity'
                    WHEN v_new_status = 'at_risk' THEN 'At risk: ' || ROUND(v_months, 1) || ' months without recorded activity'
                    WHEN v_new_status = 'active' THEN 'Reactivated: activity recorded'
                 END,
                 now());
        END IF;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION public.update_department_statuses() IS
  'Anchors dormancy on the LATER of last_revenue_at and last_activity_at. '
  'Before 2026-08-28 this read last_revenue_at alone, which marked a '
  'department dormant for closing problems that carried no invoice.';

-- ── Grant lockdown (CI gate: new SECURITY DEFINER functions lock anon) ──────
-- One call rewrites the status of EVERY solution department, and the body
-- carries no authorization check. Revoking anon alone would not be enough:
-- authenticated is a member of PUBLIC, so both are named. service_role holds
-- EXECUTE independently, so cron and server routes are unaffected — and the
-- only application entry point, DepartmentTrackerService.refreshStatuses(),
-- has no caller today.
REVOKE EXECUTE ON FUNCTION public.update_department_statuses() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_department_statuses() TO service_role;

DO $lockcheck$
BEGIN
  IF has_function_privilege('anon', 'public.update_department_statuses()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.update_department_statuses()', 'EXECUTE') THEN
    RAISE EXCEPTION 'update_department_statuses is still EXECUTE-able by anon or authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.update_department_statuses()', 'EXECUTE') THEN
    RAISE EXCEPTION 'update_department_statuses lost EXECUTE for service_role';
  END IF;
END $lockcheck$;

-- ── 4. What refreshes the activity clock ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.on_societal_activity_touch_department()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dept_id  UUID;
    v_when     timestamptz;
    v_sd_id    UUID;
    v_old      TEXT;
BEGIN
    IF TG_TABLE_NAME = 'sh_community_engagements' THEN
        v_dept_id := NEW.department_id;
        -- The engagement's own date, not now(): a backfilled entry for work
        -- done in March must not read as activity today.
        v_when := NEW.engagement_date::timestamptz;
    ELSE
        -- sh_solutions flipped to pro-bono
        IF NOT NEW.is_pro_bono OR (TG_OP = 'UPDATE' AND OLD.is_pro_bono) THEN
            RETURN NEW;
        END IF;
        v_dept_id := NEW.lead_department_id;
        v_when := now();
    END IF;

    IF v_dept_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT sd.id, sd.status INTO v_sd_id, v_old
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

    -- Reactivate only when the activity is recent enough to mean it. An entry
    -- for work done four months ago should not clear a dormant flag.
    IF v_old IN ('at_risk', 'dormant') AND v_when > now() - interval '30 days' THEN
        UPDATE public.sh_solution_departments
        SET status = 'active', updated_at = now()
        WHERE id = v_sd_id;

        INSERT INTO public.sh_department_status_history
            (solution_department_id, previous_status, new_status, reason, changed_at)
        VALUES (v_sd_id, v_old, 'active', 'Reactivated: societal activity recorded', now());
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_engagement_touches_dept ON public.sh_community_engagements;
CREATE TRIGGER trg_community_engagement_touches_dept
    AFTER INSERT OR UPDATE OF engagement_date, department_id
    ON public.sh_community_engagements
    FOR EACH ROW EXECUTE FUNCTION public.on_societal_activity_touch_department();

DROP TRIGGER IF EXISTS trg_pro_bono_touches_dept ON public.sh_solutions;
CREATE TRIGGER trg_pro_bono_touches_dept
    AFTER INSERT OR UPDATE OF is_pro_bono
    ON public.sh_solutions
    FOR EACH ROW EXECUTE FUNCTION public.on_societal_activity_touch_department();

-- ── 5. The grant ────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_roles text[];
  v_after int;
BEGIN
  SELECT array_agg(role_key ORDER BY role_key)
    INTO v_roles
    FROM public.custom_roles
   WHERE (permissions->>'solutions.dashboard.view')::boolean IS TRUE;

  IF v_roles IS NULL OR array_length(v_roles, 1) = 0 THEN
    RAISE EXCEPTION
      'No role holds solutions.dashboard.view = true, so there is nobody to '
      'grant the societal keys to. Refusing rather than guessing a role list.';
  END IF;

  RAISE NOTICE 'Granting solutions.societal.view/.record to: %',
    array_to_string(v_roles, ', ');

  UPDATE public.custom_roles
     SET permissions = permissions || jsonb_build_object(
           'solutions.societal.view',   true,
           'solutions.societal.record', true
         ),
         updated_at = now()
   WHERE role_key = ANY (v_roles);

  SELECT count(*)
    INTO v_after
    FROM public.custom_roles
   WHERE role_key = ANY (v_roles)
     AND (permissions->>'solutions.societal.view')::boolean IS TRUE
     AND (permissions->>'solutions.societal.record')::boolean IS TRUE;

  IF v_after <> array_length(v_roles, 1) THEN
    RAISE EXCEPTION
      'Expected % roles to hold both societal keys, found %.',
      array_length(v_roles, 1), v_after;
  END IF;
END $$;
