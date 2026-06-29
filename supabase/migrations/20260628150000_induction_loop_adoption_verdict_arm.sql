-- ============================================================================
-- Fresher Induction — Phase 6 follow-up: adoption-verdict FALSIFICATION ARM
-- File: 20260628150000_induction_loop_adoption_verdict_arm.sql | Date: 2026-06-28
--
-- WHY: a moat-loop causal-validity check showed the induction loop's lift
-- (this_cohort_score − prior_cohort_score, across DIFFERENT freshers a year apart)
-- is CONFOUNDED — a positive year-over-year lift can be regression-to-the-mean /
-- a better admission market, not the playbook. A live demo proved it: two cohorts
-- IDENTICAL in every causal input got opposite lift verdicts purely from their
-- prior level. With no counterfactual, the loop is self-reinforcing, not a moat.
--
-- THE FIX (mirrors the SCF "revive the dead channel" gap-close): naturally-IGNORED
-- playbooks become the CONTROL group. Record whether each cohort's coordinator
-- ADOPTED / partially-adopted / IGNORED the playbook, feed that verdict forward,
-- and expose a confound-check that compares adopted-vs-ignored lift. Only when
-- adopted cohorts lift MORE than ignored ones (across enough cohorts) can the
-- moat be certified. This migration builds that arm:
--   1. fn_induction_set_playbook_verdict   — human write path (was a dead channel)
--   2. fn_induction_prior_loop_suggestion   — now ALSO returns human_verdict (feed-fwd)
--   3. fn_induction_loop_confound_check      — the runnable adopted-vs-ignored falsification
--
-- The scf_ai_suggestions.human_verdict / human_verdict_at columns already exist
-- (shared with the SCF loop) — induction simply starts writing+reading them.
-- ============================================================================

-- ── 0. Expand the shared human_verdict CHECK to admit induction's vocabulary ────
-- The constraint was defined for the SCF loop's verdicts only
-- (tried_helped/tried_no_change/not_tried). Induction adds adopted/partial/ignored.
-- Additive: SCF values preserved; NULL still allowed. (Caught by the moat-loop
-- write-path sim — the function DDL dry-ran clean, but a real verdict write tripped
-- this constraint, which a CREATE-only dry-run never exercises.)
ALTER TABLE public.scf_ai_suggestions DROP CONSTRAINT IF EXISTS scf_ai_suggestions_human_verdict_check;
ALTER TABLE public.scf_ai_suggestions ADD CONSTRAINT scf_ai_suggestions_human_verdict_check
  CHECK (human_verdict IS NULL OR human_verdict = ANY (ARRAY[
    'tried_helped','tried_no_change','not_tried',   -- SCF loop (preserved)
    'adopted','partial','ignored'                    -- induction loop (added)
  ]));

-- ── 1. Human write path: set a cohort's playbook adoption verdict ──────────────
-- Verdict semantics (the induction analogue of SCF's tried_helped/tried_no_change/
-- not_tried): 'adopted' = the playbook was implemented (≈ the intervention arm),
-- 'partial' = partly, 'ignored' = not implemented (≈ the CONTROL arm). Canonical
-- authz: super/admin bypass, else induction.manage + institution access.
CREATE OR REPLACE FUNCTION public.fn_induction_set_playbook_verdict(
  p_institution_id    uuid,
  p_academic_year_id  uuid,
  p_verdict           text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_set_playbook_verdict: not authenticated';
  END IF;
  IF p_verdict NOT IN ('adopted','partial','ignored') THEN
    RAISE EXCEPTION 'fn_induction_set_playbook_verdict: invalid verdict "%" — must be adopted, partial, or ignored', p_verdict;
  END IF;
  IF p_institution_id IS NULL OR p_academic_year_id IS NULL THEN
    RAISE EXCEPTION 'fn_induction_set_playbook_verdict: institution_id and academic_year_id are required';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(p_institution_id))) THEN
    RAISE EXCEPTION 'fn_induction_set_playbook_verdict: not authorized to set a verdict for this institution';
  END IF;

  UPDATE public.scf_ai_suggestions
  SET human_verdict    = p_verdict,
      human_verdict_at = now(),
      updated_at       = now()
  WHERE domain = 'induction'
    AND institution_id = p_institution_id
    AND academic_year_id = p_academic_year_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_induction_set_playbook_verdict: no loop playbook exists for this cohort yet';
  END IF;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_set_playbook_verdict(uuid,uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_set_playbook_verdict(uuid,uuid,text) TO authenticated;

-- ── 2. Feed-forward now carries the human_verdict ──────────────────────────────
-- Return-shape change → DROP + CREATE. The generator uses human_verdict to AVOID
-- crediting an IGNORED prior playbook for its lift (advice that wasn't followed
-- can't have caused the change). Otherwise byte-identical to the P6 definition.
DROP FUNCTION IF EXISTS public.fn_induction_prior_loop_suggestion(uuid, uuid);
CREATE OR REPLACE FUNCTION public.fn_induction_prior_loop_suggestion(
  p_institution_id            uuid,
  p_exclude_academic_year_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  generated_at      timestamptz,
  academic_year_id  uuid,
  input_score       numeric,
  suggestion        jsonb,
  outcome_score     numeric,
  outcome_lift      numeric,
  has_outcome       boolean,
  human_verdict     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.generated_at,
         s.academic_year_id::uuid,
         s.input_avg_understood::numeric    AS input_score,
         s.suggestion,
         s.outcome_avg_understood::numeric  AS outcome_score,
         s.outcome_lift::numeric            AS outcome_lift,
         (s.outcome_lift IS NOT NULL)       AS has_outcome,
         s.human_verdict::text              AS human_verdict
  FROM public.scf_ai_suggestions s
  WHERE s.domain = 'induction'
    AND s.institution_id = p_institution_id
    AND s.outcome_lift IS NOT NULL
    AND (p_exclude_academic_year_id IS NULL OR s.academic_year_id <> p_exclude_academic_year_id)
  ORDER BY s.generated_at DESC
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_prior_loop_suggestion(uuid,uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_induction_prior_loop_suggestion(uuid,uuid) TO service_role;

-- ── 3. The runnable falsification: adopted-vs-ignored lift distribution ─────────
-- The causal-validity check, operationalised. Compare avg_lift across verdicts:
--   if IGNORED cohorts lift ~the same as ADOPTED ones → the lift is drift/
--   regression, NOT the playbook → loop is self-reinforcing (NOT a moat).
--   if ADOPTED lifts materially MORE than IGNORED (across enough cohorts) → the
--   playbook has a causal effect → the moat can be certified.
-- Institution-scoped per row (a non-admin only aggregates their own cohorts).
CREATE OR REPLACE FUNCTION public.fn_induction_loop_confound_check(
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE (
  human_verdict text,
  n             bigint,
  avg_lift      numeric,
  stddev_lift   numeric,
  avg_score     numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(s.human_verdict, '(unset)')          AS human_verdict,
         count(*)::bigint                              AS n,
         round(avg(s.outcome_lift), 2)                 AS avg_lift,
         round(stddev_samp(s.outcome_lift), 2)         AS stddev_lift,
         round(avg(s.outcome_avg_understood), 2)       AS avg_score
  FROM public.scf_ai_suggestions s
  WHERE s.domain = 'induction'
    AND s.outcome_lift IS NOT NULL
    AND (p_institution_id IS NULL OR s.institution_id = p_institution_id)
    AND (is_super_admin() OR is_admin() OR role_has_institution_access(s.institution_id))
  GROUP BY COALESCE(s.human_verdict, '(unset)')
  ORDER BY 1;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_loop_confound_check(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_loop_confound_check(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_induction_loop_confound_check(uuid) IS
  'Causal-validity check for the induction loop: per-verdict lift distribution. If ignored cohorts lift ~the same as adopted, the lift is drift/regression not the playbook (self-reinforcing). Only adopted >> ignored across enough cohorts certifies the moat.';

NOTIFY pgrst, 'reload schema';
