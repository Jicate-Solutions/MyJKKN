-- =====================================================================
-- Institution department contacts: the table the app has always written
-- to, and which never existed.
--
-- 📄 FILE ONLY — HELD for the Director: new table holding staff contact
-- details (name, designation, email, mobile), with its own read/write rules.
--
-- BUG-003313 (24 Apr): "unable to insert Department Contacts" on
-- /organizations/institutions/<id>/edit.
--
-- CAUSE (production, read-only, 25 Sep 2026): public.institution_departments
-- does not exist (to_regclass is null). OrganizationService.createInstitution
-- and updateInstitution insert into it (update deleted all rows first) and
-- never read the returned error, so every contact typed on the create or edit
-- form has been silently thrown away, and getInstitution read the academic
-- `departments` table instead, so the form always came back blank.
--
-- WHO MAY SEE / CHANGE A CONTACT (Director, 27 Sep 2026 06:47, W12-tab
-- interview: "visible to staff of that college, editable only by college
-- editors" — read LITERALLY: staff OF THAT college, not any staff member who
-- happens to have access to it)
--   read  : super admin
--           OR an ACTIVE staff record whose institution_id IS the contact's
--              institution (fn_my_staff_institution_ids(); a positive identity —
--              a missing learner link is not proof of staff, and a cross-college
--              grant or an all-colleges role does not make you staff of B)
--           OR organizations.institutions.edit AND access to that institution
--              (an editor must see the row to upsert over it)
--   write : super admin
--           OR organizations.institutions.edit AND
--              role_has_institution_access(institution_id)
--   anon gets nothing. user_has_permission is global, so the key is always
--   paired with the row's institution.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.institution_departments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  department_type text NOT NULL CHECK (department_type IN
                    ('transportation','administration','accounts','admission','placement','antiRagging')),
  contact_name    text NOT NULL CHECK (btrim(contact_name) <> ''),
  designation     text,
  email           text,
  mobile          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT institution_departments_one_per_type UNIQUE (institution_id, department_type)
);

ALTER TABLE public.institution_departments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.institution_departments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.institution_departments TO authenticated;
GRANT ALL ON public.institution_departments TO service_role;

-- The caller's own colleges as STAFF: institutions of their ACTIVE staff
-- records. SECURITY DEFINER because a staff member cannot, in general, read
-- their own public.staff row (staff_select_scope_aware needs staff.view); it
-- returns only the caller's own institution ids, nothing else.
CREATE OR REPLACE FUNCTION public.fn_my_staff_institution_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT s.institution_id), ARRAY[]::uuid[])
  FROM public.staff s
  WHERE s.profile_id = auth.uid()
    AND s.is_active
    AND s.institution_id IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.fn_my_staff_institution_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_my_staff_institution_ids() TO authenticated, service_role;

DROP POLICY IF EXISTS institution_departments_read ON public.institution_departments;
CREATE POLICY institution_departments_read ON public.institution_departments
  FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin())
         OR institution_id = ANY (public.fn_my_staff_institution_ids())
         OR ((SELECT public.user_has_permission('organizations.institutions.edit'))
             AND public.role_has_institution_access(institution_id)));

DROP POLICY IF EXISTS institution_departments_insert ON public.institution_departments;
CREATE POLICY institution_departments_insert ON public.institution_departments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_super_admin())
              OR ((SELECT public.user_has_permission('organizations.institutions.edit'))
                  AND public.role_has_institution_access(institution_id)));

DROP POLICY IF EXISTS institution_departments_update ON public.institution_departments;
CREATE POLICY institution_departments_update ON public.institution_departments
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin())
         OR ((SELECT public.user_has_permission('organizations.institutions.edit'))
             AND public.role_has_institution_access(institution_id)))
  WITH CHECK ((SELECT public.is_super_admin())
              OR ((SELECT public.user_has_permission('organizations.institutions.edit'))
                  AND public.role_has_institution_access(institution_id)));

DROP POLICY IF EXISTS institution_departments_delete ON public.institution_departments;
CREATE POLICY institution_departments_delete ON public.institution_departments
  FOR DELETE TO authenticated
  USING ((SELECT public.is_super_admin())
         OR ((SELECT public.user_has_permission('organizations.institutions.edit'))
             AND public.role_has_institution_access(institution_id)));

CREATE INDEX IF NOT EXISTS institution_departments_institution_idx
  ON public.institution_departments (institution_id);
