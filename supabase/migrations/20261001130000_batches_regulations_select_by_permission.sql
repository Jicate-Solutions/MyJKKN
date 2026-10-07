-- Learner profile detail embeds batch:batches(...) and regulation:regulations(...).
-- Both tables only allowed profiles.role admin/super_admin or the user's HOME
-- profiles.institution_id, so staff whose institution access comes from a role
-- scope (or who have no home institution) got a NULL embed -> "Not specified",
-- even though the learner's batch/regulation was saved correctly.
-- Mirror academic_years / semesters / sections: permission key + role_has_institution_access.

CREATE POLICY batches_select_permission ON public.batches
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR ((SELECT user_has_permission('academic.batches.view')) AND role_has_institution_access(institution_id))
  );

CREATE POLICY regulations_select_permission ON public.regulations
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR ((SELECT user_has_permission('academic.regulations.view')) AND role_has_institution_access(institution_id))
  );

-- A key only exists for a role once it is in custom_roles.permissions: grant the
-- two view keys to every role that can already view learner profiles.
UPDATE public.custom_roles
SET permissions = permissions
  || jsonb_build_object('academic.batches.view', true)
  || jsonb_build_object('academic.regulations.view', true)
WHERE (permissions->>'learners.profiles.view') = 'true'
  AND (
    COALESCE(permissions->>'academic.batches.view', '') <> 'true'
    OR COALESCE(permissions->>'academic.regulations.view', '') <> 'true'
  );
