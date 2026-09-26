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
-- WHO MAY SEE / CHANGE A CONTACT
--   The create and edit screens are SuperAdminOnly. Institutions rows are
--   readable by every signed-in user, but these rows carry people's email and
--   mobile, so they get their own, narrower rules:
--     read  : super admin, or holders of organizations.institutions.view or
--             .edit (an upsert over an existing contact needs to see it)
--     write : super admin, or holders of organizations.institutions.edit
--   anon gets nothing.
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

DROP POLICY IF EXISTS institution_departments_read ON public.institution_departments;
CREATE POLICY institution_departments_read ON public.institution_departments
  FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin())
         OR (SELECT public.user_has_permission('organizations.institutions.view'))
         OR (SELECT public.user_has_permission('organizations.institutions.edit')));

DROP POLICY IF EXISTS institution_departments_insert ON public.institution_departments;
CREATE POLICY institution_departments_insert ON public.institution_departments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_super_admin())
              OR (SELECT public.user_has_permission('organizations.institutions.edit')));

DROP POLICY IF EXISTS institution_departments_update ON public.institution_departments;
CREATE POLICY institution_departments_update ON public.institution_departments
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin())
         OR (SELECT public.user_has_permission('organizations.institutions.edit')))
  WITH CHECK ((SELECT public.is_super_admin())
              OR (SELECT public.user_has_permission('organizations.institutions.edit')));

DROP POLICY IF EXISTS institution_departments_delete ON public.institution_departments;
CREATE POLICY institution_departments_delete ON public.institution_departments
  FOR DELETE TO authenticated
  USING ((SELECT public.is_super_admin())
         OR (SELECT public.user_has_permission('organizations.institutions.edit')));

CREATE INDEX IF NOT EXISTS institution_departments_institution_idx
  ON public.institution_departments (institution_id);
