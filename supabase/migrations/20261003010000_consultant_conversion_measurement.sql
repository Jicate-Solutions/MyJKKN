-- =============================================================================
-- 20261003010000_consultant_conversion_measurement.sql
-- Consultants loop (Wave 2, loop-program master spec 2026-08-13) — PR 1 of the
-- lane: per-consultant conversion MEASUREMENT vs the consultant's own baseline.
--
-- ⛔ HARD CONSTRAINT (Director territory — standing rulings on walk-in credits
-- and the never-run commission pipeline): this lane is MEASUREMENT + RECORDED
-- RECOMMENDATION ONLY. Nothing in this migration (or its siblings
-- 20261003020000 / 20261003030000) changes lead allocation, routing, credits,
-- commissions, or any money-adjacent behavior. No trigger is added to any
-- money path; fn_generate_referral_commissions is untouched.
--
-- What this ships (mirrors the mess loop spine 20260727000000 — the house
-- measurement way: baseline and outcome computed by the SAME estimator, a
-- de-noise floor below which no number is fed forward, results stored as rows):
--   * consultant_conversion_measurements — one row per (consultant, window):
--     window conversion rate vs the consultant's OWN all-history-before-window
--     baseline rate, plus the delta in percentage points.
--   * platform_policies row consultants.loop.min_attributions_k — the de-noise
--     floor (config-table pattern: every policy decision = a config row).
--   * loop_registry seed row 'consultants' — charter legs deliberately NULL
--     (per the loop constitution 20260726012000, a leg is written only when it
--     demonstrably runs; until then the row is a meter, not a chartered loop).
--   * fn_consultants_measure_conversion — the MEASURE fn. service_role only.
--
-- Estimator invariant (the thing 20261003030000's regress runner attacks):
-- conversion predicate is current_stage IN ('enrolled','confirmed') — the SAME
-- vocabulary update_consultant_stats has used since 20260513183000 — and the
-- rate is ROUND(conversions::numeric / attributions * 100, 2), the SAME shape
-- as education_consultants.conversion_rate. A no-change window (same rate as
-- baseline) MUST yield conversion_delta = 0.00 exactly.
--
-- FILE ONLY / NOT APPLIED — Director-gated, per the lane's standing rule.
-- =============================================================================

-- ── 1. Measurement spine ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.consultant_conversion_measurements (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id            uuid NOT NULL REFERENCES public.education_consultants(id) ON DELETE CASCADE,
  window_start             date NOT NULL,
  window_end               date NOT NULL,           -- exclusive
  window_attributions      integer NOT NULL DEFAULT 0,
  window_conversions       integer NOT NULL DEFAULT 0,
  window_conversion_rate   numeric,                 -- % (2 dp); NULL below the de-noise floor
  baseline_attributions    integer NOT NULL DEFAULT 0,
  baseline_conversions     integer NOT NULL DEFAULT 0,
  baseline_conversion_rate numeric,                 -- % (2 dp); NULL below the de-noise floor
  conversion_delta         numeric,                 -- percentage POINTS (window − baseline); NULL when either side is NULL
  min_attributions_k       integer NOT NULL,        -- the floor in force when this row was measured
  measured_at              timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (window_end > window_start),
  UNIQUE (consultant_id, window_start, window_end)
);

COMMENT ON TABLE public.consultant_conversion_measurements IS
  'Consultants loop MEASUREMENT spine (Wave 2, 2026-08-26). One row per (consultant, window): window conversion rate vs the consultant''s OWN pre-window baseline, same estimator both sides (current_stage IN (''enrolled'',''confirmed''), rate = conversions/attributions*100 rounded 2dp). READ-ONLY telemetry — nothing consumes these rows to allocate leads, credit, or pay anything; that territory is Director-gated.';
COMMENT ON COLUMN public.consultant_conversion_measurements.conversion_delta IS
  'Window rate minus baseline rate, in percentage points (2 dp). NULL when either side sits below min_attributions_k — never feed noise forward.';

CREATE INDEX IF NOT EXISTS idx_ccm_window
  ON public.consultant_conversion_measurements (window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_ccm_consultant
  ON public.consultant_conversion_measurements (consultant_id, measured_at DESC);

-- ── 2. RLS — admin/permission reads; writes only via the DEFINER fn ─────────
-- Mirrors 20260507130001 (attributions RLS): admission.leads.view is the read
-- permission for this territory. No institution column here — the consultant
-- is a global entity (20260506 status/tier migration) and the measurement
-- aggregates that consultant across institutions.

ALTER TABLE public.consultant_conversion_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ccm_select" ON public.consultant_conversion_measurements;
CREATE POLICY "ccm_select" ON public.consultant_conversion_measurements
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('admission.leads.view')
);

REVOKE ALL ON public.consultant_conversion_measurements FROM anon, authenticated, PUBLIC;
GRANT  SELECT ON public.consultant_conversion_measurements TO authenticated;

-- ── 3. De-noise floor — a config row, not a literal ──────────────────────────
-- Shape mirrors mess.choose.loop.min_ratings_k (20260727000000): scope_type
-- 'global', data_type 'number' (the CHECK vocabulary has no 'integer'),
-- conflict target = the composite EXPRESSION unique index — a bare
-- ON CONFLICT (policy_key) raises 42P10 here.

INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, classification, publication_state, is_active, description)
VALUES
  ('consultants.loop.min_attributions_k', 'global', '5'::jsonb, 'number', 'major', 'published', true,
   'Minimum attributions on a side (window or baseline) before a consultant conversion rate is computed (de-noise floor). Below this the rate — and therefore conversion_delta — stays NULL.')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ── 4. loop_registry seed — the family enters the registry as a METER ────────
-- Charter legs (outcome_metric / baseline_window / intervention / verdict_owner
-- / remeasure_window, 20260726012000) are deliberately NOT written: they stay
-- NULL until the measurement demonstrably runs and an owner signs (MetaLoop
-- drafts, humans sign — program rule 2). Feed-forward gate is OFF on purpose:
-- the 'weighting' half of this family ships as an advisory RECORD
-- (20261003020000), never as an applied allocation change.

-- Owner at birth: the Director, interim (his ruling 2026-08-26, tappable
-- interview) — consultant/referral territory is already pinned to him by name,
-- and the constitution (20260726012000) refuses an owner-less birth on purpose.
-- Handover to Accounts/Admissions later goes through the owners panel.
INSERT INTO public.loop_registry
  (loop_key, name, stack_tier, loop_class, domain, description, gates, routine_id, owner_email) VALUES
  ('consultants', 'Consultant Effectiveness Loop', 3, 'cadence', 'admission',
   'Consultant-attributed leads → per-consultant conversion delta vs own baseline → advisory weighting RECORD a human can read. Feed-forward (actual lead-allocation weighting) is deliberately unwired: Director-gated territory (walk-in credit hold; commission pipeline never run).',
   '{"g":"on","a":"on","m":"half","f":"off"}'::jsonb, NULL, 'director@jkkn.ac.in')
ON CONFLICT (loop_key) DO NOTHING;

-- ── 5. The MEASURE fn ────────────────────────────────────────────────────────
-- INVARIANT: baseline and window use the SAME estimator + SAME >= k floor.
-- p_consultant_id scopes a run to one consultant (used by the regress sim);
-- p_min_n overrides the policy floor (sim only — production callers omit it).

CREATE OR REPLACE FUNCTION public.fn_consultants_measure_conversion(
  p_as_of         date    DEFAULT CURRENT_DATE,
  p_window_days   integer DEFAULT 30,
  p_consultant_id uuid    DEFAULT NULL,
  p_min_n         integer DEFAULT NULL
)
RETURNS TABLE(
  consultant_id            uuid,
  window_start             date,
  window_end               date,
  window_attributions      integer,
  window_conversions       integer,
  window_conversion_rate   numeric,
  baseline_attributions    integer,
  baseline_conversions     integer,
  baseline_conversion_rate numeric,
  conversion_delta         numeric
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_k     integer;
  v_start date;
  v_end   date;
BEGIN
  IF p_window_days IS NULL OR p_window_days < 1 THEN
    RAISE EXCEPTION 'p_window_days must be >= 1';
  END IF;

  v_end   := COALESCE(p_as_of, CURRENT_DATE);   -- exclusive
  v_start := v_end - p_window_days;

  v_k := COALESCE(
    p_min_n,
    (SELECT (pp.value #>> '{}')::int
       FROM public.platform_policies pp
      WHERE pp.policy_key = 'consultants.loop.min_attributions_k'
        AND pp.scope_type = 'global'
        AND pp.is_active
      LIMIT 1),
    5);
  IF v_k < 1 THEN
    RAISE EXCEPTION 'min_attributions_k must be >= 1 (got %)', v_k;
  END IF;

  RETURN QUERY
  WITH per_consultant AS (
    -- One pass over the attribution ledger; window vs baseline split by
    -- created_at against the window boundary. Consultants with no attribution
    -- ever simply produce no row.
    SELECT
      a.consultant_id AS cid,
      count(*) FILTER (WHERE a.created_at >= v_start AND a.created_at < v_end)::int AS w_n,
      count(*) FILTER (WHERE a.created_at >= v_start AND a.created_at < v_end
                         AND a.current_stage IN ('enrolled','confirmed'))::int      AS w_c,
      count(*) FILTER (WHERE a.created_at < v_start)::int                           AS b_n,
      count(*) FILTER (WHERE a.created_at < v_start
                         AND a.current_stage IN ('enrolled','confirmed'))::int      AS b_c
    FROM public.consultant_lead_attributions a
    WHERE (p_consultant_id IS NULL OR a.consultant_id = p_consultant_id)
    GROUP BY a.consultant_id
  ),
  rated AS (
    -- SAME estimator both sides; NULL below the floor (never feed noise).
    SELECT
      pc.cid, pc.w_n, pc.w_c, pc.b_n, pc.b_c,
      CASE WHEN pc.w_n >= v_k
           THEN round((pc.w_c::numeric / pc.w_n) * 100, 2) END AS w_rate,
      CASE WHEN pc.b_n >= v_k
           THEN round((pc.b_c::numeric / pc.b_n) * 100, 2) END AS b_rate
    FROM per_consultant pc
  ),
  upserted AS (
    INSERT INTO public.consultant_conversion_measurements AS m
      (consultant_id, window_start, window_end,
       window_attributions, window_conversions, window_conversion_rate,
       baseline_attributions, baseline_conversions, baseline_conversion_rate,
       conversion_delta, min_attributions_k, measured_at)
    SELECT
      r.cid, v_start, v_end,
      r.w_n, r.w_c, r.w_rate,
      r.b_n, r.b_c, r.b_rate,
      CASE WHEN r.w_rate IS NOT NULL AND r.b_rate IS NOT NULL
           THEN round(r.w_rate - r.b_rate, 2) END,
      v_k, now()
    FROM rated r
    ON CONFLICT (consultant_id, window_start, window_end) DO UPDATE SET
      window_attributions      = EXCLUDED.window_attributions,
      window_conversions       = EXCLUDED.window_conversions,
      window_conversion_rate   = EXCLUDED.window_conversion_rate,
      baseline_attributions    = EXCLUDED.baseline_attributions,
      baseline_conversions     = EXCLUDED.baseline_conversions,
      baseline_conversion_rate = EXCLUDED.baseline_conversion_rate,
      conversion_delta         = EXCLUDED.conversion_delta,
      min_attributions_k       = EXCLUDED.min_attributions_k,
      measured_at              = EXCLUDED.measured_at,
      updated_at               = now()
    RETURNING m.*
  )
  SELECT
    u.consultant_id, u.window_start, u.window_end,
    u.window_attributions, u.window_conversions, u.window_conversion_rate,
    u.baseline_attributions, u.baseline_conversions, u.baseline_conversion_rate,
    u.conversion_delta
  FROM upserted u;
END;
$function$;

COMMENT ON FUNCTION public.fn_consultants_measure_conversion(date, integer, uuid, integer) IS
  'Consultants loop MEASURE fn: per-consultant window conversion rate vs own pre-window baseline (same estimator both sides, >= k floor). Writes/refreshes consultant_conversion_measurements rows and returns them. MEASUREMENT ONLY — allocates nothing, credits nothing.';

-- Lock: SECURITY DEFINER ⇒ explicit revoke from anon AND PUBLIC (Supabase's
-- default privileges grant anon EXECUTE on every new fn; anon is also a member
-- of PUBLIC — revoke both, per CLAUDE.md 2026-06-06 + feedback 2026-08-18).
REVOKE EXECUTE ON FUNCTION public.fn_consultants_measure_conversion(date, integer, uuid, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_consultants_measure_conversion(date, integer, uuid, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
