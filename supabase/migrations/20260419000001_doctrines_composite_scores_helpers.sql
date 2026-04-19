-- =====================================================================
-- Doctrines v1 — Composite Score Helpers (shared primitives)
-- =====================================================================
-- Part of: feat/doctrines-composite-scores-v1
-- Spec: JKKNKB/MyJKKN/Routines-Stickiness-Ivy-Doctrine.md
-- Thrash-locked: 2026-04-19 (7 decisions)
--
-- Introduces two shared SQL primitives that every per-persona composite
-- score RPC will call:
--
--   1. compute_composite_band(score numeric) → text
--        Maps a 0-100 score to 'red' | 'amber' | 'green'.
--        Thresholds match existing OHS convention on jicate/main.
--
--   2. compute_renormalized_composite(components jsonb, weights jsonb) → jsonb
--        Implements the Thrash Q2 decision: when a component has no data
--        (value IS NULL), renormalize remaining weights so present
--        components cover 100% of the score. Returns:
--          { score: int, band: text, present_components: text[],
--            missing_components: text[] }
--
-- Idempotent: CREATE OR REPLACE. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper 1: compute_composite_band
-- ---------------------------------------------------------------------
-- Band thresholds (matches existing fn_dashboard_metrics OHS convention):
--   score >= 80  → green   (healthy)
--   score >= 60  → amber   (watch)
--   score <  60  → red     (intervene)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_composite_band(p_score numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_score IS NULL THEN
    RETURN 'red';
  ELSIF p_score >= 80 THEN
    RETURN 'green';
  ELSIF p_score >= 60 THEN
    RETURN 'amber';
  ELSE
    RETURN 'red';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.compute_composite_band(numeric) IS
'Doctrines v1 — Maps 0-100 composite score to traffic-light band. Thresholds: green ≥80, amber ≥60, red <60. NULL → red (missing-data is a signal).';


-- ---------------------------------------------------------------------
-- Helper 2: compute_renormalized_composite
-- ---------------------------------------------------------------------
-- Thrash Q2 decision: when a component has NULL value (no data yet),
-- renormalize so present components take proportionally more weight.
--
-- Input:
--   p_components  jsonb {key: numeric_or_null}   e.g. {"attendance": 78, "grades": null, "fees": 92}
--   p_weights     jsonb {key: numeric}           e.g. {"attendance": 25, "grades": 30, "fees": 20}
--
-- Output:
--   jsonb {
--     score: int,                  (final 0-100 composite)
--     band: text,                  (red/amber/green)
--     present_components: text[],  (used in calc)
--     missing_components: text[],  (omitted, shown in narration)
--     effective_weights: jsonb     (renormalized weights actually applied)
--   }
--
-- If ALL components are NULL → returns score 0, band 'red', all missing.
-- If some present, some missing → renormalize to sum=100 across present only.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_renormalized_composite(
  p_components jsonb,
  p_weights jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_val numeric;
  v_weight numeric;
  v_present_sum_weights numeric := 0;
  v_weighted_sum numeric := 0;
  v_score int;
  v_present_components text[] := ARRAY[]::text[];
  v_missing_components text[] := ARRAY[]::text[];
  v_effective_weights jsonb := '{}'::jsonb;
BEGIN
  -- First pass: sum weights of present components
  FOR v_key IN SELECT jsonb_object_keys(p_components) LOOP
    v_val := (p_components->>v_key)::numeric;
    v_weight := COALESCE((p_weights->>v_key)::numeric, 0);

    IF v_val IS NULL THEN
      v_missing_components := array_append(v_missing_components, v_key);
    ELSE
      v_present_components := array_append(v_present_components, v_key);
      v_present_sum_weights := v_present_sum_weights + v_weight;
    END IF;
  END LOOP;

  -- If nothing present, everything is missing → red/0
  IF v_present_sum_weights = 0 THEN
    RETURN jsonb_build_object(
      'score', 0,
      'band', 'red',
      'present_components', v_present_components,
      'missing_components', v_missing_components,
      'effective_weights', '{}'::jsonb
    );
  END IF;

  -- Second pass: renormalize and compute weighted sum
  FOR v_key IN SELECT unnest(v_present_components) LOOP
    v_val := (p_components->>v_key)::numeric;
    v_weight := COALESCE((p_weights->>v_key)::numeric, 0);
    -- Renormalized weight = (original weight / sum of present weights) * 100
    v_effective_weights := v_effective_weights || jsonb_build_object(
      v_key,
      ROUND((v_weight * 100.0 / v_present_sum_weights)::numeric, 2)
    );
    -- Contribution to final score = value * (renormalized weight / 100)
    v_weighted_sum := v_weighted_sum + (v_val * v_weight / v_present_sum_weights);
  END LOOP;

  v_score := LEAST(100, GREATEST(0, ROUND(v_weighted_sum)::int));

  RETURN jsonb_build_object(
    'score', v_score,
    'band', compute_composite_band(v_score),
    'present_components', v_present_components,
    'missing_components', v_missing_components,
    'effective_weights', v_effective_weights
  );
END;
$$;

COMMENT ON FUNCTION public.compute_renormalized_composite(jsonb, jsonb) IS
'Doctrines v1 — Computes weighted composite from components + weights, renormalizing when any component is NULL. Thrash-locked zero-state policy: present components renormalize to 100%, missing components named in output for narration.';


-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
-- Both helpers are pure SQL (no table access) → safe to grant broadly.
GRANT EXECUTE ON FUNCTION public.compute_composite_band(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_renormalized_composite(jsonb, jsonb) TO authenticated;


-- ---------------------------------------------------------------------
-- Self-test (executes at migration time; fails migration if broken)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_result jsonb;
  v_score int;
BEGIN
  -- Test 1: band boundaries
  IF compute_composite_band(90) <> 'green' THEN
    RAISE EXCEPTION 'compute_composite_band(90) expected green';
  END IF;
  IF compute_composite_band(80) <> 'green' THEN
    RAISE EXCEPTION 'compute_composite_band(80) expected green';
  END IF;
  IF compute_composite_band(79.9) <> 'amber' THEN
    RAISE EXCEPTION 'compute_composite_band(79.9) expected amber';
  END IF;
  IF compute_composite_band(60) <> 'amber' THEN
    RAISE EXCEPTION 'compute_composite_band(60) expected amber';
  END IF;
  IF compute_composite_band(59.9) <> 'red' THEN
    RAISE EXCEPTION 'compute_composite_band(59.9) expected red';
  END IF;
  IF compute_composite_band(NULL) <> 'red' THEN
    RAISE EXCEPTION 'compute_composite_band(NULL) expected red';
  END IF;

  -- Test 2: all components present (no renormalization needed)
  v_result := compute_renormalized_composite(
    '{"a": 80, "b": 80, "c": 80, "d": 80}'::jsonb,
    '{"a": 25, "b": 25, "c": 25, "d": 25}'::jsonb
  );
  v_score := (v_result->>'score')::int;
  IF v_score <> 80 THEN
    RAISE EXCEPTION 'All-present composite expected 80, got %', v_score;
  END IF;

  -- Test 3: one component missing → renormalize
  v_result := compute_renormalized_composite(
    '{"a": 90, "b": 90, "c": 90, "d": null}'::jsonb,
    '{"a": 25, "b": 25, "c": 25, "d": 25}'::jsonb
  );
  v_score := (v_result->>'score')::int;
  IF v_score <> 90 THEN
    RAISE EXCEPTION 'Renormalized composite (3 of 4 at 90) expected 90, got %', v_score;
  END IF;
  IF jsonb_array_length(v_result->'missing_components') <> 1 THEN
    RAISE EXCEPTION 'Expected 1 missing component';
  END IF;

  -- Test 4: all missing → 0/red
  v_result := compute_renormalized_composite(
    '{"a": null, "b": null}'::jsonb,
    '{"a": 50, "b": 50}'::jsonb
  );
  IF (v_result->>'score')::int <> 0 THEN
    RAISE EXCEPTION 'All-missing composite expected 0';
  END IF;
  IF v_result->>'band' <> 'red' THEN
    RAISE EXCEPTION 'All-missing band expected red';
  END IF;

  -- Test 5: weighted average correctness
  -- components: a=100 (w=50), b=0 (w=50) → score 50, amber
  v_result := compute_renormalized_composite(
    '{"a": 100, "b": 0}'::jsonb,
    '{"a": 50, "b": 50}'::jsonb
  );
  IF (v_result->>'score')::int <> 50 THEN
    RAISE EXCEPTION 'Weighted 50/50 of 100+0 expected 50, got %', (v_result->>'score')::int;
  END IF;

  RAISE NOTICE 'Doctrines v1 composite helpers: all 5 self-tests passed.';
END;
$$;
