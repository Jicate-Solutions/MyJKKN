-- 20260801140000_curriculum_readiness_missing_taxonomy.sql
-- Taxonomy-aware lesson spine (P0, 2026-07-24), part 4. Surface the skip-flag on the open
-- Compliance & Tracking board (/tracker → Lesson Spine Readiness). The generator SKIPS (never
-- defaults to Fink) any course whose regulation has no Fink/Bloom taxonomy fixed. Add a
-- per-college count of exactly that set so the gap is visible and actionable.
--
-- NOTE this differs from the existing `no_tax_regs` (regulation rows whose taxonomy_type IS
-- NULL, currently 0): `missing_taxonomy_courses` counts LATEST syllabi whose (regulation,
-- institution) has NO Fink/Bloom taxonomy row at all — the generator's real skip condition
-- (verified = 42, all at Arts-and-Science Aided).
--
-- Signature unchanged → true CREATE OR REPLACE (grants preserved); REVOKE/GRANT re-asserted so
-- the secdef-anon CI gate treats it as locked (this open board is all-logged-in, never anon).

CREATE OR REPLACE FUNCTION public.fn_open_curriculum_readiness()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH syl AS (
    SELECT institutions_id iid,
           count(*) FILTER (WHERE is_latest AND NOT is_archived
             AND course_learning_outcomes IS NOT NULL
             AND course_learning_outcomes::text NOT IN ('null','{}','[]')) syllabi_clos
    FROM bos_course_syllabi GROUP BY 1),
  reg AS (
    SELECT institutions_id iid,
           count(*) FILTER (WHERE taxonomy_type='finks')  fink_regs,
           count(*) FILTER (WHERE taxonomy_type='blooms') bloom_regs,
           count(*) FILTER (WHERE taxonomy_type IS NULL)  no_tax_regs
    FROM bos_regulation_taxonomies GROUP BY 1),
  co AS (
    SELECT institution_id iid,
           count(*) FILTER (WHERE taxonomy_level IS NOT NULL)     bloom_cos,
           count(*) FILTER (WHERE taxonomy_dimension IS NOT NULL) fink_cos
    FROM obe_course_outcomes GROUP BY 1),
  sp AS (
    SELECT institution_id iid, count(*) lessons, count(DISTINCT course_id) courses
    FROM curriculum_lesson GROUP BY 1),
  mt AS (
    -- Latest non-archived syllabi whose (regulation, institution) has NO Fink/Bloom taxonomy
    -- fixed — the EXACT set the lesson-spine generator skips-and-flags (never defaults to Fink).
    SELECT s.institutions_id iid,
           count(*) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM bos_regulation_taxonomies rt
             WHERE rt.regulation_id = s.regulation_id
               AND rt.institutions_id = s.institutions_id
               AND rt.taxonomy_type IN ('finks','blooms')
           )) AS missing_tax
    FROM bos_course_syllabi s
    WHERE s.is_latest AND NOT s.is_archived
    GROUP BY 1)
  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'syllabi_clos')::int DESC, row->>'college'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'college', i.name,
      'syllabi_clos', COALESCE(syl.syllabi_clos,0),
      'fink_regs', COALESCE(reg.fink_regs,0),
      'bloom_regs', COALESCE(reg.bloom_regs,0),
      'no_tax_regs', COALESCE(reg.no_tax_regs,0),
      'pos', (SELECT count(*) FROM bos_programme_outcomes b WHERE b.institutions_id=i.id),
      'psos', (SELECT count(*) FROM bos_programme_specific_outcomes b WHERE b.institutions_id=i.id),
      'bloom_cos', COALESCE(co.bloom_cos,0),
      'fink_cos', COALESCE(co.fink_cos,0),
      'spine_lessons', COALESCE(sp.lessons,0),
      'spine_courses', COALESCE(sp.courses,0),
      'missing_taxonomy_courses', COALESCE(mt.missing_tax,0)
    ) AS row
    FROM institutions i
    LEFT JOIN syl ON syl.iid=i.id LEFT JOIN reg ON reg.iid=i.id
    LEFT JOIN co  ON co.iid=i.id  LEFT JOIN sp  ON sp.iid=i.id
    LEFT JOIN mt  ON mt.iid=i.id
  ) s;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_open_curriculum_readiness() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_open_curriculum_readiness() TO authenticated, service_role;
