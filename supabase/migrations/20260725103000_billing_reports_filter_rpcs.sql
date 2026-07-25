-- ============================================================================
-- 20260725103000 — /billing/reports hierarchy + student-category filter RPCs
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-07-25-billing-reports-filters-design.md
-- Pattern: 20260724090000_accountant_report_rpcs.sql — permission gate +
-- get_user_accessible_institutions scope hoisted into v_inst.
--
-- The academic hierarchy (degree/department/program/semester/section) exists
-- ONLY on learners_profiles; every billing table reaches it via student_id.
-- billing_report_student_cohort resolves that once and is joined by each RPC.
-- ============================================================================

-- 0) COHORT HELPER ----------------------------------------------------------
-- LANGUAGE sql (not plpgsql) and deliberately WITHOUT `SET search_path` and
-- WITHOUT SECURITY DEFINER: PostgreSQL only inlines a set-returning SQL
-- function when proconfig IS NULL and prosecdef IS false. Inlining is the
-- point — it lets the planner see lp.degree_id = $1 and use
-- idx_learners_profiles_degree_id instead of materialising a Function Scan.
-- Every object is schema-qualified to compensate for the missing search_path.
-- Callers are SECURITY DEFINER, so this inherits definer rights.
CREATE OR REPLACE FUNCTION public.billing_report_student_cohort(
  p_institution_ids uuid[] DEFAULT NULL,
  p_degree_id       uuid   DEFAULT NULL,
  p_department_id   uuid   DEFAULT NULL,
  p_program_id      uuid   DEFAULT NULL,
  p_semester_id     uuid   DEFAULT NULL,
  p_section_id      uuid   DEFAULT NULL,
  p_schemes         text[] DEFAULT NULL
) RETURNS TABLE(student_id uuid)
LANGUAGE sql STABLE
AS $$
  -- One row per learner: lp.id is the PK and quotas joins on its PK, so no
  -- DISTINCT is needed even when a learner matches two scheme buckets — the
  -- bucket predicates are a disjunction WITHIN a single row.
  SELECT lp.id
  FROM public.learners_profiles lp
  LEFT JOIN public.quotas q ON q.id = lp.quota_id
  WHERE (p_institution_ids IS NULL OR lp.institution_id = ANY(p_institution_ids))
    AND (p_degree_id     IS NULL OR lp.degree_id     = p_degree_id)
    AND (p_department_id IS NULL OR lp.department_id = p_department_id)
    AND (p_program_id    IS NULL OR lp.program_id    = p_program_id)
    AND (p_semester_id   IS NULL OR lp.semester_id   = p_semester_id)
    AND (p_section_id    IS NULL OR lp.section_id    = p_section_id)
    AND (
      p_schemes IS NULL OR cardinality(p_schemes) = 0
      OR ('first_graduate' = ANY(p_schemes)
          AND (COALESCE(lp.first_graduate, false)
               OR COALESCE(lp.scholarship_type, '') = 'FIRST GRADUATE'))
      OR ('pmss' = ANY(p_schemes)
          AND (COALESCE(lp.scholarship_type, '') = 'PMS SCHOLARSHIP'
               OR COALESCE(q.code, '') = 'pmss'))
      OR ('scholarship_7_5' = ANY(p_schemes)
          AND COALESCE(lp.scholarship_type, '') = '7.5% SCHOLARSHIP')
      -- COALESCE is load-bearing: scholarship_type is NULL for 65 learners and
      -- NOT(NULL) is NULL, which would drop them from "other" entirely.
      OR ('other' = ANY(p_schemes)
          AND NOT (
            COALESCE(lp.first_graduate, false)
            OR COALESCE(lp.scholarship_type, '') IN
               ('FIRST GRADUATE', 'PMS SCHOLARSHIP', '7.5% SCHOLARSHIP')
            OR COALESCE(q.code, '') = 'pmss'))
    );
$$;

REVOKE EXECUTE ON FUNCTION public.billing_report_student_cohort(uuid[], uuid, uuid, uuid, uuid, uuid, text[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.billing_report_student_cohort(uuid[], uuid, uuid, uuid, uuid, uuid, text[]) TO authenticated, service_role;
