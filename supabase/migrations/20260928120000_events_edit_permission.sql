-- events.edit — a grantable "edit any event in your institution" permission.
--
-- Until now editing an event was ownership-only (events_auth_update: super
-- admin, the creator, or a creator-less event in your own institution), so Role
-- Management had no Edit toggle for Events and a role like Senior Learner
-- (role_key 'faculty') could not be given edit rights at all.
--
-- This adds a PERMISSIVE UPDATE policy alongside the ownership one: holders of
-- events.edit may update events in institutions their role can access. WITH
-- CHECK repeats the scope so an edit cannot move an event into an institution
-- the editor has no access to. Mirrored client-side by canEditEvent().

DROP POLICY IF EXISTS events_edit_permission_update ON public.events;

CREATE POLICY events_edit_permission_update ON public.events
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.user_has_permission('events.edit'::text))
    AND public.role_has_institution_access(institution_id)
  )
  WITH CHECK (
    (SELECT public.user_has_permission('events.edit'::text))
    AND public.role_has_institution_access(institution_id)
  );

-- Grant to Senior Learner (role_key 'faculty'), as requested 2026-09-28.
UPDATE public.custom_roles
   SET permissions = permissions || '{"events.edit": true}'::jsonb,
       updated_at  = now()
 WHERE role_key = 'faculty';
