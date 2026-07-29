-- =============================================================================
-- CDC Placement-Outcome Loop — PHASE 1: MEASURE side (gates ①③ ONLY)
-- Migration: 20260709032000_cdc_placement_outcome_measure.sql
-- Created: 2026-07-09 (accreditation-loop program PR-5)
--
-- ⚠️ HONESTY LABEL — THIS IS NOT A SELF-IMPROVING LOOP YET.
--   This migration ships gates ① (measure: baseline-vs-outcome per cohort) and
--   ③ (intake: NAAC 8.2.1 evidence emission) of the CDC placement-outcome loop.
--   Gates ② (act) and ④ (feed-forward) require a NAMED CDC owner who consumes
--   the deltas and adjusts training/employer strategy — that Director decision
--   is pending. Until then this is measurement + evidence plumbing, DARK by
--   default (cdc_placement_loop.master_enabled = false).
--
-- WHY: NIRF's GO parameter (~20-25% weight) is placement/progression — the one
--   NIRF lever JKKN can move. NAAC 8.2.1 ('Placement + higher studies
--   progression', weight 25 in the seeded catalog) overlaps NIRF GO_PL/GO_PS.
--
-- DATA-SOURCE DECISION (recon 2026-07-09, prod read-only via Mgmt API):
--   - cdc_placements:  0 rows in prod. Offer-level; status enum
--     {offered,accepted,declined,rescinded}; package_lpa numeric.
--   - alumni_outcomes: 0 rows in prod. Cohort-shaped (institution_id,
--     program_id, graduation_date/graduation_year, batch_id); outcome_type enum
--     {employed,self_employed,entrepreneur,higher_studies,competitive_exams,
--      family_business,gap_year,seeking,unknown}.
--   WINNER = alumni_outcomes as the numerator source: it is the convergence
--   point (two existing triggers bridge accepted cdc_placements into it —
--   fn_cdc_passed_out_to_alumni_bridge + fn_cdc_placement_to_alumni), and it
--   is the only source that can represent 'higher_studies', which NAAC 8.2.1
--   explicitly needs. cdc_placements is used ONLY for median_package_lpa
--   (accepted offers with package_lpa).
--   Both sources are currently EMPTY — the machinery is built anyway (it is
--   dark); observed fill rates are recorded in the PR body.
--
-- COHORT DEFINITION: (institution_id, program_id, passing-out AY). The AY-end
--   year is derived June-cutoff: graduation in Jan–Jun of year Y → AY (Y-1)-Y
--   (ay_end = Y); Jul–Dec of Y → AY Y-(Y+1) (ay_end = Y+1). Falls back to
--   alumni_outcomes.graduation_year when graduation_date is NULL.
--
-- DENOMINATOR (honest, self-labeling): learners_profiles.batch_id is only 46%
--   filled on graduated learners (462/1004; program_id + institution_id are
--   100%). So the denominator is GREATEST(batch-roster count, outcome-reported
--   count) and the basis used is recorded in metrics.denominator_basis
--   ('batch_roster' | 'outcome_reported') so downstream consumers know which
--   floor the rate stands on.
--
-- SMALL COHORTS ('Compute, but label small group' — Director decision 2026-07-09):
--   ALL cohorts are computed regardless of size. Cohorts with n <
--   cdc_placement_loop.min_cohort_size get "small_cohort": true in the metrics
--   jsonb (and in emitted evidence metadata) so every UI/report can render a
--   'small group — interpret with care' label. Nothing is skipped.
--
-- PRIVACY: this table and the emitted evidence hold cohort AGGREGATES only
--   (counts, rates, a median) — never per-student rows or learner ids.
--
-- WHAT THIS ADDS:
--   1. Config rows (dark gate + labeling floor)  — platform_policies
--   2. cdc_placement_outcome_cycles              — one row per cohort per
--      measure run (change-only: identical re-measures don't duplicate)
--   3. fn_cdc_placement_cohort_metrics(...)      — per-cohort metrics jsonb
--   4. fn_cdc_placement_outcome_measure()        — the measure run + NAAC
--      8.2.1 evidence emitter (service-role-only)
--   5. ai_routine_schedules seed row             — dispatcher-managed cadence
--
-- REUSE-BEATS-INVENT CHECK: no existing table fits the cohort-cycle purpose —
--   cdc_placement_snapshots is a per-drive audit log; quality_evidence_mappings
--   is the junction (not a metrics store). New table justified.
-- =============================================================================

-- ── 1. Config rows — every policy decision = a config row ────────────────────
-- Shape mirrors mess.choose.loop.* rows (20260727000000_mess_menu_loop_spine).
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, classification, publication_state, is_active, description)
VALUES
  ('cdc_placement_loop.master_enabled', 'global', 'false'::jsonb, 'boolean', 'major', 'published', true,
   'CDC Placement-Outcome loop (measure phase) master switch. DARK pending Director review: '
   || 'flipping this ON starts cohort placement/higher-ed measurement + NAAC 8.2.1 evidence emission. '
   || 'Gates ①③ only — the loop becomes self-improving only when a named CDC owner consumes the deltas (gates ②④, Director decision pending).'),
  ('cdc_placement_loop.min_cohort_size', 'global', '10'::jsonb, 'number', 'major', 'published', true,
   'Labeling threshold (cohorts below this are computed but flagged small_cohort), Director decision '
   || '2026-07-09: "Compute, but label small group". UIs/reports must render "small group — interpret '
   || 'with care" (noise context: 1 placement in a 4-learner cohort swings the rate 25pp).')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ── 2. Outcome-cycle table — one row per cohort per measure run ──────────────
CREATE TABLE IF NOT EXISTS public.cdc_placement_outcome_cycles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  program_id      uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  cohort_ay_end   integer NOT NULL,          -- AY-end year: 2025 = AY 2024-25 (June cutoff)
  cohort_label    text NOT NULL,             -- 'AY 2024-25'
  measure_window  text NOT NULL,             -- 'YYYY-MM' (IST) — idempotency window
  measured_at     timestamptz NOT NULL DEFAULT now(),
  -- metrics: { n, denominator_basis, n_roster_batch, n_outcome_reported,
  --            placed_n, higher_ed_n, progression_n,
  --            placement_rate_pct, higher_ed_rate_pct, progression_rate_pct,
  --            median_package_lpa, outcome_breakdown: {<outcome_type>: n},
  --            small_cohort: bool — n < min_cohort_size; computed anyway,
  --              render 'small group — interpret with care' }
  -- Cohort AGGREGATES only — never per-student rows.
  metrics         jsonb NOT NULL,
  -- baseline: prior cohort's (cohort_ay_end - 1, same institution+program)
  -- metrics in the SAME shape, or NULL when no usable baseline exists.
  baseline        jsonb,
  delta_summary   text NOT NULL DEFAULT 'n/a'
                  CHECK (delta_summary IN ('improved','no_change','worse','n/a')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, program_id, cohort_ay_end, measure_window)
);

COMMENT ON TABLE public.cdc_placement_outcome_cycles IS
  'CDC placement-outcome loop (measure phase, gates ①③ only): one row per (institution, program, '
  'passing-out AY) cohort per measure run. metrics = this cohort''s placement/higher-ed conversion; '
  'baseline = prior cohort''s same metrics; delta_summary = improved/no_change/worse/n-a on '
  'progression_rate_pct (±2.0pp deadband). ALL cohorts are computed; those under '
  'cdc_placement_loop.min_cohort_size carry metrics.small_cohort=true ("Compute, but label small group" — '
  'Director 2026-07-09). Cohort AGGREGATES only — never per-student rows. Written ONLY by '
  'fn_cdc_placement_outcome_measure() (service-role). NOT a self-improving loop yet — act/feed-forward '
  '(gates ②④) pending a named CDC owner.';

ALTER TABLE public.cdc_placement_outcome_cycles ENABLE ROW LEVEL SECURITY;

-- Reads: CDC staff + admins (aggregate, non-PII program-level rates).
-- Writes: NO policies — service-role only (same posture as cdc_placement_snapshots).
DROP POLICY IF EXISTS "cdc_placement_outcome_cycles_read" ON public.cdc_placement_outcome_cycles;
CREATE POLICY "cdc_placement_outcome_cycles_read" ON public.cdc_placement_outcome_cycles
  FOR SELECT USING (
    public.is_super_admin() OR public.is_admin() OR public.is_cdc_staff()
  );

REVOKE ALL ON public.cdc_placement_outcome_cycles FROM anon, PUBLIC;
GRANT SELECT ON public.cdc_placement_outcome_cycles TO authenticated;

-- ── 3. Per-cohort metrics helper ─────────────────────────────────────────────
-- Computes the metrics jsonb for ONE (institution, program, ay_end) cohort.
-- Reused for both the measured cohort and its baseline (prior AY) so both
-- sides of the delta use the SAME estimator (mess-loop invariant).
-- Enum comparisons go through ::text so a label drift can never error the run.
CREATE OR REPLACE FUNCTION public.fn_cdc_placement_cohort_metrics(
  p_institution_id uuid,
  p_program_id     uuid,
  p_ay_end         integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n_outcome  integer;
  v_n_roster   integer;
  v_n          integer;
  v_basis      text;
  v_placed     integer;
  v_higher     integer;
  v_progress   integer;
  v_breakdown  jsonb;
  v_median     numeric;
BEGIN
  -- Cohort membership (numerator side) = distinct learners with an
  -- alumni_outcomes row whose June-cutoff AY-end matches p_ay_end.
  WITH cohort AS (
    SELECT DISTINCT ON (ao.learner_id) ao.learner_id, ao.outcome_type::text AS otype
    FROM public.alumni_outcomes ao
    WHERE ao.institution_id = p_institution_id
      AND ao.program_id     = p_program_id
      AND (
        CASE
          WHEN ao.graduation_date IS NOT NULL THEN
            CASE WHEN EXTRACT(MONTH FROM ao.graduation_date) >= 7
                 THEN EXTRACT(YEAR FROM ao.graduation_date)::int + 1
                 ELSE EXTRACT(YEAR FROM ao.graduation_date)::int END
          ELSE ao.graduation_year
        END
      ) = p_ay_end
    -- Multiple outcome rows per learner are possible (no unique constraint —
    -- see the bridge migrations). Prefer the "best" outcome per learner:
    -- employed/higher_studies over seeking/unknown.
    ORDER BY ao.learner_id,
             CASE ao.outcome_type::text
               WHEN 'employed'          THEN 1
               WHEN 'higher_studies'    THEN 2
               WHEN 'self_employed'     THEN 3
               WHEN 'entrepreneur'      THEN 4
               WHEN 'competitive_exams' THEN 5
               WHEN 'family_business'   THEN 6
               WHEN 'gap_year'          THEN 7
               WHEN 'seeking'           THEN 8
               ELSE 9
             END,
             ao.reported_at DESC NULLS LAST
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE otype = 'employed'),
    count(*) FILTER (WHERE otype = 'higher_studies'),
    count(*) FILTER (WHERE otype IN ('employed','higher_studies')),
    COALESCE(jsonb_object_agg(otype, cnt) FILTER (WHERE otype IS NOT NULL), '{}'::jsonb)
  INTO v_n_outcome, v_placed, v_higher, v_progress, v_breakdown
  FROM (
    SELECT otype, count(*) OVER (PARTITION BY otype) AS cnt FROM cohort
  ) c;

  -- Denominator side: graduated/alumni learners of this program whose batch
  -- end_date falls inside the cohort AY window (Jul 1 (ay_end-1) … Jun 30 ay_end).
  -- batch_id is only ~46% filled on graduated learners (prod 2026-07-09), so
  -- the roster count can undercount — the GREATEST() below + denominator_basis
  -- keep the published rate honest about which floor it stands on.
  SELECT count(*) INTO v_n_roster
  FROM public.learners_profiles lp
  JOIN public.batches b ON b.id = lp.batch_id
  WHERE lp.institution_id = p_institution_id
    AND lp.program_id     = p_program_id
    AND lp.lifecycle_status::text IN ('graduated','alumni')
    AND b.end_date >= make_date(p_ay_end - 1, 7, 1)
    AND b.end_date <= make_date(p_ay_end, 6, 30);

  v_n := GREATEST(COALESCE(v_n_roster, 0), COALESCE(v_n_outcome, 0));
  v_basis := CASE WHEN COALESCE(v_n_roster, 0) >= COALESCE(v_n_outcome, 0)
                   AND COALESCE(v_n_roster, 0) > 0
                  THEN 'batch_roster' ELSE 'outcome_reported' END;

  -- Median accepted-offer package for cohort members, from cdc_placements
  -- ('accepted' is a REAL cdc_placement_status label — verified in prod).
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY pl.package_lpa)
  INTO v_median
  FROM public.cdc_placements pl
  WHERE pl.status::text = 'accepted'
    AND pl.package_lpa IS NOT NULL
    AND pl.learner_id IN (
      SELECT ao.learner_id FROM public.alumni_outcomes ao
      WHERE ao.institution_id = p_institution_id
        AND ao.program_id     = p_program_id
        AND (
          CASE
            WHEN ao.graduation_date IS NOT NULL THEN
              CASE WHEN EXTRACT(MONTH FROM ao.graduation_date) >= 7
                   THEN EXTRACT(YEAR FROM ao.graduation_date)::int + 1
                   ELSE EXTRACT(YEAR FROM ao.graduation_date)::int END
            ELSE ao.graduation_year
          END
        ) = p_ay_end
    );

  RETURN jsonb_build_object(
    'n',                    v_n,
    'denominator_basis',    v_basis,
    'n_roster_batch',       COALESCE(v_n_roster, 0),
    'n_outcome_reported',   COALESCE(v_n_outcome, 0),
    'placed_n',             COALESCE(v_placed, 0),
    'higher_ed_n',          COALESCE(v_higher, 0),
    'progression_n',        COALESCE(v_progress, 0),
    'placement_rate_pct',   ROUND(100.0 * COALESCE(v_placed, 0)   / NULLIF(v_n, 0), 1),
    'higher_ed_rate_pct',   ROUND(100.0 * COALESCE(v_higher, 0)   / NULLIF(v_n, 0), 1),
    'progression_rate_pct', ROUND(100.0 * COALESCE(v_progress, 0) / NULLIF(v_n, 0), 1),
    'median_package_lpa',   v_median,
    'outcome_breakdown',    COALESCE(v_breakdown, '{}'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cdc_placement_cohort_metrics(uuid, uuid, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cdc_placement_cohort_metrics(uuid, uuid, integer) TO service_role;

-- ── 4. Measure run + NAAC 8.2.1 evidence emitter (service-role only) ─────────
-- Gates ①③ ONLY: measures baseline-vs-outcome per cohort and emits evidence.
-- It does NOT act on the deltas — that is gate ②④, pending a named CDC owner.
-- Idempotent per (cohort, measure window): re-runs in the same IST calendar
-- month UPDATE the same cycle row; a re-measure whose metrics+baseline are
-- byte-identical to the cohort's latest row is skipped entirely (change-only
-- history — a monthly cadence over slow-moving data must not spam 12
-- identical rows/year/cohort into the evidence junction).
CREATE OR REPLACE FUNCTION public.fn_cdc_placement_outcome_measure()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled     boolean;
  v_min_cohort  integer;
  v_window      text := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM');
  v_measured    integer := 0;
  v_small       integer := 0;
  v_unchanged   integer := 0;
  v_evidence    integer := 0;
  v_details     jsonb := '[]'::jsonb;
  r             RECORD;
  v_metrics     jsonb;
  v_baseline    jsonb;
  v_delta       text;
  v_diff        numeric;
  v_cycle_id    uuid;
  v_label       text;
  v_latest      RECORD;
BEGIN
  -- Dark gate — the loop is dark unless its master switch is explicitly true.
  SELECT (value = 'true'::jsonb) INTO v_enabled
  FROM public.platform_policies
  WHERE policy_key = 'cdc_placement_loop.master_enabled'
    AND scope_type = 'global' AND is_active = true
  LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', 'loop dark (cdc_placement_loop.master_enabled != true)');
  END IF;

  SELECT COALESCE(NULLIF(value #>> '{}', '')::integer, 10) INTO v_min_cohort
  FROM public.platform_policies
  WHERE policy_key = 'cdc_placement_loop.min_cohort_size'
    AND scope_type = 'global' AND is_active = true
  LIMIT 1;
  v_min_cohort := COALESCE(v_min_cohort, 10);

  -- Enumerate cohorts FROM alumni_outcomes (the proven convergence source).
  FOR r IN
    SELECT DISTINCT ao.institution_id, ao.program_id,
      (CASE
         WHEN ao.graduation_date IS NOT NULL THEN
           CASE WHEN EXTRACT(MONTH FROM ao.graduation_date) >= 7
                THEN EXTRACT(YEAR FROM ao.graduation_date)::int + 1
                ELSE EXTRACT(YEAR FROM ao.graduation_date)::int END
         ELSE ao.graduation_year
       END) AS ay_end
    FROM public.alumni_outcomes ao
    WHERE ao.institution_id IS NOT NULL
      AND ao.program_id IS NOT NULL
      AND (ao.graduation_date IS NOT NULL OR ao.graduation_year IS NOT NULL)
    ORDER BY 1, 2, 3
  LOOP
    v_metrics := public.fn_cdc_placement_cohort_metrics(r.institution_id, r.program_id, r.ay_end);

    -- Small-cohort LABELING ('Compute, but label small group' — Director
    -- 2026-07-09): every cohort is computed; below the threshold the metrics
    -- carry small_cohort=true so UIs/reports render 'small group — interpret
    -- with care'. Nothing is skipped.
    v_metrics := v_metrics || jsonb_build_object(
      'small_cohort', COALESCE((v_metrics ->> 'n')::integer, 0) < v_min_cohort);
    IF (v_metrics ->> 'small_cohort')::boolean THEN
      v_small := v_small + 1;
    END IF;

    -- Baseline = prior cohort (same institution+program, ay_end - 1), same
    -- estimator, same labeling. Unusable ONLY when truly empty (n = 0 — there
    -- is nothing to compare against) → NULL + 'n/a'. A small baseline is
    -- compared anyway and carries its own small_cohort flag.
    v_baseline := public.fn_cdc_placement_cohort_metrics(r.institution_id, r.program_id, r.ay_end - 1);
    IF COALESCE((v_baseline ->> 'n')::integer, 0) = 0 THEN
      v_baseline := NULL;
      v_delta := 'n/a';
    ELSE
      v_baseline := v_baseline || jsonb_build_object(
        'small_cohort', COALESCE((v_baseline ->> 'n')::integer, 0) < v_min_cohort);
      v_diff := COALESCE((v_metrics ->> 'progression_rate_pct')::numeric, 0)
              - COALESCE((v_baseline ->> 'progression_rate_pct')::numeric, 0);
      -- ±2.0pp deadband on progression rate (placement + higher studies).
      v_delta := CASE WHEN v_diff >= 2.0 THEN 'improved'
                      WHEN v_diff <= -2.0 THEN 'worse'
                      ELSE 'no_change' END;
    END IF;

    -- Change-only history: if the cohort's latest cycle row (any window) has
    -- identical metrics + baseline + delta, don't write a duplicate.
    SELECT c.metrics, c.baseline, c.delta_summary INTO v_latest
    FROM public.cdc_placement_outcome_cycles c
    WHERE c.institution_id = r.institution_id
      AND c.program_id = r.program_id
      AND c.cohort_ay_end = r.ay_end
    ORDER BY c.measured_at DESC
    LIMIT 1;
    IF v_latest.metrics IS NOT NULL
       AND v_latest.metrics = v_metrics
       AND v_latest.delta_summary = v_delta
       AND (v_latest.baseline IS NOT DISTINCT FROM v_baseline) THEN
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;

    v_label := 'AY ' || (r.ay_end - 1)::text || '-' || right(r.ay_end::text, 2);

    INSERT INTO public.cdc_placement_outcome_cycles
      (institution_id, program_id, cohort_ay_end, cohort_label, measure_window,
       measured_at, metrics, baseline, delta_summary)
    VALUES
      (r.institution_id, r.program_id, r.ay_end, v_label, v_window,
       now(), v_metrics, v_baseline, v_delta)
    ON CONFLICT (institution_id, program_id, cohort_ay_end, measure_window)
    DO UPDATE SET
      measured_at   = now(),
      metrics       = EXCLUDED.metrics,
      baseline      = EXCLUDED.baseline,
      delta_summary = EXCLUDED.delta_summary,
      updated_at    = now()
    RETURNING id INTO v_cycle_id;

    v_measured := v_measured + 1;

    -- Gate ③ — NAAC 8.2.1 evidence emission ('Placement + higher studies
    -- progression', overlaps NIRF GO_PL/GO_PS). mapped_by is NULL: this runs
    -- as service role, there is no acting human — is_auto=true is the signal.
    INSERT INTO public.quality_evidence_mappings
      (source_table, source_id, institution_id, body_code, metric_code,
       period_label, mapped_by, is_auto, metadata, mapped_at)
    VALUES
      ('cdc_placement_outcome_cycles', v_cycle_id, r.institution_id, 'NAAC', '8.2.1',
       v_label, NULL, true,
       jsonb_build_object(
         'loop_key',      'cdc_placement',
         'loop_name',     'CDC Placement-Outcome Loop (measure phase)',
         'outcome',       v_metrics,
         'delta_summary', v_delta,
         'measured_at',   now(),
         'small_cohort',  (v_metrics ->> 'small_cohort')::boolean,
         'gates',         '①③ — act/feed-forward pending owner'),
       now())
    ON CONFLICT (source_table, source_id, body_code, metric_code)
    DO UPDATE SET
      period_label = EXCLUDED.period_label,
      metadata     = EXCLUDED.metadata,
      mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;

    v_evidence := v_evidence + 1;

    v_details := v_details || jsonb_build_object(
      'institution_id', r.institution_id, 'program_id', r.program_id,
      'cohort_ay_end', r.ay_end, 'result', 'measured',
      'n', v_metrics ->> 'n',
      'small_cohort', (v_metrics ->> 'small_cohort')::boolean,
      'progression_rate_pct', v_metrics ->> 'progression_rate_pct',
      'delta_summary', v_delta);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'measure_window', v_window,
    'min_cohort_size', v_min_cohort,
    'cohorts_measured', v_measured,
    'cohorts_small_labeled', v_small,
    'cohorts_unchanged', v_unchanged,
    'evidence_upserts', v_evidence,
    'details', v_details);
END;
$$;

COMMENT ON FUNCTION public.fn_cdc_placement_outcome_measure() IS
  'CDC placement-outcome loop MEASURE run (gates ①③ only — NOT self-improving yet; act/feed-forward '
  'gates ②④ pending a named CDC owner, Director decision pending). Per (institution, program, '
  'passing-out AY) cohort: computes placement/higher-ed conversion from alumni_outcomes (+ median '
  'accepted package from cdc_placements), compares against the prior cohort baseline (same estimator, '
  '±2.0pp deadband on progression_rate_pct), writes cdc_placement_outcome_cycles, and upserts NAAC '
  '8.2.1 evidence into quality_evidence_mappings. DARK unless platform policy '
  'cdc_placement_loop.master_enabled = true. Computes ALL cohorts regardless of size; those below '
  'cdc_placement_loop.min_cohort_size carry small_cohort=true in metrics + evidence metadata '
  '("Compute, but label small group" — Director 2026-07-09). Cohort AGGREGATES only, never per-student '
  'rows. Idempotent per (cohort, IST calendar-month window); change-only history. Service-role only.';

REVOKE EXECUTE ON FUNCTION public.fn_cdc_placement_outcome_measure() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cdc_placement_outcome_measure() TO service_role;

-- ── 5. Dispatcher schedule row ────────────────────────────────────────────────
-- The ai-routine dispatcher supports day-of-week + 15-min slots only (no
-- day-of-month), so "monthly" is not directly representable. Cadence chosen:
-- Sundays 03:15 IST — combined with the calendar-month idempotency window +
-- change-only history above, this yields at most one cycle row per cohort per
-- month (effectively monthly), and a no-op while the loop is dark.
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('cdc-placement-outcomes', true, true, ARRAY[0]::smallint[], 195)
ON CONFLICT (routine_id) DO NOTHING;
