-- ============================================================================
-- CO/PO Attainment Loop Spine — COE connector + OBE direct side (NBA loop)
-- File: 20260709031000_copo_attainment_spine.sql | Date: 2026-07-09
-- Program: accreditation-loop PR-4. Ships DARK (copo_attainment.master_enabled
-- = false). NBA audits whether each program's outcome-attainment loop CLOSES
-- (attainment measured per term → trend vs prior term → action). This is the
-- DIRECT-assessment substrate of that loop.
--
-- FEASIBILITY RECON (2026-07-09, read-only against COE prod
-- qtsuqhduiuagjjtlalbh + MyJKKN prod kvizhngldtiuufknvehv):
--   * COE marks grain: per-student × course × session. CIA components are
--     stored (assignment/quiz/mid_term/... in cia_marks_detailed_view);
--     declared results per student per course in final_marks_detailed_view
--     (internal/external/total + percentage + is_pass). marks_entry HAS a
--     question_wise_marks column but it is 0/27,282 filled — per-question
--     grain does not exist in practice.
--   * Assessment→CO / question→CO tagging: NONE anywhere in COE (no CO/outcome
--     tables at all). So TRUE CO-tagged attainment is IMPOSSIBLE today.
--   * CO sources: bos_course_syllabi.course_learning_outcomes (jsonb
--     {clos:[{clo_number, description, k_values}]}) — 658/661 + 219/237 latest
--     rows filled for the two Arts & Science colleges (the only ones with BoS
--     rows). CO→PO articulation EXISTS as bos_course_syllabi.po_mappings
--     (jsonb {mappings:[{co_id, pos:{PO1:'H'..}, psos:{..}}]}) — 642 + 193
--     rows — but obe_program_outcomes is empty (no PO definitions as rows) and
--     CO-grain attainment is impossible (above), so PO attainment stays out of
--     scope this PR. The matrix being present in BoS is recorded here so the
--     future CO-tagged PR can lift it into obe_co_po_mapping.
--   * obe_* tables: all 13 exist in prod, ALL 0 rows (scaffolding). This PR
--     populates obe_course_outcomes (real CLO substrate) and adds ONE new
--     course-grain rollup table — obe_co_attainment cannot hold the honest
--     proxy because its co_id is NOT NULL (a course-grain row would have to
--     lie about being CO-tagged) and its unique index
--     (co_id, batch_id, semester_id, academic_year) contains nullable columns
--     (NULLs never conflict → upsert-duplicates trap).
--
-- HONESTY CONTRACT: everything computed here is a COURSE-LEVEL PROXY
-- (grain='course_proxy', co_tagged=false, machine-readable on every row and
-- every evidence emission). It is NEVER presented as CO-tagged attainment.
-- The exact blocker for the real thing: the Academic Office must author
-- assessment→CO (or question→CO) maps; COE has no structure to hold them.
--
-- WHAT THIS ADDS
--   1. 8 config rows (platform_policies) — every methodology number a config
--      row. threshold_pct is PER-COLLEGE (Director 2026-07-09: 'Let each
--      college choose'): the global row is the FALLBACK, institution-scoped
--      override rows win via fn_get_policy. Weights 80/20 RATIFIED by
--      Director 2026-07-09; remaining values are DEFAULTS awaiting
--      Director/Academic Council ratification.
--   2. Metric seeds: NAAC 7.3.d (idempotent; sibling PR #1899 seeds the same
--      row — either merge order is safe, ON CONFLICT DO NOTHING) + NBA T1_CO
--      'Course Outcomes assessment' (already in prod; seeded for repo parity).
--   3. obe_course_attainment_rollup — course-grain direct-attainment rollup
--      (one row per institution × course_code × COE session) with trend delta.
--   4. fn_copo_backfill_course_outcomes() — idempotent BoS-CLO →
--      obe_course_outcomes copy, keyed to each taught course_id,
--      institution-scoped (course_code alone leaks cross-tenant; BoS column is
--      PLURAL institutions_id).
--   5. fn_copo_record_course_attainment(jsonb) — upserts rollup rows computed
--      by the cron from COE reads (SQL cannot reach the COE DB; aggregation
--      happens in the cron route via the PR-#1784 coe-db-client pattern).
--   6. fn_copo_emit_attainment_evidence() — reads rollup rows ONLY when
--      master_enabled=true and upserts quality_evidence_mappings rows
--      (NAAC 7.3.d + NBA T1_CO), loop_key 'copo_attainment'. Does NOT touch
--      PR #1899's fn_accreditation_rollup_loop_evidence (unmerged sibling).
--   7. ai_routine_schedules seed 'copo-attainment' (weekly Sun 03:41 IST —
--      dispatcher floors to the 03:30 slot; same convention as #1899's 04:23).
--
-- SECURITY (CLAUDE.md 2026-06-06 + SCF loop-RPC pattern 20260630160000): all
-- three fns are SECURITY DEFINER SET search_path=public, REVOKEd from anon,
-- authenticated AND PUBLIC, GRANTed to service_role ONLY (cron-only; GRANT-
-- level gate, no auth.uid() check, so a Management-API validation context
-- works). Rollup table writes happen only through the DEFINER RPCs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Config rows — every methodology number is a Director-ratifiable row.
--    Shape mirrors mess.choose.loop.* (20260727000000): scope_type='global',
--    conflict target = uq_platform_policies_key_scope.
--
--    PER-COLLEGE THRESHOLD (Director 2026-07-09: 'Let each college choose'):
--    the threshold_pct GLOBAL row is a FALLBACK. A college's Academic Council
--    ratifies its own value as an INSTITUTION-scoped override row
--    (scope_type='institution', scope_id=<institution uuid>, same policy_key),
--    which takes precedence via the canonical fn_get_policy resolver
--    (institution-override > global — 20260429000002). Every threshold reader
--    in this loop resolves through fn_get_policy with the institution id.
--    WEIGHTS 80/20: RATIFIED by Director 2026-07-09.
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, classification, publication_state, is_active, description)
VALUES
  ('copo_attainment.master_enabled', 'global', 'false'::jsonb, 'boolean', 'major', 'published', true,
   'CO/PO attainment loop master switch. DARK until ratified. DEFAULT — Director/Academic Council must ratify before go-live.'),
  ('copo_attainment.threshold_pct', 'global', '60'::jsonb, 'number', 'major', 'published', true,
   'A learner "meets" a course outcome when their course percentage >= this. FALLBACK 60% — each college''s Academic Council ratifies its own value; per-institution override rows take precedence.'),
  ('copo_attainment.direct_weight', 'global', '0.8'::jsonb, 'number', 'major', 'published', true,
   'Weight of DIRECT (marks-based) attainment in the final CO attainment blend. RATIFIED by Director 2026-07-09 (indirect side remains OFF until poll data matures).'),
  ('copo_attainment.indirect_weight', 'global', '0.2'::jsonb, 'number', 'major', 'published', true,
   'Weight of INDIRECT (survey-based) attainment in the final CO attainment blend. RATIFIED by Director 2026-07-09 (indirect side remains OFF until poll data matures).'),
  ('copo_attainment.target_level', 'global', '2'::jsonb, 'number', 'major', 'published', true,
   'Target attainment level (of 3) a course outcome should reach; below target flags the course for action in the loop. DEFAULT — Director/Academic Council must ratify before go-live.'),
  ('copo_attainment.level3_min_pct', 'global', '70'::jsonb, 'number', 'major', 'published', true,
   'Attainment Level 3 band: >= this % of learners meeting the threshold. DEFAULT — Director/Academic Council must ratify before go-live.'),
  ('copo_attainment.level2_min_pct', 'global', '60'::jsonb, 'number', 'major', 'published', true,
   'Attainment Level 2 band: >= this % of learners meeting the threshold. DEFAULT — Director/Academic Council must ratify before go-live.'),
  ('copo_attainment.level1_min_pct', 'global', '50'::jsonb, 'number', 'major', 'published', true,
   'Attainment Level 1 band: >= this % of learners meeting the threshold (below = Level 0). DEFAULT — Director/Academic Council must ratify before go-live.')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Metric seeds (idempotent on (metric_type, metric_code)).
--    NAAC 7.3.d text kept identical to sibling PR #1899's seed so either merge
--    order leaves the same row. NBA T1_CO already exists in prod (verified
--    2026-07-09) — seeded here only for repo/fresh-env parity.
-- ----------------------------------------------------------------------------
INSERT INTO public.sh_accreditation_metrics
  (metric_type, metric_code, metric_name, category, is_active, is_system, notes)
VALUES
  ('NAAC', '7.3.d',
   'Quality Assurance System — audits & performance assessment with feedback to the system (Metric 7.3 facet d)',
   'Attribute 7: Governance', true, true,
   'Auto-rolled from self-improving loop outcome measurements (induction session-effectiveness + annual playbook loops etc.): performance assessed vs baseline, fed back to the system. One evidence row per measured cycle, refreshed daily by fn_accreditation_rollup_loop_evidence. Legacy mapping: Criterion 6.5 (IQAC) under the outgoing framework.'),
  ('NBA', 'T1_CO', 'Course Outcomes assessment', 'Tier 1', true, true,
   'Course-outcome attainment evidence. CO/PO attainment loop (fn_copo_emit_attainment_evidence) emits one row per course per exam session at the honest available grain (metadata.grain distinguishes course_proxy vs co_tagged).')
ON CONFLICT (metric_type, metric_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. obe_course_attainment_rollup — course-grain direct attainment, one row
--    per (institution, course_code, COE session). course_code (not course_id)
--    is the key because COE marks are keyed by code; matched MyJKKN course ids
--    are carried in metadata. UNIQUE key uses only NOT NULL columns
--    (feedback_nullable_unique_index_upsert_duplicates).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.obe_course_attainment_rollup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  course_code text NOT NULL,
  course_name text,
  program_code text,
  session_code text NOT NULL,                     -- COE examination session (term)
  session_end_date date,                          -- exam-window end; orders sessions for the trend delta

  -- HONESTY: machine-readable grain. 'course_proxy' = derived from course-level
  -- marks with NO assessment→CO tagging. 'co_tagged' reserved for the future
  -- real computation once the Academic Office authors CO maps.
  grain text NOT NULL DEFAULT 'course_proxy' CHECK (grain IN ('course_proxy','co_tagged')),
  threshold_pct_used numeric NOT NULL,            -- audit: the threshold applied at compute time

  -- internal (CIA) basis
  internal_learner_count integer,
  internal_meeting_threshold integer,
  internal_attainment_pct numeric,
  avg_internal_pct numeric,

  -- declared-results basis
  final_learner_count integer,
  final_meeting_threshold integer,
  final_attainment_pct numeric,
  avg_external_pct numeric,
  avg_total_pct numeric,
  pass_pct numeric,

  -- primary attainment (declared results when available, else CIA) + NBA-style band
  attainment_basis text CHECK (attainment_basis IN ('final_total','internal_cia')),
  attainment_pct numeric,
  attainment_level smallint CHECK (attainment_level BETWEEN 0 AND 3),

  -- trend vs the previous session — the NBA loop's delta
  prior_rollup_id uuid REFERENCES public.obe_course_attainment_rollup(id) ON DELETE SET NULL,
  prev_attainment_pct numeric,
  delta_pct numeric,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,    -- co_tagged:false, source, matched course ids, component averages
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, course_code, session_code)
);

COMMENT ON TABLE public.obe_course_attainment_rollup IS
  'CO/PO attainment loop (NBA) — course-grain DIRECT attainment rollup from COE marks. grain=course_proxy until assessment→CO maps exist (obe_assessment_co_marks); never presented as CO-tagged. One row per institution × course_code × COE exam session, with trend delta vs prior session. Writes only via fn_copo_record_course_attainment (service_role). Added 2026-07-09 (accreditation-loop PR-4, DARK).';

CREATE INDEX IF NOT EXISTS idx_ocar_inst_session ON public.obe_course_attainment_rollup (institution_id, session_code);
CREATE INDEX IF NOT EXISTS idx_ocar_course_trend ON public.obe_course_attainment_rollup (institution_id, course_code, session_end_date);

ALTER TABLE public.obe_course_attainment_rollup ENABLE ROW LEVEL SECURITY;

-- READ: accreditation viewers, institution-scoped. WRITES: none (RPC-only).
DROP POLICY IF EXISTS "ocar_select" ON public.obe_course_attainment_rollup;
CREATE POLICY "ocar_select" ON public.obe_course_attainment_rollup
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.view')
      AND role_has_institution_access(institution_id))
);

-- ----------------------------------------------------------------------------
-- 4. fn_copo_backfill_course_outcomes — BoS CLOs → obe_course_outcomes.
--    Idempotent: ON CONFLICT (course_id, co_code) DO NOTHING (never overwrites
--    rows the Academic Office may later refine). Joined by course_code AND
--    institution (BoS column is PLURAL institutions_id) so a code shared
--    across colleges never leaks cross-tenant. When the same course_code is
--    latest under two regulations, the most recently modified syllabus wins.
--    target_percentage is read from config at runtime (config-table pattern).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_copo_backfill_course_outcomes()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted   integer := 0;
  v_courses    integer := 0;
  v_syllabi    integer := 0;
  v_total      integer := 0;
BEGIN
  SELECT count(*) INTO v_syllabi
  FROM public.bos_course_syllabi b
  WHERE b.is_latest AND NOT b.is_archived
    AND jsonb_array_length(COALESCE(b.course_learning_outcomes->'clos', '[]'::jsonb)) > 0;

  WITH src AS (
    SELECT DISTINCT ON (c.id, (clo->>'clo_number')::int)
      c.id AS course_id,
      c.institution_id,
      (clo->>'clo_number')::int AS clo_number,
      clo->>'description'       AS description,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(clo->'k_values', '[]'::jsonb)))::text[] AS k_values
    FROM public.bos_course_syllabi b
    JOIN public.courses c
      ON c.course_code = b.course_code
     AND c.institution_id = b.institutions_id      -- tenant guard (PLURAL col on BoS)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.course_learning_outcomes->'clos', '[]'::jsonb)) AS clo
    WHERE b.is_latest AND NOT b.is_archived
      AND (clo->>'clo_number') ~ '^[0-9]+$'
      AND COALESCE(clo->>'description', '') <> ''
    ORDER BY c.id, (clo->>'clo_number')::int, b.last_modified_at DESC
  ),
  ins AS (
    INSERT INTO public.obe_course_outcomes
      (institution_id, course_id, co_code, co_description,
       taxonomy_level, secondary_dimensions, target_percentage, sort_order, is_active)
    SELECT
      s.institution_id, s.course_id, 'CO' || s.clo_number, s.description,
      s.k_values[1],
      CASE WHEN array_length(s.k_values, 1) > 1 THEN s.k_values[2:] ELSE NULL END,
      -- PER-COLLEGE threshold: institution override wins, global row is the
      -- fallback, 60 is the defensive default (fn_get_policy, 20260429000002)
      COALESCE((public.fn_get_policy('copo_attainment.threshold_pct', s.institution_id))::numeric, 60),
      s.clo_number, true
    FROM src s
    ON CONFLICT (course_id, co_code) DO NOTHING
    RETURNING course_id
  )
  SELECT count(*), count(DISTINCT course_id) INTO v_inserted, v_courses FROM ins;

  SELECT count(*) INTO v_total FROM public.obe_course_outcomes;

  RETURN jsonb_build_object(
    'syllabi_with_clos', v_syllabi,
    'cos_inserted',      v_inserted,
    'courses_touched',   v_courses,
    'cos_total',         v_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_copo_backfill_course_outcomes() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_copo_backfill_course_outcomes() TO service_role;

COMMENT ON FUNCTION public.fn_copo_backfill_course_outcomes() IS
  'CO/PO attainment loop: idempotently copies BoS CLOs (bos_course_syllabi.course_learning_outcomes) into obe_course_outcomes, keyed to each taught course_id, institution-scoped. Never overwrites existing CO rows. target_percentage resolved PER INSTITUTION via fn_get_policy(copo_attainment.threshold_pct, institution_id) — institution override > global fallback (Director 2026-07-09: each college chooses). service_role only (cron).';

-- ----------------------------------------------------------------------------
-- 5. fn_copo_record_course_attainment — upserts rollup rows computed by the
--    cron from COE reads. The cron aggregates per-student COE rows in TS
--    (Postgres cannot reach the COE project); this fn owns level banding,
--    trend delta, and the honest-grain metadata stamp.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_copo_record_course_attainment(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_l3 numeric;
  v_l2 numeric;
  v_l1 numeric;
  r jsonb;
  v_basis text;
  v_pct numeric;
  v_level smallint;
  v_prior public.obe_course_attainment_rollup%ROWTYPE;
  v_prev_pct numeric;
  v_delta numeric;
  v_prior_id uuid;
  v_upserted integer := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a jsonb array';
  END IF;

  -- Level bands from config (defensive defaults per the config-table pattern)
  v_l3 := COALESCE((SELECT (value #>> '{}')::numeric FROM public.platform_policies
                    WHERE policy_key = 'copo_attainment.level3_min_pct' AND scope_type = 'global' AND is_active), 70);
  v_l2 := COALESCE((SELECT (value #>> '{}')::numeric FROM public.platform_policies
                    WHERE policy_key = 'copo_attainment.level2_min_pct' AND scope_type = 'global' AND is_active), 60);
  v_l1 := COALESCE((SELECT (value #>> '{}')::numeric FROM public.platform_policies
                    WHERE policy_key = 'copo_attainment.level1_min_pct' AND scope_type = 'global' AND is_active), 50);

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    -- Primary attainment: declared results when present, else CIA.
    IF COALESCE((r->>'final_learner_count')::int, 0) > 0
       AND (r->>'final_attainment_pct') IS NOT NULL THEN
      v_basis := 'final_total';
      v_pct   := (r->>'final_attainment_pct')::numeric;
    ELSIF COALESCE((r->>'internal_learner_count')::int, 0) > 0
       AND (r->>'internal_attainment_pct') IS NOT NULL THEN
      v_basis := 'internal_cia';
      v_pct   := (r->>'internal_attainment_pct')::numeric;
    ELSE
      v_basis := NULL;
      v_pct   := NULL;
    END IF;

    v_level := CASE
      WHEN v_pct IS NULL   THEN NULL
      WHEN v_pct >= v_l3   THEN 3
      WHEN v_pct >= v_l2   THEN 2
      WHEN v_pct >= v_l1   THEN 1
      ELSE 0
    END;

    -- Trend: the most recent EARLIER session's rollup for the same course.
    v_prior_id := NULL; v_prev_pct := NULL; v_delta := NULL;
    IF (r->>'session_end_date') IS NOT NULL THEN
      SELECT * INTO v_prior
      FROM public.obe_course_attainment_rollup o
      WHERE o.institution_id = (r->>'institution_id')::uuid
        AND o.course_code    = r->>'course_code'
        AND o.session_code  <> r->>'session_code'
        AND o.session_end_date IS NOT NULL
        AND o.session_end_date < (r->>'session_end_date')::date
      ORDER BY o.session_end_date DESC
      LIMIT 1;
      IF FOUND THEN
        v_prior_id := v_prior.id;
        v_prev_pct := v_prior.attainment_pct;
        IF v_pct IS NOT NULL AND v_prev_pct IS NOT NULL THEN
          v_delta := round(v_pct - v_prev_pct, 2);
        END IF;
      END IF;
    END IF;

    INSERT INTO public.obe_course_attainment_rollup AS o
      (institution_id, course_code, course_name, program_code, session_code,
       session_end_date, grain, threshold_pct_used,
       internal_learner_count, internal_meeting_threshold, internal_attainment_pct, avg_internal_pct,
       final_learner_count, final_meeting_threshold, final_attainment_pct,
       avg_external_pct, avg_total_pct, pass_pct,
       attainment_basis, attainment_pct, attainment_level,
       prior_rollup_id, prev_attainment_pct, delta_pct,
       metadata, computed_at, updated_at)
    VALUES (
      (r->>'institution_id')::uuid,
      r->>'course_code',
      r->>'course_name',
      r->>'program_code',
      r->>'session_code',
      (r->>'session_end_date')::date,
      'course_proxy',
      COALESCE((r->>'threshold_pct_used')::numeric, 60),
      (r->>'internal_learner_count')::int,
      (r->>'internal_meeting_threshold')::int,
      (r->>'internal_attainment_pct')::numeric,
      (r->>'avg_internal_pct')::numeric,
      (r->>'final_learner_count')::int,
      (r->>'final_meeting_threshold')::int,
      (r->>'final_attainment_pct')::numeric,
      (r->>'avg_external_pct')::numeric,
      (r->>'avg_total_pct')::numeric,
      (r->>'pass_pct')::numeric,
      v_basis, v_pct, v_level,
      v_prior_id, v_prev_pct, v_delta,
      COALESCE(r->'metadata', '{}'::jsonb)
        || jsonb_build_object('grain', 'course_proxy', 'co_tagged', false, 'source', 'coe_direct'),
      now(), now()
    )
    ON CONFLICT (institution_id, course_code, session_code) DO UPDATE SET
      course_name                = EXCLUDED.course_name,
      program_code               = EXCLUDED.program_code,
      session_end_date           = EXCLUDED.session_end_date,
      threshold_pct_used         = EXCLUDED.threshold_pct_used,
      internal_learner_count     = EXCLUDED.internal_learner_count,
      internal_meeting_threshold = EXCLUDED.internal_meeting_threshold,
      internal_attainment_pct    = EXCLUDED.internal_attainment_pct,
      avg_internal_pct           = EXCLUDED.avg_internal_pct,
      final_learner_count        = EXCLUDED.final_learner_count,
      final_meeting_threshold    = EXCLUDED.final_meeting_threshold,
      final_attainment_pct       = EXCLUDED.final_attainment_pct,
      avg_external_pct           = EXCLUDED.avg_external_pct,
      avg_total_pct              = EXCLUDED.avg_total_pct,
      pass_pct                   = EXCLUDED.pass_pct,
      attainment_basis           = EXCLUDED.attainment_basis,
      attainment_pct             = EXCLUDED.attainment_pct,
      attainment_level           = EXCLUDED.attainment_level,
      prior_rollup_id            = EXCLUDED.prior_rollup_id,
      prev_attainment_pct        = EXCLUDED.prev_attainment_pct,
      delta_pct                  = EXCLUDED.delta_pct,
      metadata                   = EXCLUDED.metadata,
      computed_at                = now(),
      updated_at                 = now();

    v_upserted := v_upserted + 1;
  END LOOP;

  RETURN jsonb_build_object('upserted', v_upserted);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_copo_record_course_attainment(jsonb) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_copo_record_course_attainment(jsonb) TO service_role;

COMMENT ON FUNCTION public.fn_copo_record_course_attainment(jsonb) IS
  'CO/PO attainment loop: upserts course-grain direct-attainment rollup rows computed by /api/cron/copo-attainment from COE reads. threshold_pct_used per row carries the PER-INSTITUTION threshold the cron resolved via fn_get_policy (institution override > global fallback). Owns level banding (config bands), trend delta vs prior session, and the grain=course_proxy/co_tagged=false honesty stamp. service_role only (cron).';

-- ----------------------------------------------------------------------------
-- 6. fn_copo_emit_attainment_evidence — rollup rows → quality_evidence_mappings
--    (NAAC 7.3.d + NBA T1_CO per row). Reads ONLY when master_enabled=true —
--    the loop's evidence stays dark until the Director ratifies the
--    methodology. Own emitter — deliberately does NOT touch PR #1899's
--    fn_accreditation_rollup_loop_evidence (unmerged sibling). AY label logic
--    (June cutoff) is inlined to avoid a cross-PR dependency on
--    fn_accreditation_ay_label; consolidate when both PRs are in.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_copo_emit_attainment_evidence()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_count integer := 0;
BEGIN
  v_enabled := COALESCE((SELECT (value #>> '{}')::boolean
                         FROM public.platform_policies
                         WHERE policy_key = 'copo_attainment.master_enabled'
                           AND scope_type = 'global' AND is_active), false);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'master_disabled', 'count', 0);
  END IF;

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
        'learner_count',      COALESCE(o.final_learner_count, o.internal_learner_count),
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
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    -- never clobber a manually-curated (is_auto=false) mapping for this key
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('copo_attainment', v_count, 'count', v_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_copo_emit_attainment_evidence() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_copo_emit_attainment_evidence() TO service_role;

COMMENT ON FUNCTION public.fn_copo_emit_attainment_evidence() IS
  'CO/PO attainment loop (NBA): upserts one quality_evidence_mappings row per attainment rollup row per body (NAAC 7.3.d + NBA T1_CO), loop_key copo_attainment, metadata carries grain (course_proxy until CO maps exist) + trend delta. No-ops unless copo_attainment.master_enabled=true. Never clobbers manual (is_auto=false) mappings. service_role only (cron).';

-- ----------------------------------------------------------------------------
-- 7. Dispatcher schedule seed — weekly, Sunday 03:41 IST (dispatcher floors to
--    the 03:30 slot; off-minute keeps it clear of other routines' slots).
--    Fired by the AI-routine dispatcher; day/time editable in /admin/ai-routines.
--    NOT a raw vercel.json cron. days_of_week: 0=Sun.
-- ----------------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('copo-attainment', true, true, ARRAY[0]::smallint[], 221)
ON CONFLICT (routine_id) DO NOTHING;

-- Reload PostgREST's schema cache so the new RPCs resolve immediately after a
-- raw Management-API apply (which does NOT auto-reload).
NOTIFY pgrst, 'reload schema';
