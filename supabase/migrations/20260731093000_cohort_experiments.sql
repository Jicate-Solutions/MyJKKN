-- ============================================================================
-- COHORT CORE — M7.2: control-group arm + causal lift (Phase 7 · MOAT · M6)
-- Created: 2026-07-06  (plan: docs/cohort-core/PLAN.md, PHASE 7 · M6 → item 7.2)
-- ============================================================================
-- WHAT: The CONFOUND KILLER. A within-cohort A/B experiment layer:
--   1. experiment_arm ∈ {control, treatment} on cohort_memberships.config
--      (jsonb key — no schema change). fn_assign_experiment_arms_for_cohort()
--      deterministically 50/50-assigns any unassigned non-terminal member.
--   2. public.cohort_experiments — one row per cohort holding the arm means and
--      the CAUSAL lift = mean(treatment lift) − mean(control lift).
--   3. fn_compute_cohort_experiment(cohort_id) aggregates the captured outcome
--      lifts by arm and upserts the experiment result.
--
-- WHY (PLAN.md M6): "auto-adjust ALWAYS gated by a no-change CONTROL group
--   (within-cohort team-level A/B, since 1 cohort has no prior). This kills the
--   regression-to-mean confound AND is exactly what makes the 2-cycle sim
--   certifiable." A naive "cohorts improved by X" number credits regression to
--   the mean and a dozen exogenous factors to your intervention. The control arm
--   regresses IDENTICALLY, so subtracting it leaves only the intervention effect.
--   We store naive_lift (the confounded number) beside causal_lift so the gap —
--   the regression the naive number would have falsely claimed — is visible.
--
-- ARM ASSIGNMENT: deterministic on membership id (hashtextextended) so it is
--   STABLE (re-running never reshuffles) and reproducible. Assignment is
--   pre-outcome (at/after enroll, before close) — a valid A/B requires the arm to
--   be fixed before the outcome is known. Already-terminal or already-armed
--   members are left untouched (idempotent).
--
-- TIER: TIER-1 (new table + fns; IDEMPOTENT; NON-DESTRUCTIVE; DROPS-NOTHING).
-- ============================================================================

-- ── 1. cohort_experiments — one causal-lift result per cohort ──────────────────
CREATE TABLE IF NOT EXISTS public.cohort_experiments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id           uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  kind                text NOT NULL CHECK (kind IN ('sf100','foundations','cdc','trainer')),
  n_treatment         int  NOT NULL DEFAULT 0,
  n_control           int  NOT NULL DEFAULT 0,
  treatment_mean_lift numeric,
  control_mean_lift   numeric,
  -- CAUSAL lift = treatment_mean − control_mean (NULL if either arm is empty:
  -- a causal claim needs both arms). This is the number the feed-forward loop
  -- (7.3) is allowed to act on.
  causal_lift         numeric,
  -- NAIVE lift = mean lift across ALL scored members (ignores arms). This is the
  -- CONFOUNDED number kept only for contrast — the loop must NOT act on it.
  naive_lift          numeric,
  n_scored            int  NOT NULL DEFAULT 0,
  estimator_version   text,
  computed_at         timestamptz NOT NULL DEFAULT now(),
  institution_id      uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- one experiment result per cohort; fn_compute upserts on this.
  CONSTRAINT cohort_experiments_cohort_uidx UNIQUE (cohort_id)
);

CREATE INDEX IF NOT EXISTS idx_cohort_experiments_institution
  ON public.cohort_experiments (institution_id);
CREATE INDEX IF NOT EXISTS idx_cohort_experiments_kind
  ON public.cohort_experiments (kind);

-- ── 2. RLS — institution-scoped, repo-canonical dynamic-permission pattern ─────
ALTER TABLE public.cohort_experiments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cohort_experiments_select_permission ON public.cohort_experiments;
CREATE POLICY cohort_experiments_select_permission ON public.cohort_experiments
  FOR SELECT USING (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.view'::text))
        AND (select role_has_institution_access(institution_id)))
  );

-- INSERT/UPDATE is manage-level (the compute fn is DEFINER and bypasses RLS; this
-- governs a manual/service-role-less recompute performed as the user).
DROP POLICY IF EXISTS cohort_experiments_insert_permission ON public.cohort_experiments;
CREATE POLICY cohort_experiments_insert_permission ON public.cohort_experiments
  FOR INSERT WITH CHECK (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.manage'::text))
        AND (select role_has_institution_access(institution_id)))
  );

DROP POLICY IF EXISTS cohort_experiments_update_permission ON public.cohort_experiments;
CREATE POLICY cohort_experiments_update_permission ON public.cohort_experiments
  FOR UPDATE USING (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.manage'::text))
        AND (select role_has_institution_access(institution_id)))
  );

-- DELETE admin-only (an experiment result is a moat audit record).
DROP POLICY IF EXISTS cohort_experiments_delete_permission ON public.cohort_experiments;
CREATE POLICY cohort_experiments_delete_permission ON public.cohort_experiments
  FOR DELETE USING ( (select is_super_admin()) OR (select is_admin()) );

-- ── 3. deterministic arm assignment ────────────────────────────────────────────
-- 50/50 split by a stable hash of the membership id. Only touches non-terminal
-- members that have NO arm yet → idempotent + re-run-safe. Returns the count of
-- members newly assigned. SECURITY INVOKER: the config UPDATE is governed by the
-- caller's RLS on cohort_memberships (cohort.manage + institution access), so a
-- caller can only assign arms in cohorts they already manage — no DEFINER bypass,
-- no cross-tenant write, no hand-rolled gate to drift.
CREATE OR REPLACE FUNCTION public.fn_assign_experiment_arms_for_cohort(p_cohort_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_assigned int;
BEGIN
  WITH to_assign AS (
    SELECT id,
           -- stable pseudo-random bit from the id; even → control, odd → treatment.
           CASE WHEN (abs(hashtextextended(id::text, 0)) % 2) = 0
                THEN 'control' ELSE 'treatment' END AS arm
    FROM public.cohort_memberships
    WHERE cohort_id = p_cohort_id
      AND status NOT IN ('graduated','removed')
      AND COALESCE(config->>'experiment_arm', '') = ''
  ), upd AS (
    UPDATE public.cohort_memberships m
       SET config = COALESCE(m.config, '{}'::jsonb)
                    || jsonb_build_object('experiment_arm', t.arm),
           updated_at = now()
      FROM to_assign t
     WHERE m.id = t.id
    RETURNING m.id
  )
  SELECT COUNT(*) INTO v_assigned FROM upd;
  RETURN v_assigned;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_assign_experiment_arms_for_cohort(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_assign_experiment_arms_for_cohort(uuid) TO authenticated;

-- Minimum members PER ARM before a causal_lift is trustworthy. With 1-vs-1 the
-- "causal lift" is just the difference of two individuals — pure noise — yet it
-- would read as authoritative and drive an auto-adjustment. Gate it.
CREATE OR REPLACE FUNCTION public.fn_cohort_min_arm_n()
RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 3 $$;
REVOKE EXECUTE ON FUNCTION public.fn_cohort_min_arm_n() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cohort_min_arm_n() TO authenticated;

-- ── 4. compute the causal lift for a cohort ────────────────────────────────────
-- Aggregates the captured, SCORED outcome lifts by the member's experiment_arm
-- (read from the retained membership row — D7 keeps memberships as history) and
-- upserts one cohort_experiments row. causal_lift is NULL unless BOTH arms have
-- at least one scored member. Returns the computed row as jsonb.
-- SECURITY INVOKER: reads cohort_outcomes/memberships and writes cohort_experiments
-- entirely under the caller's RLS (cohort.view to read, cohort.manage+institution
-- to insert). A cross-tenant caller sees zero outcomes and cannot insert the
-- experiment row — RLS scopes it, no DEFINER bypass.
CREATE OR REPLACE FUNCTION public.fn_compute_cohort_experiment(p_cohort_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_kind    text;
  v_inst    uuid;
  v_tmean numeric; v_cmean numeric; v_nmean numeric;
  v_tn int; v_cn int; v_scored int;
  v_ver text;
  v_row public.cohort_experiments;
BEGIN
  SELECT c.kind, c.institution_id INTO v_kind, v_inst
    FROM public.cohorts c WHERE c.id = p_cohort_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'cohort % has no institution (cannot compute experiment)', p_cohort_id
      USING ERRCODE = 'check_violation';
  END IF;

  WITH scored AS (
    SELECT
      COALESCE(m.config->>'experiment_arm',
               o.outcome_snapshot#>>'{membership_config,experiment_arm}') AS arm,
      (o.outcome_snapshot->>'lift')::numeric AS lift,
      o.outcome_snapshot->>'estimator_version' AS ver
    FROM public.cohort_outcomes o
    LEFT JOIN public.cohort_memberships m ON m.id = o.membership_id
    WHERE o.cohort_id = p_cohort_id
      AND COALESCE((o.outcome_snapshot->>'scored')::boolean, false) = true
      AND (o.outcome_snapshot->>'lift') IS NOT NULL
      -- M1: only aggregate outcomes from the CURRENT estimator version. Mixing
      -- versions would defeat the "same fixed estimator both ends" invariant.
      AND o.outcome_snapshot->>'estimator_version' = public.fn_cohort_estimator_version()
  )
  SELECT
    avg(lift) FILTER (WHERE arm = 'treatment'),
    avg(lift) FILTER (WHERE arm = 'control'),
    avg(lift),
    count(*)  FILTER (WHERE arm = 'treatment'),
    count(*)  FILTER (WHERE arm = 'control'),
    count(*),
    max(ver)
  INTO v_tmean, v_cmean, v_nmean, v_tn, v_cn, v_scored, v_ver
  FROM scored;

  INSERT INTO public.cohort_experiments AS ce (
    cohort_id, kind, n_treatment, n_control,
    treatment_mean_lift, control_mean_lift,
    causal_lift, naive_lift, n_scored, estimator_version,
    computed_at, institution_id, metadata
  ) VALUES (
    p_cohort_id, v_kind, COALESCE(v_tn,0), COALESCE(v_cn,0),
    round(v_tmean,6), round(v_cmean,6),
    -- causal_lift is trustworthy only with enough members PER ARM (min_arm_n);
    -- below that it is noise → leave it NULL so the M5 feed-forward gate refuses it.
    CASE WHEN v_tn >= public.fn_cohort_min_arm_n() AND v_cn >= public.fn_cohort_min_arm_n()
         THEN round(v_tmean - v_cmean, 6) ELSE NULL END,
    round(v_nmean,6), COALESCE(v_scored,0), v_ver,
    now(), v_inst,
    jsonb_build_object('note', 'causal_lift = treatment_mean - control_mean; naive_lift is confounded (do not act on it)')
  )
  ON CONFLICT (cohort_id) DO UPDATE SET
    n_treatment = EXCLUDED.n_treatment,
    n_control   = EXCLUDED.n_control,
    treatment_mean_lift = EXCLUDED.treatment_mean_lift,
    control_mean_lift   = EXCLUDED.control_mean_lift,
    causal_lift = EXCLUDED.causal_lift,
    naive_lift  = EXCLUDED.naive_lift,
    n_scored    = EXCLUDED.n_scored,
    estimator_version = EXCLUDED.estimator_version,
    computed_at = now(),
    metadata    = EXCLUDED.metadata
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_compute_cohort_experiment(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_compute_cohort_experiment(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
