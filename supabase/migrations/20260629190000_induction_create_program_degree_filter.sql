-- ============================================================================
-- Induction create-program: capture degree_type_filter at creation
-- Date: 2026-06-29
--
-- The induction create form now offers a UG/PG degree restriction (so e.g. an
-- M.Pharm-only or UG-only induction can be scoped at creation). fn_induction_auto_enroll
-- already honors induction_programs.degree_type_filter (20260629170000); this teaches
-- fn_induction_create_program to STORE it, so the scope is captured up front rather
-- than patched in afterward.
--
-- Additive + backward compatible: p_degree_type_filter defaults NULL (= all degrees,
-- unchanged). DROP+CREATE because the arg list changes (an added trailing default
-- param still alters the signature PostgREST resolves).
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_induction_create_program(uuid, uuid, text, timestamptz, timestamptz, text, text, integer, text, uuid);

CREATE OR REPLACE FUNCTION public.fn_induction_create_program(
  p_institution_id uuid,
  p_academic_year_id uuid,
  p_name text,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_venue_text text DEFAULT 'Campus'::text,
  p_description text DEFAULT NULL::text,
  p_admission_year integer DEFAULT NULL,
  p_enroll_scope text DEFAULT 'institution',
  p_venue_resource_id uuid DEFAULT NULL,
  p_degree_type_filter text DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id UUID;
  v_slug     TEXT;
  v_scope    TEXT := COALESCE(NULLIF(p_enroll_scope, ''), 'institution');
  v_degree   TEXT := NULLIF(p_degree_type_filter, '');
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(p_institution_id))) THEN
    RAISE EXCEPTION 'fn_induction_create_program: not authorized';
  END IF;
  IF p_institution_id IS NULL OR p_name IS NULL THEN
    RAISE EXCEPTION 'fn_induction_create_program: institution_id and name are required';
  END IF;
  IF v_scope NOT IN ('institution', 'group') THEN
    RAISE EXCEPTION 'fn_induction_create_program: enroll_scope must be institution or group';
  END IF;
  IF v_degree IS NOT NULL AND v_degree NOT IN ('ug', 'pg') THEN
    RAISE EXCEPTION 'fn_induction_create_program: degree_type_filter must be ug, pg, or null';
  END IF;

  v_slug := lower(regexp_replace(coalesce(p_name,'induction'), '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);

  INSERT INTO public.events (institution_id, event_type, name, slug, venue_text, venue_resource_id,
                             start_date, end_date, description, status, created_by)
  VALUES (p_institution_id, 'induction', p_name, v_slug,
          CASE WHEN p_venue_resource_id IS NOT NULL THEN NULLIF(p_venue_text, 'Campus') ELSE coalesce(p_venue_text, 'Campus') END,
          p_venue_resource_id,
          p_start_date, p_end_date, p_description, 'draft', auth.uid())
  RETURNING id INTO v_event_id;

  INSERT INTO public.induction_programs (event_id, institution_id, academic_year_id, admission_year, enroll_scope, degree_type_filter)
  VALUES (v_event_id, p_institution_id, p_academic_year_id, p_admission_year, v_scope, v_degree);

  RETURN v_event_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_create_program(uuid, uuid, text, timestamptz, timestamptz, text, text, integer, text, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_create_program(uuid, uuid, text, timestamptz, timestamptz, text, text, integer, text, uuid, text) TO authenticated;
