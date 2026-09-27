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
-- editors")
--   read  : super admin, or a STAFF member (not a learner) who has access to
--           THAT institution — role_has_institution_access(institution_id):
--           own college, its CAS sibling, or an all-colleges role
--   write : super admin, or a holder of organizations.institutions.edit who
--           has access to THAT institution
--   anon gets nothing. The key alone is not enough: user_has_permission is
--   global, so it must be paired with the row's institution.
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
         OR (public.role_has_institution_access(institution_id)
             AND NOT EXISTS (SELECT 1 FROM public.profiles pr
                             WHERE pr.id = (SELECT auth.uid())
                               AND pr.learner_id IS NOT NULL)));

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
