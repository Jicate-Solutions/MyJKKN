-- ============================================================================
-- Induction — re-key NAAC evidence to Binary 6.3 (Mentoring & wellbeing)
-- File: 20260709034000_induction_naac_rekey_63.sql | Date: 2026-07-09
-- Director decision 2026-07-09: fresher induction's Binary Accreditation
-- Framework home is Metric 6.3 (Mentoring & wellbeing), Attribute 6:
-- Extended Curricular. Full end-to-end re-key of the legacy Criterion-taxonomy
-- codes 5.1.3 / 7.2.1 (seeded 20260628120000, marked LEGACY/home-TBD by
-- 20260709030000 = PR #1903):
--
--   1. Catalog: ('NAAC','5.1.3') -> '6.3.1' (renamed 'Fresher induction /
--      orientation — student mentoring & wellbeing'), ('NAAC','7.2.1') ->
--      '6.3.2' (renamed 'Fresher induction as institutional mentoring
--      practice'); both category 'Attribute 6: Extended Curricular'.
--   2. Junction: the 2 existing auto-emitted quality_evidence_mappings rows
--      (verified exactly 1 per code on prod 2026-07-09) follow their metrics
--      to the new codes. Aborts if more than 2 rows match (new emissions at
--      old codes would mean the emitter re-keyed here was raced).
--   3. Emitter: fn_induction_emit_naac_evidence re-created with
--      ARRAY['6.3.1','6.3.2']. Body taken byte-faithfully from prod's live
--      definition (pg_get_functiondef, 2026-07-09 — verified identical to the
--      20260730140000 coordinator-retrofit version, the latest in git; only
--      the metric array changed). CREATE OR REPLACE preserves the ACL
--      (anon revoked; authenticated + service_role EXECUTE) — re-asserted
--      below anyway.
--   4. Crosswalk: the two #1903 rows (legacy 5.1.3 / 7.2.1, current_code
--      NULL = home TBD) resolve to 6.3.1 / 6.3.2.
--
-- SEQUENCING / HARD DEPENDENCY: timestamp sorts after BOTH
-- 20260709030000 (PR #1903 — creates accreditation_metric_crosswalk, marks
-- these codes LEGACY) and 20260709033000 (PR #1907 — catalog mis-key
-- re-keys). Merge + apply order: #1903 -> #1907 -> this. Do NOT apply before
-- #1903 (crosswalk table) even though #1907 shares no rows with this file.
--
-- Companion CODE change in the same PR: scorecard-section.tsx emit toast
-- relabeled 5.1.3 + 7.2.1 -> 6.3.1 + 6.3.2 (only UI string showing the codes).
--
-- Idempotent + fail-loud: catalog UPDATEs guarded on old code + exact current
-- name + target-code-free; a post-check RAISEs if the induction rows are not
-- at 6.3.1/6.3.2 afterwards (collision or drifted source = abort, never a
-- silent half-state). Junction re-key is a no-op on re-run (0 rows at old
-- codes). Crosswalk UPDATEs guarded on current_code IS NULL. UNIQUE
-- constraints turn any unexpected collision into a loud txn abort.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Catalog re-keys (guards: old code + exact live name + target free).
-- ----------------------------------------------------------------------------
UPDATE public.sh_accreditation_metrics
SET metric_code = '6.3.1',
    metric_name = 'Fresher induction / orientation — student mentoring & wellbeing',
    category    = 'Attribute 6: Extended Curricular',
    notes = COALESCE(notes, '')
      || ' | RE-KEYED 2026-07-09 from 5.1.3 (legacy Criterion 5.1.3, student support): Director decision 2026-07-09 — induction''s Binary home is Metric 6.3 (Mentoring & wellbeing). Resolves the LEGACY/home-TBD note.'
WHERE metric_type = 'NAAC'
  AND metric_code = '5.1.3'
  AND metric_name = 'Fresher induction / orientation programme — student support & progression'
  AND NOT EXISTS (
    SELECT 1 FROM public.sh_accreditation_metrics t
    WHERE t.metric_type = 'NAAC' AND t.metric_code = '6.3.1');

UPDATE public.sh_accreditation_metrics
SET metric_code = '6.3.2',
    metric_name = 'Fresher induction as institutional mentoring practice',
    category    = 'Attribute 6: Extended Curricular',
    notes = COALESCE(notes, '')
      || ' | RE-KEYED 2026-07-09 from 7.2.1 (legacy Criterion 7.2.1, best practice — Binary 7.2 = Effective Leadership, semantic drift): Director decision 2026-07-09 — induction''s Binary home is Metric 6.3 (Mentoring & wellbeing). Resolves the LEGACY/home-TBD note.'
WHERE metric_type = 'NAAC'
  AND metric_code = '7.2.1'
  AND metric_name = 'Fresher induction as an institutional best practice'
  AND NOT EXISTS (
    SELECT 1 FROM public.sh_accreditation_metrics t
    WHERE t.metric_type = 'NAAC' AND t.metric_code = '6.3.2');

-- Fail loud if the induction rows are not now at 6.3.1/6.3.2 (collision with a
-- foreign occupant or drifted source names). Junction/fn/crosswalk steps below
-- assume the re-key landed; holds trivially on idempotent re-runs.
DO $$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM public.sh_accreditation_metrics
       WHERE metric_type = 'NAAC' AND metric_code = '6.3.1'
         AND metric_name = 'Fresher induction / orientation — student mentoring & wellbeing')
     OR NOT EXISTS (
       SELECT 1 FROM public.sh_accreditation_metrics
       WHERE metric_type = 'NAAC' AND metric_code = '6.3.2'
         AND metric_name = 'Fresher induction as institutional mentoring practice')
  THEN
    RAISE EXCEPTION
      'induction_naac_rekey_63: induction catalog rows did not land at 6.3.1/6.3.2 (target-code collision or drifted source rows) — aborting; junction/fn/crosswalk depend on the re-key.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Junction rows follow their metrics (exactly the 2 auto-emitted rows;
--    prod verified 1 per code 2026-07-09). UNIQUE (source_table, source_id,
--    body_code, metric_code) turns any unexpected duplicate into a loud abort.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  n1 integer;
  n2 integer;
BEGIN
  UPDATE public.quality_evidence_mappings
  SET metric_code = '6.3.1'
  WHERE body_code = 'NAAC' AND metric_code = '5.1.3';
  GET DIAGNOSTICS n1 = ROW_COUNT;

  UPDATE public.quality_evidence_mappings
  SET metric_code = '6.3.2'
  WHERE body_code = 'NAAC' AND metric_code = '7.2.1';
  GET DIAGNOSTICS n2 = ROW_COUNT;

  IF n1 + n2 > 2 THEN
    RAISE EXCEPTION
      'induction_naac_rekey_63: expected <= 2 junction rows to re-key, got % (5.1.3: %, 7.2.1: %) — new evidence appeared at the old codes since authoring; investigate before applying.',
      n1 + n2, n1, n2;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Emitter re-created with the new codes. Body = prod live definition
--    (pg_get_functiondef 2026-07-09, identical to 20260730140000 retrofit version);
--    ONLY the FOREACH array changed. ACL preserved by CREATE OR REPLACE and
--    re-asserted below.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_emit_naac_evidence(p_event_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prog    RECORD;
  v_period  TEXT;
  v_meta    JSONB;
  v_metric  TEXT;
  v_n       INTEGER := 0;
  v_rc      INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_emit_naac_evidence: not authenticated'; END IF;

  SELECT ip.id AS program_id, ip.institution_id, e.start_date, ay.academic_year_name
    INTO v_prog
  FROM public.induction_programs ip
  JOIN public.events e ON e.id = ip.event_id
  LEFT JOIN public.academic_years ay ON ay.id = ip.academic_year_id
  WHERE ip.event_id = p_event_id;
  IF v_prog.program_id IS NULL THEN RAISE EXCEPTION 'fn_induction_emit_naac_evidence: not an induction event'; END IF;

  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_prog.institution_id))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_emit_naac_evidence: not authorized';
  END IF;

  -- Prefer the linked academic-year LABEL (correct AY semantics — an Indian academic
  -- year spans two calendar years, so a Jan–May induction must not be labelled by its
  -- calendar start year). Fall back to an IST-normalised calendar-year label only when
  -- the program has no academic_year row.
  v_period := COALESCE(
    NULLIF(btrim(v_prog.academic_year_name), ''),
    CASE WHEN v_prog.start_date IS NULL THEN NULL
      ELSE extract(year FROM (v_prog.start_date AT TIME ZONE 'Asia/Kolkata'))::int::text || '-' ||
           right((extract(year FROM (v_prog.start_date AT TIME ZONE 'Asia/Kolkata'))::int + 1)::text, 2)
    END
  );

  -- Live rollup snapshot for the metadata (joins LIVE off the admission funnel).
  WITH freshers AS (
    SELECT ie.learner_id FROM public.induction_enrollment ie WHERE ie.event_id = p_event_id
  ),
  refs AS (  -- submitted/referrers = EFFORT (any JKKN college); only JOINED scoped to
             -- this college (match fn_induction_scorecard) for the NAAC evidence metadata.
    SELECT count(*) FILTER (WHERE al.id IS NOT NULL) AS submitted,
           count(*) FILTER (
             WHERE al.funnel_stage IN ('token_paid','confirmed','enrolled')
               AND al.institution_id = v_prog.institution_id
           ) AS joined,
           count(DISTINCT al.referred_by_id) FILTER (WHERE al.id IS NOT NULL) AS referrers
    FROM freshers f
    LEFT JOIN public.admission_leads al
      ON al.referred_by_id = f.learner_id AND al.source = 'referral'::lead_source
  ),
  comp AS (
    SELECT count(*) AS enrolled,
           count(*) FILTER (WHERE c.participation_complete) AS participation_complete,
           count(*) FILTER (WHERE c.outcome_complete) AS outcome_complete,
           round(avg(c.attendance_pct), 2) AS avg_attendance_pct,
           round(avg(c.value_score_avg), 2) AS avg_value,
           round(avg(c.advocacy_score), 2) AS avg_advocacy
    FROM public.induction_enrollment ie
    LEFT JOIN public.induction_completion c
      ON c.event_id = ie.event_id AND c.learner_id = ie.learner_id
    WHERE ie.event_id = p_event_id
  )
  SELECT jsonb_build_object(
    'event_id', p_event_id,
    'period_label', v_period,
    'enrolled', comp.enrolled,
    'participation_complete', comp.participation_complete,
    'outcome_complete', comp.outcome_complete,
    'avg_attendance_pct', comp.avg_attendance_pct,
    'avg_value_score', comp.avg_value,
    'avg_advocacy_score', comp.avg_advocacy,
    'referrers', refs.referrers,
    'referrals_submitted', refs.submitted,
    'referrals_joined', refs.joined,
    'snapshot_at', now()
  ) INTO v_meta
  FROM comp, refs;

  -- Don't write NAAC evidence for an induction that reached nobody. The UI hides the
  -- button at enrolled=0, but a direct RPC must not emit all-zero evidence rows.
  IF COALESCE((v_meta->>'enrolled')::int, 0) = 0 THEN
    RETURN 0;
  END IF;

  -- Upsert one evidence row per NAAC criterion (source row = the induction_programs
  -- satellite). Refresh metadata + mapped_at on conflict so re-running re-snapshots.
  FOREACH v_metric IN ARRAY ARRAY['6.3.1','6.3.2'] LOOP
    INSERT INTO public.quality_evidence_mappings
      (source_table, source_id, institution_id, body_code, metric_code,
       period_label, mapped_by, is_auto, metadata, mapped_at)
    VALUES
      ('induction_programs', v_prog.program_id, v_prog.institution_id, 'NAAC', v_metric,
       v_period, auth.uid(), true, v_meta, now())
    ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
      SET period_label = EXCLUDED.period_label,
          metadata     = EXCLUDED.metadata,
          mapped_by    = EXCLUDED.mapped_by,
          is_auto      = true,
          mapped_at    = now()
      -- never clobber a manually-curated (is_auto=false) evidence mapping for this key
      WHERE public.quality_evidence_mappings.is_auto;
    -- count ACTUAL writes only: the upsert is a no-op (ROW_COUNT 0) when a manual
    -- row blocked the update, so the caller/UI never reports a false success.
    GET DIAGNOSTICS v_rc = ROW_COUNT;
    v_n := v_n + v_rc;
  END LOOP;

  RETURN v_n;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_emit_naac_evidence(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_emit_naac_evidence(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Crosswalk: resolve the two #1903 home-TBD rows to the decided codes.
--    Guarded on current_code IS NULL (re-runs no-op) + target-tuple-free
--    (UNIQUE NULLS NOT DISTINCT safety).
-- ----------------------------------------------------------------------------
UPDATE public.accreditation_metric_crosswalk
SET current_code = '6.3.1',
    note = COALESCE(note, '')
      || ' | Director decision 2026-07-09: induction = mentoring & wellbeing (Binary Metric 6.3) — resolved to 6.3.1.'
WHERE body_code = 'NAAC' AND legacy_code = '5.1.3'
  AND current_code IS NULL AND college_type IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.accreditation_metric_crosswalk t
    WHERE t.body_code = 'NAAC' AND t.legacy_code = '5.1.3'
      AND t.current_code = '6.3.1' AND t.college_type IS NULL);

UPDATE public.accreditation_metric_crosswalk
SET current_code = '6.3.2',
    note = COALESCE(note, '')
      || ' | Director decision 2026-07-09: induction = mentoring & wellbeing (Binary Metric 6.3) — resolved to 6.3.2.'
WHERE body_code = 'NAAC' AND legacy_code = '7.2.1'
  AND current_code IS NULL AND college_type IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.accreditation_metric_crosswalk t
    WHERE t.body_code = 'NAAC' AND t.legacy_code = '7.2.1'
      AND t.current_code = '6.3.2' AND t.college_type IS NULL);

COMMIT;

-- ============================================================================
-- Verification (run manually after apply)
-- ============================================================================
-- SELECT metric_code, metric_name, category FROM sh_accreditation_metrics
-- WHERE metric_type='NAAC' AND metric_code IN ('5.1.3','7.2.1','6.3.1','6.3.2')
-- ORDER BY metric_code;
--   Expected: NO rows at 5.1.3 / 7.2.1;
--     6.3.1 = 'Fresher induction / orientation — student mentoring & wellbeing'
--     6.3.2 = 'Fresher induction as institutional mentoring practice'
--     (both 'Attribute 6: Extended Curricular')
--
-- SELECT metric_code, count(*) FROM quality_evidence_mappings
-- WHERE body_code='NAAC' AND metric_code IN ('5.1.3','7.2.1','6.3.1','6.3.2')
-- GROUP BY metric_code;   -- Expected: 6.3.1 = 1, 6.3.2 = 1, no old-code rows
--
-- SELECT pg_get_functiondef('public.fn_induction_emit_naac_evidence(uuid)'::regprocedure)
--   LIKE '%''6.3.1'',''6.3.2''%';   -- Expected: true
--
-- SELECT legacy_code, current_code FROM accreditation_metric_crosswalk
-- WHERE body_code='NAAC' AND legacy_code IN ('5.1.3','7.2.1');
--   Expected: 5.1.3 -> 6.3.1, 7.2.1 -> 6.3.2
-- ============================================================================
