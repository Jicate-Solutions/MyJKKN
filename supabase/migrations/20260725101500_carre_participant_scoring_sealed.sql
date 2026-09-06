-- ============================================================================
-- CARRE participant scoring — SEALED lane (ADDITIVE)
-- 2026-07-25 · Director safety decisions (interview, 2026-07-25):
--   • scorer identity SEALED — visible to no app surface; base-table read is
--     super_admin-only (Director). The rollup NEVER returns identities.
--   • BOTH lanes — 'own' (scoring the experience you live) and 'observer'
--     (scoring a unit you don't belong to).
--   • k>=3 display floor — a (parameter, lane) group with fewer than 3 scorers
--     returns NOTHING (a lone voice can never be isolated).
--   • Freeze messaging: the system keeps saying only "frozen per CARRE audit";
--     the WHY is delivered personally by the Director. (No code change — the
--     coverage map already behaves this way; recorded here as the contract.)
--
-- WHY THIS EXISTS: the Learners Council letter (2026-07-24) documents fear of
-- retaliation. Participant scoring of dignity (RS) items is only honest if the
-- scorer cannot be identified by the people they are scoring. This lane is
-- HUMAN scoring — the "Respect is never AUTO-scored" invariant is untouched.
--
-- The owner audit remains the score of record (the /100). This lane is a
-- separate, sealed participant voice shown k-floored beside it — same
-- never-merged discipline as the Phase-2 auto-signals.
--
-- ADDITIVE-ONLY: new column + new table + 2 new RPCs. No existing fn_care_*/
-- fn_carre_* touched.
-- ============================================================================

-- 1) Per-cycle opt-in: participant scoring is closed unless deliberately opened.
ALTER TABLE public.audit_cycles
  ADD COLUMN IF NOT EXISTS participant_scoring_open boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.audit_cycles.participant_scoring_open IS
  'CARRE sealed participant lane: when true, learners may submit sealed 0-4 scores for this cycle via fn_carre_participant_score. Opened deliberately per cycle, never by default.';

-- 2) The sealed store. scorer_id exists ONLY for dedup/upsert and the
--    super_admin seal — no app surface ever selects it.
CREATE TABLE IF NOT EXISTS public.carre_participant_scores (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id       uuid NOT NULL REFERENCES public.audit_cycles(id) ON DELETE CASCADE,
  parameter_code text NOT NULL,
  lane           text NOT NULL CHECK (lane IN ('own','observer')),
  score          smallint NOT NULL CHECK (score BETWEEN 0 AND 4),
  evidence_note  text,
  scorer_id      uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, parameter_code, scorer_id)
);

CREATE INDEX IF NOT EXISTS idx_carre_participant_scores_cycle
  ON public.carre_participant_scores (cycle_id, parameter_code, lane);

COMMENT ON TABLE public.carre_participant_scores IS
  'SEALED CARRE participant scores. RLS: SELECT is super_admin-only (the Director seal); all writes go through fn_carre_participant_score. The rollup RPC returns k-floored aggregates only — never identities.';

ALTER TABLE public.carre_participant_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carre_participant_scores_seal ON public.carre_participant_scores;
CREATE POLICY carre_participant_scores_seal ON public.carre_participant_scores
  FOR SELECT USING (is_super_admin());
-- Deliberately NO insert/update/delete policies: direct writes are impossible;
-- the SECURITY DEFINER RPC below is the only write path.

REVOKE ALL ON public.carre_participant_scores FROM anon, PUBLIC;
GRANT SELECT ON public.carre_participant_scores TO authenticated;  -- RLS seals it

-- 3) Write path — learners only, open CARRE cycles only, upsert own row.
CREATE OR REPLACE FUNCTION public.fn_carre_participant_score(
  p_cycle_id uuid,
  p_parameter_code text,
  p_score int,
  p_note text DEFAULT NULL,
  p_lane text DEFAULT 'own'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  -- Participant lane is for learners; staff/owners score through the audit UI.
  IF COALESCE(get_current_user_role(), '') NOT IN ('student', 'learner') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'learners_only');
  END IF;

  IF p_lane NOT IN ('own', 'observer') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'bad_lane');
  END IF;

  IF p_score IS NULL OR p_score < 0 OR p_score > 4 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'bad_score');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_cycles c
    WHERE c.id = p_cycle_id
      AND c.frameworks @> ARRAY['CARRE']::text[]
      AND c.participant_scoring_open
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cycle_not_open');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_parameter_catalog p
    WHERE p.code = p_parameter_code AND p.code LIKE 'CARRE-%'
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'bad_parameter');
  END IF;

  INSERT INTO public.carre_participant_scores
    (cycle_id, parameter_code, lane, score, evidence_note, scorer_id)
  VALUES (p_cycle_id, p_parameter_code, p_lane, p_score, NULLIF(trim(p_note), ''), v_uid)
  ON CONFLICT (cycle_id, parameter_code, scorer_id) DO UPDATE
    SET score = EXCLUDED.score,
        lane = EXCLUDED.lane,
        evidence_note = EXCLUDED.evidence_note,
        updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_participant_score(uuid, text, int, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_participant_score(uuid, text, int, text, text) TO authenticated;

-- 4) Read path — leadership-gated, k>=3 floor, aggregates ONLY.
CREATE OR REPLACE FUNCTION public.fn_carre_participant_rollup(p_cycle_id uuid)
RETURNS TABLE (parameter_code text, lane text, scorers int, median_score numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- Mirror of fn_carre_module_coverage's leadership gate.
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('audit.cycle.view')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.parameter_code,
         s.lane,
         count(*)::int,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY s.score)::numeric
  FROM public.carre_participant_scores s
  WHERE s.cycle_id = p_cycle_id
  GROUP BY s.parameter_code, s.lane
  HAVING count(*) >= 3          -- the k-floor: below 3 scorers, NOTHING returns
  ORDER BY s.parameter_code, s.lane;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_carre_participant_rollup(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_participant_rollup(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
