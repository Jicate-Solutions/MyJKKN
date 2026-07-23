-- ============================================================================
-- Induction enroll PREVIEW — see who would be enrolled BEFORE committing
-- Date: 2026-06-29
--
-- Why
-- ---
-- Auto-enroll acts on hundreds of learners from a coarse scope (institution +
-- admission_year [+ degree filter / program list]). With no preview, a wrong or
-- missing scope silently becomes hundreds of mis-enrolled learners — exactly how
-- "Fresher Induction 2026" pulled 916 across 7 colleges when ~430 were intended.
--
-- fn_induction_preview_enroll runs the SAME matching predicate as
-- fn_induction_auto_enroll but INSERTS NOTHING. It returns a total, a per-program
-- and per-institution breakdown (the breakdown is what makes an over-pull obvious
-- at a glance), and a name sample — so a human can confirm the matched set before
-- the enroll INSERT.
--
-- Live-verified on prod 2026-06-29 (called as a super-admin):
--   * Arts&Sci Self / 2026 / scope=institution / filter='ug'  -> 432 (all UG)
--   * Pharmacy     / 2026 / scope=institution / filter='pg'   ->  21 (M.Pharm only)
--   * Arts&Sci Self / 2026 / no filter                         -> 443 (breakdown
--     exposes the 11 PG: M.Sc CS, M.Com, M.A English, M.Sc Maths)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_preview_enroll(
  p_institution_id      uuid,
  p_admission_year      integer,
  p_enroll_scope        text   DEFAULT 'institution',
  p_degree_type_filter  text   DEFAULT NULL,
  p_program_ids         uuid[] DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope  TEXT := COALESCE(NULLIF(p_enroll_scope, ''), 'institution');
  v_result jsonb;
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(p_institution_id))) THEN
    RAISE EXCEPTION 'fn_induction_preview_enroll: not authorized';
  END IF;
  IF p_admission_year IS NULL THEN
    RAISE EXCEPTION 'fn_induction_preview_enroll: admission_year required';
  END IF;

  -- Mirror of fn_induction_auto_enroll's matching predicate (read-only).
  WITH matched AS (
    SELECT lp.id, lp.institution_id, lp.program_id, d.degree_type, lp.lifecycle_status,
           TRIM(CONCAT(lp.first_name, ' ', COALESCE(lp.last_name, ''))) AS full_name
    FROM public.learners_profiles lp
    JOIN public.admission_years ay ON ay.id = lp.admission_year_id
    LEFT JOIN public.degrees d ON d.id = lp.degree_id
    WHERE ay.year = p_admission_year
      AND lp.lifecycle_status IN ('reserved', 'admitted', 'account')
      AND (v_scope = 'group' OR lp.institution_id = p_institution_id)
      AND (p_degree_type_filter IS NULL OR d.degree_type = p_degree_type_filter)
      AND (p_program_ids IS NULL OR lp.program_id = ANY(p_program_ids))
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM matched),
    'scope', v_scope,
    'degree_type_filter', p_degree_type_filter,
    'by_institution', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('institution', institution, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT i.name AS institution, count(*) AS cnt
            FROM matched m LEFT JOIN public.institutions i ON i.id = m.institution_id
            GROUP BY i.name) a),
    'by_program', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('program', program, 'degree_type', degree_type, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT coalesce(p.program_name, '(no program)') AS program, m.degree_type, count(*) AS cnt
            FROM matched m LEFT JOIN public.programs p ON p.id = m.program_id
            GROUP BY p.program_name, m.degree_type) b),
    'sample', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('name', full_name, 'status', lifecycle_status)), '[]'::jsonb)
      FROM (SELECT full_name, lifecycle_status FROM matched ORDER BY full_name LIMIT 15) c)
  ) INTO v_result;

  RETURN v_result;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_preview_enroll(uuid, integer, text, text, uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_preview_enroll(uuid, integer, text, text, uuid[]) TO authenticated;
