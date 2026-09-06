-- Split 'induction.create' out of 'induction.manage', and restrict creation to
-- the Induction Lead role (super admin / Administrator still bypass).
-- Authorised by the module owner 2026-08-21.
--
-- THE PROBLEM. 'induction.manage' bundled create + enroll + batches + attendance
-- into one key, and TEN roles held it — 654 users. Every Facilitator (493) and
-- every HOD (120) could stand up a brand-new induction programme. The "Create
-- induction" button on /events/induction was not gated at all, so all 654 saw it.
--
-- WHY THE SPLIT IS OPERATIONALLY SAFE. fn_induction_create_program is the ONLY
-- manage-gated induction RPC with no `OR fn_induction_is_event_coordinator(...)`
-- leg. mark_attendance, mark_day_attendance, upsert_session, auto_enroll,
-- appoint_feedback_volunteer, submit_feedback_proxy and the rest all accept an
-- appointed per-event coordinator, and mark_attendance additionally accepts an
-- assigned session speaker. So removing the global key from a role stops it
-- STARTING an induction without stopping the people RUNNING one.
--
-- Verified against the live data before writing: of the 10 staff who have marked
-- attendance on a live induction in the last 60 days, 8 are per-event coordinators
-- and a 9th (the single largest marker, 1,320 rows) is a session speaker. The 12
-- student peer-mentors mark through fn_induction_volunteer_mark_attendance, which
-- keys on induction_feedback_volunteers and never touched induction.manage.
-- One Facilitator with 9 marks is neither, and is being handled by appointing him
-- as a per-event coordinator through the UI rather than by a data fix here.

-- ===========================================================================
-- 1. Re-gate creation.
--
--    The old gate was, on the single-institution path:
--      is_super_admin() OR is_admin()
--      OR (user_has_permission('induction.manage') AND role_has_institution_access(...))
--    and on the multi-institution path, _fn_induction_can_target_institutions(),
--    which itself requires 'induction.manage'.
--
--    That shared helper is ALSO called by fn_induction_preview_enroll and
--    fn_induction_auto_enroll, so it is deliberately left alone — re-keying it
--    would restrict enrolment, which is not what was asked for.
--
--    Instead the gate here is split in two: one check for "may this caller create
--    inductions at all" (the new key) and one for "may they target these
--    institutions" (scope only, no key). Decoupling them means a future role
--    granted induction.create WITHOUT induction.manage still works — the old
--    shape would have silently rejected it on the institution leg.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.fn_induction_create_program(
  p_institution_id uuid, p_academic_year_id uuid, p_name text,
  p_start_date timestamp with time zone, p_end_date timestamp with time zone,
  p_venue_text text DEFAULT 'Campus'::text, p_description text DEFAULT NULL::text,
  p_admission_year integer DEFAULT NULL::integer,
  p_enroll_scope text DEFAULT 'institution'::text,
  p_venue_resource_id uuid DEFAULT NULL::uuid,
  p_degree_type_filter text DEFAULT NULL::text,
  p_institution_ids uuid[] DEFAULT NULL::uuid[],
  p_degree_ids uuid[] DEFAULT NULL::uuid[],
  p_department_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id uuid; v_slug text;
  v_scope text := COALESCE(NULLIF(p_enroll_scope,''),'institution');
  v_degree text := NULLIF(p_degree_type_filter,'');
  v_multi boolean := (p_institution_ids IS NOT NULL AND cardinality(p_institution_ids) > 0);
  v_owning uuid := CASE WHEN v_multi THEN p_institution_ids[1] ELSE p_institution_id END;
BEGIN
  -- Gate 1 — may this caller create an induction at all?
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('induction.create')) THEN
    RAISE EXCEPTION 'fn_induction_create_program: not authorized to create inductions';
  END IF;

  -- Gate 2 — scope only. Institution reach is a separate question from the right
  -- to create, so this leg carries no permission key of its own.
  IF NOT (is_super_admin() OR is_admin()) THEN
    IF v_multi THEN
      IF EXISTS (SELECT 1 FROM unnest(p_institution_ids) x(iid)
                  WHERE NOT role_has_institution_access(x.iid)) THEN
        RAISE EXCEPTION 'fn_induction_create_program: not authorized for one or more selected institutions';
      END IF;
    ELSE
      IF NOT role_has_institution_access(p_institution_id) THEN
        RAISE EXCEPTION 'fn_induction_create_program: not authorized';
      END IF;
    END IF;
  END IF;

  IF v_owning IS NULL OR p_name IS NULL THEN
    RAISE EXCEPTION 'fn_induction_create_program: institution and name are required'; END IF;
  IF v_scope NOT IN ('institution','group') THEN
    RAISE EXCEPTION 'fn_induction_create_program: enroll_scope must be institution or group'; END IF;
  IF v_degree IS NOT NULL AND v_degree NOT IN ('ug','pg') THEN
    RAISE EXCEPTION 'fn_induction_create_program: degree_type_filter must be ug, pg, or null'; END IF;

  v_slug := lower(regexp_replace(coalesce(p_name,'induction'), '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);

  INSERT INTO public.events (institution_id, event_type, name, slug, venue_text, venue_resource_id,
                             start_date, end_date, description, status, created_by)
  VALUES (v_owning, 'induction', p_name, v_slug,
          CASE WHEN p_venue_resource_id IS NOT NULL THEN NULLIF(p_venue_text,'Campus') ELSE coalesce(p_venue_text,'Campus') END,
          p_venue_resource_id, p_start_date, p_end_date, p_description, 'draft', auth.uid())
  RETURNING id INTO v_event_id;

  INSERT INTO public.induction_programs (event_id, institution_id, academic_year_id, admission_year,
    enroll_scope, degree_type_filter, target_institution_ids, target_degree_ids, target_department_ids)
  VALUES (v_event_id, v_owning, p_academic_year_id, p_admission_year, v_scope, v_degree,
          CASE WHEN v_multi THEN p_institution_ids ELSE NULL END,
          NULLIF(p_degree_ids, '{}'::uuid[]),
          NULLIF(p_department_ids, '{}'::uuid[]));

  RETURN v_event_id;
END $function$;

-- ===========================================================================
-- 2. Grant the new key to Induction Lead, and declare it FALSE everywhere else
--    that touches the module.
--
--    Declaring the key in lib/constants/permissions.ts does nothing on its own —
--    a key only "exists" for a role once it is in that role's JSONB. Writing an
--    explicit false is what makes the toggle appear (off) in Role Management,
--    rather than the key being simply absent and invisible.
-- ===========================================================================
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('induction.create', true),
       updated_at = now()
 WHERE role_key = 'induction_lead';

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('induction.create', false),
       updated_at = now()
 WHERE role_key <> 'induction_lead'
   AND permissions ?| ARRAY['induction.view','induction.manage'];

-- ===========================================================================
-- 3. Revoke induction.manage from every role except Induction Lead.
--    induction.view is deliberately left TRUE on the roles that already had it —
--    the ask was "view access only", not "no access".
--
--    Written as a predicate rather than a hardcoded role list so it cannot go
--    stale: any role that has picked up manage since this file was authored is
--    caught too. At time of writing the nine affected roles were CDC Coordinator,
--    CEO, COO, Digital Coordinator, Facilitator, HOD, Induction Coordinator,
--    Managing Director and Principal.
-- ===========================================================================
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('induction.manage', false),
       updated_at = now()
 WHERE role_key <> 'induction_lead'
   AND (permissions->>'induction.manage')::boolean IS TRUE;

-- ===========================================================================
-- 4. POST-FLIGHT.
-- ===========================================================================
DO $$
DECLARE v_creators int; v_managers int; v_lead_ok boolean;
BEGIN
  SELECT count(*) INTO v_creators FROM public.custom_roles
   WHERE (permissions->>'induction.create')::boolean IS TRUE;
  IF v_creators <> 1 THEN
    RAISE EXCEPTION 'post-flight: % role(s) hold induction.create, expected exactly 1 (Induction Lead)', v_creators;
  END IF;

  SELECT (permissions->>'induction.create')::boolean IS TRUE
    INTO v_lead_ok FROM public.custom_roles WHERE role_key='induction_lead';
  IF NOT COALESCE(v_lead_ok,false) THEN
    RAISE EXCEPTION 'post-flight: Induction Lead did not receive induction.create';
  END IF;

  SELECT count(*) INTO v_managers FROM public.custom_roles
   WHERE (permissions->>'induction.manage')::boolean IS TRUE;
  IF v_managers <> 1 THEN
    RAISE EXCEPTION 'post-flight: % role(s) still hold induction.manage, expected exactly 1', v_managers;
  END IF;

  RAISE NOTICE 'induction.create split OK: 1 creator role, 1 manager role';
END $$;
