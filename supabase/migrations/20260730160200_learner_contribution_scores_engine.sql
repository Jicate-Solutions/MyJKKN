-- ============================================================================
-- Learner contribution scoring engine — table, RPC and calibrated policy seeds
-- Migration: 20260730160200
-- Applied to production: 2026-07-30 (this file is the repo record of live state)
-- ============================================================================
--
-- Reproduces what is ALREADY RUNNING on production. The function body below was
-- captured with pg_get_functiondef and is byte-for-byte the deployed body.
-- Every statement is guarded (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF
-- EXISTS / INSERT ... WHERE NOT EXISTS), so re-running is safe.
--
-- ONE DELIBERATE DELTA FROM LIVE: the function REVOKE at the bottom now also
-- removes `authenticated`, which production currently grants. That one statement
-- changes production privileges; everything else is a no-op. Rationale at the line.
--
-- The counterpart to compute_learner_risk_assessment: risk asks who is falling
-- behind, this asks who is carrying more than their share. Admin-only —
-- deliberately NOT surfaced to the learners it ranks.
--
-- ---------------------------------------------------------------------------
-- Why the thresholds are 5/18/30/40 and not the round 15/35/60/80
-- ---------------------------------------------------------------------------
-- Same renormalisation trap as the risk engine, arrived at from the other side.
-- The five dimensions are weighted to 100, but no learner on the platform today
-- registers activity in more than 3 of the 5 — so with the original 15/35/60/80
-- ladder the top two tiers were unreachable in practice, exactly the defect this
-- migration's sibling fixes for risk. The function renormalises by v_w_applied
-- (the weight of the dimensions that are populated PLATFORM-WIDE), and the
-- thresholds were then calibrated against the resulting real distribution
-- measured on 2026-07-30: p50=4, p75=18, p90=30, p95=37, p99=50.
--
-- Note the asymmetry inside v_w_applied, which is intentional and easy to get
-- wrong: a source that is empty across the WHOLE platform cannot be measured and
-- is excluded from the denominator, but a learner simply absent from a POPULATED
-- source scored a genuine zero and must stay in it. That is participation data,
-- not missing data — treating it as missing would reward non-participation.
--
-- These live in platform_policies, so recalibration as participation broadens is
-- a config edit, not a deploy. Resulting distribution across 4,342 learners:
-- minimal 2,385 · emerging 759 · steady 627 · strong 414 · exceptional 157.
--
-- ---------------------------------------------------------------------------
-- Seeding platform_policies: why not ON CONFLICT (policy_key)
-- ---------------------------------------------------------------------------
-- platform_policies has NO unique constraint on policy_key alone. Its unique
-- index is uq_platform_policies_key_scope on
--   (policy_key, scope_type, COALESCE(scope_id, '00000000-...-0000'::uuid))
-- and ON CONFLICT requires an inference matching a real constraint, so
-- ON CONFLICT (policy_key) fails outright with 42P10 (invalid_column_reference).
-- INSERT ... SELECT ... WHERE NOT EXISTS is used instead: it is idempotent, it
-- needs no constraint inference, and — unlike DO UPDATE — it will not overwrite a
-- value the Director has since retuned through the config UI.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learner_contribution_scores (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id         UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id     UUID,
  assessment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  contribution_score SMALLINT NOT NULL,
  contribution_tier  TEXT NOT NULL,
  dimension_scores   JSONB NOT NULL DEFAULT '{}'::jsonb,
  highlights         TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (learner_id, assessment_date)
);

CREATE INDEX IF NOT EXISTS idx_lcs_learner
  ON public.learner_contribution_scores (learner_id);

-- score DESC because every read of this table is "top contributors first".
CREATE INDEX IF NOT EXISTS idx_lcs_inst_sc
  ON public.learner_contribution_scores (institution_id, contribution_score DESC);

-- ---------------------------------------------------------------------------
-- 2. RLS — exactly two policies
-- ---------------------------------------------------------------------------
-- RLS is what keeps one college out of another's rows; the REVOKE further down
-- is what shuts the public anon key. They defend different doors — neither alone
-- is sufficient, so both are present.
ALTER TABLE public.learner_contribution_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lcs_service_all   ON public.learner_contribution_scores;
DROP POLICY IF EXISTS lcs_admin_select  ON public.learner_contribution_scores;

-- The compute RPC writes through service_role. No INSERT/UPDATE/DELETE policy
-- exists for `authenticated` by design, so RLS blocks every client-side write
-- even though Supabase's default grant hands authenticated full table privileges.
CREATE POLICY lcs_service_all ON public.learner_contribution_scores
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Every guard is COALESCE-wrapped, and that is load-bearing rather than tidy.
-- A SECURITY DEFINER helper that returns NULL makes the surrounding expression
-- NULL, and `NULL OR false` is NULL, not false — a USING clause that evaluates
-- to NULL denies here, but the same shape in an IF/NOT guard FALLS THROUGH AND
-- GRANTS. That exact asymmetry produced the anon write hole fixed on 2026-07-30
-- in fn_update_recruitment_step_comment. COALESCE makes every term fail closed.
--
-- `institution_id IS NOT NULL` is the second half of that same defence, and it is
-- NOT redundant with the COALESCE. Measured on prod 2026-07-30:
--   SELECT role_has_institution_access(NULL) -> TRUE
-- because the helper reads a NULL institution as a system-wide record. So on a
-- row with NULL institution_id the COALESCE never fires — it is wrapping a
-- genuine TRUE, not a NULL — and ANY authenticated user in ANY college holding
-- `learners.contribution.view` could read that row across the tenant boundary.
-- institution_id is nullable here because the compute RPC copies it straight
-- from `learners_profiles.institution_id`, which is itself nullable. Today no
-- active learner has a NULL institution (0 of 4,342), so this is latent rather
-- than live — which is exactly why it must be closed now, while it costs one
-- clause instead of an incident. A row with no institution is readable by super
-- admin only.
--
-- `is_admin()` is deliberately ABSENT, and its absence is the point. It is a
-- GLOBAL role-name check with no institution scoping —
--   EXISTS (SELECT 1 FROM profiles WHERE id = user_id
--           AND (is_super_admin OR role IN ('admin','super_admin','administrator')))
-- — so as a standalone OR branch it ignores institution_id entirely and lets any
-- profile carrying one of those legacy role names read EVERY institution's rows.
-- This repo has already ruled that exact shape a multi-tenant leak TWICE and
-- removed it in production:
--   20260703160000_close_admission_pii_is_admin_leak.sql
--   20260731000000_fix_student_attendance_rls_is_admin_leak.sql
-- Measured on prod 2026-07-30: THREE accounts (1 'admin', 2 'administrator')
-- carry is_super_admin = false and would have read all 4,342 learners' rows
-- across all 14 institutions through that branch. This table holds exactly the
-- per-institution learner PII those two migrations were protecting, so it ships
-- with the corrected pattern rather than adding a third instance of the defect.
-- Access is: super admin, OR (holds the permission AND the row's institution is
-- in scope).
CREATE POLICY lcs_admin_select ON public.learner_contribution_scores
  FOR SELECT TO authenticated
  USING (
    COALESCE(is_super_admin(), false)
    OR (
      COALESCE(user_has_permission('learners.contribution.view'), false)
      AND institution_id IS NOT NULL
      AND COALESCE(role_has_institution_access(institution_id), false)
    )
  );

-- Both anon AND PUBLIC — see the note in the sibling migration; revoking anon
-- alone is a no-op when the privilege was inherited from PUBLIC.
REVOKE ALL ON TABLE public.learner_contribution_scores FROM anon, PUBLIC;

-- ---------------------------------------------------------------------------
-- 3. Config seeds (idempotent; will not clobber a retuned value)
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, data_type, classification, is_system, is_active, description)
SELECT
  'learner_contribution.weights', 'global', NULL,
  '{"events_participation": 30, "events_leadership": 20, "career_development": 20, "pde_demonstrations": 15, "induction_engagement": 15}'::jsonb,
  'object', 'major', true, true,
  'Weights for each learner contribution dimension (must sum to 100). Editable by Director.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'learner_contribution.weights' AND scope_type = 'global' AND scope_id IS NULL
);

INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, data_type, classification, is_system, is_active, description)
SELECT
  'learner_contribution.tier_thresholds', 'global', NULL,
  '{"emerging": 5, "steady": 18, "strong": 30, "exceptional": 40}'::jsonb,
  'object', 'major', true, true,
  'Contribution score thresholds. Percentile-calibrated 2026-07-30 (p50/p75/p90/p95). Recalibrate as participation broadens.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'learner_contribution.tier_thresholds' AND scope_type = 'global' AND scope_id IS NULL
);

-- ---------------------------------------------------------------------------
-- 4. Compute RPC
-- ---------------------------------------------------------------------------
-- NOTE the in-code COALESCE fallbacks below read 15/35/60/80, NOT the calibrated
-- 5/18/30/40. That is the deployed body and is left exactly as it runs: the seeds
-- above are always present, so the fallbacks are dead on this database and exist
-- only to keep the function callable on a fresh one. Retune via platform_policies,
-- never by editing these literals.
CREATE OR REPLACE FUNCTION public.compute_learner_contribution_score(p_target_date date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_learner        RECORD;
  v_count          INT := 0;
  v_w              JSONB;
  v_t              JSONB;
  v_w_events       INT; v_w_lead INT; v_w_career INT; v_w_pde INT; v_w_induct INT;
  v_t_emerging     INT; v_t_steady INT; v_t_strong INT; v_t_exceptional INT;
  v_w_applied      INT;
  v_has_events     BOOLEAN; v_has_career BOOLEAN; v_has_pde BOOLEAN; v_has_induct BOOLEAN;
  v_s_events       INT; v_s_lead INT; v_s_career INT; v_s_pde INT; v_s_induct INT;
  v_n_events       INT; v_n_lead INT; v_n_career INT; v_n_pde INT;
  v_adv            NUMERIC; v_outcome BOOLEAN;
  v_score          INT;
  v_tier           TEXT;
  v_high           TEXT[];
BEGIN
  SELECT value INTO v_w FROM platform_policies
    WHERE policy_key='learner_contribution.weights' AND scope_type='global' AND is_active;
  SELECT value INTO v_t FROM platform_policies
    WHERE policy_key='learner_contribution.tier_thresholds' AND scope_type='global' AND is_active;

  v_w_events := COALESCE((v_w->>'events_participation')::INT,30);
  v_w_lead   := COALESCE((v_w->>'events_leadership')::INT,20);
  v_w_career := COALESCE((v_w->>'career_development')::INT,20);
  v_w_pde    := COALESCE((v_w->>'pde_demonstrations')::INT,15);
  v_w_induct := COALESCE((v_w->>'induction_engagement')::INT,15);

  v_t_emerging    := COALESCE((v_t->>'emerging')::INT,15);
  v_t_steady      := COALESCE((v_t->>'steady')::INT,35);
  v_t_strong      := COALESCE((v_t->>'strong')::INT,60);
  v_t_exceptional := COALESCE((v_t->>'exceptional')::INT,80);

  -- A source that is empty PLATFORM-WIDE cannot be measured and must not sit in
  -- the denominator. (A learner absent from a populated source genuinely scored 0
  -- and DOES count -- that is participation data, not missing data.)
  SELECT EXISTS(SELECT 1 FROM event_team_members      WHERE learner_id IS NOT NULL LIMIT 1) INTO v_has_events;
  SELECT EXISTS(SELECT 1 FROM cdc_training_enrollments WHERE learner_id IS NOT NULL LIMIT 1) INTO v_has_career;
  SELECT EXISTS(SELECT 1 FROM pde_demonstrations       WHERE learner_id IS NOT NULL LIMIT 1) INTO v_has_pde;
  SELECT EXISTS(SELECT 1 FROM induction_completion     WHERE learner_id IS NOT NULL LIMIT 1) INTO v_has_induct;

  v_w_applied := (CASE WHEN v_has_events THEN v_w_events + v_w_lead ELSE 0 END)
               + (CASE WHEN v_has_career THEN v_w_career ELSE 0 END)
               + (CASE WHEN v_has_pde    THEN v_w_pde    ELSE 0 END)
               + (CASE WHEN v_has_induct THEN v_w_induct ELSE 0 END);
  RAISE NOTICE 'learner_contribution: earnable weight = % of 100', v_w_applied;

  FOR v_learner IN
    SELECT lp.id AS learner_id, lp.institution_id
    FROM learners_profiles lp
    WHERE lp.lifecycle_status = 'active'
  LOOP
    v_s_events:=0; v_s_lead:=0; v_s_career:=0; v_s_pde:=0; v_s_induct:=0; v_high:='{}';

    IF v_has_events THEN
      SELECT count(*), count(*) FILTER (WHERE is_leader)
        INTO v_n_events, v_n_lead
        FROM event_team_members WHERE learner_id = v_learner.learner_id;
      v_s_events := LEAST(100, COALESCE(v_n_events,0) * 14);   -- p90 = 7.6 events
      v_s_lead   := LEAST(100, COALESCE(v_n_lead,0)   * 35);   -- 3 leadership roles = 100
      IF COALESCE(v_n_lead,0)   > 0 THEN v_high := array_append(v_high, 'Led '||v_n_lead||' event team(s)'); END IF;
      IF COALESCE(v_n_events,0) > 2 THEN v_high := array_append(v_high, 'Participated in '||v_n_events||' events'); END IF;
    END IF;

    IF v_has_career THEN
      SELECT count(*) INTO v_n_career FROM cdc_training_enrollments WHERE learner_id = v_learner.learner_id;
      v_s_career := LEAST(100, COALESCE(v_n_career,0) * 50);
      IF COALESCE(v_n_career,0) > 0 THEN v_high := array_append(v_high, v_n_career||' career-development programme(s)'); END IF;
    END IF;

    IF v_has_pde THEN
      SELECT count(*) INTO v_n_pde FROM pde_demonstrations WHERE learner_id = v_learner.learner_id AND passed;
      v_s_pde := LEAST(100, COALESCE(v_n_pde,0) * 33);
      IF COALESCE(v_n_pde,0) > 0 THEN v_high := array_append(v_high, v_n_pde||' skill demonstration(s) passed'); END IF;
    END IF;

    IF v_has_induct THEN
      SELECT advocacy_score, outcome_complete INTO v_adv, v_outcome
        FROM induction_completion WHERE learner_id = v_learner.learner_id
        ORDER BY completed_at DESC NULLS LAST LIMIT 1;
      IF v_adv IS NOT NULL OR v_outcome IS NOT NULL THEN
        v_s_induct := LEAST(100, COALESCE(v_adv,0)::INT * 10 + CASE WHEN v_outcome THEN 20 ELSE 0 END);
        IF COALESCE(v_adv,0) >= 8 THEN v_high := array_append(v_high, 'High induction advocacy ('||v_adv||'/10)'); END IF;
      END IF;
    END IF;

    v_score := LEAST(100, GREATEST(0,
      (v_s_events*v_w_events + v_s_lead*v_w_lead + v_s_career*v_w_career
       + v_s_pde*v_w_pde + v_s_induct*v_w_induct) / GREATEST(v_w_applied,1)
    ));

    IF    v_score >= v_t_exceptional THEN v_tier:='exceptional';
    ELSIF v_score >= v_t_strong      THEN v_tier:='strong';
    ELSIF v_score >= v_t_steady      THEN v_tier:='steady';
    ELSIF v_score >= v_t_emerging    THEN v_tier:='emerging';
    ELSE  v_tier:='minimal';
    END IF;

    INSERT INTO learner_contribution_scores
      (learner_id, institution_id, assessment_date, contribution_score, contribution_tier, dimension_scores, highlights)
    VALUES (v_learner.learner_id, v_learner.institution_id, p_target_date, v_score, v_tier,
      jsonb_build_object('events_participation',v_s_events,'events_leadership',v_s_lead,
                         'career_development',v_s_career,'pde_demonstrations',v_s_pde,
                         'induction_engagement',v_s_induct),
      v_high)
    ON CONFLICT (learner_id, assessment_date) DO UPDATE SET
      contribution_score = EXCLUDED.contribution_score,
      contribution_tier  = EXCLUDED.contribution_tier,
      dimension_scores   = EXCLUDED.dimension_scores,
      highlights         = EXCLUDED.highlights;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- authenticated revoked for the same reason as the risk engine: this writes a row
-- per active learner and has no caller anywhere in jicate/main or pg_cron. The
-- explicit REVOKE is required because CREATE OR REPLACE preserves the live ACL.
REVOKE EXECUTE ON FUNCTION public.compute_learner_contribution_score(date) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.compute_learner_contribution_score(date) TO service_role;
