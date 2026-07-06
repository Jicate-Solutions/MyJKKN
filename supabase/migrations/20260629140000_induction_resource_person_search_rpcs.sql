-- ============================================================================
-- Induction session resource-person search — typed (facilitator vs learner)
-- Date: 2026-06-29
-- Spec: specs/pre-onboarding-induction-access-2026-06-29.md
--
-- The Add-session "Resource persons" picker is now type-segmented:
--   * Facilitator → staff (filtered by institution + department + name)
--   * Learner     → learners_profiles (cascade: institution/degree/department/
--                   program/semester/section + name)
-- Both resolve to a profiles.id (the existing event_session_speakers link), so
-- only people WITH a login account appear (INNER JOIN profiles) — resource persons
-- are active staff + senior-learner mentors, never the freshers being inducted.
--
-- SECURITY DEFINER (read past RLS for the coordinator) + gated on induction
-- view/manage; REVOKE anon. Returns only the caller-permitted directory slice.
-- ============================================================================

-- Facilitators = staff with an account.
CREATE OR REPLACE FUNCTION public.fn_induction_search_facilitators(
  p_institution_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_query text DEFAULT NULL
)
RETURNS TABLE(profile_id uuid, full_name text, email text, sub_label text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_q text := nullif(btrim(coalesce(p_query, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_search_facilitators: not authenticated'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('induction.view') OR user_has_permission('induction.manage')) THEN
    RAISE EXCEPTION 'fn_induction_search_facilitators: not authorized';
  END IF;

  RETURN QUERY
  SELECT p.id,
         COALESCE(NULLIF(btrim(p.full_name), ''), btrim(s.first_name || ' ' || COALESCE(s.last_name, '')))::text,
         p.email::text,
         NULLIF(btrim(COALESCE(s.staff_id, '')), '')::text
  FROM public.staff s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.profile_id IS NOT NULL
    AND (p_institution_id IS NULL OR s.institution_id = p_institution_id)
    AND (p_department_id IS NULL OR s.department_id = p_department_id)
    AND (v_q IS NULL
         OR p.full_name ILIKE '%' || v_q || '%'
         OR s.first_name ILIKE '%' || v_q || '%'
         OR s.last_name ILIKE '%' || v_q || '%'
         OR s.staff_id ILIKE '%' || v_q || '%'
         OR p.email ILIKE '%' || v_q || '%')
  ORDER BY 2
  LIMIT 50;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_search_facilitators(uuid, uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_induction_search_facilitators(uuid, uuid, text) TO authenticated;

-- Learners = learners_profiles with an account (profiles.learner_id link).
CREATE OR REPLACE FUNCTION public.fn_induction_search_learner_speakers(
  p_institution_id uuid DEFAULT NULL,
  p_degree_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL,
  p_semester_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL,
  p_query text DEFAULT NULL
)
RETURNS TABLE(profile_id uuid, full_name text, email text, sub_label text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_q text := nullif(btrim(coalesce(p_query, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_search_learner_speakers: not authenticated'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('induction.view') OR user_has_permission('induction.manage')) THEN
    RAISE EXCEPTION 'fn_induction_search_learner_speakers: not authorized';
  END IF;

  RETURN QUERY
  SELECT p.id,
         COALESCE(NULLIF(btrim(p.full_name), ''), btrim(lp.first_name || ' ' || COALESCE(lp.last_name, '')))::text,
         p.email::text,
         NULLIF(btrim(COALESCE(lp.roll_number, lp.register_number, '')), '')::text
  FROM public.learners_profiles lp
  JOIN public.profiles p ON p.learner_id = lp.id
  WHERE (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
    AND (p_degree_id IS NULL OR lp.degree_id = p_degree_id)
    AND (p_department_id IS NULL OR lp.department_id = p_department_id)
    AND (p_program_id IS NULL OR lp.program_id = p_program_id)
    AND (p_semester_id IS NULL OR lp.semester_id = p_semester_id)
    AND (p_section_id IS NULL OR lp.section_id = p_section_id)
    AND (v_q IS NULL
         OR lp.first_name ILIKE '%' || v_q || '%'
         OR lp.last_name ILIKE '%' || v_q || '%'
         OR lp.roll_number ILIKE '%' || v_q || '%'
         OR lp.register_number ILIKE '%' || v_q || '%'
         OR p.full_name ILIKE '%' || v_q || '%')
  ORDER BY 2
  LIMIT 50;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_search_learner_speakers(uuid, uuid, uuid, uuid, uuid, uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_induction_search_learner_speakers(uuid, uuid, uuid, uuid, uuid, uuid, text) TO authenticated;
