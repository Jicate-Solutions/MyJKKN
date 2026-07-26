-- ============================================================================
-- Accreditation — Teaching & Facilities evidence snapshots (Wave 2B)
-- File: 20260726031500_facility_teaching_naac_snapshots.sql | Date: 2026-07-26
-- Framework: NAAC Reforms 2024 — Binary Accreditation Framework.
--
-- WHAT THIS ADDS
--   Teaching (curriculum lesson spine) and facilities (resource registry +
--   campus-living modules) data emitted NOTHING into the accreditation
--   evidence junction. This migration adds ONE module-owned snapshot table +
--   ONE SECURITY DEFINER refresh fn computing, per institution per AY:
--
--   5.1.1 (Attribute 5: Learning & Teaching — 'Pedagogy tagging coverage',
--          catalog row EXISTS on prod):
--     lesson-plan coverage from the curriculum_lesson spine (30,563 rows,
--     6 institutions, 1,269 courses live on 2026-07-26): lessons total,
--     distinct courses covered vs active courses, taxonomy-tagging coverage,
--     and technique diversity (distinct taxonomy / Bloom / Fink dimensions).
--     K-ANONYMOUS: counts only — no faculty identities in any metadata.
--
--   3.1.1 (Attribute 3: Infrastructure — 'Classrooms + labs + library
--          geo-tagged…', catalog row EXISTS on prod):
--     facilities-in-daily-use from the resource registry (552 resources,
--     100% institution-scoped): counts by parent category, reservation +
--     usage-log counts, plus campus-wide activity counts from the hostel /
--     mess / health / sports modules (their daily operation is the
--     proof-of-use signal; campus_wide flag set because those tables are
--     not institution-scoped in this snapshot — all JKKN colleges operate
--     as one walkable campus).
--
--   3.4.1 (Attribute 3: Infrastructure — IT infrastructure; NO catalog code
--          existed for the NAAC-2024 deck's "metric 3.4", so this migration
--          SEEDS 'NAAC'/'3.4.1' following the live catalog convention
--          (3.1.1 / 3.2.1 / 5.1.1 — attribute.sub.facet, category
--          'Attribute 3: Infrastructure', is_system=true)):
--     computing-device counts and learner:computer ratio. SURVEY FINDING
--     (2026-07-26 live read): ims_item_categories carries NO computing-like
--     category at all (16 categories, all dental/pharmacy/lab consumables:
--     BRUSH, GEL, Glassware, Liquid, Solid, TABLETS, …) — so the IMS path
--     the spec suggested is honestly UNCOMPUTABLE and is skipped. The
--     resource registry, however, has a real 'IT & Digital Resources'
--     parent category (89 resources) with 'Computers' (38 rows / 324 units)
--     and 'Networking Devices' (39 rows) subcategories — that is the honest
--     device source, and it is what this snapshot computes from. Ratio is
--     emitted only where computer units > 0; unit method is documented in
--     the row metadata (units = sum(coalesce(current_stock_quantity,1))).
--
--   Emission is gated per metric per institution: no lessons → no 5.1.1 row;
--   no resources → no 3.1.1 row; no IT/computing resources → no 3.4.1 row.
--   Nothing is fabricated for thin institutions.
--
-- MECHANISM (canonical evidence spine — NOT a parallel mechanism):
--   snapshot table row → quality_evidence_mappings upsert on the junction's
--   natural key (source_table, source_id, body_code, metric_code), is_auto
--   =true, period_label via fn_accreditation_ay_label(now()), metadata =
--   computed numbers. Manually-curated (is_auto=false) rows are NEVER
--   clobbered (same guard as 20260709023000 rollup). Registered in
--   quality_evidence_source_registry (source_kind 'facility_teaching_snapshot'
--   — verified non-colliding with tonight's sibling claims:
--   institution_collaboration, ss_grant, event, hr_snapshot). Scheduled via
--   ai_routine_schedules row 'facility-teaching-naac-snapshots' (daily,
--   04:37 IST — clear of the 04:23 loop-evidence slot), fired by the
--   AI-routine dispatcher, NOT a raw vercel.json cron.
--
-- SECURITY (CLAUDE.md mandatory template + cron-only pattern 20260709023000):
--   fn is VOLATILE SECURITY DEFINER SET search_path=public, REVOKEd from
--   anon, authenticated AND PUBLIC, GRANTed to service_role ONLY (cron-only;
--   Management-API validation contexts also work). Snapshot table: RLS
--   enabled; SELECT mirrors quality_evidence_mappings' qem_select
--   (accreditation.evidence.view + role_has_institution_access, admin
--   bypass); writes are admin/service-role only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Seed NAAC metric 3.4.1 (IT infrastructure) — WHERE NOT EXISTS (the
--    catalog has UNIQUE (metric_type, metric_code), but WHERE NOT EXISTS is
--    used per the platform_policies 42P10 lesson — belt and braces).
--    5.1.1 and 3.1.1 are NOT touched: both verified present on prod.
-- ----------------------------------------------------------------------------
INSERT INTO public.sh_accreditation_metrics
  (metric_type, metric_code, metric_name, category, is_active, is_system, notes)
SELECT
  'NAAC', '3.4.1',
  'IT infrastructure — computing devices in active use & learner:computer ratio',
  'Attribute 3: Infrastructure', true, true,
  'Auto-computed daily by fn_facility_teaching_naac_snapshot_refresh from the resource registry (parent category ''IT & Digital Resources''; ''Computers'' subcategory drives the ratio). NAAC''s official deck wording for metric 3.4 references the student:computer ratio; MyJKKN records it as the learner:computer ratio. Seeded 2026-07-26 (Wave 2B) — no 3.4.x code existed in the catalog.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.sh_accreditation_metrics
  WHERE metric_type = 'NAAC' AND metric_code = '3.4.1'
);

-- ----------------------------------------------------------------------------
-- 2. Snapshot table — one row per institution × metric × AY, refreshed daily.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.facility_teaching_naac_evidence (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  metric_code    text NOT NULL CHECK (metric_code IN ('5.1.1', '3.1.1', '3.4.1')),
  ay_label       text NOT NULL,
  computed       jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facility_teaching_naac_evidence_natural_key
    UNIQUE (institution_id, metric_code, ay_label)
);

COMMENT ON TABLE public.facility_teaching_naac_evidence IS
  'Module-owned NAAC evidence snapshots for teaching (5.1.1 lesson-plan/pedagogy coverage) and facilities (3.1.1 daily-use, 3.4.1 IT infrastructure & learner:computer ratio). One row per institution × metric × AY, upserted daily by fn_facility_teaching_naac_snapshot_refresh (service_role cron); each row fans out to quality_evidence_mappings on the junction''s natural key. Counts only — no faculty or learner identities (Wave 2B, 2026-07-26).';

ALTER TABLE public.facility_teaching_naac_evidence ENABLE ROW LEVEL SECURITY;

-- Read: same shape as quality_evidence_mappings' qem_select (verified live).
DROP POLICY IF EXISTS "ftne_select" ON public.facility_teaching_naac_evidence;
CREATE POLICY "ftne_select" ON public.facility_teaching_naac_evidence FOR SELECT
USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.evidence.view')
      AND role_has_institution_access(institution_id))
);

-- Writes: admin cleanup only (the refresh fn is SECURITY DEFINER service_role
-- and bypasses RLS; no end-user write path exists by design).
DROP POLICY IF EXISTS "ftne_manage_admin" ON public.facility_teaching_naac_evidence;
CREATE POLICY "ftne_manage_admin" ON public.facility_teaching_naac_evidence FOR ALL
USING (is_super_admin() OR is_admin())
WITH CHECK (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 3. Registry row — canonical source-kind declaration (advisory registry).
--    source_kind verified non-colliding with existing prod rows and tonight's
--    sibling PR claims (institution_collaboration, ss_grant, event,
--    hr_snapshot). WHERE NOT EXISTS on the PK.
-- ----------------------------------------------------------------------------
INSERT INTO public.quality_evidence_source_registry
  (source_kind, source_table, display_name, description, is_system)
SELECT
  'facility_teaching_snapshot', 'facility_teaching_naac_evidence',
  'Teaching & Facilities NAAC Snapshots',
  'Daily per-institution snapshots: lesson-plan/pedagogy coverage (NAAC 5.1.1), facilities in daily use (NAAC 3.1.1), IT infrastructure & learner:computer ratio (NAAC 3.4.1).',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.quality_evidence_source_registry
  WHERE source_kind = 'facility_teaching_snapshot'
);

-- ----------------------------------------------------------------------------
-- 4. fn_facility_teaching_naac_snapshot_refresh — the idempotent refresh.
--    Upserts snapshot rows for the CURRENT AY, then fans each row out to
--    quality_evidence_mappings. Per-section BEGIN/EXCEPTION subtransactions
--    (one poison section darkens one metric's night, not all three — same
--    resilience pattern as fn_accreditation_rollup_loop_evidence).
--    Returns {"snap_5_1_1": n, "snap_3_1_1": n, "snap_3_4_1": n,
--    "mappings": n, "count": total} — the dispatcher records this summary.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_facility_teaching_naac_snapshot_refresh()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ay       text := public.fn_accreditation_ay_label(now());
  v_511      integer := 0;
  v_311      integer := 0;
  v_341      integer := 0;
  v_map      integer := 0;
  v_campus   jsonb;
  v_errors   jsonb := '{}'::jsonb;
BEGIN
  -- ── (a) 5.1.1 — lesson-plan / pedagogy-tagging coverage per institution ────
  -- Emits ONLY for institutions with at least one curriculum_lesson row
  -- (no fabricated zero-coverage snapshots). Counts only; created_by /
  -- approved_by identities are deliberately never copied (k-anonymity).
  BEGIN
    INSERT INTO public.facility_teaching_naac_evidence
      (institution_id, metric_code, ay_label, computed, computed_at, updated_at)
    SELECT
      l.institution_id, '5.1.1', v_ay,
      jsonb_build_object(
        'institution_name',       i.name,
        'lessons_total',          l.lessons_total,
        'lessons_published',      l.lessons_published,
        'courses_covered_total',  l.courses_covered_total,
        'courses_covered_active', l.courses_covered_active,
        'active_courses_total',   COALESCE(c.active_total, 0),
        'course_coverage_pct',    CASE WHEN COALESCE(c.active_total, 0) > 0
                                    THEN round(100.0 * l.courses_covered_active / c.active_total, 1)
                                    ELSE NULL END,
        'taxonomy_tagged',        l.taxonomy_tagged,
        'taxonomy_tagged_pct',    round(100.0 * l.taxonomy_tagged / l.lessons_total, 1),
        'technique_diversity',    jsonb_build_object(
                                    'distinct_taxonomies',      l.distinct_taxonomies,
                                    'distinct_bloom_levels',    l.distinct_bloom_levels,
                                    'distinct_fink_dimensions', l.distinct_fink_dimensions),
        'source',                 'curriculum_lesson spine',
        'privacy',                'aggregate counts only — no faculty identities'
      ),
      now(), now()
    FROM (
      SELECT cl.institution_id,
             count(*)                                       AS lessons_total,
             count(*) FILTER (WHERE cl.status = 'published' OR cl.is_published) AS lessons_published,
             count(DISTINCT cl.course_id)                   AS courses_covered_total,
             count(DISTINCT cl.course_id) FILTER (WHERE co.is_active) AS courses_covered_active,
             count(*) FILTER (WHERE cl.primary_taxonomy IS NOT NULL
                                 OR cl.primary_bloom_level IS NOT NULL
                                 OR cl.primary_fink_dimension IS NOT NULL) AS taxonomy_tagged,
             count(DISTINCT cl.primary_taxonomy)            AS distinct_taxonomies,
             count(DISTINCT cl.primary_bloom_level)         AS distinct_bloom_levels,
             count(DISTINCT cl.primary_fink_dimension)      AS distinct_fink_dimensions
      FROM public.curriculum_lesson cl
      LEFT JOIN public.courses co ON co.id = cl.course_id
      GROUP BY cl.institution_id
    ) l
    JOIN public.institutions i ON i.id = l.institution_id
    LEFT JOIN (
      SELECT institution_id, count(*) AS active_total
      FROM public.courses WHERE is_active GROUP BY institution_id
    ) c ON c.institution_id = l.institution_id
    ON CONFLICT (institution_id, metric_code, ay_label) DO UPDATE
      SET computed = EXCLUDED.computed, computed_at = now(), updated_at = now();
    GET DIAGNOSTICS v_511 = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('snap_5_1_1', SQLERRM);
  END;

  -- ── (b) 3.1.1 — facilities in daily use per institution ────────────────────
  -- Resource registry counts by parent category + reservation/usage activity,
  -- plus campus-wide living-module activity counts (hostel/mess/health/sports
  -- tables are not institution-scoped here → computed once, stamped with
  -- campus_wide=true; zeros are reported honestly, not hidden).
  BEGIN
    SELECT jsonb_build_object(
      'campus_wide',        true,
      'hostel_beds',        (SELECT count(*) FROM public.hostel_beds),
      'hostel_allocations', (SELECT count(*) FROM public.hostel_allocations),
      'hostel_attendance',  (SELECT count(*) FROM public.hostel_attendance),
      'mess_dish_votes',    (SELECT count(*) FROM public.mess_dish_votes),
      'health_profiles',    (SELECT count(*) FROM public.health_profiles),
      'health_assessments', (SELECT count(*) FROM public.health_assessments),
      'tournament_entries', (SELECT count(*) FROM public.tournament_entries),
      'tournament_matches', (SELECT count(*) FROM public.tournament_matches)
    ) INTO v_campus;

    INSERT INTO public.facility_teaching_naac_evidence
      (institution_id, metric_code, ay_label, computed, computed_at, updated_at)
    SELECT
      r.institution_id, '3.1.1', v_ay,
      jsonb_build_object(
        'institution_name',       i.name,
        'resources_total',        r.resources_total,
        'resources_by_category',  r.by_category,
        'reservations_total',     COALESCE(act.reservations, 0),
        'usage_logs_total',       COALESCE(act.usage_logs, 0),
        'campus_module_activity', v_campus,
        'source',                 'resource registry + campus living modules'
      ),
      now(), now()
    FROM (
      SELECT res.institution_id,
             count(*) AS resources_total,
             jsonb_object_agg(pc.name, cnt) FILTER (WHERE pc.name IS NOT NULL) AS by_category
      FROM (
        SELECT institution_id, parent_category_id, count(*) AS cnt
        FROM public.resources
        WHERE institution_id IS NOT NULL
        GROUP BY institution_id, parent_category_id
      ) res
      LEFT JOIN public.resource_parent_categories pc ON pc.id = res.parent_category_id
      GROUP BY res.institution_id
    ) r
    JOIN public.institutions i ON i.id = r.institution_id
    LEFT JOIN (
      SELECT rs.institution_id,
             count(DISTINCT rr.id) AS reservations,
             count(DISTINCT ul.id) AS usage_logs
      FROM public.resources rs
      LEFT JOIN public.resource_reservations rr ON rr.resource_id = rs.id
      LEFT JOIN public.resource_usage_logs   ul ON ul.resource_id = rs.id
      WHERE rs.institution_id IS NOT NULL
      GROUP BY rs.institution_id
    ) act ON act.institution_id = r.institution_id
    ON CONFLICT (institution_id, metric_code, ay_label) DO UPDATE
      SET computed = EXCLUDED.computed, computed_at = now(), updated_at = now();
    GET DIAGNOSTICS v_311 = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('snap_3_1_1', SQLERRM);
  END;

  -- ── (c) 3.4.1 — IT infrastructure & learner:computer ratio ─────────────────
  -- SOURCE: resource registry (survey 2026-07-26: ims_item_categories has NO
  -- computing categories — dental/pharmacy/lab consumables only — so the IMS
  -- path is honestly uncomputable and skipped). Category matching is by the
  -- live names ('IT & Digital Resources' parent; 'Computers' subcategory);
  -- if those are ever renamed this section emits nothing rather than guessing.
  -- units = sum(coalesce(current_stock_quantity, 1)) — a registered resource
  -- row is at least one physical unit; method recorded in metadata.
  -- Ratio emitted only where computer_units > 0.
  BEGIN
    INSERT INTO public.facility_teaching_naac_evidence
      (institution_id, metric_code, ay_label, computed, computed_at, updated_at)
    SELECT
      it.institution_id, '3.4.1', v_ay,
      jsonb_build_object(
        'institution_name',       i.name,
        'it_resources_rows',      it.it_rows,
        'it_units',               it.it_units,
        'computer_rows',          it.computer_rows,
        'computer_units',         it.computer_units,
        'networking_rows',        it.networking_rows,
        'learners_total',         COALESCE(lp.learners, 0),
        'learner_computer_ratio', CASE WHEN it.computer_units > 0 AND COALESCE(lp.learners, 0) > 0
                                    THEN round(lp.learners::numeric / it.computer_units, 1)
                                    ELSE NULL END,
        'unit_method',            'units = sum(coalesce(current_stock_quantity, 1)) over resource rows',
        'source',                 'resource registry — parent category ''IT & Digital Resources'', subcategory ''Computers''',
        'ims_note',               'ims_item_categories carries no computing categories (surveyed 2026-07-26) — IMS path skipped, not fabricated'
      ),
      now(), now()
    FROM (
      SELECT r.institution_id,
             count(*) FILTER (WHERE pc.name = 'IT & Digital Resources')          AS it_rows,
             COALESCE(sum(COALESCE(r.current_stock_quantity, 1))
               FILTER (WHERE pc.name = 'IT & Digital Resources'), 0)             AS it_units,
             count(*) FILTER (WHERE sc.name = 'Computers')                       AS computer_rows,
             COALESCE(sum(COALESCE(r.current_stock_quantity, 1))
               FILTER (WHERE sc.name = 'Computers'), 0)                          AS computer_units,
             count(*) FILTER (WHERE sc.name = 'Networking Devices')              AS networking_rows
      FROM public.resources r
      LEFT JOIN public.resource_parent_categories pc ON pc.id = r.parent_category_id
      LEFT JOIN public.resource_sub_categories    sc ON sc.id = r.subcategory_id
      WHERE r.institution_id IS NOT NULL
        AND (pc.name = 'IT & Digital Resources'
             OR sc.name IN ('Computers', 'Networking Devices'))
      GROUP BY r.institution_id
    ) it
    JOIN public.institutions i ON i.id = it.institution_id
    LEFT JOIN (
      SELECT institution_id, count(*) AS learners
      FROM public.learners_profiles GROUP BY institution_id
    ) lp ON lp.institution_id = it.institution_id
    WHERE it.it_rows > 0 OR it.computer_rows > 0 OR it.networking_rows > 0
    ON CONFLICT (institution_id, metric_code, ay_label) DO UPDATE
      SET computed = EXCLUDED.computed, computed_at = now(), updated_at = now();
    GET DIAGNOSTICS v_341 = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('snap_3_4_1', SQLERRM);
  END;

  -- ── (d) Fan-out: snapshot rows → quality_evidence_mappings (canonical
  --        junction, natural-key upsert, never clobber manual rows) ──────────
  BEGIN
    INSERT INTO public.quality_evidence_mappings
      (source_table, source_id, institution_id, body_code, metric_code,
       period_label, mapped_by, is_auto, metadata, mapped_at)
    SELECT
      'facility_teaching_naac_evidence', s.id, s.institution_id, 'NAAC',
      s.metric_code, s.ay_label, NULL, true,
      s.computed || jsonb_build_object('snapshot', true, 'computed_at', s.computed_at),
      now()
    FROM public.facility_teaching_naac_evidence s
    WHERE s.ay_label = v_ay
    ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
      SET period_label = EXCLUDED.period_label,
          metadata     = EXCLUDED.metadata,
          mapped_by    = EXCLUDED.mapped_by,
          is_auto      = true,
          mapped_at    = now()
      WHERE public.quality_evidence_mappings.is_auto;
    GET DIAGNOSTICS v_map = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || jsonb_build_object('mappings', SQLERRM);
  END;

  RETURN jsonb_build_object(
    'ay',          v_ay,
    'snap_5_1_1',  v_511,
    'snap_3_1_1',  v_311,
    'snap_3_4_1',  v_341,
    'mappings',    v_map,
    'count',       v_511 + v_311 + v_341
  ) || CASE WHEN v_errors = '{}'::jsonb THEN '{}'::jsonb
            ELSE jsonb_build_object('errors', v_errors) END;
END;
$$;

-- MANDATORY security template (cron-only — service_role, NOT authenticated;
-- same deliberate more-restrictive deviation as 20260709023000): SECURITY
-- DEFINER with no per-caller scoping, called only by the cron route's
-- service-role client. GRANT-level gate only, so a Management-API validation
-- context also works.
REVOKE EXECUTE ON FUNCTION public.fn_facility_teaching_naac_snapshot_refresh() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_facility_teaching_naac_snapshot_refresh() TO service_role;

COMMENT ON FUNCTION public.fn_facility_teaching_naac_snapshot_refresh() IS
  'Wave 2B teaching & facilities evidence: upserts per-institution per-AY snapshots (NAAC 5.1.1 lesson-plan/pedagogy coverage from the curriculum_lesson spine; 3.1.1 facilities in daily use from the resource registry + campus living modules; 3.4.1 IT infrastructure & learner:computer ratio from the resource registry — IMS categories carry no computing items) into facility_teaching_naac_evidence, then fans each row out to quality_evidence_mappings on the junction''s natural key (is_auto=true; manual is_auto=false rows never clobbered). Idempotent — re-running refreshes the same rows. service_role only (cron).';

-- ----------------------------------------------------------------------------
-- 5. Dispatcher schedule seed — daily at 04:37 IST (minute_of_day 277; the
--    04:23 slot is taken by accreditation-loop-evidence). Fired by the
--    AI-routine dispatcher; day/time editable in /admin/ai-routines.
-- ----------------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('facility-teaching-naac-snapshots', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 277)
ON CONFLICT (routine_id) DO NOTHING;

-- Assert the mappings ON CONFLICT arbiter at APPLY time (same guard as
-- 20260709023000) — fail loudly here rather than silently every night.
DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.quality_evidence_mappings'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%source_table, source_id, body_code, metric_code%'
  ) THEN
    RAISE EXCEPTION 'quality_evidence_mappings is missing UNIQUE (source_table, source_id, body_code, metric_code) — the snapshot fan-out depends on it';
  END IF;
END $assert$;

-- Reload PostgREST's schema cache so the new RPC resolves immediately after a
-- raw Management-API apply (which does NOT auto-reload).
NOTIFY pgrst, 'reload schema';
