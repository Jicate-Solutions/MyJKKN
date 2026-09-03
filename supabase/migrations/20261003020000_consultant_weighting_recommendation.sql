-- =============================================================================
-- 20261003020000_consultant_weighting_recommendation.sql
-- Consultants loop (Wave 2) — PR 1 of the lane, part 2: the suggested-weighting
-- RECORD. Depends on 20261003010000 (measurement spine).
--
-- ⛔ ADVISORY ONLY — THIS TABLE MUST NEVER DRIVE ALLOCATION. The master spec's
-- row reads "Rating → lead-allocation weighting → conversion delta", but the
-- consultant/referral territory carries standing Director rulings (hold on
-- walk-in credits; the commission pipeline has deliberately never run), so the
-- 'weighting' half ships as a RECORDED RECOMMENDATION a human can read — a
-- future admin surface renders it; NOTHING consumes it to act. Enforcement is
-- structural, not just prose (feedback_a_ruling_with_no_enforcement_point,
-- 2026-08-24 — three artefacts describing a rule ≠ the rule running):
--   * status has a CLOSED single-value CHECK ('advisory') — an 'applied' state
--     cannot even be recorded without a future Director-gated migration
--     widening the CHECK.
--   * no trigger, no FK from any allocation/credit/commission table, and no
--     grant beyond SELECT; the only writer is the service_role-only fn below.
--   * lead assignment code paths are untouched by this PR (grep receipt in the
--     PR body).
--
-- FILE ONLY / NOT APPLIED — Director-gated, per the lane's standing rule.
-- =============================================================================

-- ── 1. The recommendation record ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.consultant_weighting_recommendations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id          uuid NOT NULL REFERENCES public.education_consultants(id) ON DELETE CASCADE,
  window_start           date NOT NULL,
  window_end             date NOT NULL,             -- exclusive; matches the measurement row's window
  current_volume_share   numeric NOT NULL,          -- fraction of all window attributions (4 dp)
  suggested_volume_share numeric NOT NULL,          -- ADVISORY fraction (4 dp); sums to ~1 across a window's rows
  conversion_delta       numeric,                   -- copied from the measurement row (pp; may be NULL below floor)
  rationale              jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                 text NOT NULL DEFAULT 'advisory'
                         CHECK (status = 'advisory'),  -- CLOSED on purpose — see header
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (window_end > window_start),
  CHECK (current_volume_share >= 0 AND current_volume_share <= 1),
  CHECK (suggested_volume_share >= 0 AND suggested_volume_share <= 1),
  UNIQUE (consultant_id, window_start, window_end)
);

COMMENT ON TABLE public.consultant_weighting_recommendations IS
  'ADVISORY ONLY (2026-08-26). Suggested consultant volume-share per window, derived from conversion delta vs own baseline. A future admin surface READS this; nothing consumes it to allocate leads, route, credit, or pay — that territory is Director-gated (walk-in credit hold; commission pipeline never run). status is CHECK-locked to ''advisory'': recording an applied state requires a future Director-gated migration.';
COMMENT ON COLUMN public.consultant_weighting_recommendations.suggested_volume_share IS
  'share * (1 + clamp(conversion_delta_pp/100, -0.5, +0.5)), renormalized to sum 1 across the window''s consultants. A recommendation for a human to weigh — never an instruction to a system.';

CREATE INDEX IF NOT EXISTS idx_cwr_window
  ON public.consultant_weighting_recommendations (window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_cwr_consultant
  ON public.consultant_weighting_recommendations (consultant_id, created_at DESC);

-- ── 2. RLS — same read gate as the measurement spine ─────────────────────────

ALTER TABLE public.consultant_weighting_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cwr_select" ON public.consultant_weighting_recommendations;
CREATE POLICY "cwr_select" ON public.consultant_weighting_recommendations
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('admission.leads.view')
);

REVOKE ALL ON public.consultant_weighting_recommendations FROM anon, authenticated, PUBLIC;
GRANT  SELECT ON public.consultant_weighting_recommendations TO authenticated;

-- ── 3. The recommendation writer ─────────────────────────────────────────────
-- Reads ONLY consultant_conversion_measurements for the exact window (it never
-- re-measures — decoupled legs, house style). Silent (zero rows) when the
-- window has no measured attributions.

CREATE OR REPLACE FUNCTION public.fn_consultants_suggest_weighting(
  p_as_of       date    DEFAULT CURRENT_DATE,
  p_window_days integer DEFAULT 30
)
RETURNS TABLE(
  consultant_id          uuid,
  window_start           date,
  window_end             date,
  current_volume_share   numeric,
  suggested_volume_share numeric,
  conversion_delta       numeric
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_start date;
  v_end   date;
  v_total bigint;
BEGIN
  IF p_window_days IS NULL OR p_window_days < 1 THEN
    RAISE EXCEPTION 'p_window_days must be >= 1';
  END IF;

  v_end   := COALESCE(p_as_of, CURRENT_DATE);
  v_start := v_end - p_window_days;

  SELECT COALESCE(sum(m.window_attributions), 0) INTO v_total
  FROM public.consultant_conversion_measurements m
  WHERE m.window_start = v_start AND m.window_end = v_end
    AND m.window_attributions > 0;

  IF v_total = 0 THEN
    RETURN;  -- nothing measured for this window ⇒ no recommendation rows
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      m.consultant_id AS cid,
      m.window_attributions AS w_n,
      m.conversion_delta AS delta_pp,
      m.window_attributions::numeric / v_total AS cur_share
    FROM public.consultant_conversion_measurements m
    WHERE m.window_start = v_start AND m.window_end = v_end
      AND m.window_attributions > 0
  ),
  tilted AS (
    -- NULL delta (below the de-noise floor) tilts by 0: the suggestion for an
    -- unmeasurable consultant is their current share, never a guess.
    SELECT
      b.cid, b.w_n, b.delta_pp, b.cur_share,
      b.cur_share * (1 + LEAST(GREATEST(COALESCE(b.delta_pp, 0) / 100.0, -0.5), 0.5)) AS raw_share
    FROM base b
  ),
  norm AS (
    SELECT t.*, sum(t.raw_share) OVER () AS raw_sum FROM tilted t
  ),
  upserted AS (
    INSERT INTO public.consultant_weighting_recommendations AS w
      (consultant_id, window_start, window_end,
       current_volume_share, suggested_volume_share, conversion_delta, rationale)
    SELECT
      n.cid, v_start, v_end,
      round(n.cur_share, 4),
      round(n.raw_share / NULLIF(n.raw_sum, 0), 4),
      n.delta_pp,
      jsonb_build_object(
        'advisory', true,
        'formula', 'share * (1 + clamp(conversion_delta_pp/100, -0.5, +0.5)), renormalized to sum 1',
        'window_attributions', n.w_n,
        'conversion_delta_pp', n.delta_pp,
        'note', 'RECOMMENDATION ONLY — nothing reads this table to allocate leads; applying any weighting is a Director decision')
    FROM norm n
    ON CONFLICT (consultant_id, window_start, window_end) DO UPDATE SET
      current_volume_share   = EXCLUDED.current_volume_share,
      suggested_volume_share = EXCLUDED.suggested_volume_share,
      conversion_delta       = EXCLUDED.conversion_delta,
      rationale              = EXCLUDED.rationale,
      updated_at             = now()
    RETURNING w.*
  )
  SELECT
    u.consultant_id, u.window_start, u.window_end,
    u.current_volume_share, u.suggested_volume_share, u.conversion_delta
  FROM upserted u;
END;
$function$;

COMMENT ON FUNCTION public.fn_consultants_suggest_weighting(date, integer) IS
  'Writes ADVISORY consultant weighting recommendations from an existing measurement window. Recommendation record only — no allocation, routing, credit, or commission behavior changes anywhere.';

-- Lock: SECURITY DEFINER ⇒ explicit revoke from anon AND PUBLIC in the same
-- file (anon holds a default-privileges EXECUTE grant AND is a member of
-- PUBLIC — both must go).
REVOKE EXECUTE ON FUNCTION public.fn_consultants_suggest_weighting(date, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_consultants_suggest_weighting(date, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
