-- =====================================================================
-- Evidence holds — copo_attainment + cdc_placement_loop emitters
-- Migration: 20260710023000_evidence_holds_copo_placement.sql
-- Created: 2026-07-10 (Director edge-case interview, morning — decisions
-- recorded verbatim in progress.txt 2026-07-10 entries)
--
-- WHAT (three Director rulings, all "computed + visible, but OUT of the
-- accreditation evidence ledger"):
--   1. PLACEMENT cohorts whose roster is provably incomplete (denominator
--      stands on outcome_reported): held until the roster is completed.
--      Metrics gain evidence_held='incomplete_roster'; the weekly owner
--      reminder (separate PR) lists held cohorts as the fix-it queue.
--   2. COPO rollups with an uncertain institution stamp (ambiguous CAS
--      Self/Aided twin OR unmatched guess): held until re-stamped by a human
--      ('manual_assignment' — re-stamp control ships separately).
--   3. COPO small courses (< copo_attainment.min_course_size, default 10):
--      held. DELIBERATE ASYMMETRY: placement small cohorts stay IN evidence
--      labeled small_cohort (Director kept 2026-07-09's ruling explicitly).
--
-- Self-healing: each emitter run also DELETEs is_auto=true ledger rows whose
-- source is now held (never touches manually-curated is_auto=false rows).
-- Impact at ship time: 1 of 47 rollups held (unmatched_first_mapped) → its
-- 2 evidence rows removed, 94 → 92; 0 small courses in current data;
-- placement is an honest no-op (source tables empty).
--
-- Validated on prod in a rolled-back txn before apply (BEGIN → replace fns →
-- run both emitters → assert counts → RAISE) per house rule.
-- =====================================================================

-- ── 1. Config row: copo small-course floor (mirrors placement's
--       min_cohort_size shape; every policy decision = a config row) ─────────
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, classification, publication_state, is_active, description)
VALUES
  ('copo_attainment.min_course_size', 'global', '10'::jsonb, 'number', 'major', 'published', true,
   'Courses with fewer learners than this are computed and shown but HELD OUT of the accreditation '
   || 'evidence ledger (Director 2026-07-10: "Hold small courses out too"). Deliberately stricter than '
   || 'placement, where small cohorts stay in evidence labeled small_cohort (Director kept that ruling '
   || 'the same morning). Consumed by fn_copo_emit_attainment_evidence.')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ── 2. COPO emitter: eligibility predicate + self-healing ledger cleanup ─────
CREATE OR REPLACE FUNCTION public.fn_copo_emit_attainment_evidence()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled    boolean;
  v_count      integer := 0;
  v_removed    integer := 0;
  v_min_course integer;
  v_held_match integer := 0;
  v_held_small integer := 0;
BEGIN
  v_enabled := COALESCE((SELECT (value #>> '{}')::boolean
                         FROM public.platform_policies
                         WHERE policy_key = 'copo_attainment.master_enabled'
                           AND scope_type = 'global' AND is_active), false);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'master_disabled', 'count', 0);
  END IF;

  -- EVIDENCE HOLDS (Director 2026-07-10 edge-case interview). A rollup enters
  -- the accreditation ledger ONLY when BOTH hold:
  --   1. its institution stamp is confident — institution_match is
  --      'unique_course_match' (course taught by exactly one mapped college)
  --      or 'manual_assignment' (a human assigned the twin via the re-stamp
  --      control). 'ambiguous_first_mapped' (CAS Self/Aided twins) and
  --      'unmatched_first_mapped' (no match at all — a guess) are HELD:
  --      "Hold ambiguous courses out" — an unmatched guess is even less
  --      defensible than an ambiguous one.
  --   2. the course is not small — learner basis (GREATEST of final/internal
  --      counts: final_learner_count is 0, NOT NULL, before finals are
  --      declared — a bare COALESCE held all 47 courses in validation)
  --      >= copo_attainment
  --      .min_course_size (Director: "Hold small courses out too"; NOTE this
  --      is deliberately STRICTER than placement, where small cohorts stay in
  --      evidence labeled small_cohort — Director kept that asymmetry
  --      explicitly in the same interview).
  -- Held rollups stay computed and visible on dashboards; they just never
  -- enter quality_evidence_mappings — and previously-emitted auto rows for
  -- now-held rollups are removed (self-healing on every run).
  v_min_course := COALESCE((SELECT NULLIF(value #>> '{}', '')::integer
                            FROM public.platform_policies
                            WHERE policy_key = 'copo_attainment.min_course_size'
                              AND scope_type = 'global' AND is_active), 10);

  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'obe_course_attainment_rollup', o.id, o.institution_id, b.body_code, b.metric_code,
    -- 'AY YYYY-YY', June cutoff (IST for the timestamptz fallback)
    (SELECT CASE
       WHEN extract(month FROM d) >= 6
         THEN 'AY ' || extract(year FROM d)::int::text || '-' || right((extract(year FROM d)::int + 1)::text, 2)
       ELSE 'AY ' || (extract(year FROM d)::int - 1)::text || '-' || right(extract(year FROM d)::int::text, 2)
     END
     FROM (SELECT COALESCE(o.session_end_date::timestamp,
                           (o.computed_at AT TIME ZONE 'Asia/Kolkata')) AS d) x),
    NULL, true,
    jsonb_build_object(
      'loop_key',  'copo_attainment',
      'loop_name', 'CO/PO Attainment Loop',
      'grain',     o.grain,
      'co_tagged', COALESCE((o.metadata->>'co_tagged')::boolean, false),
      'outcome', jsonb_build_object(
        'course_code',        o.course_code,
        'course_name',        o.course_name,
        'program_code',       o.program_code,
        'session_code',       o.session_code,
        'attainment_basis',   o.attainment_basis,
        'attainment_pct',     o.attainment_pct,
        'attainment_level',   o.attainment_level,
        'learner_count',      GREATEST(COALESCE(o.final_learner_count, 0), COALESCE(o.internal_learner_count, 0)),
        'threshold_pct',      o.threshold_pct_used,
        'pass_pct',           o.pass_pct,
        'prev_attainment_pct', o.prev_attainment_pct,
        'delta_pct',          o.delta_pct
      ),
      'delta_summary', CASE
        WHEN o.delta_pct IS NULL THEN 'n/a'
        WHEN o.delta_pct > 0     THEN 'improved'
        WHEN o.delta_pct < 0     THEN 'worse'
        ELSE 'no_change' END,
      'measured_at', o.computed_at
    ),
    now()
  FROM public.obe_course_attainment_rollup o
  CROSS JOIN (VALUES ('NAAC', '7.3.d'), ('NBA', 'T1_CO')) AS b(body_code, metric_code)
  WHERE o.attainment_pct IS NOT NULL
    AND (o.metadata->>'institution_match') IN ('unique_course_match', 'manual_assignment')
    AND GREATEST(COALESCE(o.final_learner_count, 0), COALESCE(o.internal_learner_count, 0)) >= v_min_course
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    -- never clobber a manually-curated (is_auto=false) mapping for this key
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Self-heal: auto evidence whose source rollup is now held leaves the ledger.
  DELETE FROM public.quality_evidence_mappings qem
  USING public.obe_course_attainment_rollup o
  WHERE qem.source_table = 'obe_course_attainment_rollup'
    AND qem.source_id = o.id
    AND qem.is_auto
    AND NOT ((o.metadata->>'institution_match') IN ('unique_course_match', 'manual_assignment')
             AND GREATEST(COALESCE(o.final_learner_count, 0), COALESCE(o.internal_learner_count, 0)) >= v_min_course);
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  SELECT
    count(*) FILTER (WHERE (o.metadata->>'institution_match')
                           NOT IN ('unique_course_match', 'manual_assignment')),
    count(*) FILTER (WHERE GREATEST(COALESCE(o.final_learner_count, 0), COALESCE(o.internal_learner_count, 0)) < v_min_course)
  INTO v_held_match, v_held_small
  FROM public.obe_course_attainment_rollup o
  WHERE o.attainment_pct IS NOT NULL;

  RETURN jsonb_build_object(
    'copo_attainment', v_count, 'count', v_count,
    'min_course_size', v_min_course,
    'held_uncertain_institution', v_held_match,
    'held_small_course', v_held_small,
    'evidence_rows_removed', v_removed);
END;
$function$;

-- ── 3. Placement measure: evidence gate on denominator_basis ─────────────────
CREATE OR REPLACE FUNCTION public.fn_cdc_placement_outcome_measure()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled     boolean;
  v_min_cohort  integer;
  v_window      text := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM');
  v_measured    integer := 0;
  v_small       integer := 0;
  v_unchanged   integer := 0;
  v_evidence    integer := 0;
  v_held        integer := 0;
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

    -- EVIDENCE HOLD (Director 2026-07-10 edge-case interview: "Hold
    -- incomplete-roster cohorts out"): a cohort whose denominator stands on
    -- outcome_reported (roster empty, or smaller than the outcomes we already
    -- know about) is still computed and stored, but stays OUT of the
    -- accreditation evidence ledger until its roster is completed. The stamp
    -- names the release action. NOTE small_cohort alone does NOT hold — the
    -- Director explicitly kept 2026-07-09's "compute, but label" ruling for
    -- placement smallness (same interview, consistency check).
    IF (v_metrics ->> 'denominator_basis') IS DISTINCT FROM 'batch_roster' THEN
      v_metrics := v_metrics || jsonb_build_object('evidence_held', 'incomplete_roster');
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

    IF v_metrics ? 'evidence_held' THEN
      -- Held from the ledger — and self-heal: drop any auto evidence emitted
      -- for this cohort before the hold existed (or before its roster
      -- regressed). Manually-curated (is_auto=false) rows are never touched.
      v_held := v_held + 1;
      DELETE FROM public.quality_evidence_mappings
      WHERE source_table = 'cdc_placement_outcome_cycles'
        AND source_id = v_cycle_id
        AND is_auto;
    ELSE
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
    END IF;

    v_details := v_details || jsonb_build_object(
      'institution_id', r.institution_id, 'program_id', r.program_id,
      'cohort_ay_end', r.ay_end,
      'result', CASE WHEN v_metrics ? 'evidence_held'
                     THEN 'measured_held_from_evidence' ELSE 'measured' END,
      'denominator_basis', v_metrics ->> 'denominator_basis',
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
    'cohorts_evidence_held', v_held,
    'evidence_upserts', v_evidence,
    'details', v_details);
END;
$function$;

-- ── 4. ACL re-assertion (replays re-grant anon via default privileges — both
--       fns are cron-only, service_role ONLY; CLAUDE.md 2026-06-06 rule) ─────
REVOKE EXECUTE ON FUNCTION public.fn_copo_emit_attainment_evidence()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_cdc_placement_outcome_measure()   FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_copo_emit_attainment_evidence()   TO service_role;
GRANT  EXECUTE ON FUNCTION public.fn_cdc_placement_outcome_measure()   TO service_role;
