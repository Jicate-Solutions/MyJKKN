-- ============================================================
-- Move admission_forms RLS from the catch-all admission.applications.*
-- namespace into a dedicated admission.settings.forms.* namespace,
-- and seed the new keys on every role that currently has access so
-- nobody loses visibility at the moment of the policy swap.
-- ============================================================
-- Context (2026-05-13):
--   The form builder lives at /admission/settings/forms. Its RLS
--   was previously gated on admission.applications.{view,create,
--   edit,delete}, which:
--     • Mixed form-building (a settings/admin tool) with the
--       applications pipeline (a counselor workflow).
--     • Prevented marketing-facing roles like SEO Specialist from
--       reaching the form builder despite having every other
--       admission.settings.* key.
--
--   This migration introduces admission.settings.forms.{view,
--   manage} and rewires the 4 policies on admission_forms. Role
--   seeds preserve each role's prior access shape:
--     • Old .view → new .view
--     • Old .create OR .edit OR .delete → new .manage
--     • SEO Specialist (target) gains both keys.
--
--   admission_form_submissions RLS is left alone — counselors
--   still need admission.applications.view to read the leads
--   captured by forms. Form-builder access and submission-data
--   access are now two separate permissions, as they should be.
--
-- Seed matrix (manually derived from 2026-05-13 audit):
--   role                       | view  | manage
--   admission                  |   T   |   T
--   admission_counselor        |   T   |   F
--   admission_staff            |   T   |   T
--   ceo                        |   T   |   T
--   coo                        |   T   |   T
--   executive_admin_officer    |   T   |   T
--   expo_counselor             |   T   |   F
--   health_counselor           |   T   |   T
--   learner_counselor          |   T   |   F
--   registrar                  |   T   |   T
--   staff_counselor            |   T   |   F
--   seo (SEO Specialist)       |   T   |   T  ← target
-- ============================================================

-- ── 1. Seed roles with the new keys ─────────────────────────
-- Grant view to all 12 target roles
UPDATE public.custom_roles
   SET permissions = permissions || '{"admission.settings.forms.view": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN (
   'admission',
   'admission_counselor',
   'admission_staff',
   'ceo',
   'coo',
   'executive_admin_officer',
   'expo_counselor',
   'health_counselor',
   'learner_counselor',
   'registrar',
   'staff_counselor',
   'seo'
 );

-- Grant manage to the 8 roles that had write access on the old namespace
UPDATE public.custom_roles
   SET permissions = permissions || '{"admission.settings.forms.manage": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN (
   'admission',
   'admission_staff',
   'ceo',
   'coo',
   'executive_admin_officer',
   'health_counselor',
   'registrar',
   'seo'
 );

-- Explicitly record manage=false for the 4 roles that had only old.view
-- (keeps the permissions catalogue clean — every role lists every key
-- with an explicit boolean, matching the existing pattern).
UPDATE public.custom_roles
   SET permissions = permissions || '{"admission.settings.forms.manage": false}'::jsonb,
       updated_at  = now()
 WHERE role_key IN (
   'admission_counselor',
   'expo_counselor',
   'learner_counselor',
   'staff_counselor'
 );

-- ── 2. admission_forms policies ─────────────────────────────
DROP POLICY IF EXISTS adm_forms_select ON public.admission_forms;
DROP POLICY IF EXISTS adm_forms_insert ON public.admission_forms;
DROP POLICY IF EXISTS adm_forms_update ON public.admission_forms;
DROP POLICY IF EXISTS adm_forms_delete ON public.admission_forms;

CREATE POLICY adm_forms_select ON public.admission_forms
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('admission.settings.forms.view')
      AND role_has_institution_access(institution_id)
    )
  );

CREATE POLICY adm_forms_insert ON public.admission_forms
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('admission.settings.forms.manage')
  );

CREATE POLICY adm_forms_update ON public.admission_forms
  FOR UPDATE
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('admission.settings.forms.manage')
      AND role_has_institution_access(institution_id)
    )
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('admission.settings.forms.manage')
      AND role_has_institution_access(institution_id)
    )
  );

CREATE POLICY adm_forms_delete ON public.admission_forms
  FOR DELETE
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('admission.settings.forms.manage')
      AND role_has_institution_access(institution_id)
    )
  );

DO $$
BEGIN
  RAISE NOTICE 'admission_forms now gated by admission.settings.forms.{view,manage}; 12 roles seeded.';
END $$;
