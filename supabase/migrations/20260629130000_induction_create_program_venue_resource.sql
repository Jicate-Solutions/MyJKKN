-- ============================================================================
-- Induction create-program: link a Resource-Management venue + drop the forced
-- 'Campus' default so a resource-backed venue isn't overwritten with text.
-- Date: 2026-06-29
-- Spec: specs/pre-onboarding-induction-access-2026-06-29.md
--
-- The New Induction form now picks the main venue from Resource Management
-- (VenueRoomPicker → events.venue_resource_id), mirroring /events/create. Add
-- p_venue_resource_id and store it; venue_text is used only for a custom/off-campus
-- place. Academic year stays nullable (the form no longer collects it — enrollment
-- is admission-year based).
-- ============================================================================
DROP FUNCTION IF EXISTS public.fn_induction_create_program(uuid, uuid, text, timestamptz, timestamptz, text, text, integer, text);

CREATE OR REPLACE FUNCTION public.fn_induction_create_program(
  p_institution_id uuid,
  p_academic_year_id uuid,
  p_name text,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_venue_text text DEFAULT NULL::text,
  p_description text DEFAULT NULL::text,
  p_admission_year integer DEFAULT NULL,
  p_enroll_scope text DEFAULT 'institution',
  p_venue_resource_id uuid DEFAULT NULL
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

  v_slug := lower(regexp_replace(coalesce(p_name,'induction'), '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);

  -- venue_resource_id = the picked Resource-Management room (canonical);
  -- venue_text = a custom/off-campus place when no room is chosen.
  INSERT INTO public.events (institution_id, event_type, name, slug,
                             venue_text, venue_resource_id,
                             start_date, end_date, description, status, created_by)
  VALUES (p_institution_id, 'induction', p_name, v_slug,
          p_venue_text, p_venue_resource_id,
          p_start_date, p_end_date, p_description, 'draft', auth.uid())
  RETURNING id INTO v_event_id;

  INSERT INTO public.induction_programs (event_id, institution_id, academic_year_id, admission_year, enroll_scope)
  VALUES (v_event_id, p_institution_id, p_academic_year_id, p_admission_year, v_scope);

  RETURN v_event_id;
END $function$;
