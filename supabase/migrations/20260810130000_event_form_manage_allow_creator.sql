-- The person who CREATED an event may manage that event's forms.
--
-- WHY
-- `event_registration_forms` (+ its sections and fields) are gated by a policy
-- written for the Tournament In-charge feature (2026-07). Its four arms are:
--   is_super_admin() OR is_admin() OR fn_is_event_incharge(event_id)
--   OR (user_has_permission('sports.tournaments.manage') AND <institution scope>)
--
-- None of them is "you made this event". And fn_is_event_incharge reads
-- events.config->'incharges', which the Create-an-Event page NEVER writes — it
-- only ever sets config = {home, format, ...preset}. So on production 44 of 47
-- events have no in-charge at all, and their creators are locked out of the
-- forms they are supposed to author:
--   new row violates row-level security policy for table "event_registration_forms"
--
-- A general workshop also has no business requiring a SPORTS permission. Rather
-- than re-key the permission (a wider change that would need its own audit),
-- this adds the one arm that was always missing and is obviously correct: the
-- event's own creator. It is strictly narrower than the admin arms and grants
-- nothing across events — verified live for the reporting user, it turns on
-- exactly the 2 events they created and still denies the other 13 they can see.
--
-- All three tables get it together. Fixing only `event_registration_forms`
-- would move the identical error one click later, to saving the questions.

CREATE OR REPLACE FUNCTION public.fn_is_event_creator(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = p_event_id
      AND e.created_by = (SELECT auth.uid())
  );
$function$;

-- MUST be explicit. A SECURITY DEFINER function that authenticated cannot
-- EXECUTE makes every policy referencing it fail closed — the exact way
-- user_has_permission(uuid,text) once 403'd users who genuinely held the
-- permission after a DROP+CREATE dropped its ACL.
GRANT EXECUTE ON FUNCTION public.fn_is_event_creator(uuid) TO authenticated;

DROP POLICY IF EXISTS event_registration_forms_manage ON public.event_registration_forms;
CREATE POLICY event_registration_forms_manage ON public.event_registration_forms
  FOR ALL
  USING (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR fn_is_event_incharge(event_id)
    OR fn_is_event_creator(event_id)
    OR ((SELECT user_has_permission('sports.tournaments.manage'::text))
        AND EXISTS (
          SELECT 1 FROM public.events e
          WHERE e.id = event_registration_forms.event_id
            AND (e.scope = 'all_jkkn'::text OR role_has_institution_access(e.institution_id))))
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR fn_is_event_incharge(event_id)
    OR fn_is_event_creator(event_id)
    OR ((SELECT user_has_permission('sports.tournaments.manage'::text))
        AND EXISTS (
          SELECT 1 FROM public.events e
          WHERE e.id = event_registration_forms.event_id
            AND (e.scope = 'all_jkkn'::text OR role_has_institution_access(e.institution_id))))
  );

DROP POLICY IF EXISTS event_registration_form_sections_manage ON public.event_registration_form_sections;
CREATE POLICY event_registration_form_sections_manage ON public.event_registration_form_sections
  FOR ALL
  USING (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR fn_is_event_incharge(event_id)
    OR fn_is_event_creator(event_id)
    OR ((SELECT user_has_permission('sports.tournaments.manage'::text))
        AND EXISTS (
          SELECT 1 FROM public.events e
          WHERE e.id = event_registration_form_sections.event_id
            AND (e.scope = 'all_jkkn'::text OR role_has_institution_access(e.institution_id))))
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR fn_is_event_incharge(event_id)
    OR fn_is_event_creator(event_id)
    OR ((SELECT user_has_permission('sports.tournaments.manage'::text))
        AND EXISTS (
          SELECT 1 FROM public.events e
          WHERE e.id = event_registration_form_sections.event_id
            AND (e.scope = 'all_jkkn'::text OR role_has_institution_access(e.institution_id))))
  );

DROP POLICY IF EXISTS event_registration_form_fields_manage ON public.event_registration_form_fields;
CREATE POLICY event_registration_form_fields_manage ON public.event_registration_form_fields
  FOR ALL
  USING (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR fn_is_event_incharge(event_id)
    OR fn_is_event_creator(event_id)
    OR ((SELECT user_has_permission('sports.tournaments.manage'::text))
        AND EXISTS (
          SELECT 1 FROM public.events e
          WHERE e.id = event_registration_form_fields.event_id
            AND (e.scope = 'all_jkkn'::text OR role_has_institution_access(e.institution_id))))
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR fn_is_event_incharge(event_id)
    OR fn_is_event_creator(event_id)
    OR ((SELECT user_has_permission('sports.tournaments.manage'::text))
        AND EXISTS (
          SELECT 1 FROM public.events e
          WHERE e.id = event_registration_form_fields.event_id
            AND (e.scope = 'all_jkkn'::text OR role_has_institution_access(e.institution_id))))
  );
