-- ============================================================================
-- Accreditation — HR evidence snapshots (Wave 2A of module→evidence-spine)
-- File: 20260726130000_hr_evidence_snapshots.sql | Date: 2026-07-26
-- Framework: NAAC Reforms 2024 — Binary Accreditation Framework.
--
-- WHY
--   NAAC Attribute 2 (Faculty Resources) metrics 2.1 / 2.2.1 / 2.2.2 / 2.2.3
--   and Attribute 7 metric 7.10.1 (faculty retention) sit at ZERO evidence
--   rows in quality_evidence_mappings — HR/staff data emits nothing into the
--   evidence spine. These are AGGREGATE metrics (ratios / percentages), so a
--   per-source-row trigger fan-out (the C6 pattern) does not fit: the evidence
--   unit is one computed snapshot per institution per academic year.
--
-- EXISTING-MECHANISM SURVEY (parallel-mechanism prevention, verified live
-- 2026-07-26):
--   - quality_evidence_source_registry rows 'admission_naac_evidence' and
--     'pde_naac_evidence' describe module-owned snapshot tables, but NEITHER
--     TABLE EXISTS on prod yet (registry rows are advisory/planned). The only
--     LIVE snapshot-table emitter is obe_course_attainment_rollup
--     (20260709031000): module-owned rollup table + SECDEF refresh fn +
--     natural-key upsert into the junction + dispatcher schedule. This
--     migration follows that proven pattern exactly.
--   - fn_accreditation_rollup_loop_evidence() (20260709023000) is the
--     measured-LOOP rollup; its loop_key contract is NOT touched here.
--   - staff.role_type is 'teacher' for all 848 rows (useless as a faculty
--     discriminator). The real discriminator is
--     employment_categories.is_teaching (Teaching 451 + Facilitator 72 +
--     Principal 9 staff on prod). staff.designation is free text with case
--     variants ('Assistant Professor' / 'ASSISTANT PROFESSOR' / 'Assistant
--     professor', legacy 'Reader' = associate level), so cadre is derived
--     with case-insensitive pattern matching.
--   - PhD is recorded in staff.qualifications (jsonb array of {degree:
--     'Ph.D'|'PhD'|...}) and/or staff.qualification_summary text.
--   - hr_offboarding_cases: 67 rows, ALL status='open' (retirement pipeline),
--     0 completed — so retention is computed from staff joining dates +
--     is_active, with the open-offboarding count carried as context.
--
-- WHAT THIS ADDS
--   1. Seed NAAC metric 2.1 (Faculty-Student Ratio) — 2.2.1/2.2.2/2.2.3/7.10.1
--      verified already live. Seeded WHERE NOT EXISTS (arbiter-independent).
--      Catalog keeps NAAC's official metric name; UI copy says
--      "faculty-learner ratio" per JKKN terminology.
--   2. sanctioned_posts — admin-maintained register of sanctioned faculty
--      posts per institution × academic year × cadre (department optional).
--      Managed at /hr/admin/sanctioned-posts. Explicit SELECT / INSERT /
--      UPDATE / DELETE RLS (a missing UPDATE policy silently no-ops every
--      UPDATE — known incident, PR #2380).
--   3. hr_naac_evidence — snapshot table, one row per institution × academic
--      year with all five computed measures. Writes only via the refresh fn
--      (RPC-only; SELECT for accreditation viewers, same posture as
--      obe_course_attainment_rollup).
--   4. fn_hr_refresh_naac_evidence() — SECDEF refresh: upserts snapshots,
--      then upserts quality_evidence_mappings rows on the junction's natural
--      key (source_table, source_id, body_code, metric_code):
--        2.1    faculty-learner ratio        (emitted when faculty>0 AND learners>0)
--        2.2.1  cadre strength vs sanctioned (emitted ONLY when sanctioned_posts
--               rows exist for that institution + AY — never zeroed/faked)
--        2.2.2  PhD %                        (emitted when faculty>0)
--        2.2.3  avg teaching experience + cadre-level distribution (faculty>0)
--        7.10.1 3-year faculty retention %   (emitted when baseline cohort>0)
--      Refresh never clobbers manually-curated (is_auto=false) mappings and
--      withdraws its own stale auto rows when a condition stops holding
--      (e.g. sanctioned posts deleted → 2.2.1 withdrawn).
--   5. quality_evidence_source_registry row 'hr_snapshot' → hr_naac_evidence
--      (CONFIG row, WHERE NOT EXISTS — never ON CONFLICT). Non-colliding with
--      sibling PRs' 'institution_collaboration'/'ss_grant' (#2407) + 'event'.
--   6. ai_routine_schedules seed 'hr-naac-evidence' (daily 04:37 IST) — fired
--      by the AI-routine dispatcher, day/time editable in /admin/ai-routines;
--      NOT a raw vercel.json cron. Route: /api/cron/hr-naac-evidence.
--
-- SECURITY (CLAUDE.md mandatory RPC lockdown, 2026-06-06):
--   fn_hr_refresh_naac_evidence is VOLATILE SECURITY DEFINER SET
--   search_path=public, REVOKEd from anon, authenticated AND PUBLIC, GRANTed
--   to service_role ONLY (cron-only — same gate as
--   fn_accreditation_rollup_loop_evidence / fn_copo_emit_attainment_evidence).
--   fn_accreditation_ay_label is called INSIDE the SECDEF fn: the inner
--   privilege check runs against the definer, which owns that helper.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Seed NAAC metric 2.1 — Faculty-Student Ratio (Attribute 2). The four
--    sibling codes (2.2.1 / 2.2.2 / 2.2.3 / 7.10.1) are already live.
--    WHERE NOT EXISTS (arbiter-independent idempotence).
-- ----------------------------------------------------------------------------
INSERT INTO public.sh_accreditation_metrics
  (metric_type, metric_code, metric_name, category, is_active, is_system, notes)
SELECT
  'NAAC', '2.1',
  'Faculty-Student Ratio (FSR)',
  'Attribute 2: Faculty Resources', true, true,
  'Auto-computed per institution per academic year by fn_hr_refresh_naac_evidence from HR staff records (employment_categories.is_teaching + is_active) and active learner rosters (learners_profiles.lifecycle_status=active). Official NAAC metric name retained here; JKKN UI copy presents it as the faculty-learner ratio. One hr_naac_evidence snapshot row per institution per AY, mapped via quality_evidence_mappings. Seeded 2026-07-26 (Wave 2A HR evidence snapshots).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.sh_accreditation_metrics
  WHERE metric_type = 'NAAC' AND metric_code = '2.1'
);

-- ----------------------------------------------------------------------------
-- 2. sanctioned_posts — the register 2.2.1 compares filled strength against.
--    cadre vocabulary derived from the live staff.designation survey:
--    professor / associate_professor (incl. legacy 'Reader') /
--    assistant_professor / other_teaching (Lecturer, Tutor, school teachers…).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sanctioned_posts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES public.institutions(id),
  department_id    uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  cadre            text NOT NULL CHECK (cadre IN
                     ('professor', 'associate_professor', 'assistant_professor', 'other_teaching')),
  sanctioned_count integer NOT NULL CHECK (sanctioned_count >= 0),
  academic_year    text NOT NULL CHECK (academic_year ~ '^AY \d{4}-\d{2}$'),
  notes            text,
  created_by       uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sanctioned_posts IS
  'Sanctioned faculty posts per institution × academic year × cadre (department optional; NULL = institution-wide). Managed at /hr/admin/sanctioned-posts. fn_hr_refresh_naac_evidence compares filled strength against these rows to emit NAAC 2.2.1 evidence — the metric is emitted ONLY for institution+AY combinations that have rows here. academic_year format matches fn_accreditation_ay_label (e.g. ''AY 2026-27''). Added 2026-07-26 (Wave 2A).';

-- Data-quality guard: one row per scope. Expression index (COALESCE on the
-- nullable department) — deliberate; this table is plain CRUD, never an
-- ON CONFLICT target (feedback_seed_platform_policies_expression_unique_index).
CREATE UNIQUE INDEX IF NOT EXISTS uq_sanctioned_posts_scope
  ON public.sanctioned_posts (institution_id, academic_year, cadre,
      COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_sanctioned_posts_inst_ay
  ON public.sanctioned_posts (institution_id, academic_year);

DROP TRIGGER IF EXISTS set_updated_at ON public.sanctioned_posts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sanctioned_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS — explicit SELECT / INSERT / UPDATE / DELETE (never FOR ALL only).
-- Keys seeded in lib/constants/permissions.ts in the same PR.
ALTER TABLE public.sanctioned_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sanctioned_posts_select" ON public.sanctioned_posts;
CREATE POLICY "sanctioned_posts_select" ON public.sanctioned_posts FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('hr.sanctioned_posts.view')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "sanctioned_posts_insert" ON public.sanctioned_posts;
CREATE POLICY "sanctioned_posts_insert" ON public.sanctioned_posts FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('hr.sanctioned_posts.manage')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "sanctioned_posts_update" ON public.sanctioned_posts;
CREATE POLICY "sanctioned_posts_update" ON public.sanctioned_posts FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('hr.sanctioned_posts.manage')
      AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('hr.sanctioned_posts.manage')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS "sanctioned_posts_delete" ON public.sanctioned_posts;
CREATE POLICY "sanctioned_posts_delete" ON public.sanctioned_posts FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('hr.sanctioned_posts.manage')
      AND role_has_institution_access(institution_id))
);

-- ----------------------------------------------------------------------------
-- 3. hr_naac_evidence — the snapshot table. One row per institution × AY.
--    Writes are RPC-only (no INSERT/UPDATE/DELETE policies — same posture as
--    obe_course_attainment_rollup).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_naac_evidence (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id            uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  academic_year             text NOT NULL,          -- 'AY 2026-27' (fn_accreditation_ay_label)

  -- 2.1 — faculty-learner ratio
  learner_count             integer,                -- lifecycle_status='active'
  faculty_count             integer,                -- is_teaching category + is_active
  fsr                       numeric,                -- learners per faculty, 1dp

  -- 2.2.1 — cadre strength vs sanctioned posts (NULLs when no sanctioned rows)
  cadre_professor           integer,
  cadre_associate_professor integer,                -- incl. legacy 'Reader'
  cadre_assistant_professor integer,
  cadre_other_teaching      integer,                -- Lecturer / Tutor / school teachers …
  sanctioned_total          integer,
  sanctioned_filled_pct     numeric,

  -- 2.2.2 — PhD %
  phd_faculty_count         integer,
  phd_pct                   numeric,

  -- 2.2.3 — average teaching experience (years; staff.experience_years)
  avg_experience_years      numeric,

  -- 7.10.1 — 3-year retention (joined on/before AY start − 3y, still active)
  retention_baseline_count  integer,
  retention_retained_count  integer,
  retention_pct             numeric,
  open_offboarding_cases    integer,                -- context: hr_offboarding_cases status='open'

  metadata                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at               timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, academic_year)
);

COMMENT ON TABLE public.hr_naac_evidence IS
  'HR → NAAC evidence snapshots (Wave 2A): one row per institution × academic year with faculty-learner ratio (2.1), cadre strength vs sanctioned posts (2.2.1), PhD % (2.2.2), avg teaching experience (2.2.3) and 3-year faculty retention (7.10.1). Computed + mapped into quality_evidence_mappings by fn_hr_refresh_naac_evidence (service_role cron ''hr-naac-evidence''); writes are RPC-only. Same module-owned-snapshot pattern as obe_course_attainment_rollup.';

ALTER TABLE public.hr_naac_evidence ENABLE ROW LEVEL SECURITY;

-- READ: accreditation viewers, institution-scoped (matches ocar_select).
DROP POLICY IF EXISTS "hr_naac_evidence_select" ON public.hr_naac_evidence;
CREATE POLICY "hr_naac_evidence_select" ON public.hr_naac_evidence
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.view')
      AND role_has_institution_access(institution_id))
);

-- ----------------------------------------------------------------------------
-- 4. Evidence source registry row — CONFIG, seeded WHERE NOT EXISTS
--    (never ON CONFLICT, per registry seeding rule). source_kind 'hr_snapshot'
--    is non-colliding with sibling PRs ('institution_collaboration',
--    'ss_grant' in #2407; 'event' in W1).
-- ----------------------------------------------------------------------------
INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT 'hr_snapshot', 'hr_naac_evidence',
       'HR NAAC Evidence Snapshots',
       'Per-institution per-AY HR snapshots: faculty-learner ratio (NAAC 2.1), cadre vs sanctioned posts (2.2.1), PhD % (2.2.2), avg teaching experience (2.2.3), 3-year faculty retention (7.10.1). Refreshed by fn_hr_refresh_naac_evidence via cron hr-naac-evidence.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'hr_snapshot'
     OR source_table = 'hr_naac_evidence'
);

-- ----------------------------------------------------------------------------
-- 5. fn_hr_refresh_naac_evidence — snapshot upsert + evidence mapping upsert.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_refresh_naac_evidence()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ay        text;
  v_ay_start  date;
  v_cutoff    date;   -- retention baseline: joined on/before AY start − 3 years
  v_snapshots integer := 0;
  v_m21       integer := 0;
  v_m221      integer := 0;
  v_m222      integer := 0;
  v_m223      integer := 0;
  v_m7101     integer := 0;
  v_withdrawn integer := 0;
BEGIN
  v_ay := public.fn_accreditation_ay_label(now());
  -- AY start (June 1, IST) — same June cutoff as fn_accreditation_ay_label.
  v_ay_start := CASE
    WHEN extract(month FROM (now() AT TIME ZONE 'Asia/Kolkata')) >= 6
      THEN make_date(extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int, 6, 1)
    ELSE make_date(extract(year FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int - 1, 6, 1)
  END;
  v_cutoff := (v_ay_start - interval '3 years')::date;

  -- ── (a) Upsert snapshots — one per institution that has active faculty ────
  -- Faculty = employment_categories.is_teaching AND staff.is_active (verified
  -- discriminator; staff.role_type is 'teacher' for ALL rows, incl. drivers).
  -- Cadre from free-text designation, case-insensitive; assistant checked
  -- before associate before bare professor so 'Assistant Professor & Head'
  -- lands correctly; legacy 'Reader' = associate level.
  WITH fac AS (
    SELECT
      s.institution_id,
      count(*)::int AS faculty_count,
      count(*) FILTER (WHERE s.designation !~* 'assistant\s*professor'
                         AND s.designation !~* 'associate\s*professor'
                         AND s.designation !~* '^\s*reader'
                         AND s.designation  ~* 'professor')::int AS n_prof,
      count(*) FILTER (WHERE s.designation ~* 'associate\s*professor'
                          OR s.designation ~* '^\s*reader')::int AS n_assoc,
      count(*) FILTER (WHERE s.designation ~* 'assistant\s*professor')::int AS n_asst,
      count(*) FILTER (WHERE s.designation !~* 'professor'
                         AND s.designation !~* '^\s*reader')::int AS n_other,
      count(*) FILTER (WHERE s.qualifications::text ~* 'ph\.?\s?d'
                          OR s.qualification_summary ~* 'ph\.?\s?d')::int AS n_phd,
      round(avg(s.experience_years)::numeric, 1) AS avg_exp
    FROM public.staff s
    JOIN public.employment_categories ec ON ec.id = s.category_id
    WHERE ec.is_teaching AND COALESCE(s.is_active, false)
    GROUP BY s.institution_id
  ),
  ret AS (
    -- Retention over ALL teaching-category staff rows (active + inactive):
    -- baseline = joined on/before cutoff; retained = of those, still active.
    -- (hr_offboarding_cases has 0 completed separations on prod, so
    -- is_active is the separation signal; open cases carried as context.)
    SELECT
      s.institution_id,
      count(*) FILTER (WHERE s.date_of_joining <= v_cutoff)::int AS baseline_n,
      count(*) FILTER (WHERE s.date_of_joining <= v_cutoff
                         AND COALESCE(s.is_active, false))::int AS retained_n
    FROM public.staff s
    JOIN public.employment_categories ec ON ec.id = s.category_id
    WHERE ec.is_teaching
    GROUP BY s.institution_id
  ),
  lrn AS (
    SELECT lp.institution_id, count(*)::int AS learner_n
    FROM public.learners_profiles lp
    WHERE lp.lifecycle_status = 'active'
    GROUP BY lp.institution_id
  ),
  sanc AS (
    SELECT sp.institution_id,
           sum(sp.sanctioned_count)::int AS sanctioned_total,
           jsonb_object_agg(sp.cadre, sp.cadre_total) FILTER (WHERE sp.cadre IS NOT NULL) AS by_cadre
    FROM (
      SELECT institution_id, cadre, sum(sanctioned_count)::int AS cadre_total,
             sum(sanctioned_count) AS sanctioned_count
      FROM public.sanctioned_posts
      WHERE academic_year = v_ay
      GROUP BY institution_id, cadre
    ) sp
    GROUP BY sp.institution_id
  ),
  offb AS (
    SELECT o.institution_id, count(*)::int AS open_n
    FROM public.hr_offboarding_cases o
    WHERE o.status = 'open'
    GROUP BY o.institution_id
  )
  INSERT INTO public.hr_naac_evidence AS h
    (institution_id, academic_year,
     learner_count, faculty_count, fsr,
     cadre_professor, cadre_associate_professor, cadre_assistant_professor,
     cadre_other_teaching, sanctioned_total, sanctioned_filled_pct,
     phd_faculty_count, phd_pct,
     avg_experience_years,
     retention_baseline_count, retention_retained_count, retention_pct,
     open_offboarding_cases, metadata, computed_at, updated_at)
  SELECT
    f.institution_id, v_ay,
    COALESCE(l.learner_n, 0), f.faculty_count,
    CASE WHEN f.faculty_count > 0 AND COALESCE(l.learner_n, 0) > 0
         THEN round(l.learner_n::numeric / f.faculty_count, 1) END,
    f.n_prof, f.n_assoc, f.n_asst, f.n_other,
    sa.sanctioned_total,
    CASE WHEN sa.sanctioned_total > 0
         THEN round(f.faculty_count::numeric * 100 / sa.sanctioned_total, 1) END,
    f.n_phd,
    CASE WHEN f.faculty_count > 0
         THEN round(f.n_phd::numeric * 100 / f.faculty_count, 1) END,
    f.avg_exp,
    COALESCE(r.baseline_n, 0), COALESCE(r.retained_n, 0),
    CASE WHEN COALESCE(r.baseline_n, 0) > 0
         THEN round(r.retained_n::numeric * 100 / r.baseline_n, 1) END,
    COALESCE(ob.open_n, 0),
    jsonb_build_object(
      'sanctioned_by_cadre', sa.by_cadre,
      'method', jsonb_build_object(
        'faculty',   'employment_categories.is_teaching AND staff.is_active',
        'learners',  'learners_profiles.lifecycle_status = active',
        'phd',       'qualifications/qualification_summary ~* ph.d',
        'cadre',     'designation pattern match (Reader = associate level)',
        'retention', 'joined on/before ' || v_cutoff::text || ' AND still active'
      )
    ),
    now(), now()
  FROM fac f
  LEFT JOIN lrn  l  ON l.institution_id  = f.institution_id
  LEFT JOIN ret  r  ON r.institution_id  = f.institution_id
  LEFT JOIN sanc sa ON sa.institution_id = f.institution_id
  LEFT JOIN offb ob ON ob.institution_id = f.institution_id
  ON CONFLICT (institution_id, academic_year) DO UPDATE
    SET learner_count             = EXCLUDED.learner_count,
        faculty_count             = EXCLUDED.faculty_count,
        fsr                       = EXCLUDED.fsr,
        cadre_professor           = EXCLUDED.cadre_professor,
        cadre_associate_professor = EXCLUDED.cadre_associate_professor,
        cadre_assistant_professor = EXCLUDED.cadre_assistant_professor,
        cadre_other_teaching      = EXCLUDED.cadre_other_teaching,
        sanctioned_total          = EXCLUDED.sanctioned_total,
        sanctioned_filled_pct     = EXCLUDED.sanctioned_filled_pct,
        phd_faculty_count         = EXCLUDED.phd_faculty_count,
        phd_pct                   = EXCLUDED.phd_pct,
        avg_experience_years      = EXCLUDED.avg_experience_years,
        retention_baseline_count  = EXCLUDED.retention_baseline_count,
        retention_retained_count  = EXCLUDED.retention_retained_count,
        retention_pct             = EXCLUDED.retention_pct,
        open_offboarding_cases    = EXCLUDED.open_offboarding_cases,
        metadata                  = EXCLUDED.metadata,
        computed_at               = now(),
        updated_at                = now();
  GET DIAGNOSTICS v_snapshots = ROW_COUNT;

  -- ── (b) Withdraw stale AUTO mappings whose emit-condition stopped holding
  --        (e.g. sanctioned posts deleted → 2.2.1 must disappear, not zero).
  --        Manual (is_auto=false) mappings are never touched. ────────────────
  DELETE FROM public.quality_evidence_mappings qem
  USING public.hr_naac_evidence h
  WHERE qem.source_table = 'hr_naac_evidence'
    AND qem.source_id   = h.id
    AND qem.body_code   = 'NAAC'
    AND qem.is_auto
    AND h.academic_year = v_ay
    AND (   (qem.metric_code = '2.2.1'  AND h.sanctioned_total IS NULL)
         OR (qem.metric_code = '2.1'    AND h.fsr IS NULL)
         OR (qem.metric_code = '2.2.2'  AND h.phd_pct IS NULL)
         OR (qem.metric_code = '2.2.3'  AND COALESCE(h.faculty_count, 0) = 0)
         OR (qem.metric_code = '7.10.1' AND h.retention_pct IS NULL));
  GET DIAGNOSTICS v_withdrawn = ROW_COUNT;

  -- ── (c) 2.1 — faculty-learner ratio ────────────────────────────────────────
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'hr_naac_evidence', h.id, h.institution_id, 'NAAC', '2.1',
    h.academic_year, NULL, true,
    jsonb_build_object(
      'measure',       'faculty_learner_ratio',
      'learner_count', h.learner_count,
      'faculty_count', h.faculty_count,
      'ratio',         h.fsr,
      'ratio_label',   '1:' || h.fsr::text,
      'computed_at',   h.computed_at
    ),
    now()
  FROM public.hr_naac_evidence h
  WHERE h.academic_year = v_ay AND h.fsr IS NOT NULL
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_m21 = ROW_COUNT;

  -- ── (d) 2.2.1 — cadre strength vs sanctioned posts (ONLY where a register
  --        exists for this institution + AY; absence is skipped, never zeroed).
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'hr_naac_evidence', h.id, h.institution_id, 'NAAC', '2.2.1',
    h.academic_year, NULL, true,
    jsonb_build_object(
      'measure',             'cadre_vs_sanctioned',
      'sanctioned_total',    h.sanctioned_total,
      'filled_total',        h.faculty_count,
      'filled_pct',          h.sanctioned_filled_pct,
      'filled_by_cadre',     jsonb_build_object(
                               'professor',           h.cadre_professor,
                               'associate_professor', h.cadre_associate_professor,
                               'assistant_professor', h.cadre_assistant_professor,
                               'other_teaching',      h.cadre_other_teaching),
      'sanctioned_by_cadre', h.metadata->'sanctioned_by_cadre',
      'computed_at',         h.computed_at
    ),
    now()
  FROM public.hr_naac_evidence h
  WHERE h.academic_year = v_ay AND h.sanctioned_total IS NOT NULL
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_m221 = ROW_COUNT;

  -- ── (e) 2.2.2 — PhD % ─────────────────────────────────────────────────────
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'hr_naac_evidence', h.id, h.institution_id, 'NAAC', '2.2.2',
    h.academic_year, NULL, true,
    jsonb_build_object(
      'measure',           'phd_pct',
      'phd_faculty_count', h.phd_faculty_count,
      'faculty_count',     h.faculty_count,
      'phd_pct',           h.phd_pct,
      'computed_at',       h.computed_at
    ),
    now()
  FROM public.hr_naac_evidence h
  WHERE h.academic_year = v_ay AND h.phd_pct IS NOT NULL
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_m222 = ROW_COUNT;

  -- ── (f) 2.2.3 — avg teaching experience + cadre-level distribution ────────
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'hr_naac_evidence', h.id, h.institution_id, 'NAAC', '2.2.3',
    h.academic_year, NULL, true,
    jsonb_build_object(
      'measure',              'avg_experience_and_cadre_levels',
      'avg_experience_years', h.avg_experience_years,
      'faculty_count',        h.faculty_count,
      'by_level',             jsonb_build_object(
                                'professor',           h.cadre_professor,
                                'associate_professor', h.cadre_associate_professor,
                                'assistant_professor', h.cadre_assistant_professor,
                                'other_teaching',      h.cadre_other_teaching),
      'computed_at',          h.computed_at
    ),
    now()
  FROM public.hr_naac_evidence h
  WHERE h.academic_year = v_ay AND COALESCE(h.faculty_count, 0) > 0
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_m223 = ROW_COUNT;

  -- ── (g) 7.10.1 — 3-year faculty retention % ───────────────────────────────
  INSERT INTO public.quality_evidence_mappings
    (source_table, source_id, institution_id, body_code, metric_code,
     period_label, mapped_by, is_auto, metadata, mapped_at)
  SELECT
    'hr_naac_evidence', h.id, h.institution_id, 'NAAC', '7.10.1',
    h.academic_year, NULL, true,
    jsonb_build_object(
      'measure',                'retention_3y',
      'baseline_count',         h.retention_baseline_count,
      'retained_count',         h.retention_retained_count,
      'retention_pct',          h.retention_pct,
      'baseline_cutoff',        v_cutoff,
      'open_offboarding_cases', h.open_offboarding_cases,
      'computed_at',            h.computed_at
    ),
    now()
  FROM public.hr_naac_evidence h
  WHERE h.academic_year = v_ay AND h.retention_pct IS NOT NULL
  ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
    SET period_label = EXCLUDED.period_label,
        metadata     = EXCLUDED.metadata,
        mapped_by    = EXCLUDED.mapped_by,
        is_auto      = true,
        mapped_at    = now()
    WHERE public.quality_evidence_mappings.is_auto;
  GET DIAGNOSTICS v_m7101 = ROW_COUNT;

  -- 'count' is on the dispatcher's summarize() allowlist.
  RETURN jsonb_build_object(
    'academic_year', v_ay,
    'snapshots',     v_snapshots,
    'fsr_2_1',       v_m21,
    'cadre_2_2_1',   v_m221,
    'phd_2_2_2',     v_m222,
    'exp_2_2_3',     v_m223,
    'retention_7_10_1', v_m7101,
    'withdrawn',     v_withdrawn,
    'count',         v_m21 + v_m221 + v_m222 + v_m223 + v_m7101
  );
END;
$$;

-- MANDATORY security template (cron-only — service_role, NOT authenticated;
-- same gate as fn_accreditation_rollup_loop_evidence): GRANT-level only, so a
-- Management-API validation context also works.
REVOKE EXECUTE ON FUNCTION public.fn_hr_refresh_naac_evidence() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_refresh_naac_evidence() TO service_role;

COMMENT ON FUNCTION public.fn_hr_refresh_naac_evidence() IS
  'Wave 2A: upserts one hr_naac_evidence snapshot per institution (active teaching staff) for the current AY, then upserts quality_evidence_mappings rows — NAAC 2.1 (faculty-learner ratio), 2.2.1 (cadre vs sanctioned posts; emitted ONLY where sanctioned_posts rows exist), 2.2.2 (PhD %), 2.2.3 (avg experience + cadre levels), 7.10.1 (3-year retention). Idempotent on the junction natural key; refreshes metadata/mapped_at on re-run; never clobbers manual (is_auto=false) mappings; withdraws its own stale auto rows. service_role only (cron hr-naac-evidence).';

-- ----------------------------------------------------------------------------
-- 6. Dispatcher schedule seed — daily 04:37 IST (minute_of_day 277; clear of
--    the 263 loop-evidence and 221 copo slots). Fired by the AI-routine
--    dispatcher which resolves the triggerPath from the AI_ROUTINES registry
--    (lib/ai-routines/misc-ai.ts); day/time editable in /admin/ai-routines.
--    NOT a raw vercel.json cron.
-- ----------------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('hr-naac-evidence', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 277)
ON CONFLICT (routine_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7. Apply-time asserts — fail loudly here rather than the cron failing
--    silently forever (same discipline as 20260709023000).
-- ----------------------------------------------------------------------------
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.quality_evidence_mappings'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%source_table, source_id, body_code, metric_code%'
  ) THEN
    RAISE EXCEPTION 'quality_evidence_mappings is missing UNIQUE (source_table, source_id, body_code, metric_code) — the snapshot upserts depend on it';
  END IF;

  IF (SELECT count(*) FROM public.sh_accreditation_metrics
      WHERE metric_type = 'NAAC'
        AND metric_code IN ('2.1', '2.2.1', '2.2.2', '2.2.3', '7.10.1')) <> 5 THEN
    RAISE EXCEPTION 'NAAC metric catalog incomplete for HR snapshots (need 2.1, 2.2.1, 2.2.2, 2.2.3, 7.10.1)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.quality_evidence_source_registry
    WHERE source_kind = 'hr_snapshot' AND source_table = 'hr_naac_evidence'
  ) THEN
    RAISE EXCEPTION 'quality_evidence_source_registry row hr_snapshot missing — registry seed failed (source_kind or source_table collision?)';
  END IF;
END $assert$;

-- Reload PostgREST's schema cache so the new tables/RPC resolve immediately
-- after a raw Management-API apply (which does NOT auto-reload).
NOTIFY pgrst, 'reload schema';
