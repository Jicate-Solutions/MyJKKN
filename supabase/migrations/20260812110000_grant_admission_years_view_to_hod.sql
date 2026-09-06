-- Grant admission.settings.years.view to the HOD role.
--
-- Symptom: on /events/induction/new the "Admission year (cohort to enroll)"
-- dropdown rendered "No admission years" for HODs — with no error toast, because
-- an RLS denial and a genuinely empty list are indistinguishable at that
-- placeholder (app/(routes)/events/induction/new/page.tsx).
--
-- Cause: the picker is not fed by an induction API. useGroupAdmissionYears
-- (hooks/admission/use-group-admission-years.ts) selects from admission_years
-- straight from the browser client, so the admission_years_select policy decides:
--
--   is_super_admin() OR is_admin()
--   OR (user_has_permission('admission.settings.years.view')
--       AND role_has_institution_access(institution_id))
--
-- HODs already hold induction.view / induction.manage — which is what the
-- fn_induction_* functions check — so they could submit the form but could not
-- populate its own cohort picker. induction.manage appears nowhere in the
-- admission_years policy, so the permission arm collapsed and PostgREST
-- returned [] rather than an error.
--
-- Scope of the grant: read-only. .edit and .delete stay false, so HODs still
-- cannot create or modify admission years. role_has_institution_access keeps the
-- institution confinement — the HOD role is institution_scope='own', so a HOD
-- sees only their own college's years (users holding an additional 'all'-scoped
-- role, e.g. admission_counselor, already saw group-wide reference data through
-- that role; this change does not widen them).
--
-- Side effect, intentional: lib/sidebarMenuLink.ts maps /admission/settings/years
-- to this same key, so the Admission > Settings > Years menu item now appears for
-- HODs as a read-only list.
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object('admission.settings.years.view', true),
    updated_at = now()
WHERE role_key = 'hod';
