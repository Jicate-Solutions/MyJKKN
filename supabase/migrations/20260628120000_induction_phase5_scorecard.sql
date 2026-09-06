-- ============================================================================
-- Fresher Induction — Phase 5: scorecard + NAAC evidence rollup
-- File: 20260628120000_induction_phase5_scorecard.sql | Date: 2026-06-28
-- Spec: specs/induction-program-module-2026-06-27.md §5b (scorecard) + item 5 (NAAC)
--
-- WHAT THIS ADDS
--   1. Seed two NAAC criterion rows the induction evidence maps to (the JKKN
--      metric catalog uses its own code scheme; induction-aligned codes 5.1.3
--      and 7.2.1 did not exist — seeded here, idempotent).
--   2. fn_induction_scorecard(p_event_id) — one induction's funnel
--      (enrolled → value → advocacy → referred → submitted → JOINED), broken out
--      by department + by batch + a program total. Coordinator scope.
--   3. fn_induction_scorecard_leadership(p_academic_year_id, p_institution_id) —
--      cross-college funnel + joins-vs-vacancy. Rows are filtered to the colleges
--      the caller may access (role_has_institution_access).
--   4. fn_induction_emit_naac_evidence(p_event_id) — upsert one quality_evidence_
--      mappings row per (induction, NAAC criterion) with the live rollup snapshot
--      in metadata. Extends the CANONICAL fan-out mechanism (the same junction the
--      anti-ragging / grievance fan-outs write to) — NOT a parallel mechanism.
--
-- LOAD-BEARING FACTS (verified against live prod 2026-06-28, ground truth):
--   - "JOINED" = admission_leads.funnel_stage IN ('token_paid','confirmed','enrolled'),
--     read LIVE off the admission funnel by referred_by_id. The cached column
--     induction_completion.referrals_joined is NOT maintained by Phase 4 (only
--     referrals_submitted is) → it sits at 0 → MUST compute joins live here.
--   - Seat vacancy = intake_history.sanctioned_intake − actual_intake per
--     program×year. (The earlier spec named admission_year_quota_seats — that
--     table does not exist in prod.)
--   - department of a fresher = learners_profiles.department_id → departments.department_name.
--   - quality_evidence_mappings UNIQUE (source_table, source_id, body_code, metric_code).
--
-- SECURITY (CLAUDE.md): every fn is STABLE/VOLATILE SECURITY DEFINER
--   SET search_path=public, with explicit REVOKE EXECUTE FROM anon, PUBLIC +
--   GRANT TO authenticated. Every RETURNS TABLE column is cast to its declared
--   type (the secdef-returns-table lesson). Reads are gated on induction.view +
--   role_has_institution_access; the evidence write on induction.manage.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Seed induction-aligned NAAC criterion rows (idempotent on (metric_type,metric_code)).
--    Criterion 5 = Student Support & Progression; Criterion 7 = Institutional
--    Values & Best Practices. Induction/orientation is the classic 5.1.3
--    student-support initiative + a 7.2.1 institutional best practice.
-- ----------------------------------------------------------------------------
INSERT INTO public.sh_accreditation_metrics
  (metric_type, metric_code, metric_name, category, is_active, is_system, notes)
VALUES
  ('NAAC', '5.1.3',
   'Fresher induction / orientation programme — student support & progression',
   'Criterion 5 — Student Support and Progression', true, true,
   'Auto-rolled from the Fresher Induction module: enrolment, completion, attendance, experienced value, advocacy and referral-join outcomes per induction programme.'),
  ('NAAC', '7.2.1',
   'Fresher induction as an institutional best practice',
   'Criterion 7 — Institutional Values and Best Practices', true, true,
   'Auto-rolled from the Fresher Induction module: the induction programme itself, evidenced as a documented institutional best practice with participation and outcome metrics.')
ON CONFLICT (metric_type, metric_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. fn_induction_scorecard — one induction's funnel, by department + batch + total.
--    Coordinator scope (induction.view + institution access). JOINED is LIVE.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_scorecard(p_event_id UUID)
RETURNS TABLE (
  dimension           TEXT,     -- 'total' | 'department' | 'batch'
  group_id            UUID,     -- dept_id / batch_id (NULL for total)
  group_label         TEXT,
  enrolled            INTEGER,
  value_rated         INTEGER,  -- freshers who gave a per-session value score
  value_avg           NUMERIC,  -- avg value_score_avg (1–5), NULL if none
  advocacy_given      INTEGER,  -- freshers who gave an NPS score
  advocacy_avg        NUMERIC,  -- avg advocacy (0–10), NULL if none
  promoters           INTEGER,  -- NPS >= 9
  referred            INTEGER,  -- freshers who submitted >= 1 referral
  referrals_submitted BIGINT,
  referrals_joined    BIGINT    -- LIVE off admission_leads (source of truth)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_scorecard: not authenticated'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_scorecard: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_scorecard: not authorized';
  END IF;

  RETURN QUERY
  WITH freshers AS (
    SELECT ie.learner_id, lp.department_id, ie.batch_id
    FROM public.induction_enrollment ie
    LEFT JOIN public.learners_profiles lp ON lp.id = ie.learner_id
    WHERE ie.event_id = p_event_id
  ),
  refs AS (  -- per-fresher referral stats, LIVE. submitted/referred = EFFORT (a referral
             -- to any JKKN college counts — the "refer anywhere" decision); only JOINED is
             -- institution-scoped, since a join fills THIS college's seat.
    SELECT al.referred_by_id AS learner_id,
           count(*)::bigint AS submitted,
           count(*) FILTER (
             WHERE al.funnel_stage IN ('token_paid','confirmed','enrolled')
               AND al.institution_id = v_inst
           )::bigint AS joined
    FROM public.admission_leads al
    WHERE al.source = 'referral'::lead_source
      AND al.referred_by_id IN (SELECT learner_id FROM freshers)
    GROUP BY al.referred_by_id
  ),
  base AS (
    SELECT f.learner_id, f.department_id, f.batch_id,
           c.value_score_avg, c.advocacy_score,
           COALESCE(r.submitted, 0) AS submitted,
           COALESCE(r.joined, 0)    AS joined
    FROM freshers f
    LEFT JOIN public.induction_completion c
      ON c.event_id = p_event_id AND c.learner_id = f.learner_id
    LEFT JOIN refs r ON r.learner_id = f.learner_id
  )
  -- program total
  SELECT 'total'::text, NULL::uuid, 'All departments'::text,
         count(*)::integer,
         count(*) FILTER (WHERE b.value_score_avg IS NOT NULL)::integer,
         round(avg(b.value_score_avg), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score IS NOT NULL)::integer,
         round(avg(b.advocacy_score), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score >= 9)::integer,
         count(*) FILTER (WHERE b.submitted >= 1)::integer,
         COALESCE(sum(b.submitted), 0)::bigint,
         COALESCE(sum(b.joined), 0)::bigint
  FROM base b
  UNION ALL
  -- by department
  SELECT 'department'::text, b.department_id,
         COALESCE(d.department_name, '— Unassigned —')::text,
         count(*)::integer,
         count(*) FILTER (WHERE b.value_score_avg IS NOT NULL)::integer,
         round(avg(b.value_score_avg), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score IS NOT NULL)::integer,
         round(avg(b.advocacy_score), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score >= 9)::integer,
         count(*) FILTER (WHERE b.submitted >= 1)::integer,
         COALESCE(sum(b.submitted), 0)::bigint,
         COALESCE(sum(b.joined), 0)::bigint
  FROM base b
  LEFT JOIN public.departments d ON d.id = b.department_id
  GROUP BY b.department_id, d.department_name
  UNION ALL
  -- by batch
  SELECT 'batch'::text, b.batch_id,
         COALESCE(ib.label, '— No batch —')::text,
         count(*)::integer,
         count(*) FILTER (WHERE b.value_score_avg IS NOT NULL)::integer,
         round(avg(b.value_score_avg), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score IS NOT NULL)::integer,
         round(avg(b.advocacy_score), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score >= 9)::integer,
         count(*) FILTER (WHERE b.submitted >= 1)::integer,
         COALESCE(sum(b.submitted), 0)::bigint,
         COALESCE(sum(b.joined), 0)::bigint
  FROM base b
  LEFT JOIN public.induction_batches ib ON ib.id = b.batch_id
  GROUP BY b.batch_id, ib.label
  ORDER BY 1, 3;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_scorecard(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_scorecard(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. fn_induction_scorecard_leadership — cross-college funnel + joins-vs-vacancy.
--    Entry gated on induction.view; ROWS filtered to colleges the caller may see.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_scorecard_leadership(
  p_academic_year_id UUID,
  p_institution_id   UUID DEFAULT NULL
)
RETURNS TABLE (
  institution_id       UUID,
  institution_name     TEXT,
  inductions           INTEGER,
  enrolled             INTEGER,
  value_avg            NUMERIC,
  advocacy_avg         NUMERIC,
  promoters            INTEGER,
  referred             INTEGER,
  referrals_submitted  BIGINT,
  referrals_joined     BIGINT,
  vacant_seats         INTEGER,
  joins_vs_vacancy_pct NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_scorecard_leadership: not authenticated'; END IF;
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('induction.view')) THEN
    RAISE EXCEPTION 'fn_induction_scorecard_leadership: not authorized';
  END IF;

  RETURN QUERY
  WITH ind AS (  -- induction events in the year (optionally one college), caller-scoped
    SELECT ip.event_id, ip.institution_id
    FROM public.induction_programs ip
    WHERE ip.academic_year_id = p_academic_year_id
      AND (p_institution_id IS NULL OR ip.institution_id = p_institution_id)
      AND (is_super_admin() OR is_admin() OR role_has_institution_access(ip.institution_id))
  ),
  colleges AS (  -- institutions in scope (incl. those that ran an induction with 0 enrollees)
    SELECT DISTINCT ind.institution_id FROM ind   -- qualify: institution_id is also a RETURNS TABLE out-param
  ),
  fresh_inst AS (  -- exactly ONE institution per learner — a learner inducted at >1
                   -- college is attributed to a single deterministic one, so their
                   -- referrals are not double-counted across colleges. Attribute by
                   -- the ACCESS-CHECKED program institution.
    SELECT DISTINCT ON (ie.learner_id) ind.institution_id, ie.learner_id
    FROM ind
    JOIN public.induction_enrollment ie ON ie.event_id = ind.event_id
    ORDER BY ie.learner_id, ind.institution_id
  ),
  comp AS (  -- each learner's completion stats, averaged across their in-scope inductions
    SELECT ind.institution_id, ie.learner_id,
           avg(c.value_score_avg) AS value_avg,
           avg(c.advocacy_score)  AS advocacy_avg
    FROM ind
    JOIN public.induction_enrollment ie ON ie.event_id = ind.event_id
    LEFT JOIN public.induction_completion c ON c.event_id = ie.event_id AND c.learner_id = ie.learner_id
    GROUP BY ind.institution_id, ie.learner_id
  ),
  refs AS (  -- per (attributed college, learner), ONCE. submitted = EFFORT (any JKKN
             -- college); only JOINED is scoped to the learner's own college (seat there).
    SELECT fi.institution_id, fi.learner_id,
           count(al.id)::bigint AS submitted,
           count(al.id) FILTER (
             WHERE al.funnel_stage IN ('token_paid','confirmed','enrolled')
               AND al.institution_id = fi.institution_id
           )::bigint AS joined
    FROM fresh_inst fi
    LEFT JOIN public.admission_leads al
      ON al.referred_by_id = fi.learner_id
     AND al.source = 'referral'::lead_source
    GROUP BY fi.institution_id, fi.learner_id
  ),
  per_fresher AS (  -- exactly one row per (institution, learner)
    SELECT fi.institution_id, fi.learner_id,
           cm.value_avg, cm.advocacy_avg,
           COALESCE(r.submitted, 0) AS submitted,
           COALESCE(r.joined, 0)    AS joined
    FROM fresh_inst fi
    LEFT JOIN comp cm ON cm.institution_id = fi.institution_id AND cm.learner_id = fi.learner_id
    LEFT JOIN refs r  ON r.institution_id = fi.institution_id AND r.learner_id = fi.learner_id
  ),
  vac AS (  -- vacant seats per college for the year (sanctioned − actual, floored at 0)
    SELECT ih.institution_id,
           sum(greatest(COALESCE(ih.sanctioned_intake,0) - COALESCE(ih.actual_intake,0), 0))::integer AS vacant_seats
    FROM public.intake_history ih
    WHERE ih.academic_year_id = p_academic_year_id
      AND (p_institution_id IS NULL OR ih.institution_id = p_institution_id)
    GROUP BY ih.institution_id
  )
  SELECT col.institution_id::uuid,
         i.name::text,
         (SELECT count(DISTINCT x.event_id) FROM ind x WHERE x.institution_id = col.institution_id)::integer,
         count(DISTINCT pf.learner_id)::integer,
         round(avg(pf.value_avg), 2)::numeric,
         round(avg(pf.advocacy_avg), 2)::numeric,
         count(*) FILTER (WHERE pf.advocacy_avg >= 9)::integer,
         count(*) FILTER (WHERE pf.submitted >= 1)::integer,
         COALESCE(sum(pf.submitted), 0)::bigint,
         COALESCE(sum(pf.joined), 0)::bigint,
         COALESCE(v.vacant_seats, 0)::integer,
         CASE WHEN COALESCE(v.vacant_seats, 0) = 0 THEN NULL
              ELSE round(100.0 * COALESCE(sum(pf.joined), 0) / v.vacant_seats, 2) END::numeric
  FROM colleges col
  JOIN public.institutions i ON i.id = col.institution_id
  LEFT JOIN per_fresher pf ON pf.institution_id = col.institution_id
  LEFT JOIN vac v ON v.institution_id = col.institution_id
  GROUP BY col.institution_id, i.name, v.vacant_seats
  ORDER BY i.name;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_scorecard_leadership(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_scorecard_leadership(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. fn_induction_emit_naac_evidence — record/refresh the induction as NAAC
--    Criterion 5 + 7 evidence in the canonical quality_evidence_mappings junction,
--    with the live rollup snapshot in metadata. Coordinator action (induction.manage).
--    Returns the number of evidence rows upserted (2).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_emit_naac_evidence(p_event_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
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
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_prog.institution_id))) THEN
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
  FOREACH v_metric IN ARRAY ARRAY['5.1.3','7.2.1'] LOOP
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
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_emit_naac_evidence(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_emit_naac_evidence(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
